const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

// ============ CONFIGURATION ============
const VERIFY_CONTRACTS = false;
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
    console.log("FregShop Deployment Script");
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
    const itemsAddress = process.env.VITE_FREGS_ITEMS_ADDRESS || deploymentStatus.contracts?.fregsItems;
    const fregCoinAddress = process.env.VITE_FREGCOIN_ADDRESS || deploymentStatus.contracts?.fregCoin;

    if (!itemsAddress) {
        console.error("\n❌ Error: FregsItems address not found!");
        console.error("Run deploy.js first or set VITE_FREGS_ITEMS_ADDRESS in environment");
        process.exit(1);
    }

    if (!fregCoinAddress) {
        console.error("\n❌ Error: FregCoin address not found!");
        console.error("Run deploy.js first or set VITE_FREGCOIN_ADDRESS in environment");
        process.exit(1);
    }

    console.log("\nExisting Contracts:");
    console.log("  FregsItems:", itemsAddress);
    console.log("  FregCoin:", fregCoinAddress);

    // ============ Deploy FregShop ============
    console.log("\n--- Deploying FregShop ---");
    const FregShop = await ethers.getContractFactory("FregShop");
    const fregShop = await deployContract(FregShop, [], "FregShop");
    const fregShopAddress = await fregShop.getAddress();

    // ============ Configure FregShop ============
    console.log("\n--- Configuring FregShop ---");

    console.log("Setting FregCoin contract...");
    await sendTx(fregShop.setFregCoinContract(fregCoinAddress));

    console.log("Setting Items contract...");
    await sendTx(fregShop.setItemsContract(itemsAddress));

    // ============ Configure Existing Contracts ============
    console.log("\n--- Configuring Existing Contracts ---");

    const fregsItems = await ethers.getContractAt("FregsItems", itemsAddress);
    const fregCoin = await ethers.getContractAt("FregCoin", fregCoinAddress);

    console.log("Setting ShopContract on FregsItems...");
    await sendTx(fregsItems.setShopContract(fregShopAddress));

    console.log("Setting ShopContract on FregCoin...");
    await sendTx(fregCoin.setShopContract(fregShopAddress));

    // ============ Save Deployment Status ============
    console.log("\n--- Saving Deployment Status ---");
    deploymentStatus.contracts.fregShop = fregShopAddress;
    saveDeploymentStatus(deploymentStatus, network.name);

    // ============ Copy ABIs ============
    console.log("\n--- Copying ABIs to Website ---");
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
    }
    copyABI("FregShop", "FregShop");
    copyABI("FregCoin", "FregCoin");
    copyABI("FregsItems", "FregsItems");

    // ============ Verify Contract ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contract on Block Explorer ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        try {
            console.log("Verifying FregShop...");
            await run("verify:verify", {
                address: fregShopAddress,
                constructorArguments: []
            });
            console.log("FregShop verified!");
        } catch (error) {
            console.log("FregShop verification failed:", error.message);
        }
    }

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("FREGSHOP DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Address:");
    console.log("  FregShop:", fregShopAddress);
    console.log("\nLinked Contracts:");
    console.log("  FregsItems:", itemsAddress);
    console.log("  FregCoin:", fregCoinAddress);

    console.log("\nNext Steps:");
    console.log("  1. List items for sale:");
    console.log("     await fregShop.listItem(itemTypeId, priceInWei, maxSupply)");
    console.log("  2. Users buy items via FregCoin:");
    console.log("     await fregCoin.buyItem(itemTypeId)");
    console.log("  3. Withdraw collected tokens:");
    console.log("     await fregShop.withdraw(toAddress, amount)");

    console.log("\nFor .env file:");
    console.log(`VITE_FREG_SHOP_ADDRESS=${fregShopAddress}`);

    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
