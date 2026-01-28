const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ RETRY HELPER ============

async function retryWithBackoff(fn, maxRetries = 3, retryDelay = 5000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === maxRetries) throw error;
            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`  ⚠️  Attempt ${attempt} failed: ${error.message}`);
            console.log(`  ⏳ Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

// ============ SVG STORAGE ============

async function storeSvgData(svgPartWriter, data) {
    const buffer = Buffer.from(data, "utf8");
    const bytes = new Uint8Array(buffer);

    return await retryWithBackoff(async () => {
        const tx = await svgPartWriter.store(bytes);
        const receipt = await tx.wait(network.name !== "localhost" && network.name !== "hardhat" ? 1 : undefined);

        if (receipt.status !== 1) {
            throw new Error("Transaction failed");
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
        throw new Error("Could not find storage address");
    }, 3, 5000);
}

// ============ SVG PROCESSING ============

/**
 * Process SVG file for on-chain storage with proper escaping for JSON embedding
 * - Strips XML declaration and SVG wrapper
 * - Replaces double quotes with single quotes (for JSON compatibility)
 * - Removes newlines, tabs, and excessive whitespace (for JSON compatibility)
 * - Prefixes CSS class names to avoid collisions between layers
 * @param svgFilePath - Path to the SVG file
 * @param classPrefix - Unique prefix for CSS class names (e.g., 'body', 'head1')
 */
function processSvgFile(svgFilePath, classPrefix = '') {
    let svgData = fs.readFileSync(svgFilePath, "utf8");

    // Replace double quotes with single quotes for JSON compatibility
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

    // Prefix CSS class names to avoid collisions between layers
    if (classPrefix) {
        // Replace .cls-X in style definitions with .{prefix}-cls-X
        svgData = svgData.replace(/\.cls-(\d+)/g, `.${classPrefix}-cls-$1`);
        // Replace class='cls-X' in elements with class='{prefix}-cls-X'
        svgData = svgData.replace(/class='cls-(\d+)'/g, `class='${classPrefix}-cls-$1'`);
        // Handle multiple classes: class='cls-1 cls-2' -> class='prefix-cls-1 prefix-cls-2'
        svgData = svgData.replace(/class='([^']+)'/g, (match, classes) => {
            const prefixed = classes.split(' ').map(c => {
                if (c.startsWith('cls-')) {
                    return `${classPrefix}-${c}`;
                }
                return c;
            }).join(' ');
            return `class='${prefixed}'`;
        });
    }

    // Remove newlines, tabs, carriage returns, and excessive whitespace for JSON compatibility
    // This prevents "Bad control character" errors when parsing tokenURI JSON
    svgData = svgData
        .replace(/[\r\n\t]/g, ' ')     // Replace newlines and tabs with spaces
        .replace(/\s{2,}/g, ' ')        // Collapse multiple spaces into one
        .replace(/>\s+</g, '><')        // Remove whitespace between tags
        .trim();

    return svgData;
}

// ============ SVG DEPLOYMENT ============

/**
 * Deploy a single SVG file as an SVGRenderer contract
 * @param svgPartWriter - The SVGPartWriter contract instance
 * @param filePath - Path to the SVG file
 * @param classPrefix - Unique prefix for CSS class names
 * @returns The deployed SVGRenderer address
 */
async function deploySingleSvg(svgPartWriter, filePath, classPrefix = '') {
    const svgData = processSvgFile(filePath, classPrefix);
    const chunkSize = 16 * 1024;
    const totalChunks = Math.ceil(svgData.length / chunkSize);
    const addresses = [];

    for (let j = 0; j < totalChunks; j++) {
        const chunk = svgData.slice(j * chunkSize, (j + 1) * chunkSize);
        const addr = await storeSvgData(svgPartWriter, chunk);
        addresses.push(addr);
    }

    const SVGRenderer = await ethers.getContractFactory("SVGRenderer");
    const renderer = await SVGRenderer.deploy(addresses);
    await renderer.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await renderer.deploymentTransaction()?.wait(2);
    }

    return await renderer.getAddress();
}

/**
 * Deploy a folder of SVG trait files and create an SVGRouter
 * @param folderPath - Path to the folder containing SVG files
 * @param svgPartWriter - The SVGPartWriter contract instance
 * @param classPrefixBase - Base prefix for CSS class names (file number will be appended)
 * @returns The deployed SVGRouter address
 */
async function deployTraitFolder(folderPath, svgPartWriter, classPrefixBase = '') {
    if (!fs.existsSync(folderPath)) return null;

    const files = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.svg'))
        .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')));

    if (files.length === 0) return null;

    console.log(`  Deploying ${path.basename(folderPath)} (${files.length} SVGs)...`);

    const svgRendererAddresses = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(folderPath, file);
        // Create unique prefix: base + file number (e.g., 'head1', 'belly2', 'specialHead1')
        const fileNum = file.replace('.svg', '');
        const classPrefix = classPrefixBase ? `${classPrefixBase}${fileNum}` : '';

        const rendererAddress = await deploySingleSvg(svgPartWriter, filePath, classPrefix);
        svgRendererAddresses.push(rendererAddress);
        console.log(`    ${file} deployed`);
    }

    // Deploy router
    const SVGRouter = await ethers.getContractFactory("SVGRouter");
    const router = await SVGRouter.deploy();
    await router.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await router.deploymentTransaction()?.wait(2);
    }

    await (await router.setRenderContractsBatch(svgRendererAddresses)).wait();

    const routerAddress = await router.getAddress();
    console.log(`    Router deployed: ${routerAddress}`);
    return routerAddress;
}

/**
 * Get or deploy SVGPartWriter
 * @returns The SVGPartWriter contract instance
 */
async function getOrDeploySvgPartWriter() {
    console.log("  Deploying SVGPartWriter...");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await SVGPartWriter.deploy();
    await svgPartWriter.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await svgPartWriter.deploymentTransaction()?.wait(2);
    }

    console.log(`  SVGPartWriter deployed: ${await svgPartWriter.getAddress()}`);
    return svgPartWriter;
}

module.exports = {
    retryWithBackoff,
    storeSvgData,
    processSvgFile,
    deploySingleSvg,
    deployTraitFolder,
    getOrDeploySvgPartWriter,
};
