const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Output folder for SVGs
const OUTPUT_PATH = path.join(__dirname, "../../tmp/tokenSvgs");

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Token Inspector");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    // Get deployed Fregs contract address from env or hardcoded
    const fregsAddress = process.env.VITE_FREGS_ADDRESS;

    if (!fregsAddress) {
        console.error("\nError: VITE_FREGS_ADDRESS not set");
        console.error("Set it in your .env file or run: VITE_FREGS_ADDRESS=0x... npx hardhat run scripts/inspectTokens.js");
        process.exit(1);
    }

    console.log("Fregs address:", fregsAddress);

    // Connect to contract
    const fregs = await ethers.getContractAt("Fregs", fregsAddress);

    // Get total supply
    let totalSupply;
    try {
        totalSupply = await fregs.totalSupply();
        console.log("Total supply:", totalSupply.toString());
    } catch (e) {
        console.log("Could not get totalSupply, trying to enumerate tokens...");
        totalSupply = 0n;
    }

    if (totalSupply === 0n) {
        console.log("\nNo tokens minted yet.");
        return;
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_PATH)) {
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_PATH}`);
    }

    console.log(`\nFetching ${totalSupply} tokens...`);
    console.log("-".repeat(60));

    const results = [];

    for (let i = 0; i < totalSupply; i++) {
        const tokenId = i; // Token IDs start at 0

        try {
            // Get tokenURI
            const tokenUri = await fregs.tokenURI(tokenId);

            // Parse the data URI
            // Format: data:application/json,<json> (no base64)
            let metadata;
            if (tokenUri.startsWith("data:application/json,")) {
                const jsonString = tokenUri.replace("data:application/json,", "");
                metadata = JSON.parse(jsonString);
            } else if (tokenUri.startsWith("data:application/json;base64,")) {
                // Fallback for base64 encoded
                const base64Data = tokenUri.replace("data:application/json;base64,", "");
                const jsonString = Buffer.from(base64Data, "base64").toString("utf8");
                metadata = JSON.parse(jsonString);
            } else {
                console.log(`  Token ${tokenId}: Unknown URI format, skipping`);
                continue;
            }

            // Extract SVG from image field
            // Format: data:image/svg+xml,<svg> (no base64)
            let svg;
            if (metadata.image) {
                if (metadata.image.startsWith("data:image/svg+xml,")) {
                    svg = metadata.image.replace("data:image/svg+xml,", "");
                } else if (metadata.image.startsWith("data:image/svg+xml;base64,")) {
                    // Fallback for base64 encoded
                    const base64Svg = metadata.image.replace("data:image/svg+xml;base64,", "");
                    svg = Buffer.from(base64Svg, "base64").toString("utf8");
                } else {
                    svg = metadata.image; // Maybe it's raw SVG
                }
            }

            // Save SVG to file
            const svgPath = path.join(OUTPUT_PATH, `token_${tokenId}.svg`);
            fs.writeFileSync(svgPath, svg);

            // Save metadata to file
            const metaPath = path.join(OUTPUT_PATH, `token_${tokenId}.json`);
            fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

            console.log(`  Token ${tokenId}: ${metadata.name || 'Unnamed'}`);
            console.log(`    SVG saved to: ${svgPath}`);

            // Extract and display attributes
            if (metadata.attributes && metadata.attributes.length > 0) {
                const attrs = metadata.attributes.map(a => `${a.trait_type}: ${a.value}`).join(", ");
                console.log(`    Attributes: ${attrs}`);
            }

            results.push({
                tokenId,
                name: metadata.name,
                attributes: metadata.attributes,
                svgPath,
                metaPath
            });

        } catch (error) {
            console.log(`  Token ${tokenId}: Error - ${error.message}`);
        }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("INSPECTION COMPLETE");
    console.log("=".repeat(60));
    console.log(`\nTokens inspected: ${results.length}/${totalSupply}`);
    console.log(`SVGs saved to: ${OUTPUT_PATH}`);
    console.log("\nTo view SVGs, open them in a browser or SVG viewer.");

    // Create an HTML index file for easy viewing
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Fregs Token Gallery</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; padding: 20px; }
        h1 { text-align: center; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .token { background: #16213e; border-radius: 10px; padding: 15px; }
        .token img { width: 100%; height: auto; border-radius: 5px; }
        .token h3 { margin: 10px 0 5px; }
        .token .attrs { font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <h1>Fregs Token Gallery</h1>
    <p style="text-align:center">Network: ${network.name} | Contract: ${fregsAddress}</p>
    <div class="gallery">
        ${results.map(r => `
        <div class="token">
            <img src="token_${r.tokenId}.svg" alt="Token ${r.tokenId}">
            <h3>${r.name || `Token #${r.tokenId}`}</h3>
            <div class="attrs">${r.attributes ? r.attributes.map(a => `${a.trait_type}: ${a.value}`).join('<br>') : ''}</div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;

    const htmlPath = path.join(OUTPUT_PATH, "index.html");
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`\nHTML gallery created: ${htmlPath}`);
    console.log("Open this file in a browser to view all tokens.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
