/**
 * FregCoin Airdrop Script
 *
 * Distributes FREG coin proportionally to all Freg NFT holders.
 *
 * Usage:
 *   node scripts/airdropFregCoin.js --network base
 *   node scripts/airdropFregCoin.js --network base --resume airdrop-progress-base-2024-01-01T12-00-00.json
 *   node scripts/airdropFregCoin.js --network base --dry-run
 *
 * Features:
 *   - Saves full snapshot + progress to a timestamped JSON file after every batch
 *   - Safe to re-run: --resume skips already-completed batches
 *   - --dry-run prints distribution without sending any transactions
 *   - All history files are preserved, never overwritten
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus } = require("./deploymentStatus");

const BATCH_SIZE = 150;
const PROGRESS_DIR = path.join(__dirname, "..", "airdrop-history");

// ============ CLI args ============

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const resumeIdx = args.indexOf("--resume");
const resumeFile = resumeIdx !== -1 ? args[resumeIdx + 1] : null;

// ============ Helpers ============

function getProgressPath(networkName, timestamp) {
    if (!fs.existsSync(PROGRESS_DIR)) {
        fs.mkdirSync(PROGRESS_DIR, { recursive: true });
    }
    return path.join(PROGRESS_DIR, `airdrop-progress-${networkName}-${timestamp}.json`);
}

function saveProgress(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadProgress(filePath) {
    const full = path.isAbsolute(filePath)
        ? filePath
        : path.join(PROGRESS_DIR, filePath);
    if (!fs.existsSync(full)) throw new Error(`Progress file not found: ${full}`);
    return JSON.parse(fs.readFileSync(full, "utf8"));
}

function formatAmount(wei) {
    return Number(ethers.formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ============ Main ============

async function main() {
    console.log("=".repeat(60));
    console.log("FregCoin Airdrop Script");
    console.log("=".repeat(60));
    if (isDryRun) console.log("\n⚠️  DRY RUN — no transactions will be sent\n");
    if (resumeFile) console.log(`\n▶  Resuming from: ${resumeFile}\n`);

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();
    const networkName = network.name;

    console.log("Network:", networkName);
    console.log("Chain ID:", networkInfo.chainId.toString());
    console.log("Deployer:", deployerAddress);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "ETH\n");

    const deploymentStatus = loadDeploymentStatus(networkName);
    const fregsAddress = deploymentStatus.contracts?.fregs;
    const airdropAddress = deploymentStatus.contracts?.fregsAirdrop;

    if (!fregsAddress) throw new Error("Fregs contract address not found in deployment status");
    if (!airdropAddress) throw new Error("FregsAirdrop contract address not found in deployment status");

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);
    const airdrop = await ethers.getContractAt("FregsAirdrop", airdropAddress);

    let progress;
    let progressPath;

    if (resumeFile) {
        // ---- RESUME MODE ----
        progress = loadProgress(resumeFile);
        progressPath = path.isAbsolute(resumeFile)
            ? resumeFile
            : path.join(PROGRESS_DIR, resumeFile);

        console.log(`Loaded progress file:`);
        console.log(`  Snapshot block:     ${progress.snapshotBlock}`);
        console.log(`  Total recipients:   ${progress.recipients.length}`);
        console.log(`  Total batches:      ${progress.totalBatches}`);
        console.log(`  Completed batches:  ${progress.completedBatches.length} / ${progress.totalBatches}`);
        console.log(`  Per-Freg amount:    ${formatAmount(progress.perFregAmount)} FREG`);
        console.log();

        if (progress.completedBatches.length === progress.totalBatches) {
            console.log("✅ Airdrop already fully completed. Nothing to do.");
            return;
        }

    } else {
        // ---- FRESH RUN ----
        const snapshotBlock = Number(await ethers.provider.getBlockNumber());
        console.log(`Taking snapshot at block ${snapshotBlock}...`);

        const totalMinted = Number(await fregs.totalMinted());
        if (totalMinted === 0) throw new Error("No Fregs minted yet");

        console.log(`Total minted: ${totalMinted}`);

        const holders = {};
        let liveCount = 0;
        let burned = 0;

        for (let tokenId = 0; tokenId < totalMinted; tokenId++) {
            if (tokenId % 100 === 0) process.stdout.write(`\r  Scanning token ${tokenId} / ${totalMinted}...`);
            try {
                const owner = await fregs.ownerOf(tokenId);
                holders[owner] = (holders[owner] || 0) + 1;
                liveCount++;
            } catch {
                burned++;
            }
        }
        process.stdout.write("\n");

        console.log(`  Live tokens: ${liveCount}, Burned: ${burned}`);
        console.log(`  Unique holders: ${Object.keys(holders).length}`);

        if (liveCount === 0) throw new Error("No live Fregs found");

        const contractBalance = await airdrop.coinBalance();
        console.log(`\nAirdrop contract balance: ${formatAmount(contractBalance)} FREG`);

        if (contractBalance === 0n) throw new Error("Airdrop contract has no FREG balance. Fund it first.");

        const perFregAmount = contractBalance / BigInt(liveCount);
        if (perFregAmount === 0n) throw new Error("Balance too low — per-Freg share rounds to 0");

        const recipients = Object.keys(holders);
        const amounts = recipients.map(addr => (perFregAmount * BigInt(holders[addr])).toString());
        const totalBatches = Math.ceil(recipients.length / BATCH_SIZE);

        const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "");
        progressPath = getProgressPath(networkName, timestamp);

        progress = {
            timestamp,
            networkName,
            snapshotBlock,
            airdropContractAddress: airdropAddress,
            fregsContractAddress: fregsAddress,
            contractBalanceAtSnapshot: contractBalance.toString(),
            perFregAmount: perFregAmount.toString(),
            liveTokenCount: liveCount,
            uniqueHolders: recipients.length,
            totalBatches,
            completedBatches: [],
            completedTxHashes: [],
            recipients,
            amounts,
            holderFreqMap: holders,
        };

        saveProgress(progressPath, progress);
        console.log(`\nSnapshot saved to: ${progressPath}`);

        console.log(`\nDistribution preview:`);
        console.log(`  Per Freg:           ${formatAmount(perFregAmount)} FREG`);
        console.log(`  Unique recipients:  ${recipients.length}`);
        console.log(`  Total batches:      ${totalBatches} (batch size: ${BATCH_SIZE})`);
        const totalDistributed = recipients.reduce((sum, addr, i) => sum + BigInt(amounts[i]), 0n);
        const dust = contractBalance - totalDistributed;
        console.log(`  Total distributed:  ${formatAmount(totalDistributed)} FREG`);
        console.log(`  Dust (remainder):   ${formatAmount(dust)} FREG`);
    }

    if (isDryRun) {
        console.log("\n✅ Dry run complete. No transactions sent.");
        console.log(`   Progress file: ${progressPath}`);
        return;
    }

    // ---- SEND BATCHES ----
    const completedSet = new Set(progress.completedBatches);
    const contract = await ethers.getContractAt("FregsAirdrop", airdropAddress, deployer);

    console.log(`\nSending batches...`);

    for (let b = 0; b < progress.totalBatches; b++) {
        if (completedSet.has(b)) {
            console.log(`  Batch ${b + 1} / ${progress.totalBatches} — already completed, skipping`);
            continue;
        }

        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, progress.recipients.length);
        const batchRecipients = progress.recipients.slice(start, end);
        const batchAmounts = progress.amounts.slice(start, end);

        console.log(`  Batch ${b + 1} / ${progress.totalBatches} — ${batchRecipients.length} recipients...`);

        try {
            const tx = await contract.airdropBatch(batchRecipients, batchAmounts);
            console.log(`    TX submitted: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`    ✅ Confirmed in block ${receipt.blockNumber}`);

            progress.completedBatches.push(b);
            progress.completedTxHashes.push({ batch: b, txHash: tx.hash, block: receipt.blockNumber });
            saveProgress(progressPath, progress);

        } catch (err) {
            console.error(`\n  ❌ Batch ${b + 1} FAILED: ${err.message}`);
            console.error(`\n  Progress saved to: ${progressPath}`);
            console.error(`  Resume with:\n    node scripts/airdropFregCoin.js --network ${progress.networkName} --resume ${path.basename(progressPath)}`);
            process.exit(1);
        }
    }

    // ---- DONE ----
    progress.completedAt = new Date().toISOString();
    saveProgress(progressPath, progress);

    console.log("\n" + "=".repeat(60));
    console.log("✅ AIRDROP COMPLETE");
    console.log("=".repeat(60));
    console.log(`  Recipients:   ${progress.uniqueHolders}`);
    console.log(`  Batches sent: ${progress.totalBatches}`);
    console.log(`  History file: ${progressPath}`);

    const remaining = await airdrop.coinBalance();
    if (remaining > 0n) {
        console.log(`\n  ⚠️  Remaining balance in contract: ${formatAmount(remaining)} FREG (dust)`);
        console.log(`  Use withdrawRemainder() to reclaim it.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("\n❌ Fatal error:", err.message);
        process.exit(1);
    });
