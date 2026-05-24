const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { processSvgFile, storeSvgData, retryWithBackoff } = require("./deployUtils");
const { syncDynamicShopItemArtifacts } = require("./shopItemSync");

const VALID_MODES = new Set(["trait", "icon", "both"]);
const CATEGORY_CONFIG = {
    background: { contractMethod: "backgroundContract", targetTraitType: 0 },
    head: { contractMethod: "headContract", targetTraitType: 2 },
    mouth: { contractMethod: "mouthContract", targetTraitType: 3 },
    skin: { contractMethod: "skinContract", targetTraitType: 1 },
    stomach: { contractMethod: "bellyContract", targetTraitType: 4 },
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

async function deployContract(factory, args = [], name = "Contract", signer = null) {
    return await retryWithBackoff(async () => {
        console.log(`  Deploying ${name}...`);
        const factoryWithSigner = signer ? factory.connect(signer) : factory;
        const contract = await factoryWithSigner.deploy(...args);
        await contract.waitForDeployment();

        if (network.name !== "localhost" && network.name !== "hardhat") {
            await contract.deploymentTransaction()?.wait(2);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log(`  ${name} deployed: ${await contract.getAddress()}`);
        return contract;
    }, 3, 5000);
}

function resolveRouterSigner() {
    const envKeyByNetwork = {
        base: "BASE_ART_PRIVATE_KEY",
        baseSepolia: "BASE_SEPOLIA_ART_PRIVATE_KEY",
    };
    const envKey = envKeyByNetwork[network.name];
    if (!envKey) return null;
    const raw = process.env[envKey];
    if (!raw) return null;
    const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
    return new ethers.Wallet(normalized, ethers.provider);
}

function getCliArgs() {
    const args = process.argv.slice(2);
    const result = { definitionPath: null, mode: "both" };

    const flagged = (flag) => {
        const idx = args.findIndex((arg) => arg === flag);
        if (idx >= 0 && args[idx + 1]) return args[idx + 1];
        const inline = args.find((arg) => arg.startsWith(`${flag}=`));
        if (inline) return inline.split("=", 2)[1];
        return null;
    };

    const definitionFlag = flagged("--definition");
    if (definitionFlag) {
        result.definitionPath = path.resolve(process.cwd(), definitionFlag);
    } else if (process.env.SHOP_ITEM_DEFINITION) {
        result.definitionPath = path.resolve(process.cwd(), process.env.SHOP_ITEM_DEFINITION);
    } else {
        const positional = args.find((arg) => !arg.startsWith("--"));
        if (positional) {
            result.definitionPath = path.resolve(process.cwd(), positional);
        }
    }

    const modeFlag = flagged("--mode") || process.env.REPLACE_MODE;
    if (modeFlag) {
        result.mode = modeFlag;
    }

    return result;
}

function loadItemDefinition(definitionPath) {
    if (!definitionPath) {
        throw new Error("Missing item definition. Pass --definition <path>.");
    }
    if (!fs.existsSync(definitionPath)) {
        throw new Error(`Item definition not found: ${definitionPath}`);
    }
    delete require.cache[require.resolve(definitionPath)];
    return require(definitionPath);
}

function findExistingItem(status, definition) {
    const itemTypes = status.itemTypes || {};
    const entry = Object.entries(itemTypes).find(([, config]) => {
        return config?.definitionKey === definition.key ||
            (config?.name === definition.name && Number(config?.targetTraitType) === Number(definition.targetTraitType));
    });
    if (!entry) return null;
    const [itemTypeId, config] = entry;
    return { itemTypeId: Number(itemTypeId), config };
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

function buildDynamicItemEntry(itemTypeId, definition, existingConfig) {
    const entry = {
        id: itemTypeId,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        svgFile: definition.icon.svgFile,
        targetTraitType: definition.targetTraitType,
        traitFileName: existingConfig.traitFileName,
        isClaimable: Boolean(definition.isClaimable),
        claimWeight: Number(definition.claimWeight || 0),
        isOwnerMintable: Boolean(definition.isOwnerMintable),
        hiddenInShop: Boolean(definition.hiddenInShop),
    };
    if (Array.isArray(definition.incompatibleWithSkins) && definition.incompatibleWithSkins.length > 0) {
        entry.incompatibleWithSkins = definition.incompatibleWithSkins.map(Number);
    }
    if (Array.isArray(definition.incompatibleWithHeads) && definition.incompatibleWithHeads.length > 0) {
        entry.incompatibleWithHeads = definition.incompatibleWithHeads.map(Number);
    }
    return entry;
}

async function main() {
    const { definitionPath, mode } = getCliArgs();
    if (!VALID_MODES.has(mode)) {
        throw new Error(`Invalid --mode "${mode}". Use one of: trait, icon, both.`);
    }

    const definition = loadItemDefinition(definitionPath);
    const categoryConfig = CATEGORY_CONFIG[definition.category];
    if (!categoryConfig) {
        throw new Error(`Unsupported item category "${definition.category}" in ${definitionPath}`);
    }

    const status = loadDeploymentStatus(network.name);
    const existing = findExistingItem(status, definition);
    if (!existing) {
        throw new Error(
            `Item "${definition.name}" not found in deployment-status-${network.name}.json. ` +
            "Use deployNewShopItem.js to deploy it first."
        );
    }
    const { itemTypeId, config: existingConfig } = existing;

    const replaceTrait = mode === "trait" || mode === "both";
    const replaceIcon = mode === "icon" || mode === "both";

    if (replaceTrait && !fs.existsSync(definition.trait?.sourceSvgPath || "")) {
        throw new Error(`Trait SVG not found: ${definition.trait?.sourceSvgPath}`);
    }
    if (replaceIcon && !fs.existsSync(definition.icon?.sourceSvgPath || "")) {
        throw new Error(`Icon SVG not found: ${definition.icon?.sourceSvgPath}`);
    }

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();
    const chainId = Number(networkInfo.chainId);
    const routerSigner = resolveRouterSigner();
    const routerSignerAddress = routerSigner ? await routerSigner.getAddress() : deployerAddress;

    console.log("=".repeat(60));
    console.log(`Replace Shop Item Image: ${definition.name}`);
    console.log("=".repeat(60));
    console.log(`Definition:  ${definitionPath}`);
    console.log(`Network:     ${network.name}`);
    console.log(`Chain ID:    ${chainId}`);
    console.log(`Mode:        ${mode}`);
    console.log(`Item type:   ${itemTypeId}`);
    console.log(`Trait value: ${existingConfig.traitValue}`);
    console.log(`Deployer:    ${deployerAddress}`);
    if (routerSigner) {
        console.log(`Router signer (art wallet): ${routerSignerAddress}`);
    }

    const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", status.contracts.svgRenderer);

    let traitRouter = null;
    let traitRouterAddress = null;
    if (replaceTrait) {
        traitRouterAddress = await svgRenderer[categoryConfig.contractMethod]();
        if (!traitRouterAddress || traitRouterAddress === ethers.ZeroAddress) {
            throw new Error(`No ${definition.category} router registered on SVG renderer.`);
        }
        traitRouter = await ethers.getContractAt("SVGRouter", traitRouterAddress);
        if (routerSigner) traitRouter = traitRouter.connect(routerSigner);
    }

    let itemsRouter = null;
    if (replaceIcon) {
        if (!status.routers?.items) {
            throw new Error("No items router in deployment status.");
        }
        itemsRouter = await ethers.getContractAt("SVGRouter", status.routers.items);
        if (routerSigner) itemsRouter = itemsRouter.connect(routerSigner);
    }

    console.log("\n--- Deploying SVGPartWriter ---");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await deployContract(SVGPartWriter, [], "SVGPartWriter");

    let newTraitRendererAddress = null;
    if (replaceTrait) {
        console.log("\n--- Deploying New Trait Renderer ---");
        newTraitRendererAddress = await deploySvgRenderer(svgPartWriter, definition.trait.sourceSvgPath, {
            classPrefix: definition.trait.classPrefix || `${definition.key || definition.name.toLowerCase()}${definition.category}`,
            name: `${definition.name} trait renderer`,
        });

        console.log("\n--- Updating Trait Router Pointer ---");
        console.log(`  Router:  ${traitRouterAddress}`);
        console.log(`  Slot:    ${existingConfig.traitValue}`);
        console.log(`  Old:     ${existingConfig.traitRendererAddress}`);
        console.log(`  New:     ${newTraitRendererAddress}`);
        await sendTx(() => traitRouter.setRenderContract(existingConfig.traitValue, newTraitRendererAddress));
    }

    let newIconRendererAddress = null;
    if (replaceIcon) {
        console.log("\n--- Deploying New Icon Renderer ---");
        newIconRendererAddress = await deploySvgRenderer(svgPartWriter, definition.icon.sourceSvgPath, {
            keepSvgTag: true,
            name: `${definition.name} icon renderer`,
        });

        console.log("\n--- Updating Items Router Pointer ---");
        console.log(`  Router:  ${status.routers.items}`);
        console.log(`  Slot:    ${existingConfig.iconRouterSlot}`);
        console.log(`  Old:     ${existingConfig.iconRendererAddress}`);
        console.log(`  New:     ${newIconRendererAddress}`);
        await sendTx(() => itemsRouter.setRenderContract(existingConfig.iconRouterSlot, newIconRendererAddress));
    }

    console.log("\n--- Syncing Local Manifests ---");
    const dynamicItem = buildDynamicItemEntry(itemTypeId, definition, existingConfig);
    syncDynamicShopItemArtifacts({
        chainId,
        item: dynamicItem,
        itemIconSourceSvgPath: replaceIcon ? definition.icon.sourceSvgPath : null,
        trait: {
            category: definition.category,
            fileName: existingConfig.traitFileName,
            name: definition.trait.name,
        },
        traitSourceSvgPath: replaceTrait ? definition.trait.sourceSvgPath : null,
    });

    console.log("\n--- Saving Deployment Status ---");
    if (replaceTrait) {
        const traitKey = `${existingConfig.traitValue}.svg`;
        if (status.addedTraits?.[definition.category]?.[traitKey]) {
            status.addedTraits[definition.category][traitKey].rendererAddress = newTraitRendererAddress;
        }
        status.itemTypes[itemTypeId].traitRendererAddress = newTraitRendererAddress;
    }
    if (replaceIcon) {
        status.itemTypes[itemTypeId].iconRendererAddress = newIconRendererAddress;
    }
    saveDeploymentStatus(status, network.name);

    console.log("\n" + "=".repeat(60));
    console.log("DONE");
    console.log("=".repeat(60));
    console.log(`Item "${definition.name}" (itemType ${itemTypeId}) renderer pointer(s) updated.`);
    if (replaceTrait) console.log(`  Trait renderer: ${newTraitRendererAddress}`);
    if (replaceIcon) console.log(`  Icon renderer:  ${newIconRendererAddress}`);
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
