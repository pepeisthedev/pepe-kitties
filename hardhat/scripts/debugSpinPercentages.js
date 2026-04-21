const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const TOTAL_SPINS = 100;
const BATCH_SIZE = 5;
const EVENT_TIMEOUT_MS = Number(process.env.VRF_EVENT_TIMEOUT_MS || 180000);
const EVENT_POLL_MS = Number(process.env.VRF_EVENT_POLL_MS || 3000);
const ADMIN_GAS_LIMIT = 150000n;
const SPIN_GAS_LIMIT = 500000n;

const ITEM_NAMES = {
    1: "Color Change", 2: "Head Reroll", 4: "Robot", 5: "Gold Skin",
    6: "Treasure Chest", 8: "Diamond Skin", 9: "Hoodie", 10: "Frogsuit", 11: "Bone",
};

const PRIZE_NAMES = {
    0: "Lose",
    1: "Mint Pass",
    2: "Item",
};

function printDistribution(title, counts, total) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${title} (${total} total spins)`);
    console.log(`${"=".repeat(60)}`);

    const entries = Object.entries(counts)
        .map(([name, count]) => ({
            name,
            count,
            pct: ((count / total) * 100).toFixed(2),
        }))
        .sort((a, b) => b.count - a.count);

    const maxNameLen = Math.max(...entries.map(e => e.name.length), 10);
    const maxCountLen = Math.max(...entries.map(e => String(e.count).length), 3);

    for (const { name, count, pct } of entries) {
        const bar = "#".repeat(Math.round(Number(pct)));
        console.log(
            `  ${name.padEnd(maxNameLen)}  ${String(count).padStart(maxCountLen)}  ${pct.padStart(6)}%  ${bar}`
        );
    }
}

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function getTxGasPrice() {
    const feeData = await ethers.provider.getFeeData();
    const candidates = [feeData.gasPrice, feeData.maxFeePerGas].filter(
        (value) => typeof value === "bigint" && value > 0n
    );

    if (candidates.length === 0) {
        return 1n;
    }

    return candidates.reduce((max, value) => value > max ? value : max);
}

async function syncNonceState(nonceState) {
    const pendingNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
    if (pendingNonce > nonceState.nextNonce) {
        nonceState.nextNonce = pendingNonce;
    }
    return nonceState.nextNonce;
}

async function sendTx(sendFn, txOptions, nonceState) {
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const nonce = await syncNonceState(nonceState);

        try {
            const tx = await sendFn({
                ...txOptions,
                nonce,
            });
            nonceState.nextNonce = nonce + 1;
            const receipt = await tx.wait();
            return { tx, receipt };
        } catch (error) {
            lastError = error;
            const message = String(error?.message || error);

            if (
                message.includes("nonce too low") ||
                message.includes("already known") ||
                message.includes("replacement transaction underpriced")
            ) {
                nonceState.nextNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
                await sleep(1000);
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}

async function waitForSpinResult(spinTheWheel, player, fromBlock) {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    let nextFromBlock = Number(fromBlock);

    while (Date.now() < deadline) {
        const latestBlock = await ethers.provider.getBlockNumber();
        const logs = await spinTheWheel.queryFilter(
            spinTheWheel.filters.SpinResult(player),
            nextFromBlock,
            latestBlock
        );
        if (logs.length > 0) return logs[0];
        nextFromBlock = latestBlock + 1;
        await sleep(EVENT_POLL_MS);
    }

    throw new Error("Timed out waiting for SpinResult event");
}

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();
    const nonceState = {
        address: deployer.address,
        nextNonce: await ethers.provider.getTransactionCount(deployer.address, "pending"),
    };

    const requestedSpinTheWheelAddress = process.env.SPIN_THE_WHEEL_ADDRESS || status.contracts.spinTheWheel;
    if (!requestedSpinTheWheelAddress) {
        throw new Error("SpinTheWheel address missing. Set SPIN_THE_WHEEL_ADDRESS or update deployment status.");
    }

    const spinTheWheel = await ethers.getContractAt("SpinTheWheel", requestedSpinTheWheelAddress);
    const spinTheWheelAddress = await spinTheWheel.getAddress();
    const spinOwner = await spinTheWheel.owner();

    console.log("Network:             ", network.name);
    console.log("SpinTheWheel address:", spinTheWheelAddress);
    console.log("SpinTheWheel owner:  ", spinOwner);
    console.log("Signer:              ", deployer.address);

    if (spinOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error("Current signer is not the SpinTheWheel owner, so ownerMint() will fail.");
    }

    // Print current weights
    const loseWeight = Number(await spinTheWheel.loseWeight());
    const mintPassWeight = Number(await spinTheWheel.mintPassWeight());
    const totalItemWeight = Number(await spinTheWheel.totalItemWeight());
    const totalWeight = loseWeight + mintPassWeight + totalItemWeight;

    console.log("Current spin weights:");
    console.log(`  Lose:      ${loseWeight} (${((loseWeight / totalWeight) * 100).toFixed(1)}%)`);
    console.log(`  MintPass:  ${mintPassWeight} (${((mintPassWeight / totalWeight) * 100).toFixed(1)}%)`);
    console.log(`  Items:     ${totalItemWeight} (${((totalItemWeight / totalWeight) * 100).toFixed(1)}%)`);
    console.log(`  Total:     ${totalWeight}`);

    // Mint spin tokens
    console.log(`\nMinting ${TOTAL_SPINS} SpinTokens to deployer...`);
    const gasPrice = await getTxGasPrice();
    await sendTx(
        (txOptions) => spinTheWheel.ownerMint(deployer.address, TOTAL_SPINS, txOptions),
        {
            gasLimit: ADMIN_GAS_LIMIT,
            gasPrice,
        },
        nonceState
    );
    const balance = await spinTheWheel.balanceOf(deployer.address, 1);
    console.log(`SpinToken balance: ${balance}`);

    console.log(`\nSpinning ${TOTAL_SPINS} times...\n`);

    // Counters
    const prizeCounts = {}; // prizeType -> count
    const itemCounts = {};  // itemType -> count
    let failed = 0;

    for (let i = 0; i < TOTAL_SPINS; i++) {
        try {
            const { receipt } = await sendTx(
                (txOptions) => spinTheWheel.spin(txOptions),
                {
                    gasLimit: SPIN_GAS_LIMIT,
                    gasPrice,
                },
                nonceState
            );

            // Try to find SpinResult in the receipt (works on localhost with autoFulfill)
            let parsed = null;
            const event = receipt.logs.find(l => {
                try { return spinTheWheel.interface.parseLog(l)?.name === "SpinResult"; } catch { return false; }
            });
            if (event) {
                parsed = spinTheWheel.interface.parseLog(event);
            } else {
                // On live networks, VRF callback arrives in a later block — poll for it
                const log = await waitForSpinResult(spinTheWheel, deployer.address, receipt.blockNumber);
                parsed = spinTheWheel.interface.parseLog(log);
            }

            if (parsed) {
                const prizeType = Number(parsed.args.prizeType);
                const itemType = Number(parsed.args.itemType);

                prizeCounts[prizeType] = (prizeCounts[prizeType] || 0) + 1;

                if (prizeType === 2) {
                    itemCounts[itemType] = (itemCounts[itemType] || 0) + 1;
                }
            }
        } catch (e) {
            failed++;
            if (failed <= 3) console.log(`  Spin ${i} FAILED: ${e.message.slice(0, 200)}`);
        }

        if ((i + 1) % BATCH_SIZE === 0) {
            process.stdout.write(`  Spun ${i + 1}/${TOTAL_SPINS}\r`);
        }
    }

    const totalSpun = TOTAL_SPINS - failed;
    console.log(`\nSpinning done: ${totalSpun} success, ${failed} failed`);

    // Build combined winnings: every prize type as % of total spins
    const allWinnings = {};
    allWinnings["Lose"] = prizeCounts[0] || 0;
    allWinnings["Mint Pass"] = prizeCounts[1] || 0;
    for (const [itemType, count] of Object.entries(itemCounts)) {
        const name = ITEM_NAMES[Number(itemType)] || `Unknown(${itemType})`;
        allWinnings[name] = count;
    }

    printDistribution("ALL WINNINGS (% of total spins)", allWinnings, totalSpun);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
