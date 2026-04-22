const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { processSvgFile, storeSvgData, retryWithBackoff } = require("./deployUtils");
const { syncDynamicShopItemArtifacts } = require("./shopItemSync");

const DEFAULT_DEFINITION_PATH = path.join(__dirname, "shop-item-definitions/sunItemTrait.js");
const CATEGORY_CONFIG = {
    background: {
        baseTraitTypeId: null,
        contractMethod: "backgroundContract",
        setterMethod: "setBackgroundContract",
        targetTraitType: 0,
    },
    head: {
        baseTraitTypeId: 2,
        contractMethod: "headContract",
        setterMethod: "setHeadContract",
        targetTraitType: 2,
    },
    mouth: {
        baseTraitTypeId: 3,
        contractMethod: "mouthContract",
        setterMethod: "setMouthContract",
        targetTraitType: 3,
    },
    skin: {
        baseTraitTypeId: null,
        contractMethod: "skinContract",
        setterMethod: "setSkinContract",
        targetTraitType: 1,
    },
    stomach: {
        baseTraitTypeId: 4,
        contractMethod: "bellyContract",
        setterMethod: "setBellyContract",
        targetTraitType: 4,
    },
};

async function sendTx(txFn, confirmations = 1) {
    return await retryWithBackoff(async () => {
        const tx = await (typeof txFn === "function" ? txFn() : txFn);
        const receipt = await tx.wait(confirmations);
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return receipt;
    }, 3, 5000);
}

async function deployContract(factory, args = [], name = "Contract") {
    return await retryWithBackoff(async () => {
        console.log(`  Deploying ${name}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();

        if (network.name !== "localhost" && network.name !== "hardhat") {
            await contract.deploymentTransaction()?.wait(2);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log(`  ${name} deployed: ${await contract.getAddress()}`);
        return contract;
    }, 3, 5000);
}

function resolveDefinitionPath() {
    const extraArgs = process.argv.slice(2);
    const definitionArgIndex = extraArgs.findIndex((arg) => arg === "--definition");

    if (definitionArgIndex >= 0 && extraArgs[definitionArgIndex + 1]) {
        return path.resolve(process.cwd(), extraArgs[definitionArgIndex + 1]);
    }

    const inlineDefinitionArg = extraArgs.find((arg) => arg.startsWith("--definition="));
    if (inlineDefinitionArg) {
        return path.resolve(process.cwd(), inlineDefinitionArg.split("=", 2)[1]);
    }

    if (process.env.SHOP_ITEM_DEFINITION) {
        return path.resolve(process.cwd(), process.env.SHOP_ITEM_DEFINITION);
    }

    const positionalArg = extraArgs.find((arg) => !arg.startsWith("--"));
    if (positionalArg) {
        return path.resolve(process.cwd(), positionalArg);
    }

    return DEFAULT_DEFINITION_PATH;
}

function loadItemDefinition() {
    const definitionPath = resolveDefinitionPath();
    if (!fs.existsSync(definitionPath)) {
        throw new Error(`Item definition not found: ${definitionPath}`);
    }

    delete require.cache[require.resolve(definitionPath)];
    const definition = require(definitionPath);
    return { definition, definitionPath };
}

function validateItemDefinition(definition, definitionPath) {
    if (!definition || typeof definition !== "object") {
        throw new Error(`Definition file must export an object: ${definitionPath}`);
    }

    const categoryConfig = CATEGORY_CONFIG[definition.category];
    if (!categoryConfig) {
        throw new Error(`Unsupported item category "${definition.category}" in ${definitionPath}`);
    }

    if (Number(definition.targetTraitType) !== categoryConfig.targetTraitType) {
        throw new Error(
            `Definition ${definitionPath} targetTraitType=${definition.targetTraitType} does not match category "${definition.category}" (${categoryConfig.targetTraitType}).`
        );
    }

    if (!definition.name || !definition.description) {
        throw new Error(`Definition ${definitionPath} must include name and description.`);
    }

    if (!definition.trait?.name || !definition.trait?.sourceSvgPath) {
        throw new Error(`Definition ${definitionPath} must include trait.name and trait.sourceSvgPath.`);
    }

    if (!definition.icon?.svgFile || !definition.icon?.sourceSvgPath) {
        throw new Error(`Definition ${definitionPath} must include icon.svgFile and icon.sourceSvgPath.`);
    }

    if (!fs.existsSync(definition.trait.sourceSvgPath)) {
        throw new Error(`Trait SVG not found: ${definition.trait.sourceSvgPath}`);
    }

    if (!fs.existsSync(definition.icon.sourceSvgPath)) {
        throw new Error(`Item icon SVG not found: ${definition.icon.sourceSvgPath}`);
    }
}

function findExistingStatusItem(status, definition) {
    return Object.entries(status.itemTypes || {}).find(([, config]) => {
        return config?.definitionKey === definition.key ||
            (config?.name === definition.name && Number(config?.targetTraitType) === Number(definition.targetTraitType));
    }) || null;
}

function getTargetTraitConfig(category) {
    const config = CATEGORY_CONFIG[category];
    if (!config) {
        throw new Error(`Unsupported item category: ${category}`);
    }
    return config;
}

async function getOrCreateTraitRouter(svgRenderer, category, status) {
    const config = getTargetTraitConfig(category);
    let routerAddress = await svgRenderer[config.contractMethod]();

    if (!routerAddress || routerAddress === ethers.ZeroAddress) {
        console.log(`\n--- Deploying SVGRouter for ${category} ---`);
        const SVGRouterFactory = await ethers.getContractFactory("SVGRouter");
        const router = await deployContract(SVGRouterFactory, [], `SVGRouter (${category})`);
        routerAddress = await router.getAddress();
        await sendTx(() => svgRenderer[config.setterMethod](routerAddress));
        console.log(`  Registered ${category} router on SVG renderer`);
        status.routers = status.routers || {};
        status.routers[category] = routerAddress;
        saveDeploymentStatus(status, network.name);
    }

    const router = await ethers.getContractAt("SVGRouter", routerAddress);
    return { config, router, routerAddress };
}

async function deploySvgRenderer(svgPartWriter, svgPath, options = {}) {
    const svgData = processSvgFile(svgPath, options.classPrefix || "", Boolean(options.keepSvgTag));
    const chunkSize = 16 * 1024;
    const totalChunks = Math.ceil(svgData.length / chunkSize);
    const chunkAddresses = [];

    console.log(`  SVG data size: ${svgData.length} bytes (${totalChunks} chunk${totalChunks === 1 ? "" : "s"})`);

    for (let index = 0; index < totalChunks; index += 1) {
        const chunk = svgData.slice(index * chunkSize, (index + 1) * chunkSize);
        const address = await storeSvgData(svgPartWriter, chunk);
        chunkAddresses.push(address);
        console.log(`    Stored chunk ${index + 1}/${totalChunks}: ${address}`);
    }

    const SVGRendererFactory = await ethers.getContractFactory("SVGRenderer");
    const renderer = await deployContract(SVGRendererFactory, [chunkAddresses], options.name || "SVGRenderer");
    return await renderer.getAddress();
}

async function computeTraitFileName(svgRenderer, category, traitValue) {
    const { baseTraitTypeId } = getTargetTraitConfig(category);

    if (baseTraitTypeId === null) {
        return `${traitValue}.svg`;
    }

    const baseTraitCount = Number(await svgRenderer.getBaseTraitCount(baseTraitTypeId));
    if (traitValue <= baseTraitCount) {
        throw new Error(
            `Trait value ${traitValue} for ${category} is not above the base count ${baseTraitCount}; refusing to map it into from_items.`
        );
    }

    return `${traitValue - baseTraitCount}.svg`;
}

function buildDynamicItemEntry(itemTypeId, definition, traitFileName) {
    return {
        id: itemTypeId,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        svgFile: definition.icon.svgFile,
        targetTraitType: definition.targetTraitType,
        traitFileName,
        isClaimable: Boolean(definition.isClaimable),
        claimWeight: Number(definition.claimWeight || 0),
        isOwnerMintable: Boolean(definition.isOwnerMintable),
    };
}

async function main() {
    const { definition, definitionPath } = loadItemDefinition();
    validateItemDefinition(definition, definitionPath);

    const status = loadDeploymentStatus(network.name);
    status.addedTraits = status.addedTraits || {};
    status.itemTypes = status.itemTypes || {};
    const existingItem = findExistingStatusItem(status, definition);
    if (existingItem) {
        const [itemTypeId] = existingItem;
        throw new Error(
            `Item "${definition.name}" is already recorded as itemType ${itemTypeId} in deployment-status-${network.name}.json. ` +
            "Use deployOnlyContracts.js to restore it after contract redeploys instead of redeploying the same item again."
        );
    }

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();
    const chainId = Number(networkInfo.chainId);

    console.log("=".repeat(60));
    console.log(`Deploy New Shop Item: ${definition.name}`);
    console.log("=".repeat(60));
    console.log(`Definition: ${definitionPath}`);
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${chainId}`);
    console.log(`Deployer: ${deployerAddress}`);

    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const fregShop = await ethers.getContractAt("FregShop", status.contracts.fregShop);
    const fregCoin = await ethers.getContractAt("FregCoin", status.contracts.fregCoin);
    const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", status.contracts.svgRenderer);
    const itemsRouter = await ethers.getContractAt("SVGRouter", status.routers.items);

    const { router: traitRouter, routerAddress: traitRouterAddress } = await getOrCreateTraitRouter(svgRenderer, definition.category, status);

    console.log("\n--- Deploying Trait SVG ---");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await deployContract(SVGPartWriter, [], "SVGPartWriter");
    const traitRendererAddress = await deploySvgRenderer(svgPartWriter, definition.trait.sourceSvgPath, {
        classPrefix: definition.trait.classPrefix || `${definition.key || definition.name.toLowerCase()}${definition.category}`,
        name: `${definition.name} trait renderer`,
    });

    console.log("\n--- Registering Trait On Router ---");
    console.log(`  ${definition.category} router: ${traitRouterAddress}`);

    // Find the highest occupied slot on the router, then use the next one.
    // We cannot rely on getTraitCount()/nextTypeId because the initial deploy
    // uses setRenderContractsBatchWithTypeIds which does not update nextTypeId.
    // Scan forward from slot 1 to find the highest occupied slot.
    let highestOccupied = 0;
    let slot = 1;
    let consecutiveEmpty = 0;
    while (consecutiveEmpty < 10) {
        const existing = await traitRouter.renderContracts(slot);
        if (!existing || existing === ethers.ZeroAddress) {
            consecutiveEmpty++;
        } else {
            highestOccupied = slot;
            consecutiveEmpty = 0;
        }
        slot++;
    }
    const newTraitValue = highestOccupied + 1;
    console.log(`  Highest occupied slot: ${highestOccupied}, new trait value: ${newTraitValue}`);

    await sendTx(() => traitRouter.setRenderContract(newTraitValue, traitRendererAddress));
    await sendTx(() => traitRouter.setTraitName(newTraitValue, definition.trait.name));
    console.log(`  Registered trait at slot ${newTraitValue}`);

    console.log("\n--- Creating Item Type ---");
    const itemTypeId = Number(await fregsItems.nextItemTypeId());
    await sendTx(() => fregsItems.addItemType(
        definition.name,
        definition.description,
        definition.targetTraitType,
        newTraitValue,
        definition.isOwnerMintable,
        definition.isClaimable,
        definition.claimWeight || 0,
    ));
    console.log(`  Item type ID: ${itemTypeId}`);

    console.log("\n--- Deploying Item Icon ---");
    const iconRendererAddress = await deploySvgRenderer(svgPartWriter, definition.icon.sourceSvgPath, {
        keepSvgTag: true,
        name: `${definition.name} icon renderer`,
    });
    const iconSlot = itemTypeId;
    console.log(`  Setting items router slot ${iconSlot}`);
    await sendTx(() => itemsRouter.setRenderContract(iconSlot, iconRendererAddress));

    let shopPrice = null;
    const shopMaxSupply = Number(definition.shop?.maxSupply || 0);
    const shopIsActive = definition.shop?.isActive !== false;

    if (definition.shop?.priceFreg !== undefined && definition.shop?.priceFreg !== null) {
        console.log("\n--- Listing In Shop ---");
        shopPrice = ethers.parseEther(String(definition.shop.priceFreg));
        await sendTx(() => fregShop.listItem(itemTypeId, shopPrice, shopMaxSupply));
        if (!shopIsActive) {
            await sendTx(() => fregShop.updateItem(itemTypeId, shopPrice, false, shopMaxSupply));
        }
        console.log(`  Price: ${ethers.formatEther(shopPrice)} FREG`);
        console.log(`  Max supply: ${shopMaxSupply === 0 ? "unlimited" : shopMaxSupply}`);
        console.log(`  Active: ${shopIsActive}`);
    }

    const mintFregToDeployer = definition.localhost?.mintFregToDeployer;
    if ((network.name === "localhost" || network.name === "hardhat") && mintFregToDeployer) {
        console.log("\n--- Test FREG ---");
        const deployerBalance = await fregCoin.balanceOf(deployerAddress);
        console.log(`  Deployer FREG balance: ${ethers.formatEther(deployerBalance)}`);
    }

    const traitFileName = await computeTraitFileName(svgRenderer, definition.category, newTraitValue);
    const dynamicItem = buildDynamicItemEntry(itemTypeId, definition, traitFileName);

    console.log("\n--- Syncing Dynamic Item Manifests ---");
    syncDynamicShopItemArtifacts({
        chainId,
        item: dynamicItem,
        itemIconSourceSvgPath: definition.icon.sourceSvgPath,
        trait: {
            category: definition.category,
            fileName: traitFileName,
            name: definition.trait.name,
        },
        traitSourceSvgPath: definition.trait.sourceSvgPath,
    });
    console.log(`  Updated website/src/config/dynamic-items.json`);
    console.log(`  Updated api/data/dynamic-items.json`);
    console.log(`  Updated dynamic from_items trait manifests`);
    console.log(`  Synced trait SVG into api/assets/frogz/from_items/${definition.category}/${traitFileName}`);

    console.log("\n--- Saving Deployment Status ---");
    if (!status.addedTraits[definition.category]) {
        status.addedTraits[definition.category] = {};
    }
    status.addedTraits[definition.category][`${newTraitValue}.svg`] = {
        definitionKey: definition.key || null,
        fileName: traitFileName,
        name: definition.trait.name,
        rendererAddress: traitRendererAddress,
        routerId: newTraitValue,
        source: "from_items",
    };

    status.itemTypes[itemTypeId] = {
        category: definition.category,
        claimWeight: Number(definition.claimWeight || 0),
        definitionKey: definition.key || null,
        description: definition.description,
        iconRendererAddress,
        iconRouterSlot: iconSlot,
        isClaimable: Boolean(definition.isClaimable),
        isOwnerMintable: Boolean(definition.isOwnerMintable),
        name: definition.name,
        shopIsActive,
        shopMaxSupply,
        shopPrice: shopPrice ? ethers.formatEther(shopPrice) : null,
        svgFile: definition.icon.svgFile,
        targetTraitType: definition.targetTraitType,
        traitFileName,
        traitRendererAddress,
        traitValue: newTraitValue,
    };

    saveDeploymentStatus(status, network.name);

    console.log("\n" + "=".repeat(60));
    console.log("DONE");
    console.log("=".repeat(60));
    console.log(`Item "${definition.name}" deployed as itemType ${itemTypeId}`);
    console.log(`Trait value: ${newTraitValue}`);
    console.log(`Local trait file: from_items/${definition.category}/${traitFileName}`);
    console.log(`Item icon: items/${definition.icon.svgFile}`);
    console.log(`Trait router: ${traitRouterAddress}`);
    console.log(`Status + dynamic API/website manifests are now in sync.`);
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = {
    main,
};
