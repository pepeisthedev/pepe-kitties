const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const status = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployment-status.json"), "utf8"));

    const fregCoin = await ethers.getContractAt("FregCoin", status.contracts.fregCoin);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    console.log("=== FregCoin Prize Config ===");
    console.log("Lose weight:", (await fregCoin.loseWeight()).toString());
    console.log("MintPass weight:", (await fregCoin.mintPassWeight()).toString());
    console.log("Total item weight:", (await fregCoin.totalItemWeight()).toString());

    const count = await fregCoin.getItemPrizeCount();
    console.log("Item prize count:", count.toString());

    for (let i = 0; i < count; i++) {
        const [itemType, weight] = await fregCoin.getItemPrize(i);
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
