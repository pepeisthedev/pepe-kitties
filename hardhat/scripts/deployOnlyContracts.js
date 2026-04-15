const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { retryWithBackoff } = require("./deployUtils");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

// Helper to send transaction with retry and proper waiting
async function sendTx(txPromise, confirmations = 1) {
    return await retryWithBackoff(async () => {
        const tx = await txPromise;
        const receipt = await tx.wait(confirmations);
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return receipt;
    }, 3, 5000);
}

// Helper to deploy contract with retry
async function deployContract(factory, args = [], name = "Contract") {
    return await retryWithBackoff(async () => {
        console.log(`  Deploying ${name}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();

        if (network.name !== "localhost" && network.name !== "hardhat") {
            await contract.deploymentTransaction()?.wait(2);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const address = await contract.getAddress();
        console.log(`  ${name} deployed to: ${address}`);
        return contract;
    }, 3, 5000);
}

// Copy ABI from artifacts to website
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");
function copyABI(contractName, targetFileName, subPath = "") {
    try {
        const artifactPath = path.join(
            __dirname,
            `../artifacts/contracts/${subPath}${contractName}.sol/${contractName}.json`
        );
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        const targetPath = path.join(WEBSITE_ABI_PATH, `${targetFileName}.json`);
        fs.writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));
        console.log(`  Copied ${contractName} ABI to ${targetFileName}.json`);
    } catch (error) {
        console.error(`  Failed to copy ${contractName} ABI:`, error.message);
    }
}

// Load built-in items.json
const ITEMS_JSON_PATH = path.join(__dirname, "../../website/src/config/items.json");
const VRF_CALLBACK_GAS = {
    mint: Number(process.env.VRF_MINT_CALLBACK_GAS_LIMIT || 700000),
    claimItem: Number(process.env.VRF_CLAIM_ITEM_CALLBACK_GAS_LIMIT || 500000),
    headReroll: Number(process.env.VRF_HEAD_REROLL_CALLBACK_GAS_LIMIT || 350000),
    spin: Number(process.env.VRF_SPIN_CALLBACK_GAS_LIMIT || 450000),
};
const DEFAULT_VRF_COORDINATOR_ADDRESSES = {
  baseSepolia: "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE",
  base: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
};

const DEFAULT_VRF_KEY_HASHES = {
  // Base Sepolia only exposes the 30 gwei lane
  baseSepolia: "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71",

  // Base mainnet 2 gwei lane
  base: "0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab",
};

function getVrfConfig() {
    if (network.name === "localhost" || network.name === "hardhat") {
        return { coordinator: null, subscriptionId: 0, keyHash: ethers.ZeroHash };
    }
    if (network.name === "baseSepolia") {
        return {
            coordinator: process.env.BASE_SEPOLIA_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.baseSepolia,
            subscriptionId: BigInt(process.env.BASE_SEPOLIA_VRF_SUBSCRIPTION_ID || 0),
            keyHash: process.env.BASE_SEPOLIA_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.baseSepolia,
        };
    }
    if (network.name === "base") {
        return {
            coordinator: process.env.BASE_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.base,
            subscriptionId: BigInt(process.env.BASE_VRF_SUBSCRIPTION_ID || 0),
            keyHash: process.env.BASE_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.base,
        };
    }
    return {
        coordinator: process.env.VRF_COORDINATOR || "",
        subscriptionId: BigInt(process.env.VRF_SUBSCRIPTION_ID || 0),
        keyHash: process.env.VRF_KEY_HASH || ethers.ZeroHash,
    };
}

function loadItemsConfig() {
    if (!fs.existsSync(ITEMS_JSON_PATH)) {
        console.log("  ⚠️  items/items.json not found");
        return null;
    }
    return JSON.parse(fs.readFileSync(ITEMS_JSON_PATH, "utf8"));
}

function buildItemConfigs(itemsConfig) {
    if (!itemsConfig?.items) return { configs: {}, traitMappings: [] };
    const configs = {};
    for (const item of itemsConfig.items) {
        configs[item.id] = {
            name: item.name,
            description: item.description,
            category: item.category,
            targetTraitType: item.targetTraitType,
            traitFileName: item.traitFileName,
            isClaimable: item.isClaimable,
            claimWeight: item.claimWeight,
            isOwnerMintable: item.isOwnerMintable
        };
    }
    return { configs, items: itemsConfig.items };
}

function buildTraitItemMappings(itemsConfig, baseTraitCounts) {
    if (!itemsConfig?.items) return [];
    const mappings = [];
    for (const item of itemsConfig.items) {
        if (!item.traitFileName || item.targetTraitType === undefined) continue;
        const fileNumber = parseInt(item.traitFileName.replace('.svg', ''));
        let traitValue;
        if (item.category === 'skin') {
            traitValue = fileNumber;
            console.log(`    Skin mapping: ${item.name} (id ${item.id}) → trait value ${traitValue}`);
        } else if (item.category === 'head') {
            const baseHeadCount = baseTraitCounts?.head || 22;
            traitValue = baseHeadCount + fileNumber;
            console.log(`    Head mapping: ${item.name} (id ${item.id}) → trait value ${traitValue} (base ${baseHeadCount} + file ${fileNumber})`);
        } else {
            continue;
        }
        mappings.push({ itemId: item.id, traitValue, category: item.category });
    }
    return mappings;
}

// Load traits.json for trait weights
const DEFAULT_TRAITS_PATH = path.join(__dirname, "../../website/public/frogz/default");
const TRAITS_JSON_PATH = path.join(DEFAULT_TRAITS_PATH, "traits.json");
function loadTraitsConfig() {
    if (!fs.existsSync(TRAITS_JSON_PATH)) {
        throw new Error(`Traits config not found at: ${TRAITS_JSON_PATH}`);
    }
    const traitsConfig = JSON.parse(fs.readFileSync(TRAITS_JSON_PATH, "utf8"));
    const traitWeights = {};
    const noneTraitIds = {};
    for (const [traitType, traits] of Object.entries(traitsConfig)) {
        if (!traits[0]?.rarity && traits[0]?.rarity !== 0) continue;
        traitWeights[traitType] = traits.map(t => t.rarity || 0);
        const noneIndex = traits.findIndex(t => t.isNone);
        noneTraitIds[traitType] = noneIndex >= 0 ? noneIndex + 1 : 0;
    }
    return { traitsConfig, traitWeights, noneTraitIds };
}

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function countBaseTraits(traits) {
    return (traits || []).filter(trait => !trait.isNone).length;
}

function getExpectedBaseTraitCounts(traitsConfig) {
    return {
        head: countBaseTraits(traitsConfig.head),
        mouth: countBaseTraits(traitsConfig.mouth),
        stomach: countBaseTraits(traitsConfig.stomach),
    };
}

function parseStoredPrice(shopPrice) {
    if (shopPrice === undefined || shopPrice === null || shopPrice === "") {
        return null;
    }
    return ethers.parseEther(String(shopPrice));
}

function normalizeStoredItemType(itemTypeId, config) {
    return {
        claimWeight: Number(config?.claimWeight ?? 0),
        description: config?.description || "",
        iconRendererAddress: config?.iconRendererAddress || null,
        iconRouterSlot: Number(config?.iconRouterSlot ?? itemTypeId),
        isClaimable: Boolean(config?.isClaimable ?? false),
        isOwnerMintable: Boolean(config?.isOwnerMintable ?? true),
        name: config?.name || "",
        shopIsActive: config?.shopIsActive ?? (config?.shopPrice !== undefined && config?.shopPrice !== null),
        shopMaxSupply: Number(config?.shopMaxSupply ?? 0),
        shopPrice: config?.shopPrice ?? null,
        targetTraitType: Number(config?.targetTraitType ?? 0),
        traitRendererAddress: config?.traitRendererAddress || null,
        traitValue: Number(config?.traitValue ?? 0),
    };
}

async function loadReusedRendererState(previousStatus, traitsConfig) {
    const svgRendererAddress = previousStatus.contracts?.svgRenderer;
    if (!svgRendererAddress) {
        throw new Error("No svgRenderer address found in previous deployment status. Run full deploy first.");
    }

    const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", svgRendererAddress);
    const [
        background,
        body,
        skin,
        head,
        mouth,
        stomach,
        baseHead,
        baseMouth,
        baseStomach,
    ] = await Promise.all([
        svgRenderer.backgroundContract(),
        svgRenderer.bodyContract(),
        svgRenderer.skinContract(),
        svgRenderer.headContract(),
        svgRenderer.mouthContract(),
        svgRenderer.bellyContract(),
        svgRenderer.getBaseTraitCount(2),
        svgRenderer.getBaseTraitCount(3),
        svgRenderer.getBaseTraitCount(4),
    ]);

    const rendererRouters = {
        background,
        body,
        skin,
        head,
        mouth,
        stomach,
    };

    for (const [routerName, routerAddress] of Object.entries(rendererRouters)) {
        if (!routerAddress || normalizeAddress(routerAddress) === normalizeAddress(ethers.ZeroAddress)) {
            throw new Error(`Reused FregsSVGRenderer has no ${routerName} router configured.`);
        }

        const storedRouterAddress = previousStatus.routers?.[routerName];
        if (storedRouterAddress && normalizeAddress(storedRouterAddress) !== normalizeAddress(routerAddress)) {
            console.log(`  ⚠️  Stored ${routerName} router ${storedRouterAddress} differs from reused renderer ${routerAddress}. Using renderer address.`);
        }
    }

    const baseTraitCounts = {
        head: Number(baseHead),
        mouth: Number(baseMouth),
        stomach: Number(baseStomach),
    };
    const expectedBaseTraitCounts = getExpectedBaseTraitCounts(traitsConfig);

    for (const [traitName, expectedCount] of Object.entries(expectedBaseTraitCounts)) {
        if (baseTraitCounts[traitName] !== expectedCount) {
            throw new Error(
                `Reused FregsSVGRenderer base ${traitName} count is ${baseTraitCounts[traitName]}, but current traits.json expects ${expectedCount}. ` +
                "This contracts-only flow only works when the deployed SVG data still matches the current trait config."
            );
        }
    }

    return {
        baseTraitCounts,
        rendererRouters,
        svgRenderer,
        svgRendererAddress,
    };
}

async function restoreDynamicItemTypesFromStatus(fregsItems, fregShop, svgRenderer, itemsRouter, previousStatus) {
    const restoredItemTypes = {};
    const entries = Object.entries(previousStatus.itemTypes || {})
        .map(([itemTypeId, config]) => ({
            config: normalizeStoredItemType(Number(itemTypeId), config),
            itemTypeId: Number(itemTypeId),
        }))
        .filter((entry) => Number.isInteger(entry.itemTypeId) && entry.itemTypeId >= 101)
        .sort((left, right) => left.itemTypeId - right.itemTypeId);

    if (entries.length === 0) {
        console.log("\n--- No Dynamic Item Types To Restore ---");
        return restoredItemTypes;
    }

    console.log(`\n--- Restoring ${entries.length} Dynamic Item Type(s) From Deployment Status ---`);

    let expectedNextItemTypeId = Number(await fregsItems.nextItemTypeId());
    for (const entry of entries) {
        const { itemTypeId, config } = entry;
        restoredItemTypes[itemTypeId] = config;

        if (!config.name) {
            throw new Error(`Stored itemType ${itemTypeId} is missing a name.`);
        }

        if (expectedNextItemTypeId !== itemTypeId) {
            throw new Error(
                `Cannot restore stored itemType ${itemTypeId}. New FregsItems expects nextItemTypeId=${expectedNextItemTypeId}. ` +
                "Stored dynamic item IDs must be contiguous from 101."
            );
        }
        expectedNextItemTypeId += 1;

        if (config.iconRouterSlot !== itemTypeId) {
            throw new Error(
                `Stored itemType ${itemTypeId} uses iconRouterSlot ${config.iconRouterSlot}, but FregsItems.tokenURI expects ${itemTypeId}.`
            );
        }

        const iconExists = await itemsRouter.isValidTrait(config.iconRouterSlot);
        if (!iconExists) {
            throw new Error(`Items router is missing icon slot ${config.iconRouterSlot} for stored itemType ${itemTypeId} (${config.name}).`);
        }

        if (config.targetTraitType >= 0 && config.targetTraitType <= 4 && config.traitValue > 0) {
            const traitExists = await svgRenderer.isValidTrait(config.targetTraitType, config.traitValue);
            if (!traitExists) {
                throw new Error(
                    `Reused FregsSVGRenderer is missing trait ${config.traitValue} for stored itemType ${itemTypeId} (${config.name}).`
                );
            }
        }
    }

    for (const entry of entries) {
        const { itemTypeId, config } = entry;
        console.log(`  Restoring itemType ${itemTypeId}: ${config.name}`);
        await sendTx(fregsItems.addItemType(
            config.name,
            config.description,
            config.targetTraitType,
            config.traitValue,
            config.isOwnerMintable,
            config.isClaimable,
            config.claimWeight
        ));

        const shopPrice = parseStoredPrice(config.shopPrice);
        if (shopPrice && shopPrice > 0n) {
            console.log(`    Restoring shop listing at ${ethers.formatEther(shopPrice)} FREG (maxSupply=${config.shopMaxSupply})`);
            await sendTx(fregShop.listItem(itemTypeId, shopPrice, config.shopMaxSupply));

            if (!config.shopIsActive) {
                await sendTx(fregShop.updateItem(itemTypeId, shopPrice, false, config.shopMaxSupply));
            }
        }
    }

    return restoredItemTypes;
}

// ============ CONFIGURATION ============
const MINT_PASSES_TO_MINT = 2;
const ADDITIONAL_MINTPASS_RECIPIENT = "";

// SpinTheWheel configuration (weights out of 10000)
const SPIN_LOSE_WEIGHT = 0;
const SPIN_MINTPASS_WEIGHT = 7800;
const SPIN_HOODIE_WEIGHT = 100;
const SPIN_FROGSUIT_WEIGHT = 100;
const SPIN_CHEST_WEIGHT = 2000;
const HOODIE_ITEM_TYPE = 9;
const FROGSUIT_ITEM_TYPE = 10;
const CHEST_ITEM_TYPE = 6;
const INITIAL_SPIN_TOKENS_TO_MINT = 100;

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOY ONLY CONTRACTS (reuse existing SVG data)");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("\nDeployer:", deployerAddress);
    console.log("Network:", network.name);

    // ============ Steg 1: Load previous deployment status ============
    console.log("\n--- Loading Previous Deployment Status ---");
    const previousStatus = loadDeploymentStatus(network.name);
    if (!previousStatus.routers?.items) {
        throw new Error("No items router address found in previous deployment status. Run full deploy first.");
    }
    if (!previousStatus.contracts?.svgPartWriter) {
        console.log("  ⚠️  No svgPartWriter address in previous status (non-critical, will preserve if present)");
    }

    const { traitsConfig, traitWeights, noneTraitIds } = loadTraitsConfig();
    const {
        baseTraitCounts,
        rendererRouters,
        svgRenderer: reusedSvgRenderer,
        svgRendererAddress,
    } = await loadReusedRendererState(previousStatus, traitsConfig);
    const itemsRouterAddress = previousStatus.routers.items;
    const itemsRouter = await ethers.getContractAt("SVGRouter", itemsRouterAddress);

    console.log("  Reusing deployed FregsSVGRenderer:", svgRendererAddress);
    console.log("  Reused renderer routers:");
    for (const [key, addr] of Object.entries(rendererRouters)) {
        console.log(`    ${key}: ${addr}`);
    }
    console.log(`  Reused items router: ${itemsRouterAddress}`);
    console.log("  Reused base trait counts:", baseTraitCounts);

    // Configuration
    const ROYALTY_RECEIVER = deployerAddress;
    const ROYALTY_FEE = 500; // 5%
    const isLocalhost = network.name === "localhost" || network.name === "hardhat";

    const vrfConfig = getVrfConfig();
    if (!isLocalhost) {
        if (!vrfConfig.coordinator) throw new Error(`Missing VRF coordinator for ${network.name}. Set BASE_VRF_COORDINATOR in .env.`);
        if (!vrfConfig.subscriptionId || vrfConfig.subscriptionId === 0n) throw new Error(`Missing VRF subscription ID for ${network.name}. Set BASE_VRF_SUBSCRIPTION_ID in .env.`);
    }

    let vrfCoordinatorAddress = vrfConfig.coordinator;
    let vrfSubscriptionId = vrfConfig.subscriptionId;
    let vrfKeyHash = vrfConfig.keyHash;

    if (isLocalhost) {
        console.log("\n--- Deploying MockVRFV2PlusWrapper (mock coordinator) ---");
        const MockVRFV2PlusWrapper = await ethers.getContractFactory("MockVRFV2PlusWrapper");
        const mockCoordinator = await deployContract(MockVRFV2PlusWrapper, [], "MockVRFV2PlusWrapper");
        vrfCoordinatorAddress = await mockCoordinator.getAddress();
        vrfSubscriptionId = 1;
        vrfKeyHash = ethers.ZeroHash;
    }

    console.log("\n--- Deploying FregsRandomizer ---");
    const FregsRandomizer = await ethers.getContractFactory("FregsRandomizer");
    const fregsRandomizer = await deployContract(FregsRandomizer, [vrfCoordinatorAddress, vrfSubscriptionId, vrfKeyHash], "FregsRandomizer");
    const fregsRandomizerAddress = await fregsRandomizer.getAddress();

    // ============ Steg 2: Deploy Contracts ============
    console.log("\n--- Deploying Fregs ---");
    const Fregs = await ethers.getContractFactory("Fregs");
    const fregs = await deployContract(Fregs, [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs", "FREG"], "Fregs");
    const fregsAddress = await fregs.getAddress();

    console.log("\n--- Deploying Fregs Items ---");
    const FregsItems = await ethers.getContractFactory("FregsItems");
    const fregsItems = await deployContract(FregsItems, [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs Items", "FREGITEM", fregsAddress], "FregsItems");
    const fregsItemsAddress = await fregsItems.getAddress();

    console.log("\n--- Deploying Fregs Mint Pass ---");
    const FregsMintPass = await ethers.getContractFactory("FregsMintPass");
    const fregsMintPass = await deployContract(FregsMintPass, [""], "FregsMintPass");
    const fregsMintPassAddress = await fregsMintPass.getAddress();

    console.log("\n--- Deploying FregCoin ---");
    const FregCoin = await ethers.getContractFactory("FregCoin");
    const fregCoin = await deployContract(FregCoin, [], "FregCoin");
    const fregCoinAddress = await fregCoin.getAddress();

    console.log("\n--- Deploying SpinTheWheel ---");
    const SpinTheWheel = await ethers.getContractFactory("SpinTheWheel");
    const spinTheWheel = await deployContract(SpinTheWheel, [""], "SpinTheWheel");
    const spinTheWheelAddress = await spinTheWheel.getAddress();

    console.log("\n--- Deploying FregsLiquidity ---");
    const FregsLiquidity = await ethers.getContractFactory("FregsLiquidity");
    const fregsLiquidity = await deployContract(FregsLiquidity, [], "FregsLiquidity");
    const fregsLiquidityAddress = await fregsLiquidity.getAddress();

    console.log("\n--- Deploying FregShop ---");
    const FregShop = await ethers.getContractFactory("FregShop");
    const fregShop = await deployContract(FregShop, [], "FregShop");
    const fregShopAddress = await fregShop.getAddress();

    console.log("\n--- Deploying FregsAirdrop ---");
    const FregsAirdrop = await ethers.getContractFactory("FregsAirdrop");
    const fregsAirdrop = await deployContract(FregsAirdrop, [], "FregsAirdrop");
    const fregsAirdropAddress = await fregsAirdrop.getAddress();

    // ============ Steg 3: Configure Cross-Contract References ============
    console.log("\n--- Configuring Cross-Contract References ---");

    console.log("Configuring FregsRandomizer...");
    await sendTx(fregsRandomizer.setContracts(fregsAddress, fregsItemsAddress, spinTheWheelAddress));
    await sendTx(
        fregsRandomizer.setCallbackGasLimits(
            VRF_CALLBACK_GAS.mint,
            VRF_CALLBACK_GAS.claimItem,
            VRF_CALLBACK_GAS.headReroll,
            VRF_CALLBACK_GAS.spin
        )
    );
   // await sendTx(fregsRandomizer.setRequestConfirmations(VRF_REQUEST_CONFIRMATIONS));
    if (isLocalhost) {
        await sendTx(fregsRandomizer.setAutoFulfill(true));
    }
    console.log("  VRF coordinator:", vrfCoordinatorAddress);
    console.log("  VRF subscription ID:", vrfSubscriptionId);

    if (!isLocalhost) {
        console.log("Adding FregsRandomizer as VRF subscription consumer...");
        const coordinator = await ethers.getContractAt("IVRFCoordinatorV2Plus", vrfCoordinatorAddress);
        await sendTx(coordinator.addConsumer(vrfSubscriptionId, fregsRandomizerAddress));
        console.log("  FregsRandomizer added as consumer!");
    }

    console.log("Setting items contract on Fregs...");
    await sendTx(fregs.setItemsContract(fregsItemsAddress));

    console.log("Setting mint pass contract on Fregs...");
    await sendTx(fregs.setMintPassContract(fregsMintPassAddress));
    console.log("Setting randomizer on Fregs...");
    await sendTx(fregs.setRandomizer(fregsRandomizerAddress));

    console.log("Setting Fregs on MintPass...");
    await sendTx(fregsMintPass.setFregsContract(fregsAddress));

    console.log("Configuring SpinTheWheel...");
    await sendTx(spinTheWheel.setMintPassContract(fregsMintPassAddress));
    await sendTx(spinTheWheel.setItemsContract(fregsItemsAddress));
    await sendTx(spinTheWheel.setLoseWeight(SPIN_LOSE_WEIGHT));
    await sendTx(spinTheWheel.setMintPassWeight(SPIN_MINTPASS_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(HOODIE_ITEM_TYPE, SPIN_HOODIE_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(FROGSUIT_ITEM_TYPE, SPIN_FROGSUIT_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(CHEST_ITEM_TYPE, SPIN_CHEST_WEIGHT));

    await sendTx(spinTheWheel.setItemMaxSupply(CHEST_ITEM_TYPE, 700));
    await sendTx(spinTheWheel.setItemMaxSupply(HOODIE_ITEM_TYPE, 30));
    await sendTx(spinTheWheel.setItemMaxSupply(FROGSUIT_ITEM_TYPE, 30));

    console.log("Setting SpinTheWheel on MintPass and Items...");
    await sendTx(fregsMintPass.setSpinTheWheelContract(spinTheWheelAddress));
    await sendTx(fregsItems.setSpinTheWheelContract(spinTheWheelAddress));

    console.log("Setting FregCoin on FregsItems...");
    await sendTx(fregsItems.setFregCoinContract(fregCoinAddress));
    console.log("Setting randomizer on FregsItems...");
    await sendTx(fregsItems.setRandomizer(fregsRandomizerAddress));
    console.log("Setting randomizer on SpinTheWheel...");
    await sendTx(spinTheWheel.setRandomizer(fregsRandomizerAddress));

    console.log("Configuring FregsLiquidity...");
    await sendTx(fregsLiquidity.setFregs(fregsAddress));
    await sendTx(fregsLiquidity.setFregCoin(fregCoinAddress));
    await sendTx(fregs.setLiquidityContract(fregsLiquidityAddress));

    console.log("Configuring FregShop...");
    await sendTx(fregShop.setFregCoinContract(fregCoinAddress));
    await sendTx(fregShop.setItemsContract(fregsItemsAddress));
    await sendTx(fregsItems.setShopContract(fregShopAddress));

    console.log("Configuring FregsAirdrop...");
    await sendTx(fregsAirdrop.setFregCoin(fregCoinAddress));
    await sendTx(fregsAirdrop.setFregs(fregsAddress));

    // ============ Steg 4: Set Mint Phase + localhost setup ============
    if (isLocalhost) {
        console.log("\n--- Setting mint phase to Public (2) for localhost ---");
        await sendTx(fregs.setMintPhase(2));
    } else {
        console.log("\n--- Setting mint phase to Paused (0) for live network ---");
        await sendTx(fregs.setMintPhase(0));
    }

    let mintPassBalance = 0n;
    let spinTokenBalance = 0n;
    if (isLocalhost) {
        console.log("\n--- Minting Mint Passes ---");
        console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to deployer...`);
        await sendTx(fregsMintPass.ownerMint(deployerAddress, MINT_PASSES_TO_MINT, { gasLimit: 200000n }));
        mintPassBalance = await fregsMintPass.balanceOf(deployerAddress, 1);
        console.log(`Deployer mint pass balance: ${mintPassBalance}`);

        if (ADDITIONAL_MINTPASS_RECIPIENT && ADDITIONAL_MINTPASS_RECIPIENT !== "0x0000000000000000000000000000000000000000") {
            console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to ${ADDITIONAL_MINTPASS_RECIPIENT}...`);
            await sendTx(fregsMintPass.ownerMint(ADDITIONAL_MINTPASS_RECIPIENT, MINT_PASSES_TO_MINT, { gasLimit: 200000n }));
            const additionalBalance = await fregsMintPass.balanceOf(ADDITIONAL_MINTPASS_RECIPIENT, 1);
            console.log(`Additional recipient mint pass balance: ${additionalBalance}`);
        }
    }

    if (isLocalhost && INITIAL_SPIN_TOKENS_TO_MINT > 0) {
        console.log("\n--- Minting SpinTokens ---");
        console.log(`Minting ${INITIAL_SPIN_TOKENS_TO_MINT} SpinTokens to deployer...`);
        await sendTx(spinTheWheel.ownerMint(deployerAddress, INITIAL_SPIN_TOKENS_TO_MINT));
        spinTokenBalance = await spinTheWheel.balanceOf(deployerAddress, 1);
        console.log(`Deployer SpinToken balance: ${spinTokenBalance}`);

        const chestFunding = ethers.parseEther("133700000000");
        console.log("Transferring 133.7B FregCoin to FregsItems for chest rewards...");
        await sendTx(fregCoin.transfer(fregsItemsAddress, chestFunding));
        const itemsCoinBalance = await fregCoin.balanceOf(fregsItemsAddress);
        console.log(`FregsItems FregCoin balance: ${ethers.formatEther(itemsCoinBalance)}`);

    }

    // ============ Steg 5: Configure items from items.json ============
    console.log("\n--- Loading Item Config from items.json ---");
    const itemsConfig = loadItemsConfig();
    let itemConfigs = null;
    if (itemsConfig) {
        const { configs } = buildItemConfigs(itemsConfig);
        itemConfigs = configs;

        const itemTypeIds = Object.keys(configs).map(Number);
        const names = itemTypeIds.map(id => configs[id].name);
        const descriptions = itemTypeIds.map(id => configs[id].description);

        console.log(`  Configuring ${itemTypeIds.length} item configs from items.json...`);
        await sendTx(fregsItems.setBuiltInItemConfigsBatch(itemTypeIds, names, descriptions));
        console.log("  Item configs set!");
    } else {
        console.log("  ⚠️  No items/items.json found, skipping item config");
    }

    console.log("\nCross-contract references configured!");

    // ============ Steg 6: Reuse existing FregsSVGRenderer ============
    console.log("\n--- Reusing Existing FregsSVGRenderer ---");
    console.log("Setting SVG Renderer on Fregs...");
    await sendTx(fregs.setSVGRenderer(svgRendererAddress));
    console.log("SVG Renderer set on Fregs!");

    // Configure trait weights from traits.json
    const TRAIT_TYPE_MAP = { head: 2, mouth: 3, stomach: 4 };
    console.log("\n--- Configuring Trait Weights on Fregs ---");
    for (const [traitName, traitTypeId] of Object.entries(TRAIT_TYPE_MAP)) {
        const weights = traitWeights[traitName];
        const noneId = noneTraitIds[traitName] || 0;
        if (weights && weights.length > 0) {
            console.log(`  Setting ${traitName} weights: [${weights.join(', ')}], noneTraitId: ${noneId}`);
            await sendTx(fregs.setTraitWeights(traitTypeId, weights, noneId));
            console.log(`  ${traitName} weights configured!`);
        }
    }

    // Set Items SVG Renderer on FregsItems
    console.log("Setting SVG Renderer on FregsItems...");
    await sendTx(fregsItems.setSVGRenderer(itemsRouterAddress));
    console.log("SVG Renderer set on FregsItems!");

    // Configure trait item mappings
    if (itemsConfig) {
        console.log("\n--- Configuring Trait Item Mappings ---");
        const traitMappings = buildTraitItemMappings(itemsConfig, baseTraitCounts);

        if (traitMappings.length > 0) {
            const allItemTypes = traitMappings.map(m => m.itemId);
            const allTraitValues = traitMappings.map(m => m.traitValue);

            console.log(`  Configuring ${allItemTypes.length} trait item mappings...`);
            await sendTx(fregsItems.setTraitItemMappingsBatch(allItemTypes, allTraitValues));
            console.log("  Trait item mappings configured!");
        }
    }

    const restoredItemTypes = await restoreDynamicItemTypesFromStatus(
        fregsItems,
        fregShop,
        reusedSvgRenderer,
        itemsRouter,
        previousStatus
    );

    // ============ Steg 7: Copy ABIs to Website ============
    console.log("\n--- Copying ABIs to Website ---");
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
        console.log(`Created ABI directory: ${WEBSITE_ABI_PATH}`);
    }
    copyABI("Fregs", "Fregs");
    copyABI("FregsItems", "FregsItems");
    copyABI("FregsMintPass", "FregsMintPass");
    copyABI("FregsRandomizer", "FregsRandomizer");
    copyABI("SpinTheWheel", "SpinTheWheel");
    copyABI("FregCoin", "FregCoin");
    copyABI("FregsLiquidity", "FregsLiquidity");
    copyABI("FregShop", "FregShop");
    copyABI("FregsAirdrop", "FregsAirdrop");
    console.log("  Reused FregsSVGRenderer ABI left unchanged.");
    console.log("ABIs copied successfully!");

    // ============ Steg 8: Build and save new deployment status ============
    console.log("\n--- Saving Deployment Status ---");
    const newStatus = {
        network: network.name,
        lastUpdated: null,
        contracts: {
            fregs: fregsAddress,
            fregsItems: fregsItemsAddress,
            fregsMintPass: fregsMintPassAddress,
            fregsRandomizer: fregsRandomizerAddress,
            fregCoin: fregCoinAddress,
            spinTheWheel: spinTheWheelAddress,
            fregsLiquidity: fregsLiquidityAddress,
            fregShop: fregShopAddress,
            fregsAirdrop: fregsAirdropAddress,
            svgRenderer: svgRendererAddress,
            vrfCoordinator: vrfCoordinatorAddress,
            vrfSubscriptionId: vrfSubscriptionId,
            // Preserve svgPartWriter from previous deploy
            svgPartWriter: previousStatus.contracts?.svgPartWriter || null,
        },
        // Preserve all SVG data from previous deploy
        routers: {
            ...rendererRouters,
            items: itemsRouterAddress,
        },
        defaultTraits: previousStatus.defaultTraits,
        addedTraits: previousStatus.addedTraits || {},
        itemTypes: restoredItemTypes,
    };
    saveDeploymentStatus(newStatus, network.name);

    // ============ Steg 9: Verify Contracts ============
    const shouldVerify = process.env.VERIFY_CONTRACTS === "true" && !isLocalhost;
    if (shouldVerify) {
        console.log("\n--- Verifying Contracts on Basescan ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        const toVerify = [
            { name: "FregsRandomizer",  address: fregsRandomizerAddress,  args: [vrfCoordinatorAddress, vrfSubscriptionId, vrfKeyHash] },
            { name: "Fregs",            address: fregsAddress,             args: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs", "FREG"] },
            { name: "FregsItems",       address: fregsItemsAddress,        args: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs Items", "FREGITEM", fregsAddress] },
            { name: "FregsMintPass",    address: fregsMintPassAddress,     args: [""] },
            { name: "FregCoin",         address: fregCoinAddress,          args: [] },
            { name: "SpinTheWheel",     address: spinTheWheelAddress,      args: [""] },
            { name: "FregsLiquidity",   address: fregsLiquidityAddress,    args: [] },
            { name: "FregShop",         address: fregShopAddress,          args: [] },
            { name: "FregsAirdrop",     address: fregsAirdropAddress,      args: [] },
        ];

        for (const { name, address, args } of toVerify) {
            try {
                console.log(`Verifying ${name}...`);
                await run("verify:verify", { address, constructorArguments: args });
                console.log(`  ${name} verified!`);
            } catch (error) {
                console.log(`  ${name} verification failed: ${error.message}`);
            }
        }
    } else if (!shouldVerify && !isLocalhost) {
        console.log("\n--- Skipping Contract Verification (VERIFY_CONTRACTS != true) ---");
    }

    // ============ Steg 10: Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY (contracts only, SVGs reused)");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Addresses (NEW):");
    console.log("  Fregs:           ", fregsAddress);
    console.log("  Fregs Items:     ", fregsItemsAddress);
    console.log("  Fregs Mint Pass: ", fregsMintPassAddress);
    console.log("  FregsRandomizer: ", fregsRandomizerAddress);
    console.log("  FregCoin:        ", fregCoinAddress);
    console.log("  SpinTheWheel:    ", spinTheWheelAddress);
    console.log("  FregsLiquidity:  ", fregsLiquidityAddress);
    console.log("  FregShop:        ", fregShopAddress);
    console.log("  FregsAirdrop:    ", fregsAirdropAddress);
    console.log("  VRF Coordinator: ", vrfCoordinatorAddress);
    console.log("  VRF Subscription:", vrfSubscriptionId);
    console.log("  SVG Renderer:    ", `${svgRendererAddress} (reused)`);
    console.log("\nArt Contracts (REUSED from previous deploy):");
    console.log("  Background:      ", rendererRouters.background || "N/A");
    console.log("  Body:            ", rendererRouters.body || "N/A");
    console.log("  Skin:            ", rendererRouters.skin || "N/A");
    console.log("  Head:            ", rendererRouters.head || "N/A");
    console.log("  Mouth:           ", rendererRouters.mouth || "N/A");
    console.log("  Stomach:         ", rendererRouters.stomach || "N/A");
    console.log("  Items:           ", itemsRouterAddress || "N/A");
    console.log("\nBase Trait Counts:");
    console.log("  Head:    ", baseTraitCounts.head || 0);
    console.log("  Mouth:   ", baseTraitCounts.mouth || 0);
    console.log("  Stomach: ", baseTraitCounts.stomach || 0);

    console.log("\n" + "=".repeat(60));

    console.log("\nNext Steps:");
    console.log("  1. Fund items contract with FregCoin for chest rewards:");
    console.log(`     npx hardhat run scripts/fundChestRewards.js --network ${network.name}`);

    console.log(`\nVITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress} VITE_SVG_RENDERER_ADDRESS=${svgRendererAddress} npx hardhat run scripts/deploySpecialItems.js --network localhost`);
    console.log("\nFor .env file:");
    console.log(`VITE_FREGS_ADDRESS=${fregsAddress}`);
    console.log(`VITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress}`);
    console.log(`VITE_FREGS_MINTPASS_ADDRESS=${fregsMintPassAddress}`);
    console.log(`VITE_FREGCOIN_ADDRESS=${fregCoinAddress}`);
    console.log(`VITE_SPIN_THE_WHEEL_ADDRESS=${spinTheWheelAddress}`);
    console.log(`VITE_FREGS_LIQUIDITY_ADDRESS=${fregsLiquidityAddress}`);
    console.log(`VITE_FREG_SHOP_ADDRESS=${fregShopAddress}`);
    console.log(`VITE_FREG_AIRDROP_ADDRESS=${fregsAirdropAddress}`);
    console.log(`VITE_SVG_RENDERER_ADDRESS=${svgRendererAddress}`);
    console.log(`VITE_FREGS_RANDOMIZER_ADDRESS=${fregsRandomizerAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
