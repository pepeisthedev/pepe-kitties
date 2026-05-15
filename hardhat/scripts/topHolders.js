const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus } = require("./deploymentStatus");

const TOP_N = 100;
const BATCH_SIZE = 50;
const OUTPUT_PATH = path.join(__dirname, "..", `top-holders-${network.name}.json`);

async function batchedOwnerOf(fregs, tokenIds) {
    const owners = new Array(tokenIds.length);
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
        const slice = tokenIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            slice.map(id =>
                fregs.ownerOf(id).catch(() => null)
            )
        );
        for (let j = 0; j < results.length; j++) {
            owners[i + j] = results[j];
        }
        process.stdout.write(`\r  Fetched ${Math.min(i + BATCH_SIZE, tokenIds.length)}/${tokenIds.length} owners`);
    }
    process.stdout.write("\n");
    return owners;
}

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Top Holders");
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

    const counts = new Map();
    let unresolved = 0;
    for (const owner of owners) {
        if (!owner) {
            unresolved++;
            continue;
        }
        const key = owner.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    if (unresolved > 0) {
        console.log(`  Warning: ${unresolved} token owners could not be resolved.`);
    }

    const ranked = Array.from(counts.entries())
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));

    const top = ranked.slice(0, TOP_N);

    console.log("\n" + "=".repeat(60));
    console.log(`Top ${Math.min(TOP_N, top.length)} holders (of ${ranked.length} total)`);
    console.log("=".repeat(60));
    console.log("Rank  Address                                       Count");
    console.log("-".repeat(64));
    top.forEach((entry, i) => {
        const rank = String(i + 1).padStart(4, " ");
        const count = String(entry.count).padStart(5, " ");
        console.log(`${rank}  ${entry.address}  ${count}`);
    });

    const payload = {
        network: network.name,
        contract: fregsAddress,
        generatedAt: new Date().toISOString(),
        liveSupply: tokenIds.length,
        uniqueHolders: ranked.length,
        unresolvedTokens: unresolved,
        topHolders: top
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`\nSaved to: ${OUTPUT_PATH}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
