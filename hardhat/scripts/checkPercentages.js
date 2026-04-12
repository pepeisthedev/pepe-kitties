const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");
const fs = require("fs");
const path = require("path");

const BATCH_SIZE = 200; // tokens per getFregDataBatch call

const TRAITS_JSON_PATH = path.join(__dirname, "../../website/public/frogz/default/traits.json");
const traitsConfig = JSON.parse(fs.readFileSync(TRAITS_JSON_PATH, "utf8"));

// Build name maps and target percentage maps from traits.json
// Trait IDs are 1-based (index+1), isNone traits map to ID 0
function buildMaps(traitList) {
    const nameMap = {};
    const targetPctMap = {};
    const totalWeight = traitList.reduce((sum, t) => sum + (t.rarity || 0), 0);

    traitList.forEach((t, index) => {
        const id = t.isNone ? 0 : index + 1;
        nameMap[id] = t.name;
        if (totalWeight > 0) {
            targetPctMap[id] = ((t.rarity || 0) / totalWeight * 100).toFixed(2);
        }
    });

    return { nameMap, targetPctMap };
}

const { nameMap: HEAD_NAMES, targetPctMap: HEAD_TARGET } = buildMaps(traitsConfig.head);
const { nameMap: MOUTH_NAMES, targetPctMap: MOUTH_TARGET } = buildMaps(traitsConfig.mouth);
const { nameMap: STOMACH_NAMES, targetPctMap: STOMACH_TARGET } = buildMaps(traitsConfig.stomach);

function printDistribution(title, counts, total, nameMap, targetPctMap) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${title} (${total} total)`);
    console.log(`${"=".repeat(70)}`);

    const entries = Object.entries(counts)
        .map(([id, count]) => ({
            id: Number(id),
            name: nameMap[Number(id)] || `Unknown(${id})`,
            count,
            actual: ((count / total) * 100).toFixed(2),
            target: targetPctMap[Number(id)] || "?",
        }))
        .sort((a, b) => b.count - a.count);

    const maxNameLen = Math.max(...entries.map(e => e.name.length), 10);
    const maxCountLen = Math.max(...entries.map(e => String(e.count).length), 3);

    console.log(`  ${"Name".padEnd(maxNameLen)}  ${"Count".padStart(maxCountLen)}  ${"Actual".padStart(7)}  ${"Target".padStart(7)}`);
    console.log(`  ${"-".repeat(maxNameLen + maxCountLen + 20)}`);
    for (const { name, count, actual, target } of entries) {
        const diff = target !== "?" ? (Number(actual) - Number(target)).toFixed(2) : "?";
        const diffStr = diff === "?" ? "?" : (diff >= 0 ? `+${diff}` : diff);
        console.log(
            `  ${name.padEnd(maxNameLen)}  ${String(count).padStart(maxCountLen)}  ${actual.padStart(6)}%  ${String(target).padStart(6)}%  (${diffStr})`
        );
    }
}

async function main() {
    const status = loadDeploymentStatus(network.name);
    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);

    const totalSupply = await fregs.totalSupply();
    const total = Number(totalSupply);
    console.log(`Network:      ${network.name}`);
    console.log(`Contract:     ${status.contracts.fregs}`);
    console.log(`Total supply: ${total}`);

    if (total === 0) {
        console.log("No tokens minted yet.");
        return;
    }

    // Build full list of token IDs (ERC721A: sequential from 0, may have gaps from burns)
    const allTokenIds = await fregs.getAllTokenIds();
    console.log(`Fetching traits for ${allTokenIds.length} tokens in batches of ${BATCH_SIZE}...`);

    const headCounts = {};
    const mouthCounts = {};
    const stomachCounts = {};

    const tokenIds = Array.from(allTokenIds);

    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
        const batch = tokenIds.slice(i, i + BATCH_SIZE);
        const { heads, mouths, bellies } = await fregs.getFregDataBatch(batch);

        for (let j = 0; j < batch.length; j++) {
            const h = Number(heads[j]);
            const m = Number(mouths[j]);
            const s = Number(bellies[j]);
            headCounts[h] = (headCounts[h] || 0) + 1;
            mouthCounts[m] = (mouthCounts[m] || 0) + 1;
            stomachCounts[s] = (stomachCounts[s] || 0) + 1;
        }

        process.stdout.write(`  Fetched ${Math.min(i + BATCH_SIZE, tokenIds.length)}/${tokenIds.length}\r`);
    }

    console.log(`\nDone.\n`);

    printDistribution("HEAD TRAITS", headCounts, tokenIds.length, HEAD_NAMES, HEAD_TARGET);
    printDistribution("MOUTH TRAITS", mouthCounts, tokenIds.length, MOUTH_NAMES, MOUTH_TARGET);
    printDistribution("STOMACH TRAITS", stomachCounts, tokenIds.length, STOMACH_NAMES, STOMACH_TARGET);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  SUMMARY: ${tokenIds.length} tokens read`);
    console.log(`${"=".repeat(60)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
