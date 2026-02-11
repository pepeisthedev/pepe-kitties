const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ CONFIGURATION ============
// Contract addresses - set these from deployment-status.json or environment
const FREGS_MINTPASS_ADDRESS = process.env.VITE_FREGS_MINTPASS_ADDRESS || "";
const FREGS_ITEMS_ADDRESS = process.env.VITE_FREGS_ITEMS_ADDRESS || "";

// Prize configuration (weights out of 10000)
const LOSE_WEIGHT = 8000;           // 80% chance to lose
const MINTPASS_WEIGHT = 1000;       // 10% chance to win MintPass
const SILVER_SKIN_WEIGHT = 500;     // 5% chance to win Silver Skin
const NEON_SKIN_WEIGHT = 500;       // 5% chance to win Neon Skin

// Item type IDs for the new skins (must match items.json)
// Using high IDs (200+) to keep spin wheel exclusive items separate from regular items
const SILVER_SKIN_ITEM_TYPE = 200;
const NEON_SKIN_ITEM_TYPE = 201;

// Initial FregCoins to mint to owner for distribution
const INITIAL_COINS_TO_MINT = 100;

// Verify contracts on block explorer
const VERIFY_CONTRACTS = false;

// Paths
const DEPLOYMENT_STATUS_PATH = path.join(__dirname, "../deployment-status.json");
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");

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

function loadDeploymentStatus() {
    if (fs.existsSync(DEPLOYMENT_STATUS_PATH)) {
        return JSON.parse(fs.readFileSync(DEPLOYMENT_STATUS_PATH, "utf8"));
    }
    return {
        network: null,
        lastUpdated: null,
        contracts: {},
        routers: {},
        defaultTraits: {},
        addedTraits: {},
        itemTypes: {}
    };
}

function saveDeploymentStatus(status) {
    status.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DEPLOYMENT_STATUS_PATH, JSON.stringify(status, null, 2));
    console.log(`  Deployment status saved to: ${DEPLOYMENT_STATUS_PATH}`);
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
    console.log("FregCoin Deployment Script");
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
    const deploymentStatus = loadDeploymentStatus();

    // Verify network matches
    if (deploymentStatus.network && deploymentStatus.network !== network.name) {
        console.warn(`\n⚠️  Warning: Deployment status is for ${deploymentStatus.network}, but running on ${network.name}`);
    }

    // Get existing contract addresses
    const mintPassAddress = FREGS_MINTPASS_ADDRESS || deploymentStatus.contracts?.fregsMintPass;
    const itemsAddress = FREGS_ITEMS_ADDRESS || deploymentStatus.contracts?.fregsItems;

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
    console.log("  FregsMintPass:", mintPassAddress);
    console.log("  FregsItems:", itemsAddress);

    // ============ Deploy FregCoin ============
    console.log("\n--- Deploying FregCoin ---");
    const FregCoin = await ethers.getContractFactory("FregCoin");
    const fregCoin = await deployContract(FregCoin, [""], "FregCoin");
    const fregCoinAddress = await fregCoin.getAddress();

    // ============ Configure FregCoin ============
    console.log("\n--- Configuring FregCoin ---");

    console.log("Setting MintPass contract...");
    await sendTx(fregCoin.setMintPassContract(mintPassAddress));

    console.log("Setting Items contract...");
    await sendTx(fregCoin.setItemsContract(itemsAddress));

    console.log("Setting lose weight:", LOSE_WEIGHT, "(", LOSE_WEIGHT / 100, "%)");
    await sendTx(fregCoin.setLoseWeight(LOSE_WEIGHT));

    console.log("Setting MintPass weight:", MINTPASS_WEIGHT, "(", MINTPASS_WEIGHT / 100, "%)");
    await sendTx(fregCoin.setMintPassWeight(MINTPASS_WEIGHT));

    console.log("Adding Silver Skin prize (type", SILVER_SKIN_ITEM_TYPE, ") with weight:", SILVER_SKIN_WEIGHT, "(", SILVER_SKIN_WEIGHT / 100, "%)");
    await sendTx(fregCoin.addItemPrize(SILVER_SKIN_ITEM_TYPE, SILVER_SKIN_WEIGHT));

    console.log("Adding Neon Skin prize (type", NEON_SKIN_ITEM_TYPE, ") with weight:", NEON_SKIN_WEIGHT, "(", NEON_SKIN_WEIGHT / 100, "%)");
    await sendTx(fregCoin.addItemPrize(NEON_SKIN_ITEM_TYPE, NEON_SKIN_WEIGHT));

    // ============ Configure Existing Contracts ============
    console.log("\n--- Configuring Existing Contracts ---");

    const fregsMintPass = await ethers.getContractAt("FregsMintPass", mintPassAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", itemsAddress);

    console.log("Setting FregCoin on FregsMintPass...");
    await sendTx(fregsMintPass.setFregCoinContract(fregCoinAddress));

    console.log("Setting FregCoin on FregsItems...");
    await sendTx(fregsItems.setFregCoinContract(fregCoinAddress));

    // ============ Configure New Skin Item Types ============
    console.log("\n--- Configuring New Skin Item Types ---");

    // Check if items need to be configured
    try {
        const silverConfig = await fregsItems.itemTypeConfigs(SILVER_SKIN_ITEM_TYPE);
        if (!silverConfig.name || silverConfig.name === "") {
            console.log("Configuring Silver Skin item type...");
            await sendTx(fregsItems.setBuiltInItemConfig(
                SILVER_SKIN_ITEM_TYPE,
                "Silver Skin",
                "A shimmering silver skin - exclusive spin wheel prize"
            ));
        } else {
            console.log("  Silver Skin already configured");
        }
    } catch (e) {
        console.log("Configuring Silver Skin item type...");
        await sendTx(fregsItems.setBuiltInItemConfig(
            SILVER_SKIN_ITEM_TYPE,
            "Silver Skin",
            "A shimmering silver skin - exclusive spin wheel prize"
        ));
    }

    try {
        const neonConfig = await fregsItems.itemTypeConfigs(NEON_SKIN_ITEM_TYPE);
        if (!neonConfig.name || neonConfig.name === "") {
            console.log("Configuring Neon Skin item type...");
            await sendTx(fregsItems.setBuiltInItemConfig(
                NEON_SKIN_ITEM_TYPE,
                "Neon Skin",
                "A glowing neon skin - exclusive spin wheel prize"
            ));
        } else {
            console.log("  Neon Skin already configured");
        }
    } catch (e) {
        console.log("Configuring Neon Skin item type...");
        await sendTx(fregsItems.setBuiltInItemConfig(
            NEON_SKIN_ITEM_TYPE,
            "Neon Skin",
            "A glowing neon skin - exclusive spin wheel prize"
        ));
    }

    // Configure skin trait mappings (maps item type to skin trait value)
    // These values should match the fileName numbers in from_items/traits.json
    console.log("Setting skin trait mappings...");
    await sendTx(fregsItems.setSkinItemTraitValue(SILVER_SKIN_ITEM_TYPE, 200)); // 200.svg
    await sendTx(fregsItems.setSkinItemTraitValue(NEON_SKIN_ITEM_TYPE, 201));   // 201.svg

    // ============ Mint Initial FregCoins ============
    const isLocalhost = network.name === "localhost" || network.name === "hardhat";
    if (isLocalhost && INITIAL_COINS_TO_MINT > 0) {
        console.log("\n--- Minting Initial FregCoins ---");
        console.log(`Minting ${INITIAL_COINS_TO_MINT} FregCoins to deployer...`);
        await sendTx(fregCoin.ownerMint(deployerAddress, INITIAL_COINS_TO_MINT));
        const balance = await fregCoin.balanceOf(deployerAddress, 1);
        console.log(`Deployer FregCoin balance: ${balance}`);
    }

    // ============ Save Deployment Status ============
    console.log("\n--- Saving Deployment Status ---");
    deploymentStatus.contracts.fregCoin = fregCoinAddress;
    saveDeploymentStatus(deploymentStatus);

    // ============ Copy ABI ============
    console.log("\n--- Copying ABI to Website ---");
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
    }
    copyABI("FregCoin", "FregCoin");

    // ============ Verify Contract ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contract on Block Explorer ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        try {
            console.log("Verifying FregCoin...");
            await run("verify:verify", {
                address: fregCoinAddress,
                constructorArguments: [""]
            });
            console.log("FregCoin verified!");
        } catch (error) {
            console.log("FregCoin verification failed:", error.message);
        }
    }

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("FREGCOIN DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Address:");
    console.log("  FregCoin:", fregCoinAddress);
    console.log("\nPrize Configuration:");
    console.log("  Total Weight:", LOSE_WEIGHT + MINTPASS_WEIGHT + SILVER_SKIN_WEIGHT + NEON_SKIN_WEIGHT);
    console.log("  Lose:", LOSE_WEIGHT / 100, "%");
    console.log("  MintPass:", MINTPASS_WEIGHT / 100, "%");
    console.log("  Silver Skin:", SILVER_SKIN_WEIGHT / 100, "%");
    console.log("  Neon Skin:", NEON_SKIN_WEIGHT / 100, "%");
    console.log("\nLinked Contracts:");
    console.log("  FregsMintPass:", mintPassAddress);
    console.log("  FregsItems:", itemsAddress);

    if (isLocalhost) {
        const balance = await fregCoin.balanceOf(deployerAddress, 1);
        console.log("\nDeployer FregCoin Balance:", balance.toString());
    }

    console.log("\nNext Steps:");
    console.log("  1. Mint FregCoins to users for distribution:");
    console.log("     await fregCoin.ownerMint(recipientAddress, amount)");
    console.log("  2. Or airdrop to multiple users:");
    console.log("     await fregCoin.airdrop([addr1, addr2], [amount1, amount2])");
    console.log("  3. Users can spin with:");
    console.log("     await fregCoin.spin()");

    console.log("\nFor .env file:");
    console.log(`VITE_FREGCOIN_ADDRESS=${fregCoinAddress}`);

    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
