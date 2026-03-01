const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const NONE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const TOTAL_MINTS = 2000;
const BATCH_SIZE = 50; // Print progress every N mints

// Trait names from traits.json (index = traitId, 1-based)
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

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    const mintPrice = await fregs.mintPrice();
    const mintPhase = await fregs.mintPhase();
    console.log(`Mint price: ${ethers.formatEther(mintPrice)} ETH`);
    console.log(`Mint phase: ${mintPhase} (0=Paused, 1=Whitelist, 2=Public)`);
    console.log(`Minting ${TOTAL_MINTS} fregs...\n`);

    // Trait counters
    const headCounts = {};
    const mouthCounts = {};
    const stomachCounts = {};
    const itemCounts = {};

    const mintedTokenIds = [];
    let failed = 0;

    // Mint all
    for (let i = 0; i < TOTAL_MINTS; i++) {
        try {
            // Use varied colors for realism
            const hue = Math.floor((i / TOTAL_MINTS) * 360);
            const color = `#${hue.toString(16).padStart(2, "0")}aa55`;

            const tx = await fregs.mint(color, { value: mintPrice, gasLimit: 500000n });
            const receipt = await tx.wait();

            const event = receipt.logs.find(l => {
                try { return fregs.interface.parseLog(l)?.name === "FregMinted"; } catch { return false; }
            });
            const parsed = event ? fregs.interface.parseLog(event) : null;

            if (parsed) {
                const tokenId = Number(parsed.args.tokenId);
                const h = parsed.args.head;
                const m = parsed.args.mouth;
                const b = parsed.args.belly;

                mintedTokenIds.push(tokenId);

                const headId = Number(h);
                const mouthId = m === NONE ? 0 : Number(m);
                const stomachId = b === NONE ? 0 : Number(b);

                headCounts[headId] = (headCounts[headId] || 0) + 1;
                mouthCounts[mouthId] = (mouthCounts[mouthId] || 0) + 1;
                stomachCounts[stomachId] = (stomachCounts[stomachId] || 0) + 1;
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
            if (failed <= 3) console.log(`  Mint ${i} FAILED: ${e.message.slice(0, 200)}`);
        }

        if ((i + 1) % BATCH_SIZE === 0) {
            process.stdout.write(`  Minted ${i + 1}/${TOTAL_MINTS}\r`);
        }
    }

    console.log(`\nMinting done: ${mintedTokenIds.length} success, ${failed} failed`);

    // Claim items for all minted fregs
    console.log(`\nClaiming items for ${mintedTokenIds.length} fregs...`);
    let claimFailed = 0;

    for (let i = 0; i < mintedTokenIds.length; i++) {
        const tokenId = mintedTokenIds[i];
        try {
            const tx = await fregsItems.claimItem(tokenId, { gasLimit: 500000n });
            const receipt = await tx.wait();

            const event = receipt.logs.find(l => {
                try { return fregsItems.interface.parseLog(l)?.name === "ItemClaimed"; } catch { return false; }
            });
            const parsed = event ? fregsItems.interface.parseLog(event) : null;

            if (parsed) {
                const iType = Number(parsed.args.itemType);
                itemCounts[iType] = (itemCounts[iType] || 0) + 1;
            }
        } catch (e) {
            claimFailed++;
            if (claimFailed <= 3) console.log(`  Claim freg #${tokenId} FAILED: ${e.message.slice(0, 200)}`);
        }

        if ((i + 1) % BATCH_SIZE === 0) {
            process.stdout.write(`  Claimed ${i + 1}/${mintedTokenIds.length}\r`);
        }
    }

    const totalClaimed = mintedTokenIds.length - claimFailed;
    console.log(`\nClaiming done: ${totalClaimed} success, ${claimFailed} failed`);

    // Print reports
    printDistribution("HEAD TRAITS", headCounts, mintedTokenIds.length, HEAD_NAMES);
    printDistribution("MOUTH TRAITS", mouthCounts, mintedTokenIds.length, MOUTH_NAMES);
    printDistribution("STOMACH TRAITS", stomachCounts, mintedTokenIds.length, STOMACH_NAMES);
    printDistribution("ITEMS CLAIMED", itemCounts, totalClaimed, ITEM_NAMES);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  SUMMARY: ${mintedTokenIds.length} minted, ${totalClaimed} items claimed`);
    console.log(`${"=".repeat(60)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
