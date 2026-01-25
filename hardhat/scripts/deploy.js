const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ CONFIGURATION ============
const VERIFY_CONTRACTS = true; // Set to false to skip contract verification
const BEAD_PUNKS_TO_MINT = 5;  // Number of mock BeadPunks to mint on testnet
const MINT_PASSES_TO_MINT = 2; // Number of mint passes to mint to deployer
const ADDITIONAL_MINTPASS_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Also mint passes to this address (for testing)
const MAINNET_BEAD_PUNKS_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: Set actual BeadPunks contract address on mainnet

// Path to website ABIs folder (relative to hardhat folder)
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");

// Path to the frogz SVG folder
const FROGZ_PATH = path.join(__dirname, "../../website/public/frogz");

// Path to the items SVG folder
const ITEMS_PATH = path.join(__dirname, "../../website/public/items");

// Copy ABI from artifacts to website
function copyABI(contractName, targetFileName, subPath = "") {
    try {
        const artifactPath = path.join(
            __dirname,
            `../artifacts/contracts/${subPath}${contractName}.sol/${contractName}.json`
        );
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        const targetPath = path.join(WEBSITE_ABI_PATH, `${targetFileName}.json`);

        fs.writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));
        console.log(`  Copied ${contractName} ABI to ${targetFileName}.json`);
    } catch (error) {
        console.error(`  Failed to copy ${contractName} ABI:`, error.message);
    }
}

// ============ ART DEPLOYMENT HELPERS ============

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

/**
 * Process SVG file for on-chain storage
 * - Strips XML declaration and SVG wrapper
 * - Replaces double quotes with single quotes
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

    return svgData.trim();
}

async function deployBody(svgPartWriter) {
    const bodyPath = path.join(FROGZ_PATH, "body", "1.svg");
    if (!fs.existsSync(bodyPath)) {
        console.log("  ⚠️  Body SVG not found, skipping...");
        return null;
    }

    console.log("  Deploying body with color support...");
    const svgData = processSvgFile(bodyPath, 'body');

    // Split at the color value in .body-cls-6{fill:COLOR;} (prefixed)
    const colorPattern = /\.body-cls-6\{fill:/;
    const match = svgData.match(colorPattern);
    if (!match) throw new Error("Could not find .cls-6{fill: pattern in body SVG");

    const splitIndex = svgData.indexOf(match[0]) + match[0].length;
    const afterColor = svgData.indexOf(';', splitIndex);
    if (afterColor === -1) throw new Error("Could not find semicolon after color value");

    const part1 = svgData.substring(0, splitIndex);
    const part2 = svgData.substring(afterColor);

    console.log(`    Part 1: ${part1.length} chars, Part 2: ${part2.length} chars`);

    const part1Address = await storeSvgData(svgPartWriter, part1);
    console.log(`    Part 1 stored at: ${part1Address}`);

    const part2Address = await storeSvgData(svgPartWriter, part2);
    console.log(`    Part 2 stored at: ${part2Address}`);

    const BodyRenderer = await ethers.getContractFactory("BodyRenderer");
    const bodyRenderer = await BodyRenderer.deploy(part1Address, part2Address);
    await bodyRenderer.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await bodyRenderer.deploymentTransaction()?.wait(2);
    }

    const address = await bodyRenderer.getAddress();
    console.log(`    BodyRenderer deployed at: ${address}`);
    return address;
}

async function deployTraitFolder(folderName, svgPartWriter) {
    const folderPath = path.join(FROGZ_PATH, folderName);
    if (!fs.existsSync(folderPath)) return null;

    const files = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.svg'))
        .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')));

    if (files.length === 0) return null;

    console.log(`  Deploying ${folderName} (${files.length} SVGs)...`);

    const svgRendererAddresses = [];
    const chunkSize = 16 * 1024;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(folderPath, file);
        // Create unique prefix: folder + file number (e.g., 'head1', 'belly2', 'mouth1')
        const fileNum = file.replace('.svg', '');
        const classPrefix = `${folderName}${fileNum}`;
        const svgData = processSvgFile(filePath, classPrefix);

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

        svgRendererAddresses.push(await renderer.getAddress());
        console.log(`    ${file} deployed (${totalChunks} chunks)`);
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
    console.log(`    ${folderName} router: ${routerAddress}`);
    return routerAddress;
}

async function deployItems(svgPartWriter) {
    if (!fs.existsSync(ITEMS_PATH)) {
        console.log("  Items folder not found, skipping items deployment...");
        return null;
    }

    const files = fs.readdirSync(ITEMS_PATH)
        .filter(f => f.endsWith('.svg'))
        .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')));

    if (files.length === 0) {
        console.log("  No item SVGs found, skipping...");
        return null;
    }

    console.log(`  Deploying items (${files.length} SVGs)...`);

    const svgRendererAddresses = [];
    const chunkSize = 16 * 1024;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(ITEMS_PATH, file);
        // Items don't need class prefixing since they're standalone
        const svgData = processSvgFile(filePath, '');

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

        svgRendererAddresses.push(await renderer.getAddress());
        console.log(`    Item ${file} deployed (${totalChunks} chunks)`);
    }

    // Deploy router for items
    const SVGRouter = await ethers.getContractFactory("SVGRouter");
    const router = await SVGRouter.deploy();
    await router.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await router.deploymentTransaction()?.wait(2);
    }

    await (await router.setRenderContractsBatch(svgRendererAddresses)).wait();

    const routerAddress = await router.getAddress();
    console.log(`    Items router: ${routerAddress}`);
    return routerAddress;
}

async function deployArt() {
    console.log("\n--- Deploying SVG Art Contracts ---");

    if (!fs.existsSync(FROGZ_PATH)) {
        throw new Error(`Frogz folder not found at: ${FROGZ_PATH}`);
    }

    // Deploy SVGPartWriter
    console.log("  Deploying SVGPartWriter...");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await SVGPartWriter.deploy();
    await svgPartWriter.waitForDeployment();

    if (network.name !== "localhost" && network.name !== "hardhat") {
        await svgPartWriter.deploymentTransaction()?.wait(2);
    }
    console.log(`  SVGPartWriter: ${await svgPartWriter.getAddress()}`);

    const artAddresses = {};

    // Deploy body with BodyRenderer
    artAddresses.body = await deployBody(svgPartWriter);

    // Deploy other trait folders (skip background and body)
    const traitFolders = ['belly', 'head', 'mouth', 'special'];
    for (const folder of traitFolders) {
        const address = await deployTraitFolder(folder, svgPartWriter);
        if (address) {
            artAddresses[folder] = address;
        }
    }

    // Deploy item SVGs
    const itemsRouter = await deployItems(svgPartWriter);
    if (itemsRouter) {
        artAddresses.items = itemsRouter;
    }

    return artAddresses;
}

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Deployment Script");
    console.log("=".repeat(60));

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
        console.error("\nError: No wallet configured for this network!");
        console.error("Make sure you have set the private key in your .env file:");
        console.error("  - For baseSepolia: BASE_SEPOLIA_PRIVATE_KEY=your_private_key");
        console.error("  - For base mainnet: BASE_PRIVATE_KEY=your_private_key");
        console.error("\nThe private key can be with or without '0x' prefix.");
        process.exit(1);
    }

    const [deployer] = signers;
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();

    console.log("\nNetwork:", network.name);
    console.log("Chain ID:", networkInfo.chainId.toString());
    console.log("Deployer:", deployerAddress);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "ETH");
    console.log("Verify Contracts:", VERIFY_CONTRACTS);

    const isTestnet = network.name === "localhost" || network.name === "hardhat" || network.name === "baseSepolia";
    const isMainnet = network.name === "base";

    // Configuration
    const ROYALTY_RECEIVER = deployerAddress;
    const ROYALTY_FEE = 500; // 5% (500/10000)

    // ============ Deploy MockERC721 (BeadPunks) on testnet ============
    let beadPunksAddress = null;
    let beadPunksContract = null;

    if (isTestnet) {
        console.log("\n--- Deploying MockERC721 (BeadPunks) ---");
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        beadPunksContract = await MockERC721.deploy("Bead Punks", "BEADPUNK");
        await beadPunksContract.waitForDeployment();
        beadPunksAddress = await beadPunksContract.getAddress();
        console.log("MockERC721 (BeadPunks) deployed to:", beadPunksAddress);

        if (network.name === "baseSepolia") {
            console.log("Waiting for confirmations...");
            await beadPunksContract.deploymentTransaction()?.wait(2);
        }
    } else if (isMainnet) {
        beadPunksAddress = MAINNET_BEAD_PUNKS_ADDRESS;
        console.log("\n--- Using existing BeadPunks contract ---");
        console.log("BeadPunks address:", beadPunksAddress);
    }

    // ============ Deploy Fregs ============
    console.log("\n--- Deploying Fregs ---");
    const Fregs = await ethers.getContractFactory("Fregs");
    const fregs = await Fregs.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Fregs",
        "FREG"
    );
    await fregs.waitForDeployment();
    const fregsAddress = await fregs.getAddress();
    console.log("Fregs deployed to:", fregsAddress);

    // Wait for confirmations on live networks
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregs.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy FregsItems ============
    console.log("\n--- Deploying Fregs Items ---");
    const FregsItems = await ethers.getContractFactory("FregsItems");
    const fregsItems = await FregsItems.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Fregs Items",
        "FREGITEM",
        fregsAddress
    );
    await fregsItems.waitForDeployment();
    const fregsItemsAddress = await fregsItems.getAddress();
    console.log("Fregs Items deployed to:", fregsItemsAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregsItems.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy FregsMintPass ============
    console.log("\n--- Deploying Fregs Mint Pass ---");
    const FregsMintPass = await ethers.getContractFactory("FregsMintPass");
    const fregsMintPass = await FregsMintPass.deploy("");
    await fregsMintPass.waitForDeployment();
    const fregsMintPassAddress = await fregsMintPass.getAddress();
    console.log("Fregs Mint Pass deployed to:", fregsMintPassAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregsMintPass.deploymentTransaction()?.wait(2);
    }

    // ============ Configure Cross-Contract References ============
    console.log("\n--- Configuring Cross-Contract References ---");

    console.log("Setting items contract on Fregs...");
    await (await fregs.setItemsContract(fregsItemsAddress)).wait();

    console.log("Setting mint pass contract on Fregs...");
    await (await fregs.setMintPassContract(fregsMintPassAddress)).wait();

    console.log("Setting Fregs on MintPass...");
    await (await fregsMintPass.setFregs(fregsAddress)).wait();

    // ============ Mint Mint Passes to Deployer ============
    console.log("\n--- Minting Mint Passes ---");
    console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to deployer...`);
    await (await fregsMintPass.ownerMint(deployerAddress, MINT_PASSES_TO_MINT)).wait();
    const mintPassBalance = await fregsMintPass.balanceOf(deployerAddress, 1); // Token ID 1 = MINT_PASS
    console.log(`Deployer mint pass balance: ${mintPassBalance}`);

    // Also mint to additional recipient if configured
    if (ADDITIONAL_MINTPASS_RECIPIENT && ADDITIONAL_MINTPASS_RECIPIENT !== "0x0000000000000000000000000000000000000000") {
        console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to ${ADDITIONAL_MINTPASS_RECIPIENT}...`);
        await (await fregsMintPass.ownerMint(ADDITIONAL_MINTPASS_RECIPIENT, MINT_PASSES_TO_MINT)).wait();
        const additionalBalance = await fregsMintPass.balanceOf(ADDITIONAL_MINTPASS_RECIPIENT, 1);
        console.log(`Additional recipient mint pass balance: ${additionalBalance}`);
    }

    // ============ Configure BeadPunks ============
    if (beadPunksAddress && beadPunksAddress !== "0x0000000000000000000000000000000000000000") {
        console.log("\n--- Configuring BeadPunks ---");
        console.log("Setting BeadPunks contract on Fregs Items...");
        await (await fregsItems.setBeadPunksContract(beadPunksAddress)).wait();

        // On testnet, mint BeadPunks and transfer to Items contract
        if (isTestnet && beadPunksContract) {
            console.log(`Minting ${BEAD_PUNKS_TO_MINT} BeadPunks to deployer...`);
            const mintedTokenIds = [];
            for (let i = 0; i < BEAD_PUNKS_TO_MINT; i++) {
                const tx = await beadPunksContract.mint(deployerAddress);
                const receipt = await tx.wait();
                mintedTokenIds.push(i);
                console.log(`  Minted BeadPunk #${i}`);
            }

            console.log(`Transferring ${BEAD_PUNKS_TO_MINT} BeadPunks to Fregs Items contract...`);
            for (const tokenId of mintedTokenIds) {
                const tx = await beadPunksContract["safeTransferFrom(address,address,uint256)"](
                    deployerAddress,
                    fregsItemsAddress,
                    tokenId
                );
                await tx.wait();
                console.log(`  Transferred BeadPunk #${tokenId}`);
            }

            // Verify BeadPunks are in Items contract
            const beadPunksInContract = await fregsItems.getAvailableBeadPunks();
            console.log(`BeadPunks in Items contract: ${beadPunksInContract}`);
        }
    } else if (isMainnet) {
        console.log("\n--- WARNING: BeadPunks not configured ---");
        console.log("Set MAINNET_BEAD_PUNKS_ADDRESS in deploy script and call:");
        console.log(`  await fregsItems.setBeadPunksContract("0x...")`);
    }

    console.log("\nCross-contract references configured!");

    // ============ Deploy Art and SVG Renderer ============
    const artAddresses = await deployArt();

    console.log("\n--- Deploying FregsSVGRenderer ---");
    const FregsSVGRenderer = await ethers.getContractFactory("FregsSVGRenderer");
    const svgRenderer = await FregsSVGRenderer.deploy();
    await svgRenderer.waitForDeployment();
    const svgRendererAddress = await svgRenderer.getAddress();
    console.log("FregsSVGRenderer deployed to:", svgRendererAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await svgRenderer.deploymentTransaction()?.wait(2);
    }

    // Configure SVG Renderer with art contracts
    console.log("\n--- Configuring FregsSVGRenderer ---");
    console.log("Setting art contracts on SVG Renderer...");
    await (await svgRenderer.setAllContracts(
        artAddresses.body || ethers.ZeroAddress,
        artAddresses.belly || ethers.ZeroAddress,
        artAddresses.head || ethers.ZeroAddress,
        artAddresses.mouth || ethers.ZeroAddress,
        artAddresses.special || ethers.ZeroAddress
    )).wait();
    console.log("Art contracts configured!");

    // Set SVG Renderer on Fregs
    console.log("Setting SVG Renderer on Fregs...");
    await (await fregs.setSVGRenderer(svgRendererAddress)).wait();
    console.log("SVG Renderer set on Fregs!");

    // Set Items SVG Renderer on FregsItems
    if (artAddresses.items) {
        console.log("Setting SVG Renderer on FregsItems...");
        await (await fregsItems.setSVGRenderer(artAddresses.items)).wait();
        console.log("SVG Renderer set on FregsItems!");
    }

    // ============ Copy ABIs to Website ============
    console.log("\n--- Copying ABIs to Website ---");

    // Ensure the ABI directory exists
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
        console.log(`Created ABI directory: ${WEBSITE_ABI_PATH}`);
    }

    copyABI("Fregs", "Fregs");
    copyABI("FregsItems", "FregsItems");
    copyABI("FregsMintPass", "FregsMintPass");
    copyABI("FregsSVGRenderer", "FregsSVGRenderer");

    console.log("ABIs copied successfully!");

    // ============ Verify Contracts (if enabled and not localhost) ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contracts on Basescan ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Verify MockERC721 (BeadPunks) on testnet
        if (isTestnet && beadPunksAddress) {
            try {
                console.log("Verifying MockERC721 (BeadPunks)...");
                await run("verify:verify", {
                    address: beadPunksAddress,
                    constructorArguments: ["Bead Punks", "BEADPUNK"]
                });
                console.log("MockERC721 (BeadPunks) verified!");
            } catch (error) {
                console.log("MockERC721 verification failed:", error.message);
            }
        }

        // Verify Fregs
        try {
            console.log("Verifying Fregs...");
            await run("verify:verify", {
                address: fregsAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs", "FREG"]
            });
            console.log("Fregs verified!");
        } catch (error) {
            console.log("Fregs verification failed:", error.message);
        }

        // Verify Fregs Items
        try {
            console.log("Verifying Fregs Items...");
            await run("verify:verify", {
                address: fregsItemsAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs Items", "FREGITEM", fregsAddress]
            });
            console.log("Fregs Items verified!");
        } catch (error) {
            console.log("Fregs Items verification failed:", error.message);
        }

        // Verify Fregs Mint Pass
        try {
            console.log("Verifying Fregs Mint Pass...");
            await run("verify:verify", {
                address: fregsMintPassAddress,
                constructorArguments: [""]
            });
            console.log("Fregs Mint Pass verified!");
        } catch (error) {
            console.log("Fregs Mint Pass verification failed:", error.message);
        }

        // Verify FregsSVGRenderer
        try {
            console.log("Verifying FregsSVGRenderer...");
            await run("verify:verify", {
                address: svgRendererAddress,
                constructorArguments: []
            });
            console.log("FregsSVGRenderer verified!");
        } catch (error) {
            console.log("FregsSVGRenderer verification failed:", error.message);
        }
    } else if (!VERIFY_CONTRACTS) {
        console.log("\n--- Skipping Contract Verification (VERIFY_CONTRACTS = false) ---");
    }

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Addresses:");
    console.log("  Fregs:           ", fregsAddress);
    console.log("  Fregs Items:     ", fregsItemsAddress);
    console.log("  Fregs Mint Pass: ", fregsMintPassAddress);
    console.log("  SVG Renderer:    ", svgRendererAddress);
    if (beadPunksAddress) {
        console.log("  BeadPunks:       ", beadPunksAddress, isTestnet ? "(Mock)" : "(Mainnet)");
    }
    console.log("\nArt Contracts:");
    console.log("  Body:            ", artAddresses.body || "Not deployed");
    console.log("  Belly:           ", artAddresses.belly || "Not deployed");
    console.log("  Head:            ", artAddresses.head || "Not deployed");
    console.log("  Mouth:           ", artAddresses.mouth || "Not deployed");
    console.log("  Special:         ", artAddresses.special || "Not deployed");
    console.log("  Items:           ", artAddresses.items || "Not deployed");
    console.log("\nConfiguration:");
    console.log("  Royalty Receiver:", ROYALTY_RECEIVER);
    console.log("  Royalty Fee:", ROYALTY_FEE / 100, "%");
    console.log("  Deployer Mint Passes:", mintPassBalance.toString());
    if (isTestnet && beadPunksAddress) {
        const beadPunksInContract = await fregsItems.getAvailableBeadPunks();
        console.log("  BeadPunks in Items Contract:", beadPunksInContract.toString());
    }
    console.log("\nNext Steps:");
    console.log("  1. Fund items contract for chest rewards:");
    console.log("     await fregsItems.depositETH({ value: ethers.parseEther('0.5') })");
    console.log("  2. Activate mint pass sale:");
    console.log("     await fregsMintPass.setMintPassSaleActive(true)");
    if (isMainnet && (!beadPunksAddress || beadPunksAddress === "0x0000000000000000000000000000000000000000")) {
        console.log("  3. Set BeadPunks contract (mainnet):");
        console.log("     await fregsItems.setBeadPunksContract('0x...')");
    }
    console.log("\n" + "=".repeat(60));

    // Output for .env file
    console.log("\nFor .env file:");
    console.log(`VITE_FREGS_ADDRESS=${fregsAddress}`);
    console.log(`VITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress}`);
    console.log(`VITE_FREGS_MINTPASS_ADDRESS=${fregsMintPassAddress}`);
    console.log(`VITE_SVG_RENDERER_ADDRESS=${svgRendererAddress}`);
    if (beadPunksAddress) {
        console.log(`VITE_BEAD_PUNKS_ADDRESS=${beadPunksAddress}`);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
