const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Path to the frogz SVG folder (relative to this script)
const FROGZ_BASE_PATH = path.join(__dirname, "../../../website/public/frogz");
const FROGZ_PATH = path.join(FROGZ_BASE_PATH, "default");
const FROM_ITEMS_PATH = path.join(FROGZ_BASE_PATH, "from_items");
// Path to the items SVG folder
const ITEMS_PATH = path.join(__dirname, "../../../website/public/items");

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, retryDelay = 5000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) {
                throw error;
            }

            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
            console.log(`⏳ Retrying in ${delay / 1000} seconds... (${maxRetries - attempt} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Chunk and store an SVG file using SVGPartWriter
 */
async function chunkAndStoreSVG(svgFilePath, svgPartWriter) {
    let svgData = fs.readFileSync(svgFilePath, "utf8");

    const originalSize = svgData.length;
    console.log(`📄 Original SVG size: ${originalSize} characters`);

    // Replace double quotes with single quotes
    svgData = svgData.replace(/"/g, "'");

    // Strip XML declaration and SVG wrapper to get just the content
    const svgStartIndex = svgData.indexOf('<svg');
    if (svgStartIndex > 0) {
        svgData = svgData.substring(svgStartIndex);
    }

    // Strip opening <svg...> tag
    const svgTagEndIndex = svgData.indexOf('>');
    if (svgTagEndIndex !== -1) {
        svgData = svgData.substring(svgTagEndIndex + 1);
    }

    // Strip closing </svg> tag
    const closingTagIndex = svgData.lastIndexOf('</svg>');
    if (closingTagIndex !== -1) {
        svgData = svgData.substring(0, closingTagIndex);
    }

    svgData = svgData.trim();
    console.log(`✅ Processed SVG size: ${svgData.length} characters`);

    // Define chunk size (16KB)
    const chunkSizeBytes = 16 * 1024;
    const totalChunks = Math.ceil(svgData.length / chunkSizeBytes);

    console.log(`📦 Total chunks needed: ${totalChunks}`);

    const svgAddresses = [];

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSizeBytes;
        const end = start + chunkSizeBytes;
        const chunk = svgData.slice(start, end);

        console.log(`Processing chunk ${i + 1}/${totalChunks} (${chunk.length} chars)...`);

        const chunkBuffer = Buffer.from(chunk, "utf8");
        const chunkBytes = new Uint8Array(chunkBuffer);

        const address = await retryWithBackoff(async () => {
            console.log(`🚀 Executing transaction for chunk ${i + 1}...`);
            const tx = await svgPartWriter.store(chunkBytes);

            let receipt;
            if (network.name !== "localhost" && network.name !== "hardhat") {
                console.log(`⏳ Waiting for confirmation...`);
                receipt = await tx.wait(1);
            } else {
                receipt = await tx.wait();
            }

            if (receipt.status !== 1) {
                throw new Error(`Transaction failed for chunk ${i + 1}. Status: ${receipt.status}.`);
            }

            // Get the address from the DataStored event
            let addr = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = svgPartWriter.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === 'DataStored') {
                        addr = parsedLog.args.pointer;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!addr) {
                throw new Error(`Could not find storage address for chunk ${i + 1}.`);
            }

            return addr;
        }, 3, 5000);

        svgAddresses.push(address);
        console.log(`✓ Stored chunk ${i + 1}/${totalChunks} at address: ${address}`);
    }

    return { svgAddresses, chunkCount: totalChunks };
}

/**
 * Deploy a single SVG file and return its SVGRenderer address
 */
async function deploySvg(svgFilePath, svgPartWriter) {
    const { svgAddresses, chunkCount } = await chunkAndStoreSVG(svgFilePath, svgPartWriter);

    const SVGRendererContract = await ethers.getContractFactory("SVGRenderer");
    console.log("Deploying SVGRenderer with", svgAddresses.length, "addresses");
    const svgRenderer = await SVGRendererContract.deploy(svgAddresses);
    await svgRenderer.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        const deploymentTx = svgRenderer.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGRenderer deployment...");
            await deploymentTx.wait(2);
        }
    }

    return {
        address: await svgRenderer.getAddress(),
        chunkCount: chunkCount + 1
    };
}

/**
 * Deploy all SVGs from a trait folder and create a router
 * For 'skin' folder, uses from_items/ (special skins) - base skin handled by BodyRenderer
 * For 'head' folder, combines default/ and from_items/
 *
 * IMPORTANT: For skin folder, typeIds match the fileName (e.g., 2.svg → typeId 2)
 * This ensures the contract mappings align with traits.json
 */
async function deployTraitFolder(folderName, svgPartWriter) {
    const folderPath = path.join(FROGZ_PATH, folderName);
    const fromItemsFolder = path.join(FROM_ITEMS_PATH, folderName);

    let files = [];
    let useExplicitTypeIds = false; // For skin folder, use explicit IDs matching fileName

    if (folderName === 'skin') {
        // Skin folder: only deploy from from_items/ (special skins)
        // Base colorable skin is handled by BodyRenderer, not the skin router
        // TypeIds must match fileName (e.g., 2.svg → typeId 2) for contract compatibility
        if (!fs.existsSync(fromItemsFolder)) {
            console.log(`⚠️  Folder from_items/${folderName} does not exist, skipping...`);
            return null;
        }
        files = fs.readdirSync(fromItemsFolder)
            .filter(f => f.endsWith('.svg'))
            .map(f => ({
                file: f,
                path: path.join(fromItemsFolder, f),
                source: 'from_items',
                typeId: parseInt(f.replace('.svg', '')) // Extract typeId from fileName
            }));
        useExplicitTypeIds = true;
    } else if (folderName === 'head') {
        // Head folder: combine default/ and from_items/
        if (fs.existsSync(folderPath)) {
            files = fs.readdirSync(folderPath)
                .filter(f => f.endsWith('.svg'))
                .map(f => ({ file: f, path: path.join(folderPath, f), source: 'default' }));
        }
        if (fs.existsSync(fromItemsFolder)) {
            const fromItemsFiles = fs.readdirSync(fromItemsFolder)
                .filter(f => f.endsWith('.svg'))
                .map(f => {
                    // from_items heads get IDs after base heads (e.g., 1.svg becomes ID 20 if 19 base heads)
                    return { file: f, path: path.join(fromItemsFolder, f), source: 'from_items' };
                });
            files = files.concat(fromItemsFiles);
        }
    } else {
        // Other folders: only deploy from default/
        if (!fs.existsSync(folderPath)) {
            console.log(`⚠️  Folder ${folderName} does not exist, skipping...`);
            return null;
        }
        files = fs.readdirSync(folderPath)
            .filter(f => f.endsWith('.svg'))
            .map(f => ({ file: f, path: path.join(folderPath, f), source: 'default' }));
    }

    // Sort: default files by number, then from_items files by number
    files.sort((a, b) => {
        // Default files come first
        if (a.source !== b.source) {
            return a.source === 'default' ? -1 : 1;
        }
        const numA = parseInt(a.file.replace('.svg', ''));
        const numB = parseInt(b.file.replace('.svg', ''));
        return numA - numB;
    });

    if (files.length === 0) {
        console.log(`⚠️  No SVG files found in ${folderName}, skipping...`);
        return null;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎨 Deploying ${folderName.toUpperCase()} traits (${files.length} SVGs)`);
    if (useExplicitTypeIds) {
        console.log(`ℹ️  Using explicit typeIds matching fileNames`);
    }
    console.log(`${'='.repeat(60)}`);

    const svgRendererAddresses = [];
    const typeIds = []; // For explicit typeId mapping
    let totalContracts = 0;

    for (let i = 0; i < files.length; i++) {
        const { file, path: filePath, source, typeId } = files[i];

        console.log(`\n📦 Deploying ${folderName}/${file} from ${source} (${i + 1}/${files.length})...`);
        if (useExplicitTypeIds) {
            console.log(`   TypeId: ${typeId}`);
        }

        try {
            const { address, chunkCount } = await deploySvg(filePath, svgPartWriter);
            svgRendererAddresses.push(address);
            if (useExplicitTypeIds) {
                typeIds.push(typeId);
            }
            totalContracts += chunkCount;
            console.log(`✅ ${folderName}/${file} deployed at: ${address} (${chunkCount} contracts)`);
        } catch (error) {
            console.error(`❌ Failed to deploy ${folderName}/${file}:`, error);
            throw new Error(`Failed to deploy ${folderName}/${file}. Cannot continue.`);
        }
    }

    // Deploy SVGRouter for this trait type
    console.log(`\n🚀 Deploying SVGRouter for ${folderName}...`);
    const SVGRouterContract = await ethers.getContractFactory("SVGRouter");
    const svgRouter = await SVGRouterContract.deploy();
    await svgRouter.waitForDeployment();
    totalContracts++;

    if (network.name !== "localhost" && network.name !== "hardhat") {
        const deploymentTx = svgRouter.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGRouter deployment...");
            await deploymentTx.wait(2);
        }
    }

    // Add SVG addresses to the router
    if (useExplicitTypeIds) {
        // Use explicit typeIds for skin folder - typeIds match fileNames
        console.log(`📋 Adding ${svgRendererAddresses.length} SVGs to router with explicit typeIds...`);
        console.log(`   TypeIds: [${typeIds.join(', ')}]`);
        try {
            const tx = await svgRouter.setRenderContractsBatchWithTypeIds(typeIds, svgRendererAddresses);
            const receipt = await tx.wait();
            console.log(`✅ All ${folderName} SVGs added with explicit typeIds! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.error(`❌ Failed to configure router:`, error);
            throw error;
        }
    } else {
        // Use sequential IDs (1, 2, 3...) for other folders
        console.log(`📋 Adding ${svgRendererAddresses.length} SVGs to router in batch...`);
        try {
            const tx = await svgRouter.setRenderContractsBatch(svgRendererAddresses);
            const receipt = await tx.wait();
            console.log(`✅ All ${folderName} SVGs added! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.error(`❌ Failed to configure router:`, error);
            throw error;
        }
    }

    const routerAddress = await svgRouter.getAddress();
    console.log(`🎯 ${folderName} Router deployed at: ${routerAddress}`);

    return {
        routerAddress,
        svgCount: files.length,
        contractCount: totalContracts,
        typeIds: useExplicitTypeIds ? typeIds : null // Return typeIds for reference
    };
}

/**
 * Deploy the body SVG with color support using BodyRenderer
 * Splits the SVG at the color value and stores two parts
 */
async function deployBody(svgPartWriter) {
    const bodyPath = path.join(FROGZ_PATH, "body", "1.svg");

    if (!fs.existsSync(bodyPath)) {
        console.log("⚠️  Body SVG not found, skipping...");
        return null;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎨 Deploying BODY with color support`);
    console.log(`${'='.repeat(60)}`);

    let svgData = fs.readFileSync(bodyPath, "utf8");
    svgData = svgData.replace(/"/g, "'");

    // Strip XML declaration and SVG wrapper
    const svgStartIndex = svgData.indexOf('<svg');
    if (svgStartIndex > 0) {
        svgData = svgData.substring(svgStartIndex);
    }
    const svgTagEndIndex = svgData.indexOf('>');
    if (svgTagEndIndex !== -1) {
        svgData = svgData.substring(svgTagEndIndex + 1);
    }
    const closingTagIndex = svgData.lastIndexOf('</svg>');
    if (closingTagIndex !== -1) {
        svgData = svgData.substring(0, closingTagIndex);
    }
    svgData = svgData.trim();

    // Find the color in .cls-6{fill:#65b449;} and split there
    // The color appears after ".cls-6{fill:" and before ";"
    const colorPattern = /\.cls-6\{fill:/;
    const match = svgData.match(colorPattern);

    if (!match) {
        throw new Error("Could not find .cls-6{fill: pattern in body SVG");
    }

    const splitIndex = svgData.indexOf(match[0]) + match[0].length;
    const afterColor = svgData.indexOf(';', splitIndex);

    if (afterColor === -1) {
        throw new Error("Could not find semicolon after color value");
    }

    const part1 = svgData.substring(0, splitIndex);
    const part2 = svgData.substring(afterColor);

    console.log(`📄 Part 1 size: ${part1.length} chars`);
    console.log(`📄 Part 2 size: ${part2.length} chars`);

    // Store both parts
    console.log("📦 Storing part 1...");
    const part1Buffer = Buffer.from(part1, "utf8");
    const part1Bytes = new Uint8Array(part1Buffer);

    const part1Address = await retryWithBackoff(async () => {
        const tx = await svgPartWriter.store(part1Bytes);
        const receipt = await tx.wait(network.name !== "localhost" && network.name !== "hardhat" ? 1 : undefined);

        if (receipt.status !== 1) {
            throw new Error("Transaction failed for part 1");
        }

        for (const log of receipt.logs) {
            try {
                const parsedLog = svgPartWriter.interface.parseLog(log);
                if (parsedLog && parsedLog.name === 'DataStored') {
                    return parsedLog.args.pointer;
                }
            } catch (e) {
                continue;
            }
        }
        throw new Error("Could not find storage address for part 1");
    }, 3, 5000);

    console.log(`✅ Part 1 stored at: ${part1Address}`);

    console.log("📦 Storing part 2...");
    const part2Buffer = Buffer.from(part2, "utf8");
    const part2Bytes = new Uint8Array(part2Buffer);

    const part2Address = await retryWithBackoff(async () => {
        const tx = await svgPartWriter.store(part2Bytes);
        const receipt = await tx.wait(network.name !== "localhost" && network.name !== "hardhat" ? 1 : undefined);

        if (receipt.status !== 1) {
            throw new Error("Transaction failed for part 2");
        }

        for (const log of receipt.logs) {
            try {
                const parsedLog = svgPartWriter.interface.parseLog(log);
                if (parsedLog && parsedLog.name === 'DataStored') {
                    return parsedLog.args.pointer;
                }
            } catch (e) {
                continue;
            }
        }
        throw new Error("Could not find storage address for part 2");
    }, 3, 5000);

    console.log(`✅ Part 2 stored at: ${part2Address}`);

    // Deploy BodyRenderer
    console.log("🚀 Deploying BodyRenderer...");
    const BodyRendererContract = await ethers.getContractFactory("BodyRenderer");
    const bodyRenderer = await BodyRendererContract.deploy(part1Address, part2Address);
    await bodyRenderer.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        const deploymentTx = bodyRenderer.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for BodyRenderer deployment...");
            await deploymentTx.wait(2);
        }
    }

    const bodyAddress = await bodyRenderer.getAddress();
    console.log(`🎯 BodyRenderer deployed at: ${bodyAddress}`);

    return {
        address: bodyAddress,
        contractCount: 3 // 2 storage contracts + 1 renderer
    };
}

/**
 * Deploy item SVGs and create a router for them
 * Items are stored at indices matching their item type (1-6)
 */
async function deployItems(svgPartWriter) {
    if (!fs.existsSync(ITEMS_PATH)) {
        console.log("⚠️  Items folder not found, skipping...");
        return null;
    }

    // Get all SVG files in the items folder
    const files = fs.readdirSync(ITEMS_PATH)
        .filter(f => f.endsWith('.svg'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('.svg', ''));
            const numB = parseInt(b.replace('.svg', ''));
            return numA - numB;
        });

    if (files.length === 0) {
        console.log("⚠️  No SVG files found in items folder, skipping...");
        return null;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎁 Deploying ITEM SVGs (${files.length} items)`);
    console.log(`${'='.repeat(60)}`);

    const svgRendererAddresses = [];
    let totalContracts = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(ITEMS_PATH, file);

        console.log(`\n📦 Deploying item ${file} (${i + 1}/${files.length})...`);

        try {
            const { address, chunkCount } = await deploySvg(filePath, svgPartWriter);
            svgRendererAddresses.push(address);
            totalContracts += chunkCount;
            console.log(`✅ Item ${file} deployed at: ${address}`);
        } catch (error) {
            console.error(`❌ Failed to deploy item ${file}:`, error);
            throw new Error(`Failed to deploy item ${file}. Cannot continue.`);
        }
    }

    // Deploy SVGRouter for items
    console.log(`\n🚀 Deploying SVGRouter for items...`);
    const SVGRouterContract = await ethers.getContractFactory("SVGRouter");
    const svgRouter = await SVGRouterContract.deploy();
    await svgRouter.waitForDeployment();
    totalContracts++;

    if (network.name !== "localhost" && network.name !== "hardhat") {
        const deploymentTx = svgRouter.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGRouter deployment...");
            await deploymentTx.wait(2);
        }
    }

    // Add all item SVG addresses to the router
    // Note: Item type 1 will be at index 0, type 2 at index 1, etc.
    console.log(`📋 Adding ${svgRendererAddresses.length} items to router...`);
    try {
        const tx = await svgRouter.setRenderContractsBatch(svgRendererAddresses);
        const receipt = await tx.wait();
        console.log(`✅ All items added! Gas used: ${receipt.gasUsed}`);
    } catch (error) {
        console.error(`❌ Failed to configure items router:`, error);
        throw error;
    }

    const routerAddress = await svgRouter.getAddress();
    console.log(`🎯 Items Router deployed at: ${routerAddress}`);

    return {
        routerAddress,
        itemCount: files.length,
        contractCount: totalContracts
    };
}

/**
 * Main deployment function
 */
async function deployArt() {
    console.log("\n" + "=".repeat(60));
    console.log("🐸 FREGS ART DEPLOYMENT");
    console.log("=".repeat(60));
    console.log(`Network: ${network.name}`);
    console.log(`Frogz path: ${FROGZ_PATH}`);

    // Verify the frogz folder exists
    if (!fs.existsSync(FROGZ_PATH)) {
        throw new Error(`Frogz folder not found at: ${FROGZ_PATH}`);
    }

    // Get all subdirectories (trait folders)
    // Skip 'background' (handled inline in FregsSVGRenderer._renderBackground)
    // Skip 'body' (handled separately with BodyRenderer)
    const traitFolders = fs.readdirSync(FROGZ_PATH)
        .filter(f => {
            const fullPath = path.join(FROGZ_PATH, f);
            return fs.statSync(fullPath).isDirectory() &&
                   f !== 'background' &&
                   f !== 'body';
        });

    console.log(`Found trait folders: ${traitFolders.join(', ')}`);
    console.log(`ℹ️  Skipping 'background' (inline in _renderBackground)`);
    console.log(`ℹ️  Body will be deployed with BodyRenderer`);

    // 1. Deploy SVGPartWriter
    console.log("\n🔧 Deploying SVGPartWriter...");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await SVGPartWriter.deploy();
    await svgPartWriter.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        const deploymentTx = svgPartWriter.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGPartWriter deployment...");
            await deploymentTx.wait(2);
        }
    }

    const svgPartWriterAddress = await svgPartWriter.getAddress();
    console.log(`✅ SVGPartWriter deployed at: ${svgPartWriterAddress}`);

    // 2. Deploy body with BodyRenderer
    const bodyResult = await deployBody(svgPartWriter);
    let totalContracts = 1; // Start with 1 for SVGPartWriter
    const routers = {};

    if (bodyResult) {
        routers['body'] = bodyResult.address;
        totalContracts += bodyResult.contractCount;
    }

    // 3. Deploy all other trait folders
    for (const folder of traitFolders) {
        const result = await deployTraitFolder(folder, svgPartWriter);
        if (result) {
            routers[folder] = result.routerAddress;
            totalContracts += result.contractCount;
        }
    }

    // 4. Deploy item SVGs
    const itemsResult = await deployItems(svgPartWriter);
    if (itemsResult) {
        routers['items'] = itemsResult.routerAddress;
        totalContracts += itemsResult.contractCount;
    }

    // 5. Print summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log(`\nTotal contracts deployed: ${totalContracts}`);
    console.log(`\nSVGPartWriter: ${svgPartWriterAddress}`);
    console.log("\n📋 CONTRACT ADDRESSES (use these in FregsSVGRenderer):");
    console.log("-".repeat(60));
    console.log(`${'background'.padEnd(15)} : (inline in _renderBackground - no deployment needed)`);

    for (const [folder, address] of Object.entries(routers)) {
        console.log(`${folder.padEnd(15)} : ${address}`);
    }

    console.log("-".repeat(60));

    // Return addresses for use in other scripts
    return {
        svgPartWriterAddress,
        routers
    };
}

// Execute if run directly
if (require.main === module) {
    deployArt()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { deployArt };
