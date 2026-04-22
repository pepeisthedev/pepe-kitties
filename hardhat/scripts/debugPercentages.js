const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const NONE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const TOTAL_MINTS = 200;
const BATCH_SIZE = 10;
const EVENT_TIMEOUT_MS = Number(process.env.VRF_EVENT_TIMEOUT_MS || 180000);
const EVENT_POLL_MS = Number(process.env.VRF_EVENT_POLL_MS || 3000);

const HEAD_NAMES = {
    1: "Normal Eyes", 2: "Beanie", 3: "Bored Eyes", 4: "Captain", 5: "Commie",
    6: "Cowboy", 7: "Crown", 8: "Cap", 9: "Halo", 10: "3D Glasses",
    11: "Based Eyes", 12: "WW1", 13: "Hoodie", 14: "Karate Kid", 15: "Mickey D",
    16: "Noggles", 17: "Eye Patch", 18: "Pixel Glasses", 19: "Frog Suit",
    20: "Top Hat", 21: "Weedy", 22: "Based Glasses",
};

const MOUTH_NAMES = {
    1: "Cruella", 2: "Cigarette", 3: "Pipe", 4: "Puke",
    5: "Tooth Pick", 6: "Tounge", 0: "Normal (None)",
};

const STOMACH_NAMES = {
    1: "Base", 2: "ETH", 3: "Thug Life", 4: "Zipper", 0: "Normal (None)",
};

const ITEM_NAMES = {
    1: "Color Change", 2: "Head Reroll", 4: "Robot", 5: "Gold Skin",
    6: "Treasure Chest", 8: "Diamond Skin", 9: "Hoodie", 10: "Frogsuit", 11: "Bone",
};

function printDistribution(title, counts, total, nameMap) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${title} (${total} total)`);
    console.log(`${"=".repeat(60)}`);

    const entries = Object.entries(counts)
        .map(([id, count]) => ({
            id: Number(id),
            name: nameMap[Number(id)] || `Unknown(${id})`,
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

function randomHexColor() {
    return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()}`;
}

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function getTxGasPrice() {
    const feeData = await ethers.provider.getFeeData();
    const candidates = [feeData.gasPrice, feeData.maxFeePerGas].filter(
        v => typeof v === "bigint" && v > 0n
    );
    if (candidates.length === 0) return 1n;
    return candidates.reduce((max, v) => v > max ? v : max);
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
    const pendingNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
    if (pendingNonce > nonceState.nextNonce) nonceState.nextNonce = pendingNonce;
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
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    const nonceState = {
        address: deployer.address,
        nextNonce: await ethers.provider.getTransactionCount(deployer.address, "pending"),
    };

    const mintPrice = await fregs.mintPrice();
    const mintPhase = await fregs.mintPhase();

    console.log(`Network:       ${network.name}`);
    console.log(`Deployer:      ${deployer.address}`);
    console.log(`Mint price:    ${ethers.formatEther(mintPrice)} ETH`);
    console.log(`Mint phase:    ${mintPhase} (0=Paused, 1=Whitelist, 2=Public)`);
    console.log(`Minting ${TOTAL_MINTS} fregs...\n`);

    const headCounts = {};
    const mouthCounts = {};
    const stomachCounts = {};
    const itemCounts = {};
    const mintedTokenIds = [];
    let failed = 0;

    for (let i = 0; i < TOTAL_MINTS; i++) {
        try {
            const gasPrice = await getTxGasPrice();
            const color = randomHexColor();

            const { tx, receipt } = await sendTx(
                txOptions => fregs.mint(color, txOptions),
                { value: mintPrice, gasLimit: 800000n, gasPrice },
                nonceState
            );

            let parsed = null;
            for (const log of receipt.logs) {
                try {
                    const p = fregs.interface.parseLog(log);
                    if (p?.name === "FregMinted") { parsed = p; break; }
                } catch { /* skip */ }
            }

            if (!parsed) {
                parsed = await waitForEvent({
                    contract: fregs,
                    filter: fregs.filters.FregMinted(null, deployer.address),
                    fromBlock: receipt.blockNumber,
                    description: `FregMinted for mint ${i}`,
                });
            }

            if (parsed) {
                const tokenId = Number(parsed.args.tokenId);
                mintedTokenIds.push(tokenId);
                headCounts[Number(parsed.args.head)] = (headCounts[Number(parsed.args.head)] || 0) + 1;
                const mouthId = parsed.args.mouth === NONE ? 0 : Number(parsed.args.mouth);
                const stomachId = parsed.args.belly === NONE ? 0 : Number(parsed.args.belly);
                mouthCounts[mouthId] = (mouthCounts[mouthId] || 0) + 1;
                stomachCounts[stomachId] = (stomachCounts[stomachId] || 0) + 1;
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
            if (failed <= 3) console.log(`  Mint ${i} FAILED: ${String(e.message || e).slice(0, 200)}`);
        }

        if ((i + 1) % BATCH_SIZE === 0) {
            process.stdout.write(`  Minted ${i + 1}/${TOTAL_MINTS}\r`);
        }
    }

    console.log(`\nMinting done: ${mintedTokenIds.length} success, ${failed} failed`);
    console.log(`\nClaiming items for ${mintedTokenIds.length} fregs...`);
    let claimFailed = 0;

    for (let i = 0; i < mintedTokenIds.length; i++) {
        const tokenId = mintedTokenIds[i];
        try {
            const gasPrice = await getTxGasPrice();

            const { receipt } = await sendTx(
                txOptions => fregsItems.claimItem(tokenId, txOptions),
                { gasLimit: 700000n, gasPrice },
                nonceState
            );

            let parsed = null;
            for (const log of receipt.logs) {
                try {
                    const p = fregsItems.interface.parseLog(log);
                    if (p?.name === "ItemClaimed") { parsed = p; break; }
                } catch { /* skip */ }
            }

            if (!parsed) {
                parsed = await waitForEvent({
                    contract: fregsItems,
                    filter: fregsItems.filters.ItemClaimed(tokenId, null, deployer.address),
                    fromBlock: receipt.blockNumber,
                    description: `ItemClaimed for Freg #${tokenId}`,
                });
            }

            if (parsed) {
                const iType = Number(parsed.args.itemType);
                itemCounts[iType] = (itemCounts[iType] || 0) + 1;
            }
        } catch (e) {
            claimFailed++;
            if (claimFailed <= 3) console.log(`  Claim freg #${tokenId} FAILED: ${String(e.message || e).slice(0, 200)}`);
        }

        if ((i + 1) % BATCH_SIZE === 0) {
            process.stdout.write(`  Claimed ${i + 1}/${mintedTokenIds.length}\r`);
        }
    }

    const totalClaimed = mintedTokenIds.length - claimFailed;
    console.log(`\nClaiming done: ${totalClaimed} success, ${claimFailed} failed`);

    printDistribution("HEAD TRAITS", headCounts, mintedTokenIds.length, HEAD_NAMES);
    printDistribution("MOUTH TRAITS", mouthCounts, mintedTokenIds.length, MOUTH_NAMES);
    printDistribution("STOMACH TRAITS", stomachCounts, mintedTokenIds.length, STOMACH_NAMES);
    printDistribution("ITEMS CLAIMED", itemCounts, totalClaimed, ITEM_NAMES);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  SUMMARY: ${mintedTokenIds.length} minted, ${totalClaimed} items claimed`);
    console.log(`${"=".repeat(60)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
