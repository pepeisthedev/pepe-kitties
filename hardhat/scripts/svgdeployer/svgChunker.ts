import { ethers, network } from "hardhat";

const fs = require("fs");
const path = require("path");

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param retryDelay - Initial delay between retries in ms
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 5000
): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
            console.log(`⏳ Retrying in ${delay / 1000} seconds... (${maxRetries - attempt} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

export async function deploySvg(
    svgFilePath: string, 
    svgPartWriter: any
): Promise<{ address: string; chunkCount: number }> {

    const { svgAddresses, chunkCount } = await chunkAndStoreSVG(svgFilePath, svgPartWriter);
    const svgRendererContract = await ethers.getContractFactory("SVGRenderer");
    console.log("Deploying SVGRenderer with addresses:", svgAddresses, svgAddresses.length);
    const svgRenderer = await svgRendererContract.deploy(svgAddresses);
    svgRenderer.waitForDeployment();
    if (network.name !== "localhost") {
        const deploymentTx = svgRenderer.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGRendererContract deployment...");
            await deploymentTx.wait(2);
        }
    }

    return { 
        address: await svgRenderer.getAddress(),
        chunkCount: chunkCount + 1 // +1 for the SVGRenderer contract itself
    };
}

/**
 * Deploy a complete SVG (with XML declaration and SVG tags intact) using SVGRenderer
 * @param svgFilePath - Path to the SVG file to process
 * @param svgPartWriter - Deployed SVGPartWriter contract instance
 * @param escapeSvg - If true, escapes the SVG for direct JSON embedding (no base64 needed)
 * @returns Object with deployed SVGRenderer address and total contract count
 */
export async function deploySvgComplete(
    svgFilePath: string, 
    svgPartWriter: any,
    escapeSvg: boolean = false
): Promise<{ address: string; chunkCount: number }> {

    const { svgAddresses, chunkCount } = await chunkAndStoreSVGComplete(svgFilePath, svgPartWriter, escapeSvg);
    const svgRendererContract = await ethers.getContractFactory("SVGRenderer");
    console.log("Deploying SVGRenderer with addresses:", svgAddresses, svgAddresses.length);
    const svgRenderer = await svgRendererContract.deploy(svgAddresses);
    svgRenderer.waitForDeployment();
    if (network.name !== "localhost") {
        const deploymentTx = svgRenderer.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for SVGRendererContract deployment...");
            await deploymentTx.wait(2);
        }
    }

    return { 
        address: await svgRenderer.getAddress(),
        chunkCount: chunkCount + 1 // +1 for the SVGRenderer contract itself
    };
}

/**
 * Reads an SVG file, splits it into 16KB chunks, and stores them using SVGPartWriter
 * @param svgFilePath - Path to the SVG file to process
 * @param svgPartWriter - Deployed SVGPartWriter contract instance
 * @returns Object with array of addresses where the chunks are stored and the chunk count
 */
export async function chunkAndStoreSVG(
    svgFilePath: string, 
    svgPartWriter: any
): Promise<{ svgAddresses: string[]; chunkCount: number }> {
    const svgPath = path.join(__dirname, svgFilePath);
    // Read the SVG file
    let svgData = fs.readFileSync(svgPath, "utf8");
    
    console.log(`📄 Original SVG size: ${svgData.length} characters`);
    
    // Strip XML declaration (everything before the first <svg tag)
    const svgStartIndex = svgData.indexOf('<svg');
    if (svgStartIndex > 0) {
        const strippedXml = svgData.substring(0, svgStartIndex);
        console.log(`🗑️  Stripped XML declaration: ${strippedXml.trim()}`);
        svgData = svgData.substring(svgStartIndex);
    }
    
    // Strip opening <svg...> tag
    const svgTagEndIndex = svgData.indexOf('>');
    if (svgTagEndIndex !== -1) {
        const strippedOpenTag = svgData.substring(0, svgTagEndIndex + 1);
        console.log(`🗑️  Stripped opening SVG tag: ${strippedOpenTag}`);
        svgData = svgData.substring(svgTagEndIndex + 1);
    }
    
    // Strip closing </svg> tag
    const closingTagIndex = svgData.lastIndexOf('</svg>');
    if (closingTagIndex !== -1) {
        const strippedCloseTag = svgData.substring(closingTagIndex);
        console.log(`🗑️  Stripped closing SVG tag: ${strippedCloseTag}`);
        svgData = svgData.substring(0, closingTagIndex);
    }
    
    console.log(`✅ Processed SVG size: ${svgData.length} characters (saved ${fs.readFileSync(svgPath, "utf8").length - svgData.length} chars)`);
    
    // Replace all double quotes with single quotes
    svgData = svgData.replace(/"/g, "'");
    console.log(`🔄 Replaced all double quotes with single quotes`);

    // Trim any leading/trailing whitespace
    svgData = svgData.trim();

    // Define chunk size (16KB)
    const chunkSizeBytes = 16 * 1024; // 16KB in bytes
    
    // Calculate number of chunks needed
    const totalChunks = Math.ceil(svgData.length / chunkSizeBytes);
    
    console.log(`Processing SVG file: ${svgFilePath}`);
    console.log(`File size: ${svgData.length} characters`);
    console.log(`Chunk size: ${chunkSizeBytes} bytes`);
    console.log(`Total chunks needed: ${totalChunks}`);
    
    const svgAddresses: string[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSizeBytes;
        const end = start + chunkSizeBytes;
        const chunk = svgData.slice(start, end);
        
        console.log(`Processing chunk ${i + 1}/${totalChunks} (${chunk.length} chars)...`);
        
        // Convert string to bytes for the contract call
        const chunkBuffer = Buffer.from(chunk, "utf8");
        const chunkBytes = new Uint8Array(chunkBuffer);
        
        // Deploy chunk with retry logic
        const address = await retryWithBackoff(async () => {
            // Execute the transaction
            console.log(`🚀 Executing transaction for chunk ${i + 1}...`);
            const tx = await svgPartWriter.store(chunkBytes);
            
            // Wait for confirmations on mainnet/testnet, instant on localhost
            let receipt;
            if (network.name !== "localhost" && network.name !== "hardhat") {
                console.log(`⏳ Waiting for 1 confirmations...`);
                receipt = await tx.wait(1);
            } else {
                receipt = await tx.wait();
            }
            
            // Check if transaction was successful
            if (receipt.status !== 1) {
                console.error(`❌ Transaction failed for chunk ${i + 1}/${totalChunks}`);
                console.error(`Transaction hash: ${tx.hash}`);
                console.error(`Gas used: ${receipt.gasUsed}`);
                throw new Error(`Transaction failed for chunk ${i + 1}. Status: ${receipt.status}.`);
            }
            
            console.log(`✓ Transaction executed. Status: ${receipt.status}, Gas used: ${receipt.gasUsed}`);
            
            // Get the address from the DataStored event
            let address: string | null = null;
            
            for (const log of receipt.logs) {
                try {
                    const parsedLog = svgPartWriter.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === 'DataStored') {
                        address = parsedLog.args.pointer;
                        console.log(`📍 Found DataStored event with address: ${address}`);
                        break;
                    }
                } catch (e) {
                    // Continue searching through logs
                    continue;
                }
            }
            
            if (!address) {
                console.error(`❌ No DataStored event found for chunk ${i + 1}`);
                console.error(`Available logs:`, receipt.logs.length);
                throw new Error(`Could not find storage address for chunk ${i + 1}. Transaction succeeded but no event found.`);
            }
            
            return address;
        }, 3, 5000); // 3 retries with 5 second initial delay
        
        svgAddresses.push(address);
        console.log(`✓ Stored chunk ${i + 1}/${totalChunks} at address: ${address}`);
    }
    
    console.log(`✅ Successfully stored ${totalChunks} chunks for ${svgFilePath}`);
    console.log(`📊 Total SSTORE2 contracts deployed for this SVG: ${totalChunks}`);
    return { svgAddresses, chunkCount: totalChunks };
}

/**
 * Reads an SVG file, splits it into 16KB chunks, and stores them using SVGPartWriter
 * This version KEEPS the XML declaration and SVG opening/closing tags intact
 * @param svgFilePath - Path to the SVG file to process
 * @param svgPartWriter - Deployed SVGPartWriter contract instance
 * @param escapeSvg - If true, escapes the SVG for direct JSON embedding (no base64 needed). If false, just replaces quotes.
 * @returns Object with array of addresses where the chunks are stored and the chunk count
 */
export async function chunkAndStoreSVGComplete(
    svgFilePath: string, 
    svgPartWriter: any,
    escapeSvg: boolean = false
): Promise<{ svgAddresses: string[]; chunkCount: number }> {
    const svgPath = path.join(__dirname, svgFilePath);
    // Read the SVG file
    let svgData = fs.readFileSync(svgPath, "utf8");
    
    const originalSize = svgData.length;
    console.log(`📄 Original SVG size: ${originalSize} characters`);
    console.log(`ℹ️  Keeping XML declaration and SVG tags intact (complete SVG)`);

    // ALWAYS replace double quotes with single quotes first
    // Single quotes are safe in SVG and don't need escaping in JSON strings
    svgData = svgData.replace(/"/g, "'");
    console.log(`🔄 Replaced all double quotes with single quotes`);

    if (escapeSvg) {
        // Escape for direct JSON embedding (no base64 encoding needed)
        // This makes the SVG ready to be embedded directly in JSON metadata
        console.log(`🔐 Escaping SVG for direct JSON embedding...`);
        
        // 1. Replace backslashes first (must be done before other escapes)
        svgData = svgData.replace(/\\/g, '\\\\');
        
        // 2. Escape newlines (most common - adds the most overhead)
        svgData = svgData.replace(/\n/g, '\\n');
        
        // 3. Escape carriage returns (if any)
        svgData = svgData.replace(/\r/g, '\\r');
        
        // 4. Escape tabs (if any)
        svgData = svgData.replace(/\t/g, '\\t');
        
        const escapedSize = svgData.length;
        const overhead = ((escapedSize - originalSize) / originalSize * 100).toFixed(2);
        console.log(`✅ Escaped SVG size: ${escapedSize} characters`);
        console.log(`📊 Overhead from escaping: +${overhead}% (vs +33% for base64)`);
        console.log(`💡 This SVG can now be embedded directly in JSON without base64 encoding`);
        console.log(`   Note: Single quotes don't need escaping, only newlines/backslashes`);
    } else {
        console.log(`   Note: For base64 or URL encoding (no escape sequences added)`);
    }

    // Trim any leading/trailing whitespace
    svgData = svgData.trim();

    // Define chunk size (16KB)
    const chunkSizeBytes = 16 * 1024; // 16KB in bytes
    
    // Calculate number of chunks needed
    const totalChunks = Math.ceil(svgData.length / chunkSizeBytes);
    
    console.log(`Processing SVG file: ${svgFilePath}`);
    console.log(`File size: ${svgData.length} characters`);
    console.log(`Chunk size: ${chunkSizeBytes} bytes`);
    console.log(`Total chunks needed: ${totalChunks}`);
    
    const svgAddresses: string[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSizeBytes;
        const end = start + chunkSizeBytes;
        const chunk = svgData.slice(start, end);
        
        console.log(`Processing chunk ${i + 1}/${totalChunks} (${chunk.length} chars)...`);
        
        // Convert string to bytes for the contract call
        const chunkBuffer = Buffer.from(chunk, "utf8");
        const chunkBytes = new Uint8Array(chunkBuffer);
        
        // Deploy chunk with retry logic
        const address = await retryWithBackoff(async () => {
            // Execute the transaction
            console.log(`🚀 Executing transaction for chunk ${i + 1}...`);
            const tx = await svgPartWriter.store(chunkBytes);
            
            // Wait for confirmations on mainnet/testnet, instant on localhost
            let receipt;
            if (network.name !== "localhost" && network.name !== "hardhat") {
                console.log(`⏳ Waiting for 1 confirmations...`);
                receipt = await tx.wait(1);
            } else {
                receipt = await tx.wait();
            }
            
            // Check if transaction was successful
            if (receipt.status !== 1) {
                console.error(`❌ Transaction failed for chunk ${i + 1}/${totalChunks}`);
                console.error(`Transaction hash: ${tx.hash}`);
                console.error(`Gas used: ${receipt.gasUsed}`);
                throw new Error(`Transaction failed for chunk ${i + 1}. Status: ${receipt.status}.`);
            }
            
            console.log(`✓ Transaction executed. Status: ${receipt.status}, Gas used: ${receipt.gasUsed}`);
            
            // Get the address from the DataStored event
            let address: string | null = null;
            
            for (const log of receipt.logs) {
                try {
                    const parsedLog = svgPartWriter.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === 'DataStored') {
                        address = parsedLog.args.pointer;
                        console.log(`📍 Found DataStored event with address: ${address}`);
                        break;
                    }
                } catch (e) {
                    // Continue searching through logs
                    continue;
                }
            }
            
            if (!address) {
                console.error(`❌ No DataStored event found for chunk ${i + 1}`);
                console.error(`Available logs:`, receipt.logs.length);
                throw new Error(`Could not find storage address for chunk ${i + 1}. Transaction succeeded but no event found.`);
            }
            
            return address;
        }, 3, 5000); // 3 retries with 5 second initial delay
        
        svgAddresses.push(address);
        console.log(`✓ Stored chunk ${i + 1}/${totalChunks} at address: ${address}`);
    }
    
    console.log(`✅ Successfully stored ${totalChunks} chunks for ${svgFilePath}`);
    console.log(`📊 Total SSTORE2 contracts deployed for this SVG: ${totalChunks}`);
    return { svgAddresses, chunkCount: totalChunks };
}

/**
 * Convenience function to chunk and store multiple SVG files
 * @param svgFilePaths - Array of SVG file paths to process
 * @param svgPartWriter - Deployed SVGPartWriter contract instance
 * @returns Object mapping file paths to their chunk addresses
 */
export async function chunkAndStoreMultipleSVGs(
    svgFilePaths: string[], 
    svgPartWriter: any
): Promise<Record<string, { svgAddresses: string[]; chunkCount: number }>> {
    const results: Record<string, { svgAddresses: string[]; chunkCount: number }> = {};
    
    for (const filePath of svgFilePaths) {
        console.log(`\n🔄 Processing ${filePath}...`);
        results[filePath] = await chunkAndStoreSVG(filePath, svgPartWriter);
    }
    
    return results;
}
