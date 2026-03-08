const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus } = require("./deploymentStatus");

// Output folder for SVGs
const OUTPUT_PATH = path.join(__dirname, "../../tmp/itemSvgs");

async function main() {
    console.log("=".repeat(60));
    console.log("FregsItems Token Inspector");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    const status = loadDeploymentStatus(network.name);
    const fregsItemsAddress = status.contracts?.fregsItems || process.env.VITE_FREGS_ITEMS_ADDRESS;

    if (!fregsItemsAddress) {
        console.error("\nError: FregsItems address not found");
        console.error("Either deploy first or set VITE_FREGS_ITEMS_ADDRESS");
        process.exit(1);
    }

    console.log("FregsItems address:", fregsItemsAddress);

    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

    // Get total minted
    const totalMinted = await fregsItems.totalMinted();
    console.log("Total items minted:", totalMinted.toString());

    // Get next item type ID to know the range of configured types
    const nextItemTypeId = await fregsItems.nextItemTypeId();
    console.log("Next item type ID:", nextItemTypeId.toString());

    // Inspect configured item types
    console.log("\n" + "=".repeat(60));
    console.log("CONFIGURED ITEM TYPES");
    console.log("=".repeat(60));

    // Check built-in types (1-11) and dynamic types (101+)
    const typeRanges = [
        { start: 1, end: 12, label: "Built-in" },
        { start: 101, end: Number(nextItemTypeId), label: "Dynamic" },
    ];

    const configuredTypes = [];

    for (const range of typeRanges) {
        for (let id = range.start; id < range.end; id++) {
            try {
                const config = await fregsItems.itemTypeConfigs(id);
                if (config.name && config.name.length > 0) {
                    console.log(`\n  [${range.label}] Item Type ${id}: ${config.name}`);
                    console.log(`    Description: ${config.description || "(none)"}`);
                    console.log(`    Target Trait Type: ${config.targetTraitType}`);
                    console.log(`    Trait Value: ${config.traitValue}`);
                    console.log(`    Owner Mintable: ${config.isOwnerMintable}`);
                    console.log(`    Claimable: ${config.isClaimable}`);
                    console.log(`    Claim Weight: ${config.claimWeight}`);
                    configuredTypes.push({ id, name: config.name, label: range.label });
                }
            } catch {
                // Type not configured, skip
            }
        }
    }

    console.log(`\nTotal configured types: ${configuredTypes.length}`);

    // Inspect minted tokens
    if (totalMinted === 0n) {
        console.log("\nNo items minted yet.");
        return;
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_PATH)) {
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_PATH}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("MINTED ITEMS");
    console.log("=".repeat(60));
    console.log(`\nFetching ${totalMinted} items...`);
    console.log("-".repeat(60));

    const results = [];

    for (let tokenId = 0; tokenId < totalMinted; tokenId++) {
        try {
            // Check if token still exists (might have been burned)
            const info = await fregsItems.getItemInfo(tokenId);
            const itemTypeId = Number(info._itemType);
            const itemName = info._name;

            let owner;
            try {
                owner = await fregsItems.ownerOf(tokenId);
            } catch {
                console.log(`  Item ${tokenId}: Burned`);
                continue;
            }

            console.log(`  Item ${tokenId}: ${itemName} (type ${itemTypeId}), owner: ${owner}`);

            // Try to get tokenURI (may fail if SVG renderer not set for this type)
            try {
                const tokenUri = await fregsItems.tokenURI(tokenId, { gasLimit: 50000000n });

                let metadata;
                if (tokenUri.startsWith("data:application/json;base64,")) {
                    const base64Data = tokenUri.replace("data:application/json;base64,", "");
                    const jsonString = Buffer.from(base64Data, "base64").toString("utf8");
                    metadata = JSON.parse(jsonString);
                } else if (tokenUri.startsWith("data:application/json,")) {
                    const jsonString = tokenUri.replace("data:application/json,", "");
                    metadata = JSON.parse(jsonString);
                } else {
                    console.log(`    Unknown URI format, skipping SVG extraction`);
                    results.push({ tokenId, itemTypeId, name: itemName, owner });
                    continue;
                }

                // Extract SVG
                let svg;
                if (metadata.image) {
                    if (metadata.image.startsWith("data:image/svg+xml;base64,")) {
                        const base64Svg = metadata.image.replace("data:image/svg+xml;base64,", "");
                        svg = Buffer.from(base64Svg, "base64").toString("utf8");
                    } else if (metadata.image.startsWith("data:image/svg+xml,")) {
                        svg = metadata.image.replace("data:image/svg+xml,", "");
                    } else {
                        svg = metadata.image;
                    }
                }

                if (svg) {
                    const svgPath = path.join(OUTPUT_PATH, `item_${tokenId}.svg`);
                    fs.writeFileSync(svgPath, svg);
                    console.log(`    SVG saved: ${svgPath}`);
                }

                const metaPath = path.join(OUTPUT_PATH, `item_${tokenId}.json`);
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

                if (metadata.attributes && metadata.attributes.length > 0) {
                    const attrs = metadata.attributes.map(a => `${a.trait_type}: ${a.value}`).join(", ");
                    console.log(`    Attributes: ${attrs}`);
                }

                results.push({ tokenId, itemTypeId, name: itemName, owner, metadata, hasSvg: !!svg });
            } catch (err) {
                console.log(`    tokenURI failed: ${err.message?.slice(0, 80)}`);
                results.push({ tokenId, itemTypeId, name: itemName, owner, hasSvg: false });
            }
        } catch {
            // Token doesn't exist (burned or gap)
            continue;
        }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("INSPECTION COMPLETE");
    console.log("=".repeat(60));
    console.log(`\nItems inspected: ${results.length}/${totalMinted}`);
    console.log(`SVGs saved to: ${OUTPUT_PATH}`);

    // Type distribution
    const typeCounts = {};
    for (const r of results) {
        const key = `${r.name} (type ${r.itemTypeId})`;
        typeCounts[key] = (typeCounts[key] || 0) + 1;
    }
    console.log("\nItem distribution:");
    for (const [type, count] of Object.entries(typeCounts)) {
        console.log(`  ${type}: ${count}`);
    }

    // Create HTML gallery
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>FregsItems Gallery</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; padding: 20px; }
        h1 { text-align: center; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .item { background: #16213e; border-radius: 10px; padding: 15px; }
        .item img { width: 100%; height: auto; border-radius: 5px; }
        .item h3 { margin: 10px 0 5px; }
        .item .meta { font-size: 12px; color: #888; }
        .item .owner { font-size: 10px; color: #666; word-break: break-all; }
    </style>
</head>
<body>
    <h1>FregsItems Gallery</h1>
    <p style="text-align:center">Network: ${network.name} | Contract: ${fregsItemsAddress} | Items: ${results.length}</p>
    <div class="gallery">
        ${results.map(r => `
        <div class="item">
            ${r.hasSvg ? `<img src="item_${r.tokenId}.svg" alt="Item ${r.tokenId}">` : '<div style="height:200px;display:flex;align-items:center;justify-content:center;background:#0a0a1a;border-radius:5px">No SVG</div>'}
            <h3>#${r.tokenId} - ${r.name}</h3>
            <div class="meta">Type: ${r.itemTypeId}</div>
            ${r.metadata?.attributes ? `<div class="meta">${r.metadata.attributes.map(a => `${a.trait_type}: ${a.value}`).join('<br>')}</div>` : ''}
            <div class="owner">Owner: ${r.owner}</div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;

    const htmlPath = path.join(OUTPUT_PATH, "index.html");
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`\nHTML gallery created: ${htmlPath}`);
    console.log("Open this file in a browser to view all items.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
