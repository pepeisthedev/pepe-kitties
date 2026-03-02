const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

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
    const deploymentStatus = loadDeploymentStatus(network.name);
    if (!deploymentStatus.contracts || Object.keys(deploymentStatus.contracts).length === 0) {
        console.error(`\n Error: No deployment status found for network ${network.name}!`);
        process.exit(1);
    }

    const spinTheWheelAddress = deploymentStatus.contracts?.spinTheWheel;
    const fregsItemsAddress = deploymentStatus.contracts?.fregsItems;

    if (!spinTheWheelAddress) {
        console.error("\n Error: SpinTheWheel address not found in deployment-status.json!");
        process.exit(1);
    }
    if (!fregsItemsAddress) {
        console.error("\n Error: FregsItems address not found in deployment-status.json!");
        process.exit(1);
    }

    console.log("\nContracts:");
    console.log("  SpinTheWheel:", spinTheWheelAddress);
    console.log("  FregsItems:", fregsItemsAddress);

    const spinTheWheel = await ethers.getContractAt("SpinTheWheel", spinTheWheelAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

    // ============ Update SpinTheWheel Prize Weights ============
    console.log("\n--- Updating SpinTheWheel Prize Configuration ---");

    console.log("Setting lose weight to 0 (no lose)...");
    await sendTx(spinTheWheel.setLoseWeight(0));

    console.log("Setting MintPass weight to 9000 (90%)...");
    await sendTx(spinTheWheel.setMintPassWeight(9000));

    console.log("Removing Silver Skin prize (item type 200)...");
    await sendTx(spinTheWheel.removeItemPrize(200));

    console.log("Removing Neon Skin prize (item type 201)...");
    await sendTx(spinTheWheel.removeItemPrize(201));

    console.log("Adding Hoodie prize (item type 9, weight 300 = 3%)...");
    await sendTx(spinTheWheel.addItemPrize(9, 300));

    console.log("Adding Frogsuit prize (item type 10, weight 300 = 3%)...");
    await sendTx(spinTheWheel.addItemPrize(10, 300));

    console.log("Adding Treasure Chest prize (item type 6, weight 400 = 4%)...");
    await sendTx(spinTheWheel.addItemPrize(6, 400));

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
