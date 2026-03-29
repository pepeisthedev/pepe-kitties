const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

// ============ CONFIGURATION ============
// Contract addresses - set these from deployment-status.json or environment
const FREGS_ADDRESS = process.env.VITE_FREGS_ADDRESS || "";
const FREGS_MINTPASS_ADDRESS = process.env.VITE_FREGS_MINTPASS_ADDRESS || "";
const FREGS_ITEMS_ADDRESS = process.env.VITE_FREGS_ITEMS_ADDRESS || "";

// Prize configuration (weights out of 10000)
const LOSE_WEIGHT = 0;              // 0% chance to lose (every spin wins)
const MINTPASS_WEIGHT = 9000;       // 90% chance to win MintPass
const HOODIE_WEIGHT = 300;          // 3% chance to win Hoodie
const FROGSUIT_WEIGHT = 300;        // 3% chance to win Frogsuit
const CHEST_WEIGHT = 400;           // 4% chance to win Treasure Chest

// Item type IDs (must match items.json)
const HOODIE_ITEM_TYPE = 9;
const FROGSUIT_ITEM_TYPE = 10;
const CHEST_ITEM_TYPE = 6;

// Initial SpinTokens to mint to owner for distribution
const INITIAL_TOKENS_TO_MINT = 100;
const VRF_CALLBACK_GAS = {
    mint: Number(process.env.VRF_MINT_CALLBACK_GAS_LIMIT || 700000),
    claimItem: Number(process.env.VRF_CLAIM_ITEM_CALLBACK_GAS_LIMIT || 500000),
    headReroll: Number(process.env.VRF_HEAD_REROLL_CALLBACK_GAS_LIMIT || 350000),
    spin: Number(process.env.VRF_SPIN_CALLBACK_GAS_LIMIT || 450000),
};
const VRF_REQUEST_CONFIRMATIONS = Number(process.env.VRF_REQUEST_CONFIRMATIONS || 3);

// Verify contracts on block explorer
const VERIFY_CONTRACTS = false;

// Paths
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");
const DEFAULT_VRF_WRAPPER_ADDRESSES = {
    baseSepolia: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed",
    base: "0xb0407dbe851f8318bd31404A49e658143C982F23",
};

function getVrfWrapperAddress() {
    if (network.name === "localhost" || network.name === "hardhat") {
        return null;
    }
    if (network.name === "baseSepolia") {
        return process.env.BASE_SEPOLIA_VRF_WRAPPER_ADDRESS || DEFAULT_VRF_WRAPPER_ADDRESSES.baseSepolia;
    }
    if (network.name === "base") {
        return process.env.BASE_VRF_WRAPPER_ADDRESS || DEFAULT_VRF_WRAPPER_ADDRESSES.base;
    }
    return process.env.VRF_WRAPPER_ADDRESS || "";
}

// ============ HELPERS ============

async function sendTx(txPromise, confirmations = 1) {
    const tx = await txPromise;
    const receipt = await tx.wait(confirmations);
    if (network.name !== "localhost" && network.name !== "hardhat") {
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return receipt;
}

async function deployContract(factory, args = [], name = "Contract") {
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
}

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

// ============ MAIN ============

async function main() {
    console.log("=".repeat(60));
    console.log("SpinTheWheel Deployment Script");
    console.log("=".repeat(60));

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
        console.error("\nError: No wallet configured for this network!");
        process.exit(1);
    }

    const [deployer] = signers;
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();

    console.log("\nNetwork:", network.name);
    console.log("Chain ID:", networkInfo.chainId.toString());
    console.log("Deployer:", deployerAddress);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "ETH");

    // Load deployment status
    const deploymentStatus = loadDeploymentStatus(network.name);

    // Get existing contract addresses
    const fregsAddress = FREGS_ADDRESS || deploymentStatus.contracts?.fregs;
    const mintPassAddress = FREGS_MINTPASS_ADDRESS || deploymentStatus.contracts?.fregsMintPass;
    const itemsAddress = FREGS_ITEMS_ADDRESS || deploymentStatus.contracts?.fregsItems;
    const existingRandomizerAddress = deploymentStatus.contracts?.fregsRandomizer || "";

    if (!fregsAddress) {
        console.error("\n❌ Error: Fregs address not found!");
        console.error("Run deploy.js first or set VITE_FREGS_ADDRESS in environment");
        process.exit(1);
    }

    if (!mintPassAddress) {
        console.error("\n❌ Error: FregsMintPass address not found!");
        console.error("Run deploy.js first or set VITE_FREGS_MINTPASS_ADDRESS in environment");
        process.exit(1);
    }

    if (!itemsAddress) {
        console.error("\n❌ Error: FregsItems address not found!");
        console.error("Run deploy.js first or set VITE_FREGS_ITEMS_ADDRESS in environment");
        process.exit(1);
    }

    console.log("\nExisting Contracts:");
    console.log("  Fregs:", fregsAddress);
    console.log("  FregsMintPass:", mintPassAddress);
    console.log("  FregsItems:", itemsAddress);
    if (existingRandomizerAddress) {
        console.log("  FregsRandomizer:", existingRandomizerAddress);
    }

    const isLocalhost = network.name === "localhost" || network.name === "hardhat";
    let vrfWrapperAddress = deploymentStatus.contracts?.vrfWrapper || getVrfWrapperAddress();
    if (!isLocalhost && !vrfWrapperAddress && !existingRandomizerAddress) {
        console.error(`\n❌ Error: Missing VRF wrapper address for ${network.name}.`);
        console.error("Set BASE_SEPOLIA_VRF_WRAPPER_ADDRESS or BASE_VRF_WRAPPER_ADDRESS.");
        process.exit(1);
    }

    let fregsRandomizer;
    let fregsRandomizerAddress = existingRandomizerAddress;
    if (existingRandomizerAddress) {
        console.log("\n--- Reusing Existing FregsRandomizer ---");
        fregsRandomizer = await ethers.getContractAt("FregsRandomizer", existingRandomizerAddress);
    } else {
        if (isLocalhost) {
            console.log("\n--- Deploying MockVRFV2PlusWrapper ---");
            const MockVRFV2PlusWrapper = await ethers.getContractFactory("MockVRFV2PlusWrapper");
            const mockWrapper = await deployContract(MockVRFV2PlusWrapper, [], "MockVRFV2PlusWrapper");
            vrfWrapperAddress = await mockWrapper.getAddress();
        }

        console.log("\n--- Deploying FregsRandomizer ---");
        const FregsRandomizer = await ethers.getContractFactory("FregsRandomizer");
        fregsRandomizer = await deployContract(FregsRandomizer, [vrfWrapperAddress], "FregsRandomizer");
        fregsRandomizerAddress = await fregsRandomizer.getAddress();
    }

    // ============ Deploy SpinTheWheel ============
    console.log("\n--- Deploying SpinTheWheel ---");
    const SpinTheWheel = await ethers.getContractFactory("SpinTheWheel");
    const spinTheWheel = await deployContract(SpinTheWheel, [""], "SpinTheWheel");
    const spinTheWheelAddress = await spinTheWheel.getAddress();

    // ============ Configure SpinTheWheel ============
    console.log("\n--- Configuring SpinTheWheel ---");

    console.log("Setting MintPass contract...");
    await sendTx(spinTheWheel.setMintPassContract(mintPassAddress));

    console.log("Setting Items contract...");
    await sendTx(spinTheWheel.setItemsContract(itemsAddress));

    console.log("Setting randomizer...");
    await sendTx(spinTheWheel.setRandomizer(fregsRandomizerAddress));

    console.log("\n--- Configuring FregsRandomizer ---");
    await sendTx(fregsRandomizer.setContracts(fregsAddress, itemsAddress, spinTheWheelAddress));
    await sendTx(
        fregsRandomizer.setCallbackGasLimits(
            VRF_CALLBACK_GAS.mint,
            VRF_CALLBACK_GAS.claimItem,
            VRF_CALLBACK_GAS.headReroll,
            VRF_CALLBACK_GAS.spin
        )
    );
    await sendTx(fregsRandomizer.setRequestConfirmations(VRF_REQUEST_CONFIRMATIONS));
    if (isLocalhost) {
        await sendTx(fregsRandomizer.setAutoFulfill(true));
    }

    console.log("Setting lose weight:", LOSE_WEIGHT, "(", LOSE_WEIGHT / 100, "%)");
    await sendTx(spinTheWheel.setLoseWeight(LOSE_WEIGHT));

    console.log("Setting MintPass weight:", MINTPASS_WEIGHT, "(", MINTPASS_WEIGHT / 100, "%)");
    await sendTx(spinTheWheel.setMintPassWeight(MINTPASS_WEIGHT));

    console.log("Adding Hoodie prize (type", HOODIE_ITEM_TYPE, ") with weight:", HOODIE_WEIGHT, "(", HOODIE_WEIGHT / 100, "%)");
    await sendTx(spinTheWheel.addItemPrize(HOODIE_ITEM_TYPE, HOODIE_WEIGHT));

    console.log("Adding Frogsuit prize (type", FROGSUIT_ITEM_TYPE, ") with weight:", FROGSUIT_WEIGHT, "(", FROGSUIT_WEIGHT / 100, "%)");
    await sendTx(spinTheWheel.addItemPrize(FROGSUIT_ITEM_TYPE, FROGSUIT_WEIGHT));

    console.log("Adding Treasure Chest prize (type", CHEST_ITEM_TYPE, ") with weight:", CHEST_WEIGHT, "(", CHEST_WEIGHT / 100, "%)");
    await sendTx(spinTheWheel.addItemPrize(CHEST_ITEM_TYPE, CHEST_WEIGHT));

    console.log("Setting max supply for Treasure Chest (type", CHEST_ITEM_TYPE, ") to 700...");
    await sendTx(spinTheWheel.setItemMaxSupply(CHEST_ITEM_TYPE, 700));

    // ============ Configure Existing Contracts ============
    console.log("\n--- Configuring Existing Contracts ---");

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);
    const fregsMintPass = await ethers.getContractAt("FregsMintPass", mintPassAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", itemsAddress);

    console.log("Setting SpinTheWheel on FregsMintPass...");
    await sendTx(fregsMintPass.setSpinTheWheelContract(spinTheWheelAddress));

    console.log("Setting SpinTheWheel on FregsItems...");
    await sendTx(fregsItems.setSpinTheWheelContract(spinTheWheelAddress));

    if (!existingRandomizerAddress) {
        console.log("Setting randomizer on Fregs...");
        await sendTx(fregs.setRandomizer(fregsRandomizerAddress));

        console.log("Setting randomizer on FregsItems...");
        await sendTx(fregsItems.setRandomizer(fregsRandomizerAddress));
    }

    // ============ Ensure Prize Item Types Are Configured ============
    // SpinTheWheel.spin() calls FregsItems.mintFromCoin() which requires
    // itemTypeConfigs[itemType].name to be non-empty
    console.log("\n--- Ensuring Prize Item Types Are Configured ---");

    const prizeItems = [
        { id: HOODIE_ITEM_TYPE, name: "Hoodie", desc: "A cozy hoodie for your Freg" },
        { id: FROGSUIT_ITEM_TYPE, name: "Frogsuit", desc: "A cool frogsuit for your Freg" },
        { id: CHEST_ITEM_TYPE, name: "Treasure Chest", desc: "Burn this chest to claim $FREG rewards" },
    ];

    for (const item of prizeItems) {
        try {
            const config = await fregsItems.itemTypeConfigs(item.id);
            if (config.name && config.name !== "") {
                console.log(`  ${item.name} (type ${item.id}) already configured`);
                continue;
            }
        } catch (e) {
            // Not configured yet
        }
        console.log(`  Configuring ${item.name} (type ${item.id})...`);
        await sendTx(fregsItems.setBuiltInItemConfig(item.id, item.name, item.desc));
    }

    // ============ Mint Initial SpinTokens ============
    if (isLocalhost && INITIAL_TOKENS_TO_MINT > 0) {
        console.log("\n--- Minting Initial SpinTokens ---");
        console.log(`Minting ${INITIAL_TOKENS_TO_MINT} SpinTokens to deployer...`);
        await sendTx(spinTheWheel.ownerMint(deployerAddress, INITIAL_TOKENS_TO_MINT));
        const balance = await spinTheWheel.balanceOf(deployerAddress, 1);
        console.log(`Deployer SpinToken balance: ${balance}`);
    }

    // ============ Save Deployment Status ============
    console.log("\n--- Saving Deployment Status ---");
    deploymentStatus.contracts.spinTheWheel = spinTheWheelAddress;
    deploymentStatus.contracts.fregsRandomizer = fregsRandomizerAddress;
    if (vrfWrapperAddress) {
        deploymentStatus.contracts.vrfWrapper = vrfWrapperAddress;
    }
    saveDeploymentStatus(deploymentStatus, network.name);

    // ============ Copy ABI ============
    console.log("\n--- Copying ABI to Website ---");
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
    }
    copyABI("SpinTheWheel", "SpinTheWheel");
    copyABI("FregsRandomizer", "FregsRandomizer");

    // ============ Verify Contract ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contract on Block Explorer ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        try {
            console.log("Verifying SpinTheWheel...");
            await run("verify:verify", {
                address: spinTheWheelAddress,
                constructorArguments: [""]
            });
            console.log("SpinTheWheel verified!");
        } catch (error) {
            console.log("SpinTheWheel verification failed:", error.message);
        }
    }

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("SPINTHEWHEEL DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Address:");
    console.log("  SpinTheWheel:", spinTheWheelAddress);
    console.log("  FregsRandomizer:", fregsRandomizerAddress);
    if (vrfWrapperAddress) {
        console.log("  VRF Wrapper:", vrfWrapperAddress);
    }
    console.log("\nPrize Configuration:");
    console.log("  Total Weight:", LOSE_WEIGHT + MINTPASS_WEIGHT + HOODIE_WEIGHT + FROGSUIT_WEIGHT + CHEST_WEIGHT);
    console.log("  Lose:", LOSE_WEIGHT / 100, "%");
    console.log("  MintPass:", MINTPASS_WEIGHT / 100, "%");
    console.log("  Hoodie:", HOODIE_WEIGHT / 100, "%");
    console.log("  Frogsuit:", FROGSUIT_WEIGHT / 100, "%");
    console.log("  Treasure Chest:", CHEST_WEIGHT / 100, "%");
    console.log("\nLinked Contracts:");
    console.log("  Fregs:", fregsAddress);
    console.log("  FregsMintPass:", mintPassAddress);
    console.log("  FregsItems:", itemsAddress);

    if (isLocalhost) {
        const balance = await spinTheWheel.balanceOf(deployerAddress, 1);
        console.log("\nDeployer SpinToken Balance:", balance.toString());
    }

    console.log("\nNext Steps:");
    console.log("  1. Mint SpinTokens to users for distribution:");
    console.log("     await spinTheWheel.ownerMint(recipientAddress, amount)");
    console.log("  2. Or airdrop to multiple users:");
    console.log("     await spinTheWheel.airdrop([addr1, addr2], [amount1, amount2])");
    console.log("  3. Users can spin with:");
    console.log("     const fee = await spinTheWheel.quoteSpinFee()");
    console.log("     await spinTheWheel.spin({ value: fee })");

    console.log("\nFor .env file:");
    console.log(`VITE_SPIN_THE_WHEEL_ADDRESS=${spinTheWheelAddress}`);

    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
