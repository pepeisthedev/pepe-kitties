const { ethers, network } = require("hardhat");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { syncItemManifestOnly } = require("./shopItemSync");
const serumDef = require("./shop-item-definitions/mutantSerumItem");

async function main() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log(`Deploying TestMutationRenderer on ${network.name}`);
    console.log(`Deployer: ${deployerAddress}`);

    const status = loadDeploymentStatus(network.name);
    const fregsAddress = status.contracts?.fregs;
    const fregsItemsAddress = status.contracts?.fregsItems;
    const fregShopAddress = status.contracts?.fregShop;
    if (!fregsAddress) throw new Error(`No Fregs address for ${network.name}`);
    if (!fregsItemsAddress) throw new Error(`No FregsItems address for ${network.name}`);
    if (!fregShopAddress) throw new Error(`No FregShop address for ${network.name}`);

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);
    const fregShop = await ethers.getContractAt("FregShop", fregShopAddress);

    // 1. Deploy TestMutationRenderer
    const Factory = await ethers.getContractFactory("TestMutationRenderer");
    const renderer = await Factory.deploy();
    await renderer.waitForDeployment();
    const rendererAddress = await renderer.getAddress();
    console.log(`TestMutationRenderer deployed at: ${rendererAddress}`);

    // 2. Set it as the mutation renderer on Fregs
    let tx = await fregs.setMutationRenderer(rendererAddress);
    await tx.wait();
    console.log(`Set mutationRenderer on Fregs`);

    // 3. Add Mutant Serum as a dynamic item type on FregsItems
    tx = await fregsItems.addItemType(
        serumDef.name,
        serumDef.description,
        0,                      // targetTraitType (not a trait item)
        0,                      // traitValue
        serumDef.isOwnerMintable,
        serumDef.isClaimable,
        serumDef.claimWeight
    );
    await tx.wait();
    const serumItemTypeId = Number(await fregsItems.nextItemTypeId()) - 1;
    console.log(`Mutant Serum registered as item type ${serumItemTypeId}`);

    // 4. Set it as the mutation item type
    tx = await fregsItems.setMutationItemTypeId(serumItemTypeId);
    await tx.wait();
    console.log(`Set mutationItemTypeId to ${serumItemTypeId}`);

    // 5. List in shop — price: 500M FREG, maxSupply = total NFT supply
    const totalSupply = Number(await fregs.supply());
    const price = ethers.parseEther(serumDef.shop.priceFreg);
    tx = await fregShop.listItem(serumItemTypeId, price, totalSupply);
    await tx.wait();
    console.log(`Listed in shop: price=500M FREG, maxSupply=${totalSupply}`);

    // 6. Sync manifest + icon to website/api
    const chainId = network.config.chainId;
    syncItemManifestOnly({
        chainId,
        item: {
            id: serumItemTypeId,
            name: serumDef.name,
            description: serumDef.description,
            category: serumDef.category,
            svgFile: serumDef.icon.svgFile,
            isClaimable: serumDef.isClaimable,
            claimWeight: serumDef.claimWeight,
            isOwnerMintable: serumDef.isOwnerMintable,
        },
        itemIconSourceSvgPath: serumDef.icon.sourceSvgPath,
    });
    console.log(`Synced dynamic-items.json and icon for chain ${chainId}`);

    // Save to deployment status
    status.contracts.testMutationRenderer = rendererAddress;
    status.mutationItemTypeId = serumItemTypeId;
    saveDeploymentStatus(network.name, status);
    console.log(`Saved to deployment status`);

    console.log("\nDone! Mutant Serum is available in the shop.");
    console.log("Buy it with $FREG, then use it from the 'Use Items' tab.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
