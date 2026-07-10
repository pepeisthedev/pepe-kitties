/**
 * Fregs Holders Snapshot (read-only)
 *
 * Dumps EVERY unique address currently holding a Fregs NFT.
 *
 * Usage:
 *   npx hardhat run scripts/fregHolders.js --network base
 *
 * Writes:
 *   freg-holders-<network>.json  — full holder list with per-address counts
 *   freg-holders-<network>.txt   — one address per line
 *
 * Read-only: never sends a transaction. Safe to run against mainnet.
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus } = require("./deploymentStatus");
const { batchedOwnerOf } = require("./ownerResolver");

const JSON_OUTPUT_PATH = path.join(__dirname, "..", `freg-holders-${network.name}.json`);
const TXT_OUTPUT_PATH = path.join(__dirname, "..", `freg-holders-${network.name}.txt`);

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Holders Snapshot");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    const status = loadDeploymentStatus(network.name);
    const fregsAddress = process.env.VITE_FREGS_ADDRESS || status.contracts.fregs;

    if (!fregsAddress) {
        console.error("Could not determine Fregs address (set VITE_FREGS_ADDRESS or update deployment status).");
        process.exit(1);
    }

    console.log("Fregs address:", fregsAddress);

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);

    console.log("\nFetching live token IDs...");
    const tokenIdsBn = await fregs.getAllTokenIds();
    const tokenIds = tokenIdsBn.map(id => Number(id));
    console.log(`  Live supply: ${tokenIds.length}`);

    if (tokenIds.length === 0) {
        console.log("No tokens minted yet.");
        return;
    }

    console.log("\nResolving owners...");
    const owners = await batchedOwnerOf(fregs, tokenIds);

    // ownerOfWithRetry never returns null, so every token resolves to an owner.
    const counts = new Map();
    for (const owner of owners) {
        const key = owner.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    const holders = Array.from(counts.entries())
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));

    console.log("\n" + "=".repeat(60));
    console.log(`Unique holders: ${holders.length}`);
    console.log("=".repeat(60));

    const payload = {
        network: network.name,
        contract: fregsAddress,
        generatedAt: new Date().toISOString(),
        liveSupply: tokenIds.length,
        uniqueHolders: holders.length,
        holders
    };
    fs.writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`\nSaved JSON to: ${JSON_OUTPUT_PATH}`);

    fs.writeFileSync(TXT_OUTPUT_PATH, holders.map(h => h.address).join("\n") + "\n");
    console.log(`Saved addresses to: ${TXT_OUTPUT_PATH}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
