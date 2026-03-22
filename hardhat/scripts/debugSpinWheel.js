const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();

    const spinTheWheel = await ethers.getContractAt("SpinTheWheel", status.contracts.spinTheWheel);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    console.log("=== SpinTheWheel Prize Config ===");
    console.log("Lose weight:", (await spinTheWheel.loseWeight()).toString());
    console.log("MintPass weight:", (await spinTheWheel.mintPassWeight()).toString());
    console.log("Total item weight:", (await spinTheWheel.totalItemWeight()).toString());

    const prizeCount = Number(await spinTheWheel.getItemPrizesCount());
    const targetItemTypes = new Set();
    for (let i = 0; i < prizeCount; i++) {
        const [itemType, weight] = await spinTheWheel.getItemPrize(i);
        const config = await fregsItems.itemTypeConfigs(itemType);
        console.log(`  Prize ${i}: itemType=${itemType}, weight=${weight}, name="${config.name}"`);
        targetItemTypes.add(Number(itemType));
    }

    console.log(`\nNeed to collect ${targetItemTypes.size} unique item types: [${[...targetItemTypes].join(", ")}]`);

    const collected = new Set();
    let spinCount = 0;
    let mintPassCount = 0;
    let loseCount = 0;
    const MAX_SPINS = 500;

    console.log("\n=== Spinning ===");

    while (collected.size < targetItemTypes.size && spinCount < MAX_SPINS) {
        const balance = await spinTheWheel.balanceOf(deployer.address, 1);
        if (balance === 0n) {
            console.log("Out of SpinTokens, minting more...");
            await (await spinTheWheel.ownerMint(deployer.address, 100)).wait();
        }

        const vrfFee = await spinTheWheel.quoteSpinFee();
        const tx = await spinTheWheel.spin({ value: vrfFee });
        const receipt = await tx.wait();
        spinCount++;

        const spinResultEvent = receipt.logs
            .map((log) => {
                try { return spinTheWheel.interface.parseLog(log); } catch { return null; }
            })
            .find((parsed) => parsed?.name === "SpinResult");

        if (!spinResultEvent) {
            console.log(`  Spin ${spinCount}: no SpinResult event`);
            continue;
        }

        const [, won, prizeType, itemType] = spinResultEvent.args;
        const prizeTypeNum = Number(prizeType);
        const itemTypeNum = Number(itemType);

        if (!won || prizeTypeNum === 0) {
            loseCount++;
        } else if (prizeTypeNum === 1) {
            mintPassCount++;
        } else if (prizeTypeNum === 2) {
            const isNew = !collected.has(itemTypeNum);
            collected.add(itemTypeNum);
            const config = await fregsItems.itemTypeConfigs(itemTypeNum);
            console.log(`  Spin ${spinCount}: WON item ${itemTypeNum} "${config.name}"${isNew ? " (NEW!)" : ""} [${collected.size}/${targetItemTypes.size}]`);
        }
    }

    console.log("\n=== Results ===");
    console.log(`Total spins: ${spinCount}`);
    console.log(`Losses: ${loseCount}`);
    console.log(`MintPasses: ${mintPassCount}`);
    console.log(`Items collected: ${collected.size}/${targetItemTypes.size}`);
    for (const itemType of collected) {
        const config = await fregsItems.itemTypeConfigs(itemType);
        console.log(`  - ${config.name} (type ${itemType})`);
    }
    if (collected.size < targetItemTypes.size) {
        const missing = [...targetItemTypes].filter((t) => !collected.has(t));
        console.log(`Missing: [${missing.join(", ")}]`);
    } else {
        console.log("Got one of each item!");
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
