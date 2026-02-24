const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ CONFIGURATION ============
const DEPLOYMENT_STATUS_PATH = path.join(__dirname, "../deployment-status.json");

async function sendTx(txPromise, confirmations = 1) {
    const tx = await txPromise;
    const receipt = await tx.wait(confirmations);
    if (network.name !== "localhost" && network.name !== "hardhat") {
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return receipt;
}

// ============ MAIN ============
async function main() {
    console.log("=".repeat(60));
    console.log("Spin Wheel Reconfiguration Script");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("\nNetwork:", network.name);
    console.log("Deployer:", deployerAddress);

    // Load deployment status
    if (!fs.existsSync(DEPLOYMENT_STATUS_PATH)) {
        console.error("\n Error: deployment-status.json not found!");
        process.exit(1);
    }
    const deploymentStatus = JSON.parse(fs.readFileSync(DEPLOYMENT_STATUS_PATH, "utf8"));

    const fregCoinAddress = deploymentStatus.contracts?.fregCoin;
    const fregsItemsAddress = deploymentStatus.contracts?.fregsItems;

    if (!fregCoinAddress) {
        console.error("\n Error: FregCoin address not found in deployment-status.json!");
        process.exit(1);
    }
    if (!fregsItemsAddress) {
        console.error("\n Error: FregsItems address not found in deployment-status.json!");
        process.exit(1);
    }

    console.log("\nContracts:");
    console.log("  FregCoin:", fregCoinAddress);
    console.log("  FregsItems:", fregsItemsAddress);

    const fregCoin = await ethers.getContractAt("FregCoin", fregCoinAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

    // ============ Update FregCoin Prize Weights ============
    console.log("\n--- Updating FregCoin Prize Configuration ---");

    console.log("Setting lose weight to 0 (no lose)...");
    await sendTx(fregCoin.setLoseWeight(0));

    console.log("Setting MintPass weight to 9000 (90%)...");
    await sendTx(fregCoin.setMintPassWeight(9000));

    console.log("Removing Silver Skin prize (item type 200)...");
    await sendTx(fregCoin.removeItemPrize(200));

    console.log("Removing Neon Skin prize (item type 201)...");
    await sendTx(fregCoin.removeItemPrize(201));

    console.log("Adding Hoodie prize (item type 9, weight 300 = 3%)...");
    await sendTx(fregCoin.addItemPrize(9, 300));

    console.log("Adding Frogsuit prize (item type 10, weight 300 = 3%)...");
    await sendTx(fregCoin.addItemPrize(10, 300));

    console.log("Adding Treasure Chest prize (item type 6, weight 400 = 4%)...");
    await sendTx(fregCoin.addItemPrize(6, 400));

    // ============ Ensure Prize Item Types Are Configured ============
    console.log("\n--- Ensuring Prize Item Types Are Configured ---");

    const prizeItems = [
        { id: 9, name: "Hoodie", desc: "A cozy hoodie for your Freg - exclusive spin wheel prize" },
        { id: 10, name: "Frogsuit", desc: "Transform your Freg into a frog - exclusive spin wheel prize" },
        { id: 6, name: "Treasure Chest", desc: "Burn this chest to claim ETH rewards" },
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

    // ============ Remove Hoodie/Frogsuit from Normal Claims ============
    console.log("\n--- Removing Hoodie/Frogsuit from Normal Item Claims ---");

    console.log("Setting head item weights to 0 (hoodie=0, frogsuit=0)...");
    await sendTx(fregsItems.setHeadItemWeights(0, 0));

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("RECONFIGURATION COMPLETE");
    console.log("=".repeat(60));
    console.log("\nNew Prize Configuration:");
    console.log("  Lose: 0%");
    console.log("  MintPass: 90%");
    console.log("  Hoodie (type 9): 3%");
    console.log("  Frogsuit (type 10): 3%");
    console.log("  Treasure Chest (type 6): 4%");
    console.log("\nHoodie and Frogsuit removed from normal item claims.");
    console.log("Silver Skin and Neon Skin removed from spin wheel prizes.");
    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
