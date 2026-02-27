const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {
    retryWithBackoff,
    storeSvgData,
    processSvgFile,
} = require("./deployUtils");

// Helper to send transaction with retry and proper waiting
async function sendTx(txPromise, confirmations = 1) {
    return await retryWithBackoff(async () => {
        const tx = await txPromise;
        const receipt = await tx.wait(confirmations);
        // Small delay to let the network catch up
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return receipt;
    }, 3, 5000);
}

// Helper to deploy contract with retry
async function deployContract(factory, args = [], name = "Contract") {
    return await retryWithBackoff(async () => {
        console.log(`  Deploying ${name}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();

        // Wait for confirmations on live networks
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await contract.deploymentTransaction()?.wait(2);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const address = await contract.getAddress();
        console.log(`  ${name} deployed to: ${address}`);
        return contract;
    }, 3, 5000);
}

// ============ CONFIGURATION ============
const VERIFY_CONTRACTS = false; // Set to false to skip contract verification
const MINT_PASSES_TO_MINT = 2; // Number of mint passes to mint to deployer
const ADDITIONAL_MINTPASS_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Also mint passes to this address (for testing)

// SpinTheWheel configuration (weights out of 10000)
const SPIN_LOSE_WEIGHT = 0;                  // 0% chance to lose (every spin wins)
const SPIN_MINTPASS_WEIGHT = 9000;           // 90% chance to win MintPass
const SPIN_HOODIE_WEIGHT = 300;              // 3% chance to win Hoodie
const SPIN_FROGSUIT_WEIGHT = 300;            // 3% chance to win Frogsuit
const SPIN_CHEST_WEIGHT = 400;               // 4% chance to win Treasure Chest
const HOODIE_ITEM_TYPE = 9;
const FROGSUIT_ITEM_TYPE = 10;
const CHEST_ITEM_TYPE = 6;
const INITIAL_SPIN_TOKENS_TO_MINT = 100;     // Initial SpinTokens to mint to owner on localhost

// Path to website ABIs folder (relative to hardhat folder)
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");

// Path to the frogz SVG folder
const FROGZ_PATH = path.join(__dirname, "../../website/public/frogz");
const DEFAULT_TRAITS_PATH = path.join(FROGZ_PATH, "default");
const FROM_ITEMS_PATH = path.join(FROGZ_PATH, "from_items");
const TRAITS_JSON_PATH = path.join(DEFAULT_TRAITS_PATH, "traits.json");

// Path to the items SVG folder
const ITEMS_PATH = path.join(__dirname, "../../website/public/items");

// Path to deployment status file
const DEPLOYMENT_STATUS_PATH = path.join(__dirname, "../deployment-status.json");

// Path to from_items traits.json (for special items configuration)
const FROM_ITEMS_TRAITS_JSON_PATH = path.join(FROM_ITEMS_PATH, "traits.json");

// Path to items.json (single source of truth for all items)
const ITEMS_JSON_PATH = path.join(__dirname, "../../website/src/config/items.json");

// ============ LOAD TRAITS FROM JSON ============
function loadTraitsConfig() {
    if (!fs.existsSync(TRAITS_JSON_PATH)) {
        throw new Error(`Traits config not found at: ${TRAITS_JSON_PATH}`);
    }
    const traitsConfig = JSON.parse(fs.readFileSync(TRAITS_JSON_PATH, "utf8"));

    // Convert to trait names format (array of names for each trait type)
    const traitNames = {};
    for (const [traitType, traits] of Object.entries(traitsConfig)) {
        traitNames[traitType] = traits.map(t => t.name);
    }
    return { traitsConfig, traitNames };
}

// Load items.json - single source of truth for all items
function loadItemsConfig() {
    if (!fs.existsSync(ITEMS_JSON_PATH)) {
        console.log("  ⚠️  items/items.json not found");
        return null;
    }
    return JSON.parse(fs.readFileSync(ITEMS_JSON_PATH, "utf8"));
}

// Build all item configurations from items.json
function buildItemConfigs(itemsConfig) {
    if (!itemsConfig?.items) return { configs: {}, traitMappings: [] };

    const configs = {};
    const traitMappings = []; // Will be populated after we know base trait counts

    for (const item of itemsConfig.items) {
        configs[item.id] = {
            name: item.name,
            description: item.description,
            category: item.category,
            targetTraitType: item.targetTraitType,
            traitFileName: item.traitFileName,
            isClaimable: item.isClaimable,
            claimWeight: item.claimWeight,
            isOwnerMintable: item.isOwnerMintable
        };
    }

    return { configs, items: itemsConfig.items };
}

// Build trait item mappings from items.json
// Maps item IDs to trait values based on category and traitFileName
function buildTraitItemMappings(itemsConfig, baseTraitCounts) {
    if (!itemsConfig?.items) return [];

    const mappings = [];

    for (const item of itemsConfig.items) {
        if (!item.traitFileName || item.targetTraitType === undefined) continue;

        const fileNumber = parseInt(item.traitFileName.replace('.svg', ''));
        let traitValue;

        if (item.category === 'skin') {
            // Skin: traitFileName directly maps to trait value
            traitValue = fileNumber;
            console.log(`    Skin mapping: ${item.name} (id ${item.id}) → trait value ${traitValue}`);
        } else if (item.category === 'head') {
            // Head: baseHeadCount + fileNumber
            const baseHeadCount = baseTraitCounts?.head || 19;
            traitValue = baseHeadCount + fileNumber;
            console.log(`    Head mapping: ${item.name} (id ${item.id}) → trait value ${traitValue} (base ${baseHeadCount} + file ${fileNumber})`);
        } else {
            continue;
        }

        mappings.push({ itemId: item.id, traitValue, category: item.category });
    }

    return mappings;
}

// ============ DEPLOYMENT STATUS ============
function loadDeploymentStatus() {
    if (fs.existsSync(DEPLOYMENT_STATUS_PATH)) {
        return JSON.parse(fs.readFileSync(DEPLOYMENT_STATUS_PATH, "utf8"));
    }
    return {
        network: null,
        lastUpdated: null,
        contracts: {},
        routers: {},
        defaultTraits: {},
        addedTraits: {},
        itemTypes: {}
    };
}

function saveDeploymentStatus(status) {
    status.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DEPLOYMENT_STATUS_PATH, JSON.stringify(status, null, 2));
    console.log(`  Deployment status saved to: ${DEPLOYMENT_STATUS_PATH}`);
}

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

async function deployBody(svgPartWriter, traitsConfig) {
    // Base body/skin is now at default/skin/1.svg
    const skinPath = path.join(DEFAULT_TRAITS_PATH, "skin");
    const bodyPath = path.join(skinPath, "1.svg");

    if (!fs.existsSync(bodyPath)) {
        console.log("  ⚠️  Base skin SVG not found at:", bodyPath);
        return null;
    }

    console.log("  Deploying UnifiedBodyRenderer (color + special skins)...");
    const svgData = processSvgFile(bodyPath, 'body');

    // Find the main body color (typically #65b449 green, used in .body-cls-6{fill:#65b449;})
    // After prefixing, we look for .body-cls-X{fill:#XXXXXX pattern
    const colorPattern = /\.body-cls-\d+\{fill:(#[0-9a-fA-F]{6});/;
    const match = svgData.match(colorPattern);

    if (!match) {
        console.log("  ⚠️  Could not find color pattern in body SVG");
        console.log("     Expected pattern like: .body-cls-X{fill:#XXXXXX;}");
        console.log("     Deploying as static SVG...");

        // Deploy as a simple SVG renderer without color support
        const chunkSize = 16 * 1024;
        const totalChunks = Math.ceil(svgData.length / chunkSize);
        const addresses = [];

        for (let j = 0; j < totalChunks; j++) {
            const chunk = svgData.slice(j * chunkSize, (j + 1) * chunkSize);
            const addr = await storeSvgData(svgPartWriter, chunk);
            addresses.push(addr);
        }

        const SVGRenderer = await ethers.getContractFactory("SVGRenderer");
        const renderer = await deployContract(SVGRenderer, [addresses], "Static body renderer");
        return await renderer.getAddress();
    }

    // Find where to split for color injection
    // We split right before the # of the color value
    const fullMatch = match[0];
    const matchIndex = svgData.indexOf(fullMatch);
    const colorStartInMatch = fullMatch.indexOf('#');
    const splitIndex = matchIndex + colorStartInMatch;
    const afterColor = svgData.indexOf(';', splitIndex);
    if (afterColor === -1) throw new Error("Could not find semicolon after color value");

    const part1 = svgData.substring(0, splitIndex);
    const part2 = svgData.substring(afterColor);

    console.log(`    Found body color: ${match[1]}`);

    console.log(`    Color body Part 1: ${part1.length} chars, Part 2: ${part2.length} chars`);

    const part1Address = await storeSvgData(svgPartWriter, part1);
    console.log(`    Part 1 stored at: ${part1Address}`);

    const part2Address = await storeSvgData(svgPartWriter, part2);
    console.log(`    Part 2 stored at: ${part2Address}`);

    // Deploy UnifiedBodyRenderer
    const UnifiedBodyRenderer = await ethers.getContractFactory("UnifiedBodyRenderer");
    const bodyRenderer = await deployContract(UnifiedBodyRenderer, [part1Address, part2Address], "UnifiedBodyRenderer");
    const address = await bodyRenderer.getAddress();

    // Deploy special skins (2.svg, 3.svg, etc.) from same skin folder
    const skinFiles = fs.readdirSync(skinPath)
        .filter(f => f.endsWith('.svg') && f !== '1.svg') // Skip base skin
        .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')));

    if (skinFiles.length > 0) {
        console.log(`    Deploying ${skinFiles.length} special skins...`);
        const chunkSize = 16 * 1024;
        const skinNames = traitsConfig?.skin?.slice(1) || []; // Skip first (base) skin name

        for (let i = 0; i < skinFiles.length; i++) {
            const file = skinFiles[i];
            const filePath = path.join(skinPath, file);
            const skinId = parseInt(file.replace('.svg', '')); // 2=Diamond, 3=Metal, etc.
            const classPrefix = `skin${skinId}`;
            const skinData = processSvgFile(filePath, classPrefix);

            const totalChunks = Math.ceil(skinData.length / chunkSize);
            const pointers = [];

            for (let j = 0; j < totalChunks; j++) {
                const chunk = skinData.slice(j * chunkSize, (j + 1) * chunkSize);
                const addr = await storeSvgData(svgPartWriter, chunk);
                pointers.push(addr);
            }

            const skinName = skinNames[i]?.name || `Skin ${skinId}`;
            await sendTx(bodyRenderer.setSkin(skinId, pointers, skinName));
            console.log(`      Skin ${skinId} (${skinName}) deployed (${totalChunks} chunks)`);
        }
    }

    return address;
}

async function deployTraitFolder(folderName, svgPartWriter, traitNames = [], deploymentStatus = null) {
    // Skin uses from_items folder only (with explicit typeIds matching fileNames)
    // Head uses default + from_items (from_items use explicit typeIds: baseCount + fileNumber)
    // Other traits use default folder only

    let allFiles = [];
    let useExplicitTypeIds = false; // For skin folder, typeIds must match fileNames
    let baseTraitCount = 0; // Track base trait count for head offset calculation

    if (folderName === 'skin') {
        // Skin: only from from_items, use explicit typeIds matching fileNames
        // This ensures FregsItems mappings align with deployed traits
        const folderPath = path.join(FROM_ITEMS_PATH, folderName);
        if (!fs.existsSync(folderPath)) {
            console.log(`    ⚠️  Folder not found: ${folderPath}`);
            return null;
        }
        allFiles = fs.readdirSync(folderPath)
            .filter(f => f.endsWith('.svg'))
            .map(f => ({
                file: f,
                path: path.join(folderPath, f),
                typeId: parseInt(f.replace('.svg', '')) // Extract typeId from fileName (2.svg → 2)
            }));
        useExplicitTypeIds = true;
    } else if (folderName === 'head') {
        // Head: default + from_items
        // Default heads use sequential IDs (1, 2, 3...)
        // from_items heads use explicit typeIds: baseHeadCount + fileNumber
        const defaultPath = path.join(DEFAULT_TRAITS_PATH, folderName);
        const fromItemsPath = path.join(FROM_ITEMS_PATH, folderName);

        if (fs.existsSync(defaultPath)) {
            const defaultFiles = fs.readdirSync(defaultPath)
                .filter(f => f.endsWith('.svg'))
                .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')));
            baseTraitCount = defaultFiles.length;
            allFiles = defaultFiles.map((f, index) => ({
                file: f,
                path: path.join(defaultPath, f),
                source: 'default',
                typeId: index + 1 // Sequential: 1, 2, 3...
            }));
        }
        if (fs.existsSync(fromItemsPath)) {
            const fromItemsFiles = fs.readdirSync(fromItemsPath)
                .filter(f => f.endsWith('.svg'))
                .sort((a, b) => parseInt(a.replace('.svg', '')) - parseInt(b.replace('.svg', '')))
                .map(f => ({
                    file: f,
                    path: path.join(fromItemsPath, f),
                    source: 'from_items',
                    typeId: baseTraitCount + parseInt(f.replace('.svg', '')) // baseCount + fileNumber
                }));
            allFiles = allFiles.concat(fromItemsFiles);
        }
        useExplicitTypeIds = true; // Use explicit typeIds for all heads
    } else {
        // Other traits: only from default
        const folderPath = path.join(DEFAULT_TRAITS_PATH, folderName);
        if (!fs.existsSync(folderPath)) {
            console.log(`    ⚠️  Folder not found: ${folderPath}`);
            return null;
        }
        allFiles = fs.readdirSync(folderPath)
            .filter(f => f.endsWith('.svg'))
            .map(f => ({ file: f, path: path.join(folderPath, f) }));
    }

    // Sort by typeId if using explicit IDs, otherwise by filename
    if (useExplicitTypeIds) {
        allFiles.sort((a, b) => a.typeId - b.typeId);
    } else {
        allFiles.sort((a, b) => parseInt(a.file.replace('.svg', '')) - parseInt(b.file.replace('.svg', '')));
    }

    const files = allFiles;

    if (files.length === 0) return null;

    console.log(`  Deploying ${folderName} (${files.length} SVGs)...`);

    const svgRendererAddresses = [];
    const chunkSize = 16 * 1024;
    const deployedTraits = {};

    for (let i = 0; i < files.length; i++) {
        const fileObj = files[i];
        const fileName = fileObj.file;
        const filePath = fileObj.path;
        // Create unique prefix: folder + index (e.g., 'head1', 'head20' for from_items)
        const classPrefix = `${folderName}${i + 1}`;
        const svgData = processSvgFile(filePath, classPrefix);

        const totalChunks = Math.ceil(svgData.length / chunkSize);
        const addresses = [];

        for (let j = 0; j < totalChunks; j++) {
            const chunk = svgData.slice(j * chunkSize, (j + 1) * chunkSize);
            const addr = await storeSvgData(svgPartWriter, chunk);
            addresses.push(addr);
        }

        const SVGRenderer = await ethers.getContractFactory("SVGRenderer");
        const traitName = traitNames[i] || `Type ${i + 1}`;
        const source = fileObj.source || 'default';
        const renderer = await deployContract(SVGRenderer, [addresses], `${folderName}/${fileName} (${source})`);
        const rendererAddress = await renderer.getAddress();
        svgRendererAddresses.push(rendererAddress);
        console.log(`    ${fileName} from ${source} deployed (${totalChunks} chunks) - "${traitName}"`);

        // Track deployed trait
        deployedTraits[fileName] = {
            routerId: useExplicitTypeIds ? fileObj.typeId : i + 1, // Explicit typeId for skin, 1-indexed for others
            name: traitName,
            source: source,
            rendererAddress: rendererAddress
        };
    }

    // Deploy router
    const SVGRouter = await ethers.getContractFactory("SVGRouter");
    const router = await deployContract(SVGRouter, [], `${folderName} router`);

    if (useExplicitTypeIds) {
        // For skin: use explicit typeIds matching fileNames
        const typeIds = files.map(f => f.typeId);
        console.log(`    Using explicit typeIds: [${typeIds.join(', ')}]`);
        await sendTx(router.setRenderContractsBatchWithTypeIds(typeIds, svgRendererAddresses));

        // Set trait names with explicit typeIds
        for (let i = 0; i < files.length; i++) {
            const traitName = traitNames[i] || `Type ${files[i].typeId}`;
            await sendTx(router.setTraitName(files[i].typeId, traitName));
        }
        console.log(`    Set ${files.length} trait names with explicit typeIds`);
    } else {
        // For other traits: use sequential IDs (1, 2, 3...)
        await sendTx(router.setRenderContractsBatch(svgRendererAddresses));

        // Set trait names if provided
        if (traitNames.length > 0) {
            // Only set names for the number of files we actually deployed
            const namesToSet = traitNames.slice(0, files.length);
            await sendTx(router.setTraitNamesBatch(namesToSet));
            console.log(`    Set ${namesToSet.length} trait names`);
        }
    }

    const routerAddress = await router.getAddress();
    console.log(`    ${folderName} router: ${routerAddress}`);

    // Save to deployment status
    if (deploymentStatus) {
        deploymentStatus.routers[folderName] = routerAddress;
        deploymentStatus.defaultTraits[folderName] = deployedTraits;
    }

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
        const renderer = await deployContract(SVGRenderer, [addresses], `Item ${file}`);
        svgRendererAddresses.push(await renderer.getAddress());
    }

    // Deploy router for items
    const SVGRouter = await ethers.getContractFactory("SVGRouter");
    const router = await deployContract(SVGRouter, [], "Items router");

    await sendTx(router.setRenderContractsBatch(svgRendererAddresses));

    const routerAddress = await router.getAddress();
    return routerAddress;
}

async function deployArt(deploymentStatus) {
    console.log("\n--- Deploying SVG Art Contracts ---");

    if (!fs.existsSync(DEFAULT_TRAITS_PATH)) {
        throw new Error(`Default traits folder not found at: ${DEFAULT_TRAITS_PATH}`);
    }

    // Load traits from JSON
    const { traitsConfig, traitNames } = loadTraitsConfig();
    console.log("  Loaded traits config from:", TRAITS_JSON_PATH);

    // Deploy SVGPartWriter
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await deployContract(SVGPartWriter, [], "SVGPartWriter");
    const svgPartWriterAddress = await svgPartWriter.getAddress();
    deploymentStatus.contracts.svgPartWriter = svgPartWriterAddress;

    const artAddresses = {};
    const baseTraitCounts = {};

    // Deploy UnifiedBodyRenderer (handles both color body ID=0 and special skins ID=1+)
    artAddresses.body = await deployBody(svgPartWriter, traitsConfig);
    if (artAddresses.body) {
        deploymentStatus.routers.body = artAddresses.body;
    }

    // Deploy background (if exists in traits.json)
    if (traitsConfig.background && traitsConfig.background.length > 0) {
        const bgAddress = await deployTraitFolder('background', svgPartWriter, traitNames.background || [], deploymentStatus);
        if (bgAddress) {
            artAddresses.background = bgAddress;
        }
    }

    // Deploy base trait folders (changed 'belly' to 'stomach')
    const traitFolders = ['head', 'mouth', 'stomach', 'skin'];
    for (const folder of traitFolders) {
        const names = traitNames[folder] || [];
        const address = await deployTraitFolder(folder, svgPartWriter, names, deploymentStatus);
        if (address) {
            artAddresses[folder] = address;
            const folderPath = path.join(DEFAULT_TRAITS_PATH, folder);
            if (folder !== 'skin') { // skin uses from_items, not default
                baseTraitCounts[folder] = names.length || fs.readdirSync(folderPath).filter(f => f.endsWith('.svg')).length;
            }
        }
    }

    // Store base trait counts for renderer configuration
    artAddresses.baseTraitCounts = baseTraitCounts;

    // Deploy item SVGs
    const itemsRouter = await deployItems(svgPartWriter);
    if (itemsRouter) {
        artAddresses.items = itemsRouter;
        deploymentStatus.routers.items = itemsRouter;
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

    // Load or initialize deployment status
    const deploymentStatus = loadDeploymentStatus();
    deploymentStatus.network = network.name;

    // Configuration
    const ROYALTY_RECEIVER = deployerAddress;
    const ROYALTY_FEE = 500; // 5% (500/10000)

    // ============ Deploy Fregs ============
    console.log("\n--- Deploying Fregs ---");
    const Fregs = await ethers.getContractFactory("Fregs");
    const fregs = await deployContract(Fregs, [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs", "FREG"], "Fregs");
    const fregsAddress = await fregs.getAddress();

    // ============ Deploy FregsItems ============
    console.log("\n--- Deploying Fregs Items ---");
    const FregsItems = await ethers.getContractFactory("FregsItems");
    const fregsItems = await deployContract(FregsItems, [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs Items", "FREGITEM", fregsAddress], "FregsItems");
    const fregsItemsAddress = await fregsItems.getAddress();

    // ============ Deploy FregsMintPass ============
    console.log("\n--- Deploying Fregs Mint Pass ---");
    const FregsMintPass = await ethers.getContractFactory("FregsMintPass");
    const fregsMintPass = await deployContract(FregsMintPass, [""], "FregsMintPass");
    const fregsMintPassAddress = await fregsMintPass.getAddress();

    // ============ Deploy SpinTheWheel ============
    console.log("\n--- Deploying SpinTheWheel ---");
    const SpinTheWheel = await ethers.getContractFactory("SpinTheWheel");
    const spinTheWheel = await deployContract(SpinTheWheel, [""], "SpinTheWheel");
    const spinTheWheelAddress = await spinTheWheel.getAddress();

    // ============ Configure Cross-Contract References ============
    console.log("\n--- Configuring Cross-Contract References ---");

    console.log("Setting items contract on Fregs...");
    await sendTx(fregs.setItemsContract(fregsItemsAddress));

    console.log("Setting mint pass contract on Fregs...");
    await sendTx(fregs.setMintPassContract(fregsMintPassAddress));

    console.log("Setting Fregs on MintPass...");
    await sendTx(fregsMintPass.setFregs(fregsAddress));

    // Configure SpinTheWheel
    console.log("Configuring SpinTheWheel...");
    await sendTx(spinTheWheel.setMintPassContract(fregsMintPassAddress));
    await sendTx(spinTheWheel.setItemsContract(fregsItemsAddress));
    await sendTx(spinTheWheel.setLoseWeight(SPIN_LOSE_WEIGHT));
    await sendTx(spinTheWheel.setMintPassWeight(SPIN_MINTPASS_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(HOODIE_ITEM_TYPE, SPIN_HOODIE_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(FROGSUIT_ITEM_TYPE, SPIN_FROGSUIT_WEIGHT));
    await sendTx(spinTheWheel.addItemPrize(CHEST_ITEM_TYPE, SPIN_CHEST_WEIGHT));

    // Set SpinTheWheel on MintPass and Items
    console.log("Setting SpinTheWheel on MintPass and Items...");
    await sendTx(fregsMintPass.setSpinTheWheelContract(spinTheWheelAddress));
    await sendTx(fregsItems.setSpinTheWheelContract(spinTheWheelAddress));

    // ============ Mint Mint Passes to Deployer (localhost only) ============
    const isLocalhost = network.name === "localhost" || network.name === "hardhat";
    let mintPassBalance = 0n;
    if (isLocalhost) {
        console.log("\n--- Minting Mint Passes ---");
        console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to deployer...`);
        await sendTx(fregsMintPass.ownerMint(deployerAddress, MINT_PASSES_TO_MINT, { gasLimit: 200000n }));
        mintPassBalance = await fregsMintPass.balanceOf(deployerAddress, 1); // Token ID 1 = MINT_PASS
        console.log(`Deployer mint pass balance: ${mintPassBalance}`);

        // Also mint to additional recipient if configured
        if (ADDITIONAL_MINTPASS_RECIPIENT && ADDITIONAL_MINTPASS_RECIPIENT !== "0x0000000000000000000000000000000000000000") {
            console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to ${ADDITIONAL_MINTPASS_RECIPIENT}...`);
            await sendTx(fregsMintPass.ownerMint(ADDITIONAL_MINTPASS_RECIPIENT, MINT_PASSES_TO_MINT, { gasLimit: 200000n }));
            const additionalBalance = await fregsMintPass.balanceOf(ADDITIONAL_MINTPASS_RECIPIENT, 1);
            console.log(`Additional recipient mint pass balance: ${additionalBalance}`);
        }
    } else {
        console.log("\n--- Skipping Mint Pass minting (not localhost) ---");
    }

    // Mint SpinTokens to deployer on localhost
    let spinTokenBalance = 0n;
    if (isLocalhost && INITIAL_SPIN_TOKENS_TO_MINT > 0) {
        console.log("\n--- Minting SpinTokens ---");
        console.log(`Minting ${INITIAL_SPIN_TOKENS_TO_MINT} SpinTokens to deployer...`);
        await sendTx(spinTheWheel.ownerMint(deployerAddress, INITIAL_SPIN_TOKENS_TO_MINT));
        spinTokenBalance = await spinTheWheel.balanceOf(deployerAddress, 1);
        console.log(`Deployer SpinToken balance: ${spinTokenBalance}`);
    }

    // ============ Configure Item Configs from items.json ============
    // Note: This happens before art deployment, so we'll configure trait mappings after art is deployed
    console.log("\n--- Loading Item Config from items.json ---");
    const itemsConfig = loadItemsConfig();
    let itemConfigs = null;
    if (itemsConfig) {
        // Build and configure item names and descriptions
        const { configs } = buildItemConfigs(itemsConfig);
        itemConfigs = configs;

        const itemTypeIds = Object.keys(configs).map(Number);
        const names = itemTypeIds.map(id => configs[id].name);
        const descriptions = itemTypeIds.map(id => configs[id].description);

        console.log(`  Configuring ${itemTypeIds.length} item configs from items.json...`);
        await sendTx(fregsItems.setBuiltInItemConfigsBatch(itemTypeIds, names, descriptions));
        console.log("  Item configs set!");
    } else {
        console.log("  ⚠️  No items/items.json found, skipping item config");
    }

    console.log("\nCross-contract references configured!");

    // Save contract addresses to deployment status
    deploymentStatus.contracts.fregs = fregsAddress;
    deploymentStatus.contracts.fregsItems = fregsItemsAddress;
    deploymentStatus.contracts.fregsMintPass = fregsMintPassAddress;
    deploymentStatus.contracts.spinTheWheel = spinTheWheelAddress;

    // ============ Deploy Art and SVG Renderer ============
    const artAddresses = await deployArt(deploymentStatus);

    console.log("\n--- Deploying FregsSVGRenderer ---");
    const FregsSVGRenderer = await ethers.getContractFactory("FregsSVGRenderer");
    const svgRenderer = await deployContract(FregsSVGRenderer, [], "FregsSVGRenderer");
    const svgRendererAddress = await svgRenderer.getAddress();

    // Save SVG Renderer address to deployment status
    deploymentStatus.contracts.svgRenderer = svgRendererAddress;

    // Configure SVG Renderer with art contracts (simplified: 5 contracts)
    console.log("\n--- Configuring FregsSVGRenderer ---");
    console.log("Setting art contracts on SVG Renderer...");
    await sendTx(svgRenderer.setAllContracts(
        artAddresses.background || ethers.ZeroAddress,  // background (0=color rect, 1+=special)
        artAddresses.body || ethers.ZeroAddress,        // body (colorable skin via BodyRenderer)
        artAddresses.skin || ethers.ZeroAddress,        // skin (special skins: Bronze=1, Diamond=2, Metal=3)
        artAddresses.head || ethers.ZeroAddress,        // head (all heads in one router)
        artAddresses.mouth || ethers.ZeroAddress,       // mouth (all mouths in one router)
        artAddresses.stomach || ethers.ZeroAddress      // stomach (all stomachs in one router)
    ));
    console.log("Art contracts configured!");

    // Set base trait counts for mint randomization
    if (artAddresses.baseTraitCounts) {
        console.log("Setting base trait counts...");
        await sendTx(svgRenderer.setAllBaseTraitCounts(
            artAddresses.baseTraitCounts.head || 0,
            artAddresses.baseTraitCounts.mouth || 0,
            artAddresses.baseTraitCounts.stomach || 0
        ));
        console.log("Base trait counts configured!");
    }

    // Set SVG Renderer on Fregs
    console.log("Setting SVG Renderer on Fregs...");
    await sendTx(fregs.setSVGRenderer(svgRendererAddress));
    console.log("SVG Renderer set on Fregs!");

    // Set Items SVG Renderer on FregsItems
    if (artAddresses.items) {
        console.log("Setting SVG Renderer on FregsItems...");
        await sendTx(fregsItems.setSVGRenderer(artAddresses.items));
        console.log("SVG Renderer set on FregsItems!");
    }

    // Configure trait item mappings (skin and head) - needs base trait counts from art deployment
    if (itemsConfig) {
        console.log("\n--- Configuring Trait Item Mappings ---");
        const traitMappings = buildTraitItemMappings(itemsConfig, artAddresses.baseTraitCounts);

        if (traitMappings.length > 0) {
            const allItemTypes = traitMappings.map(m => m.itemId);
            const allTraitValues = traitMappings.map(m => m.traitValue);

            console.log(`  Configuring ${allItemTypes.length} trait item mappings...`);
            await sendTx(fregsItems.setTraitItemMappingsBatch(allItemTypes, allTraitValues));
            console.log("  Trait item mappings configured!");
        }
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
    copyABI("SpinTheWheel", "SpinTheWheel");

    console.log("ABIs copied successfully!");

    // ============ Verify Contracts (if enabled and not localhost) ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contracts on Basescan ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

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

        // Verify SpinTheWheel
        try {
            console.log("Verifying SpinTheWheel...");
            await run("verify:verify", {
                address: spinTheWheelAddress,
                constructorArguments: [""]
            });
            console.log("SpinTheWheel verified!");
        } catch (error) {
            console.log("SpinTheWheel verification failed:", error.message);
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
    console.log("  SpinTheWheel:    ", spinTheWheelAddress);
    console.log("  SVG Renderer:    ", svgRendererAddress);
    console.log("\nArt Contracts (6 unified routers):");
    console.log("  Background:        ", artAddresses.background || "Not deployed (uses color rect)");
    console.log("  Body:              ", artAddresses.body || "Not deployed");
    console.log("  Skin:              ", artAddresses.skin || "Not deployed");
    console.log("  Head:              ", artAddresses.head || "Not deployed");
    console.log("  Mouth:             ", artAddresses.mouth || "Not deployed");
    console.log("  Stomach:           ", artAddresses.stomach || "Not deployed");
    console.log("  Items:             ", artAddresses.items || "Not deployed");
    if (artAddresses.baseTraitCounts) {
        console.log("\nBase Trait Counts (for mint randomization):");
        console.log("  Head:    ", artAddresses.baseTraitCounts.head || 0);
        console.log("  Mouth:   ", artAddresses.baseTraitCounts.mouth || 0);
        console.log("  Stomach: ", artAddresses.baseTraitCounts.stomach || 0);
    }
    console.log("\nConfiguration:");
    console.log("  Royalty Receiver:", ROYALTY_RECEIVER);
    console.log("  Royalty Fee:", ROYALTY_FEE / 100, "%");
    console.log("  Deployer Mint Passes:", mintPassBalance.toString());
    console.log("  Deployer SpinTokens:", spinTokenBalance.toString());
    console.log("\nSpinTheWheel Spin Wheel:");
    console.log("  Lose:", SPIN_LOSE_WEIGHT / 100, "%");
    console.log("  MintPass:", SPIN_MINTPASS_WEIGHT / 100, "%");
    console.log("  Hoodie:", SPIN_HOODIE_WEIGHT / 100, "%");
    console.log("  Frogsuit:", SPIN_FROGSUIT_WEIGHT / 100, "%");
    console.log("  Treasure Chest:", SPIN_CHEST_WEIGHT / 100, "%");
    console.log("\nNext Steps:");
    console.log("  1. Fund items contract for chest rewards:");
    console.log("     await fregsItems.depositETH({ value: ethers.parseEther('0.5') })");
    console.log("  2. Activate mint pass sale:");
    console.log("     await fregsMintPass.setMintPassSaleActive(true)");
    // ============ Save Deployment Status ============
    console.log("\n--- Saving Deployment Status ---");
    saveDeploymentStatus(deploymentStatus);

    console.log("\n" + "=".repeat(60));

    console.log(`\nVITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress} VITE_SVG_RENDERER_ADDRESS=${svgRendererAddress} npx hardhat run scripts/deploySpecialItems.js --network localhost`);
    // Output for .env file
    console.log("\nFor .env file:");
    console.log(`VITE_FREGS_ADDRESS=${fregsAddress}`);
    console.log(`VITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress}`);
    console.log(`VITE_FREGS_MINTPASS_ADDRESS=${fregsMintPassAddress}`);
    console.log(`VITE_SPIN_THE_WHEEL_ADDRESS=${spinTheWheelAddress}`);
    console.log(`VITE_SVG_RENDERER_ADDRESS=${svgRendererAddress}`);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
