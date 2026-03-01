const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

async function main() {
    const status = loadDeploymentStatus(network.name);

    const spinTheWheel = await ethers.getContractAt("SpinTheWheel", status.contracts.spinTheWheel);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    console.log("=== SpinTheWheel Prize Config ===");
    console.log("Lose weight:", (await spinTheWheel.loseWeight()).toString());
    console.log("MintPass weight:", (await spinTheWheel.mintPassWeight()).toString());
    console.log("Total item weight:", (await spinTheWheel.totalItemWeight()).toString());

    const count = await spinTheWheel.getItemPrizeCount();
    console.log("Item prize count:", count.toString());

    for (let i = 0; i < count; i++) {
        const [itemType, weight] = await spinTheWheel.getItemPrize(i);
        console.log(`  Prize ${i}: itemType=${itemType}, weight=${weight}`);

        // Check if this item type is configured on FregsItems
        try {
            const config = await fregsItems.itemTypeConfigs(itemType);
            console.log(`    FregsItems config: name="${config.name}", desc="${config.description}"`);
        } catch (e) {
            console.log(`    FregsItems config: ERROR - ${e.message}`);
        }
    }

    console.log("\n=== Direct Item Config Checks ===");
    for (const id of [6, 9, 10, 200, 201]) {
        try {
            const config = await fregsItems.itemTypeConfigs(id);
            console.log(`  Item ${id}: name="${config.name}", desc="${config.description}"`);
        } catch (e) {
            console.log(`  Item ${id}: ERROR`);
        }
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
