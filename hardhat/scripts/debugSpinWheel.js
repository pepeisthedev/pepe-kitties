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

    // Ensure spin is active
    const wasActive = await spinTheWheel.active();
    if (!wasActive) {
        console.log("Spin not active — enabling...");
        await (await spinTheWheel.setActive(true)).wait();
    }

    // Mirror the website's gas-aware buffered VRF fee logic
    const VRF_FEE_BUFFER_BPS = 1500n;
    const BPS_DENOMINATOR = 10000n;
    const MIN_VRF_FEE_BUFFER_WEI = 1_000_000_000_000n;

    let vrfFee = 0n;
    try {
        const provider = deployer.provider;
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 1n;
        const callResult = await provider.call({
            to: await spinTheWheel.getAddress(),
            data: spinTheWheel.interface.encodeFunctionData("quoteSpinFee", []),
            gasPrice,
        });
        [vrfFee] = spinTheWheel.interface.decodeFunctionResult("quoteSpinFee", callResult);
        const proportionalBuffer = (vrfFee * VRF_FEE_BUFFER_BPS + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR;
        const appliedBuffer = proportionalBuffer > MIN_VRF_FEE_BUFFER_WEI ? proportionalBuffer : MIN_VRF_FEE_BUFFER_WEI;
        vrfFee = vrfFee + appliedBuffer;
    } catch (e) {
        console.log(`quoteSpinFee() failed (${e.shortMessage || e.message}), assuming 0`);
    }
    console.log(`VRF fee per spin (buffered): ${vrfFee}`);

    console.log("\n=== Spinning ===");

    while (collected.size < targetItemTypes.size && spinCount < MAX_SPINS) {
        const balance = await spinTheWheel.balanceOf(deployer.address, 1);
        if (balance === 0n) {
            console.log("Out of SpinTokens, minting more...");
            await (await spinTheWheel.ownerMint(deployer.address, 100)).wait();
        }

        let receipt;
        try {
            const tx = await spinTheWheel.spin({ value: vrfFee, gasLimit: 500000n });
            receipt = await tx.wait();
        } catch (e) {
            console.log(`  Spin ${spinCount + 1} FAILED: ${e.shortMessage || e.message}`);
            spinCount++;
            continue;
        }
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

    // Restore active state
    if (!wasActive) {
        console.log("\nRestoring spin active=false...");
        await (await spinTheWheel.setActive(false)).wait();
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
