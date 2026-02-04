const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {
    deploySingleSvg,
    getOrDeploySvgPartWriter,
    processSvgFile,
    storeSvgData,
} = require("./deployUtils");

// ============ CONFIGURATION ============
// These can be overridden with environment variables
const FREGS_ITEMS_ADDRESS = process.env.VITE_FREGS_ITEMS_ADDRESS || "";
const SVG_RENDERER_ADDRESS = process.env.VITE_SVG_RENDERER_ADDRESS || "";

// Paths
const FROGZ_PATH = path.join(__dirname, "../../website/public/frogz");
const ADDED_TRAITS_PATH = path.join(FROGZ_PATH, "added");
const ADDED_TRAITS_JSON = path.join(ADDED_TRAITS_PATH, "traits.json");
const DEPLOYMENT_STATUS_PATH = path.join(__dirname, "../deployment-status.json");

// Trait type constants (must match contracts)
const TRAIT_TYPES = {
    BACKGROUND: 0,
    BODY: 1,
    HEAD: 2,
    MOUTH: 3,
    STOMACH: 4, // Changed from BELLY
};

// Map folder names to trait types
const FOLDER_TO_TRAIT_TYPE = {
    background: TRAIT_TYPES.BACKGROUND,
    skin: TRAIT_TYPES.BODY, // skin applies to body
    head: TRAIT_TYPES.HEAD,
    mouth: TRAIT_TYPES.MOUTH,
    stomach: TRAIT_TYPES.STOMACH,
};

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

function loadAddedTraitsConfig() {
    if (!fs.existsSync(ADDED_TRAITS_JSON)) {
        throw new Error(`Added traits config not found at: ${ADDED_TRAITS_JSON}`);
    }
    return JSON.parse(fs.readFileSync(ADDED_TRAITS_JSON, "utf8"));
}

// ============ HELPERS ============

function isTraitDeployed(deploymentStatus, traitType, fileName) {
    const addedTraits = deploymentStatus.addedTraits[traitType] || {};
    return addedTraits[fileName] !== undefined;
}

async function getNextTraitId(router) {
    // SVGRouter.nextTypeId tells us what ID will be assigned next
    return Number(await router.nextTypeId());
}

// ============ MAIN ============

async function main() {
    console.log("=".repeat(60));
    console.log("Deploy Special Items Script");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    console.log("\nNetwork:", network.name);
    console.log("Deployer:", deployerAddress);

    // Load deployment status
    const deploymentStatus = loadDeploymentStatus();

    // Verify network matches
    if (deploymentStatus.network && deploymentStatus.network !== network.name) {
        console.warn(`\n⚠️  Warning: Deployment status is for ${deploymentStatus.network}, but running on ${network.name}`);
        console.warn("   Contract addresses may not be valid for this network.\n");
    }

    // Get contract addresses from status or env
    const fregsItemsAddress = FREGS_ITEMS_ADDRESS || deploymentStatus.contracts?.fregsItems;
    const svgRendererAddress = SVG_RENDERER_ADDRESS || deploymentStatus.contracts?.svgRenderer;

    if (!fregsItemsAddress) {
        console.error("\n❌ Error: FREGS_ITEMS_ADDRESS not set!");
        console.error("Run deploy.js first or set VITE_FREGS_ITEMS_ADDRESS in environment");
        process.exit(1);
    }

    console.log("\nFregsItems contract:", fregsItemsAddress);
    console.log("SVG Renderer:", svgRendererAddress || "Not set");

    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

    // Load added traits config
    const addedTraitsConfig = loadAddedTraitsConfig();
    console.log("\nLoaded added traits from:", ADDED_TRAITS_JSON);

    // Deploy SVGPartWriter
    console.log("\n--- Getting SVGPartWriter ---");
    const svgPartWriter = await getOrDeploySvgPartWriter();

    // Track what we deploy
    const deployedItems = [];
    let newItemsDeployed = 0;

    // Process each trait type
    for (const [traitType, traits] of Object.entries(addedTraitsConfig)) {
        if (!traits || traits.length === 0) continue;

        console.log(`\n--- Processing ${traitType.toUpperCase()} traits ---`);

        // Initialize addedTraits for this type if needed
        if (!deploymentStatus.addedTraits[traitType]) {
            deploymentStatus.addedTraits[traitType] = {};
        }

        for (const trait of traits) {
            const { fileName, name, description, isOwnerMintable = true, isClaimable = false, claimWeight = 0 } = trait;

            // Check if already deployed
            if (isTraitDeployed(deploymentStatus, traitType, fileName)) {
                const existingTrait = deploymentStatus.addedTraits[traitType][fileName];
                console.log(`  ✓ ${fileName} (${name}) - Already deployed (routerId: ${existingTrait.routerId}, itemTypeId: ${existingTrait.itemTypeId})`);
                continue;
            }

            console.log(`\n  Deploying ${fileName} (${name})...`);

            // Deploy the SVG
            const svgPath = path.join(ADDED_TRAITS_PATH, traitType, fileName);
            if (!fs.existsSync(svgPath)) {
                console.error(`    ❌ SVG not found: ${svgPath}`);
                continue;
            }

            const classPrefix = `added${traitType}${fileName.replace('.svg', '')}`;
            const rendererAddress = await deploySingleSvg(svgPartWriter, svgPath, classPrefix);
            console.log(`    Renderer deployed: ${rendererAddress}`);

            // Get the router for this trait type and add the trait
            let routerId = null;
            const routerAddress = deploymentStatus.routers[traitType];

            if (routerAddress) {
                const router = await ethers.getContractAt("SVGRouter", routerAddress);

                // Add to router and get the assigned ID
                const tx = await router.addRenderContractWithName(rendererAddress, name);
                const receipt = await tx.wait();

                // Get the assigned ID from nextTypeId before the transaction
                // Since addRenderContractWithName returns the ID, we need to get it
                // The ID is nextTypeId - 1 after the transaction
                routerId = Number(await router.nextTypeId()) - 1;
                console.log(`    Added to ${traitType} router with ID: ${routerId}`);
            } else {
                console.log(`    ⚠️  No router found for ${traitType}, creating standalone`);
                // Deploy a new router for this trait type
                const SVGRouter = await ethers.getContractFactory("SVGRouter");
                const router = await SVGRouter.deploy();
                await router.waitForDeployment();

                if (network.name !== "localhost" && network.name !== "hardhat") {
                    await router.deploymentTransaction()?.wait(2);
                }

                const newRouterAddress = await router.getAddress();
                await (await router.addRenderContractWithName(rendererAddress, name)).wait();
                routerId = 1;

                deploymentStatus.routers[traitType] = newRouterAddress;
                console.log(`    New router created: ${newRouterAddress}`);
            }

            // Register item type in FregsItems
            const targetTraitType = FOLDER_TO_TRAIT_TYPE[traitType];
            if (targetTraitType === undefined) {
                console.error(`    ❌ Unknown trait type: ${traitType}`);
                continue;
            }

            console.log(`    Registering item type in FregsItems...`);
            const itemTx = await fregsItems.addItemType(
                name,
                description,
                targetTraitType,
                routerId,
                isOwnerMintable,
                isClaimable,
                claimWeight
            );
            const itemReceipt = await itemTx.wait();

            // Get the item type ID from event
            let itemTypeId = null;
            for (const log of itemReceipt.logs) {
                try {
                    const parsedLog = fregsItems.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === 'ItemTypeAdded') {
                        itemTypeId = Number(parsedLog.args.itemTypeId);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            console.log(`    ✅ Item type registered with ID: ${itemTypeId}`);

            // Save to deployment status
            deploymentStatus.addedTraits[traitType][fileName] = {
                name,
                description,
                routerId,
                itemTypeId,
                rendererAddress,
                targetTraitType,
                isOwnerMintable,
                isClaimable,
                claimWeight,
                deployedAt: new Date().toISOString()
            };

            // Also track in itemTypes for easy lookup
            if (itemTypeId) {
                deploymentStatus.itemTypes[itemTypeId] = {
                    name,
                    traitType,
                    fileName,
                    routerId
                };
            }

            deployedItems.push({
                traitType,
                fileName,
                name,
                routerId,
                itemTypeId
            });

            newItemsDeployed++;
        }
    }

    // Save deployment status
    console.log("\n--- Saving Deployment Status ---");
    saveDeploymentStatus(deploymentStatus);

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));

    if (newItemsDeployed === 0) {
        console.log("\n✓ No new items to deploy. Everything is up to date!");
    } else {
        console.log(`\n✅ Deployed ${newItemsDeployed} new item(s):`);
        console.log("-".repeat(60));

        for (const item of deployedItems) {
            console.log(`  ${item.traitType}/${item.fileName}`);
            console.log(`    Name: ${item.name}`);
            console.log(`    Router ID: ${item.routerId}`);
            console.log(`    Item Type ID: ${item.itemTypeId}`);
            console.log("");
        }
    }

    // Show all deployed added traits
    console.log("\nAll deployed special items:");
    console.log("-".repeat(60));

    for (const [traitType, traits] of Object.entries(deploymentStatus.addedTraits)) {
        const traitEntries = Object.entries(traits);
        if (traitEntries.length === 0) continue;

        console.log(`\n  ${traitType.toUpperCase()}:`);
        for (const [fileName, data] of traitEntries) {
            console.log(`    ${fileName}: "${data.name}" (routerId: ${data.routerId}, itemTypeId: ${data.itemTypeId})`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\nTo add more special items:");
    console.log("  1. Add SVG files to website/public/frogz/added/<traitType>/");
    console.log("  2. Update website/public/frogz/added/traits.json");
    console.log("  3. Run this script again");
    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
