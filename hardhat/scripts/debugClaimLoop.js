const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const EVENT_TIMEOUT_MS = Number(process.env.VRF_EVENT_TIMEOUT_MS || 180000);
const EVENT_POLL_MS = Number(process.env.VRF_EVENT_POLL_MS || 3000);
const HASCLAIMED_BATCH = 25; // parallel hasClaimed checks
const HASCLAIMED_DELAY_MS = 200; // delay between batches

const ITEM_NAMES = {
    1: "Color Change",
    2: "Head Reroll",
    4: "Robot",
    5: "Gold Skin",
    6: "Treasure Chest",
    8: "Diamond Skin",
    9: "Hoodie",
    10: "Frogsuit",
    11: "Bone",
};

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function callUint(contract, functionName, args = [], overrides = {}) {
    const data = contract.interface.encodeFunctionData(functionName, args);
    const result = await ethers.provider.call({
        to: await contract.getAddress(),
        data,
        ...overrides,
    });
    return contract.interface.decodeFunctionResult(functionName, result)[0];
}

async function getTxGasPrice() {
    const feeData = await ethers.provider.getFeeData();
    const candidates = [feeData.gasPrice, feeData.maxFeePerGas].filter(
        v => typeof v === "bigint" && v > 0n
    );
    if (candidates.length === 0) return 1n;
    return candidates.reduce((max, v) => v > max ? v : max);
}

async function readGasAwareQuote(contract, functionName, gasPrice) {
    const fee = await callUint(contract, functionName, [], { gasPrice });
    return fee * 120n / 100n;
}

async function waitForEvent({ contract, filter, fromBlock, description, match }) {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    let nextFromBlock = Number(fromBlock);

    while (Date.now() < deadline) {
        const latestBlock = await ethers.provider.getBlockNumber();
        const logs = await contract.queryFilter(filter, nextFromBlock, latestBlock);
        for (const log of logs) {
            if (!match || match(log)) return log;
        }
        nextFromBlock = latestBlock + 1;
        await sleep(EVENT_POLL_MS);
    }

    throw new Error(`Timed out waiting for ${description}`);
}

async function syncNonceState(nonceState) {
    const pending = await ethers.provider.getTransactionCount(nonceState.address, "pending");
    if (pending > nonceState.nextNonce) nonceState.nextNonce = pending;
    return nonceState.nextNonce;
}

async function sendTx(sendFn, txOptions, nonceState) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const nonce = await syncNonceState(nonceState);
        try {
            const tx = await sendFn({ ...txOptions, nonce });
            nonceState.nextNonce = nonce + 1;
            const receipt = await tx.wait();
            return { tx, receipt };
        } catch (error) {
            lastError = error;
            const msg = String(error?.message || error);
            if (msg.includes("nonce too low") || msg.includes("already known") || msg.includes("replacement transaction underpriced")) {
                nonceState.nextNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
                await sleep(1000);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

async function main() {
    console.log("=".repeat(60));
    console.log("Claim items for all unclaimed Fregs");
    console.log("=".repeat(60));
    console.log(`Network: ${network.name}`);

    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    const nonceState = {
        address: deployer.address,
        nextNonce: await ethers.provider.getTransactionCount(deployer.address, "pending"),
    };

    console.log(`Deployer:     ${deployer.address}`);
    console.log(`Fregs:        ${status.contracts.fregs}`);
    console.log(`FregsItems:   ${status.contracts.fregsItems}`);

    // Fetch all token IDs
    const allTokenIds = Array.from(await fregs.getAllTokenIds());
    console.log(`\nTotal tokens: ${allTokenIds.length}`);
    console.log(`Checking hasClaimed in batches of ${HASCLAIMED_BATCH}...`);

    // Find unclaimed tokens
    const unclaimed = [];
    for (let i = 0; i < allTokenIds.length; i += HASCLAIMED_BATCH) {
        const batch = allTokenIds.slice(i, i + HASCLAIMED_BATCH);
        let results;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                results = await Promise.all(batch.map(id => fregsItems.hasClaimed(id)));
                break;
            } catch (e) {
                if (attempt === 5) throw e;
                await sleep(attempt * 1000);
            }
        }
        for (let j = 0; j < batch.length; j++) {
            if (!results[j]) unclaimed.push(batch[j]);
        }
        process.stdout.write(`  Checked ${Math.min(i + HASCLAIMED_BATCH, allTokenIds.length)}/${allTokenIds.length}\r`);
        await sleep(HASCLAIMED_DELAY_MS);
    }

    console.log(`\nUnclaimed: ${unclaimed.length} / ${allTokenIds.length}`);

    if (unclaimed.length === 0) {
        console.log("All fregs have already claimed their item.");
        return;
    }

    const gasPrice = await getTxGasPrice();
    const claimVrfFee = await readGasAwareQuote(fregsItems, "quoteClaimItemFee", gasPrice);
    console.log(`Claim VRF fee: ${ethers.formatEther(claimVrfFee)} ETH`);
    console.log(`\nClaiming items for ${unclaimed.length} fregs...\n`);

    const itemCounts = {};
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < unclaimed.length; i++) {
        const tokenId = unclaimed[i];
        try {
            const gp = await getTxGasPrice();
            const vrfFee = await readGasAwareQuote(fregsItems, "quoteClaimItemFee", gp);

            const { receipt } = await sendTx(
                txOptions => fregsItems.claimItem(tokenId, txOptions),
                { value: vrfFee, gasLimit: 700000n, gasPrice: gp },
                nonceState
            );

            // Try to parse ItemClaimed from receipt first (localhost / sync VRF)
            let parsed = null;
            for (const log of receipt.logs) {
                try {
                    const p = fregsItems.interface.parseLog(log);
                    if (p?.name === "ItemClaimed") { parsed = p; break; }
                } catch { /* skip */ }
            }

            // If not in receipt (async VRF on testnet), poll for the event
            if (!parsed) {
                parsed = await waitForEvent({
                    contract: fregsItems,
                    filter: fregsItems.filters.ItemClaimed(tokenId),
                    fromBlock: receipt.blockNumber,
                    description: `ItemClaimed for Freg #${tokenId}`,
                });
            }

            if (parsed) {
                const iType = Number(parsed.args.itemType);
                itemCounts[iType] = (itemCounts[iType] || 0) + 1;
                const name = ITEM_NAMES[iType] || `Unknown(${iType})`;
                console.log(`  [${i + 1}/${unclaimed.length}] Freg #${tokenId} → ${name}`);
            }

            succeeded++;
        } catch (e) {
            failed++;
            console.log(`  [${i + 1}/${unclaimed.length}] Freg #${tokenId} FAILED: ${String(e.message || e).slice(0, 150)}`);
        }
    }

    // Summary
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  RESULTS: ${succeeded} claimed, ${failed} failed`);
    console.log(`${"=".repeat(60)}`);

    if (succeeded === 0) return;

    const maxNameLen = Math.max(...Object.keys(itemCounts).map(id => (ITEM_NAMES[Number(id)] || `Unknown(${id})`).length), 10);
    console.log(`\n  ${"Item".padEnd(maxNameLen)}  Count   Actual`);
    console.log(`  ${"-".repeat(maxNameLen + 16)}`);

    for (const [id, count] of Object.entries(itemCounts).sort((a, b) => b[1] - a[1])) {
        const name = ITEM_NAMES[Number(id)] || `Unknown(${id})`;
        const pct = ((count / succeeded) * 100).toFixed(2);
        console.log(`  ${name.padEnd(maxNameLen)}  ${String(count).padStart(5)}  ${pct.padStart(6)}%`);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
