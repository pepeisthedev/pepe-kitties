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
// Set these addresses after initial deployment
const FREGS_ITEMS_ADDRESS = process.env.VITE_FREGS_ITEMS_ADDRESS || "";
const SVG_RENDERER_ADDRESS = process.env.VITE_SVG_RENDERER_ADDRESS || "";

// Paths
const FROGZ_PATH = path.join(__dirname, "../../website/public/frogz");

// Items to mint for testing
const MINT_AMOUNT = 5;

// ============ MAIN ============

async function main() {
    console.log("=".repeat(60));
    console.log("Deploy Special Items Script");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    console.log("\nNetwork:", network.name);
    console.log("Deployer:", deployerAddress);

    // Get contract instances
    if (!FREGS_ITEMS_ADDRESS) {
        console.error("\n❌ Error: FREGS_ITEMS_ADDRESS not set!");
        console.error("Set VITE_FREGS_ITEMS_ADDRESS in .env or update the script");
        process.exit(1);
    }

    const fregsItems = await ethers.getContractAt("FregsItems", FREGS_ITEMS_ADDRESS);
    console.log("\nFregsItems contract:", FREGS_ITEMS_ADDRESS);

    // Deploy SVGPartWriter using shared utility
    console.log("\n--- Deploying SVGPartWriter ---");
    const svgPartWriter = await getOrDeploySvgPartWriter();

    // ============ DEPLOY CROWN SPECIAL HEAD ============
    console.log("\n--- Deploying Crown Special Head Trait ---");

    const crownTraitPath = path.join(FROGZ_PATH, "specialHead", "1.svg");
    if (!fs.existsSync(crownTraitPath)) {
        console.error("❌ Crown trait SVG not found at:", crownTraitPath);
        process.exit(1);
    }

    const crownTraitRendererAddr = await deploySingleSvg(svgPartWriter, crownTraitPath, 'crownTrait');
    console.log("Crown trait renderer deployed:", crownTraitRendererAddr);

    // Deploy specialHead router if it doesn't exist
    console.log("\n--- Deploying Special Head Router ---");
    const SVGRouter = await ethers.getContractFactory("SVGRouter");
    const specialHeadRouter = await SVGRouter.deploy();
    await specialHeadRouter.waitForDeployment();
    const specialHeadRouterAddr = await specialHeadRouter.getAddress();
    console.log("Special Head Router deployed:", specialHeadRouterAddr);

    // Add crown to router at index 1
    const crownTraitTx = await specialHeadRouter.setRenderContract(1, crownTraitRendererAddr);
    await crownTraitTx.wait();
    console.log("Crown added to Special Head Router (variant ID: 1)");

    // Set trait name
    await (await specialHeadRouter.setTraitName(1, "Crown")).wait();

    // ============ DEPLOY DIAMOND SPECIAL BODY ============
    console.log("\n--- Deploying Diamond Special Body Trait ---");

    const diamondTraitPath = path.join(FROGZ_PATH, "special", "4.svg");
    if (!fs.existsSync(diamondTraitPath)) {
        console.error("❌ Diamond trait SVG not found at:", diamondTraitPath);
        process.exit(1);
    }

    const diamondTraitRendererAddr = await deploySingleSvg(svgPartWriter, diamondTraitPath, 'diamondTrait');
    console.log("Diamond trait renderer deployed:", diamondTraitRendererAddr);

    // Note: For production, add diamond to the EXISTING UnifiedBodyRenderer
    console.log("\n--- Updating UnifiedBodyRenderer ---");

    // If SVG_RENDERER_ADDRESS is set, we can update the existing body renderer
    if (SVG_RENDERER_ADDRESS) {
        const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", SVG_RENDERER_ADDRESS);
        const bodyContractAddr = await svgRenderer.bodyContract();

        if (bodyContractAddr && bodyContractAddr !== ethers.ZeroAddress) {
            // UnifiedBodyRenderer uses setSkin(skinId, pointers[], name)
            // We need to store the diamond SVG and get its pointer
            const diamondPointers = [];

            // Read diamond SVG data and store it
            const diamondPath = path.join(FROGZ_PATH, "special", "4.svg");
            const chunkSize = 16 * 1024;

            if (fs.existsSync(diamondPath)) {
                const diamondData = processSvgFile(diamondPath, 'special4');
                const totalChunks = Math.ceil(diamondData.length / chunkSize);

                for (let j = 0; j < totalChunks; j++) {
                    const chunk = diamondData.slice(j * chunkSize, (j + 1) * chunkSize);
                    const addr = await storeSvgData(svgPartWriter, chunk);
                    diamondPointers.push(addr);
                }

                const bodyRenderer = await ethers.getContractAt("UnifiedBodyRenderer", bodyContractAddr);
                await (await bodyRenderer.setSkin(4, diamondPointers, "Diamond")).wait();
                console.log("Diamond skin added to UnifiedBodyRenderer at ID 4");
            } else {
                console.log("⚠️  Diamond SVG not found, skipping body update");
            }
        } else {
            console.log("⚠️  No existing body contract found");
        }
    }

    // ============ REGISTER ITEM TYPES IN FREGSITEMS ============
    console.log("\n--- Registering Item Types ---");

    // Simplified trait constants (must match Fregs.sol):
    // TRAIT_BACKGROUND = 0
    // TRAIT_BODY = 1
    // TRAIT_HEAD = 2
    // TRAIT_MOUTH = 3
    // TRAIT_BELLY = 4

    // Add Crown item type
    // targetTraitType = 2 (TRAIT_HEAD)
    // traitValue = ID above baseTraitCount (e.g., if 3 base heads, crown = 4)
    console.log("Adding Crown item type...");
    const crownItemTx = await fregsItems.addItemType(
        "Crown",                           // name
        "A royal crown for your Freg",     // description
        2,                                 // targetTraitType (TRAIT_HEAD)
        4,                                 // traitValue (ID above base head count)
        true,                              // isOwnerMintable
        false,                             // isClaimable
        0                                  // claimWeight
    );
    const crownReceipt = await crownItemTx.wait();

    // Get the item type ID from event
    let crownItemTypeId;
    for (const log of crownReceipt.logs) {
        try {
            const parsedLog = fregsItems.interface.parseLog(log);
            if (parsedLog && parsedLog.name === 'ItemTypeAdded') {
                crownItemTypeId = parsedLog.args.itemTypeId;
                break;
            }
        } catch (e) {
            continue;
        }
    }
    console.log(`Crown item type registered with ID: ${crownItemTypeId}`);

    // Add Diamond item type
    // targetTraitType = 1 (TRAIT_BODY)
    // traitValue = 4 (Diamond variant)
    console.log("Adding Diamond item type...");
    const diamondItemTx = await fregsItems.addItemType(
        "Diamond Skin",                    // name
        "A dazzling diamond skin for your Freg", // description
        1,                                 // targetTraitType (TRAIT_BODY)
        4,                                 // traitValue (Diamond = 4)
        true,                              // isOwnerMintable
        false,                             // isClaimable
        0                                  // claimWeight
    );
    const diamondReceipt = await diamondItemTx.wait();

    let diamondItemTypeId;
    for (const log of diamondReceipt.logs) {
        try {
            const parsedLog = fregsItems.interface.parseLog(log);
            if (parsedLog && parsedLog.name === 'ItemTypeAdded') {
                diamondItemTypeId = parsedLog.args.itemTypeId;
                break;
            }
        } catch (e) {
            continue;
        }
    }
    console.log(`Diamond item type registered with ID: ${diamondItemTypeId}`);

    // ============ CONFIGURE SPECIAL DICE ============
    console.log("\n--- Configuring Special Dice ---");

    // Set max variants for trait types (for dice rolls)
    // Simplified trait constants:
    // TRAIT_BACKGROUND = 0, TRAIT_BODY = 1, TRAIT_HEAD = 2, TRAIT_MOUTH = 3, TRAIT_BELLY = 4
    await (await fregsItems.setAllTraitMaxVariants(
        0,  // maxBackground (none yet)
        4,  // maxBody (bronze, silver, gold, diamond)
        4,  // maxHead (3 base + crown item = 4)
        1,  // maxMouth (1 base)
        2   // maxBelly (2 base)
    )).wait();
    console.log("Dice configured with max variants");

    // ============ MINT TEST ITEMS ============
    console.log("\n--- Minting Test Items ---");

    // Mint Crown items
    console.log(`Minting ${MINT_AMOUNT} Crown items to ${deployerAddress}...`);
    await (await fregsItems.ownerMint(deployerAddress, crownItemTypeId, MINT_AMOUNT)).wait();
    console.log(`✅ Minted ${MINT_AMOUNT} Crown items`);

    // Mint Diamond items
    console.log(`Minting ${MINT_AMOUNT} Diamond Skin items to ${deployerAddress}...`);
    await (await fregsItems.ownerMint(deployerAddress, diamondItemTypeId, MINT_AMOUNT)).wait();
    console.log(`✅ Minted ${MINT_AMOUNT} Diamond Skin items`);

    // Mint Special Dice
    console.log(`Minting ${MINT_AMOUNT} Special Dice to ${deployerAddress}...`);
    await (await fregsItems.ownerMint(deployerAddress, 100, MINT_AMOUNT)).wait(); // 100 = SPECIAL_DICE
    console.log(`✅ Minted ${MINT_AMOUNT} Special Dice`);

    // ============ UPDATE SVG RENDERER ============
    console.log("\n--- Updating SVG Renderer ---");

    if (SVG_RENDERER_ADDRESS) {
        const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", SVG_RENDERER_ADDRESS);

        // Update head contract to include crown
        // Note: In simplified system, crown should be added to the unified head router
        // The specialHeadRouter we created above should be merged into headContract
        console.log("Adding Crown to Head Router...");
        const headRouterAddr = await svgRenderer.headContract();
        if (headRouterAddr && headRouterAddr !== ethers.ZeroAddress) {
            const headRouter = await ethers.getContractAt("SVGRouter", headRouterAddr);
            // Get crown renderer from our new router and add to head router
            const crownRenderer = await specialHeadRouter.renderContracts(1);
            // Add crown at ID 4 (after base heads 1-3)
            await (await headRouter.setRenderContract(4, crownRenderer)).wait();
            await (await headRouter.setTraitName(4, "Crown")).wait();
            console.log("✅ Crown added to Head Router at ID 4");
        }
    } else {
        console.log("⚠️  SVG_RENDERER_ADDRESS not set, skipping renderer update");
    }

    // Trait validation is now dynamic - no need to update max values
    // The contract queries svgRenderer.isValidTrait() to check if a trait exists

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));

    console.log("\nDeployed Contracts:");
    console.log("  SVGPartWriter:        ", await svgPartWriter.getAddress());
    console.log("  Special Head Router:  ", specialHeadRouterAddr);
    console.log("  Crown Trait Renderer: ", crownTraitRendererAddr);
    console.log("  Diamond Trait Renderer:", diamondTraitRendererAddr);

    console.log("\nRegistered Item Types (Simplified Trait System):");
    console.log(`  Crown (ID: ${crownItemTypeId}):        TRAIT_HEAD = 4`);
    console.log(`  Diamond Skin (ID: ${diamondItemTypeId}): TRAIT_BODY = 4`);
    console.log("  Special Dice (ID: 100):  Random trait");

    console.log("\nMinted Items:");
    console.log(`  Crown items:        ${MINT_AMOUNT}`);
    console.log(`  Diamond Skin items: ${MINT_AMOUNT}`);
    console.log(`  Special Dice:       ${MINT_AMOUNT}`);

    console.log("\n⚠️  IMPORTANT: Update your website's ItemCard.tsx with these item type IDs:");
    console.log(`     ${crownItemTypeId}: "/items/7.svg",  // Crown`);
    console.log(`     ${diamondItemTypeId}: "/items/8.svg",  // Diamond Skin`);

    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
