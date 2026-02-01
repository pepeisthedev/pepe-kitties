const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {
    deploySingleSvg,
    getOrDeploySvgPartWriter,
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

    // Note: For production, add diamond to the EXISTING specialBody router
    // Here we demo by updating an existing router or creating a new one
    console.log("\n--- Updating Special Body Router ---");

    // If SVG_RENDERER_ADDRESS is set, we can update the existing specialBody router
    if (SVG_RENDERER_ADDRESS) {
        const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", SVG_RENDERER_ADDRESS);
        const specialBodyRouterAddr = await svgRenderer.specialBodyContract();

        if (specialBodyRouterAddr && specialBodyRouterAddr !== ethers.ZeroAddress) {
            const existingRouter = await ethers.getContractAt("SVGRouter", specialBodyRouterAddr);
            // Add diamond at variant 4
            await (await existingRouter.setRenderContract(4, diamondTraitRendererAddr)).wait();
            await (await existingRouter.setTraitName(4, "Diamond")).wait();
            console.log("Diamond added to existing Special Body Router at variant 4");
        } else {
            console.log("⚠️  No existing specialBody router found, creating new one...");
            const newRouter = await SVGRouter.deploy();
            await newRouter.waitForDeployment();
            const newRouterAddr = await newRouter.getAddress();

            await (await newRouter.setRenderContract(4, diamondTraitRendererAddr)).wait();
            await (await newRouter.setTraitName(4, "Diamond")).wait();
            console.log("New Special Body Router deployed:", newRouterAddr);
        }
    }

    // ============ REGISTER ITEM TYPES IN FREGSITEMS ============
    console.log("\n--- Registering Item Types ---");

    // Add Crown item type
    // targetTraitType = 8 (TRAIT_SPECIAL_HEAD)
    // traitValue = 1 (Crown variant)
    console.log("Adding Crown item type...");
    const crownItemTx = await fregsItems.addItemType(
        "Crown",                           // name
        "A royal crown for your Freg",     // description
        8,                                 // targetTraitType (TRAIT_SPECIAL_HEAD)
        1,                                 // traitValue (variant ID)
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
    // targetTraitType = 4 (TRAIT_SPECIAL_BODY)
    // traitValue = 4 (Diamond variant)
    console.log("Adding Diamond item type...");
    const diamondItemTx = await fregsItems.addItemType(
        "Diamond Skin",                    // name
        "A dazzling diamond skin for your Freg", // description
        4,                                 // targetTraitType (TRAIT_SPECIAL_BODY)
        4,                                 // traitValue (variant ID)
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

    // Set max variants for special traits (for dice rolls)
    // TRAIT_SPECIAL_BODY (4) = 4 variants (bronze, silver, gold, diamond)
    // TRAIT_SPECIAL_HEAD (8) = 1 variant (crown)
    await (await fregsItems.setAllSpecialTraitMaxVariants(
        4,  // maxBody (bronze, silver, gold, diamond)
        0,  // maxMouth (none yet)
        0,  // maxBackground (none yet)
        0,  // maxBelly (none yet)
        1   // maxHead (crown)
    )).wait();
    console.log("Special dice configured with max variants");

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

        // Update specialHead contract
        console.log("Setting Special Head contract on SVG Renderer...");
        await (await svgRenderer.setSpecialHeadContract(specialHeadRouterAddr)).wait();
        console.log("✅ Special Head contract updated");
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

    console.log("\nRegistered Item Types:");
    console.log(`  Crown (ID: ${crownItemTypeId}):        TRAIT_SPECIAL_HEAD = 1`);
    console.log(`  Diamond Skin (ID: ${diamondItemTypeId}): TRAIT_SPECIAL_BODY = 4`);
    console.log("  Special Dice (ID: 100):  Random special trait");

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
