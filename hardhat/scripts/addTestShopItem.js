const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { storeSvgData, processSvgFile } = require("./deployUtils");

// ============ TEST ITEM CONFIG ============
const TEST_ITEM = {
    name: "Sun",
    description: "A blazing sun on your Freg's belly!",
    targetTraitType: 4,   // BELLY (stomach)
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
};

// Path to the SVG file for the on-chain trait (rendered ON the frog)
const TRAIT_SVG_PATH = path.join(__dirname, "../../website/public/frogz/from_items/stomach/1.svg");

// Path to the item icon SVG (shown in inventory/shop, used by FregsItems.tokenURI())
const ITEM_ICON_SVG_PATH = path.join(__dirname, "../../website/public/items/sun.svg");

// Shop listing config
const SHOP_PRICE = ethers.parseEther("1000000"); // 1M $FREG
const SHOP_MAX_SUPPLY = 50;                       // 0 = unlimited

// Mint $FREG to deployer for testing purchases
const MINT_FREG_TO_DEPLOYER = ethers.parseEther("10000000"); // 10M $FREG

// ============ HELPERS ============

async function sendTx(txPromise) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    return receipt;
}

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    console.log("=".repeat(60));
    console.log("Add Test Shop Item: " + TEST_ITEM.name);
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("Deployer:", deployerAddress);

    // Get contracts
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const fregShop = await ethers.getContractAt("FregShop", status.contracts.fregShop);
    const fregCoin = await ethers.getContractAt("FregCoin", status.contracts.fregCoin);
    const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", status.contracts.svgRenderer);

    // ============ 1. Deploy SVG trait on-chain ============
    console.log("\n--- Deploying SVG Trait On-Chain ---");

    if (!fs.existsSync(TRAIT_SVG_PATH)) {
        console.error(`SVG file not found: ${TRAIT_SVG_PATH}`);
        process.exit(1);
    }

    // Deploy SVGPartWriter for storing SVG data
    console.log("  Deploying SVGPartWriter...");
    const SVGPartWriter = await ethers.getContractFactory("SVGPartWriter");
    const svgPartWriter = await SVGPartWriter.deploy();
    await svgPartWriter.waitForDeployment();
    console.log("  SVGPartWriter deployed:", await svgPartWriter.getAddress());

    // Process and store the SVG
    const svgData = processSvgFile(TRAIT_SVG_PATH, "sunstomach");
    console.log(`  SVG data size: ${svgData.length} bytes`);

    const chunkSize = 16 * 1024;
    const totalChunks = Math.ceil(svgData.length / chunkSize);
    const chunkAddresses = [];

    for (let i = 0; i < totalChunks; i++) {
        const chunk = svgData.slice(i * chunkSize, (i + 1) * chunkSize);
        const addr = await storeSvgData(svgPartWriter, chunk);
        chunkAddresses.push(addr);
        console.log(`  Chunk ${i + 1}/${totalChunks} stored at ${addr}`);
    }

    // Deploy SVGRenderer for this trait
    console.log("  Deploying SVGRenderer for trait...");
    const SVGRendererFactory = await ethers.getContractFactory("SVGRenderer");
    const traitRenderer = await SVGRendererFactory.deploy(chunkAddresses);
    await traitRenderer.waitForDeployment();
    const traitRendererAddress = await traitRenderer.getAddress();
    console.log(`  SVGRenderer deployed: ${traitRendererAddress}`);

    // ============ 2. Register trait on the belly SVGRouter ============
    console.log("\n--- Registering Trait on Belly SVGRouter ---");

    // Get the belly contract address from the SVG renderer
    const bellyContractAddress = await svgRenderer.bellyContract();
    console.log(`  Belly SVGRouter: ${bellyContractAddress}`);

    const bellyRouter = await ethers.getContractAt("SVGRouter", bellyContractAddress);
    const currentTraitCount = await bellyRouter.getTraitCount();
    console.log(`  Current belly trait count: ${currentTraitCount}`);

    // Add the new trait to the router
    const addTx = await bellyRouter.addRenderContractWithName(traitRendererAddress, TEST_ITEM.name);
    const addReceipt = await addTx.wait();
    const newTraitCount = await bellyRouter.getTraitCount();
    const newTraitId = Number(newTraitCount); // The ID assigned (nextTypeId - 1 after add)
    console.log(`  New belly trait count: ${newTraitCount}`);
    console.log(`  New trait ID: ${newTraitId}`);

    // Verify the trait renders
    const isValid = await bellyRouter.isValidTrait(newTraitId);
    console.log(`  Trait ${newTraitId} valid: ${isValid}`);

    // ============ 3. Add item type on FregsItems ============
    console.log("\n--- Adding Item Type on FregsItems ---");
    const nextItemId = await fregsItems.nextItemTypeId();
    console.log(`  Next item type ID: ${nextItemId}`);

    await sendTx(fregsItems.addItemType(
        TEST_ITEM.name,
        TEST_ITEM.description,
        TEST_ITEM.targetTraitType,
        newTraitId,               // traitValue = the ID on the belly router
        TEST_ITEM.isOwnerMintable,
        TEST_ITEM.isClaimable,
        TEST_ITEM.claimWeight,
    ));
    const itemTypeId = Number(nextItemId);
    console.log(`  Item type "${TEST_ITEM.name}" added with ID: ${itemTypeId}, traitValue: ${newTraitId}`);

    // Verify
    const config = await fregsItems.itemTypeConfigs(itemTypeId);
    console.log(`  Verified: name="${config.name}", targetTraitType=${config.targetTraitType}, traitValue=${config.traitValue}`);

    // ============ 4. Deploy item icon SVG to items SVGRouter ============
    console.log("\n--- Deploying Item Icon SVG On-Chain ---");

    if (!fs.existsSync(ITEM_ICON_SVG_PATH)) {
        console.error(`Item icon SVG not found: ${ITEM_ICON_SVG_PATH}`);
        process.exit(1);
    }

    const itemsRouterAddress = status.routers.items;
    console.log(`  Items SVGRouter: ${itemsRouterAddress}`);
    const itemsRouter = await ethers.getContractAt("SVGRouter", itemsRouterAddress);

    // Process and store the icon SVG (no class prefix for item icons)
    const iconSvgData = processSvgFile(ITEM_ICON_SVG_PATH, "");
    console.log(`  Icon SVG data size: ${iconSvgData.length} bytes`);

    const iconChunkAddresses = [];
    const iconTotalChunks = Math.ceil(iconSvgData.length / chunkSize);

    for (let i = 0; i < iconTotalChunks; i++) {
        const chunk = iconSvgData.slice(i * chunkSize, (i + 1) * chunkSize);
        const addr = await storeSvgData(svgPartWriter, chunk);
        iconChunkAddresses.push(addr);
        console.log(`  Icon chunk ${i + 1}/${iconTotalChunks} stored at ${addr}`);
    }

    // Deploy SVGRenderer for the icon
    console.log("  Deploying SVGRenderer for item icon...");
    const iconRenderer = await SVGRendererFactory.deploy(iconChunkAddresses);
    await iconRenderer.waitForDeployment();
    const iconRendererAddress = await iconRenderer.getAddress();
    console.log(`  Icon SVGRenderer deployed: ${iconRendererAddress}`);

    // FregsItems.tokenURI() calls svgRenderer.render(itemType - 1), so we need
    // the icon at slot (itemTypeId - 1) on the items SVGRouter
    const iconSlot = itemTypeId - 1;
    console.log(`  Setting icon on items router at slot ${iconSlot} (itemType ${itemTypeId} - 1)...`);
    await sendTx(itemsRouter.setRenderContract(iconSlot, iconRendererAddress));
    console.log(`  Item icon registered!`);

    // Verify
    const iconValid = await itemsRouter.isValidTrait(iconSlot);
    console.log(`  Icon slot ${iconSlot} valid: ${iconValid}`);

    // ============ 5. List in FregShop ============
    console.log("\n--- Listing Item in FregShop ---");
    console.log(`  Price: ${ethers.formatEther(SHOP_PRICE)} $FREG`);
    console.log(`  Max supply: ${SHOP_MAX_SUPPLY === 0 ? "unlimited" : SHOP_MAX_SUPPLY}`);

    await sendTx(fregShop.listItem(itemTypeId, SHOP_PRICE, SHOP_MAX_SUPPLY));
    console.log("  Listed!");

    const shopItem = await fregShop.shopItems(itemTypeId);
    console.log(`  Verified: price=${ethers.formatEther(shopItem.price)} $FREG, active=${shopItem.isActive}`);

    // ============ 6. Mint $FREG to deployer for testing ============
    const isLocalhost = network.name === "localhost" || network.name === "hardhat";
    if (isLocalhost && MINT_FREG_TO_DEPLOYER > 0n) {
        console.log("\n--- Minting $FREG to Deployer ---");
        await sendTx(fregCoin.ownerMint(deployerAddress, MINT_FREG_TO_DEPLOYER));
        const balance = await fregCoin.balanceOf(deployerAddress);
        console.log(`  Balance: ${ethers.formatEther(balance)} $FREG`);
    }

    // ============ 7. Save to deployment-status.json ============
    console.log("\n--- Saving Deployment Status ---");

    if (!status.addedTraits.stomach) status.addedTraits.stomach = {};
    status.addedTraits.stomach[`${newTraitId}.svg`] = {
        routerId: newTraitId,
        name: TEST_ITEM.name,
        source: "from_items",
        rendererAddress: traitRendererAddress,
    };

    status.itemTypes[itemTypeId] = {
        name: TEST_ITEM.name,
        description: TEST_ITEM.description,
        targetTraitType: TEST_ITEM.targetTraitType,
        traitValue: newTraitId,
        traitRendererAddress: traitRendererAddress,
        iconRendererAddress: iconRendererAddress,
        iconRouterSlot: iconSlot,
        shopPrice: ethers.formatEther(SHOP_PRICE),
        shopMaxSupply: SHOP_MAX_SUPPLY,
    };

    saveDeploymentStatus(status, network.name);

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("DONE");
    console.log("=".repeat(60));
    console.log(`\nItem "${TEST_ITEM.name}" (Item Type ID: ${itemTypeId}):`);
    console.log(`  - On-chain SVG trait deployed (belly trait ID: ${newTraitId})`);
    console.log(`  - On-chain item icon deployed (items router slot: ${iconSlot})`);
    console.log(`  - Available in Shop for ${ethers.formatEther(SHOP_PRICE)} $FREG`);
    console.log(`  - Owner-mintable via Admin panel`);
    console.log(`  - When applied: sets belly to trait ${newTraitId}`);
    console.log(`\nFrontend from_items SVG: website/public/frogz/from_items/stomach/1.svg`);
    console.log(`Shop icon SVG: website/public/items/sun.svg`);

    console.log("\nAdd to website/src/config/items.json:");
    console.log(JSON.stringify({
        id: itemTypeId,
        name: TEST_ITEM.name,
        description: TEST_ITEM.description,
        category: "stomach",
        svgFile: "sun.svg",
        targetTraitType: TEST_ITEM.targetTraitType,
        traitFileName: "1.svg",
        isClaimable: false,
        claimWeight: 0,
        isOwnerMintable: true
    }, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
