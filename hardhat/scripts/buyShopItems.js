const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    const fregCoin = await ethers.getContractAt("FregCoin", status.contracts.fregCoin);
    const fregShop = await ethers.getContractAt("FregShop", status.contracts.fregShop);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);

    console.log("=".repeat(60));
    console.log("Buy Shop Items");
    console.log("=".repeat(60));
    console.log("Network:", network.name);
    console.log("Buyer:", deployerAddress);

    const balance = await fregCoin.balanceOf(deployerAddress);
    console.log("FREG balance:", ethers.formatEther(balance));

    const [itemTypeIds, prices, actives, maxSupplies, mintCounts] = await fregShop.getListedItems();

    const activeItems = [];
    for (let i = 0; i < itemTypeIds.length; i++) {
        if (actives[i]) {
            const soldOut = maxSupplies[i] > 0n && mintCounts[i] >= maxSupplies[i];
            activeItems.push({
                itemTypeId: Number(itemTypeIds[i]),
                price: prices[i],
                maxSupply: Number(maxSupplies[i]),
                mintCount: Number(mintCounts[i]),
                soldOut,
            });
        }
    }

    if (activeItems.length === 0) {
        console.log("\nNo active shop items found.");
        return;
    }

    console.log(`\nFound ${activeItems.length} active shop items:`);
    for (const item of activeItems) {
        const config = await fregsItems.itemTypeConfigs(item.itemTypeId);
        const supply = item.maxSupply === 0 ? "unlimited" : `${item.mintCount}/${item.maxSupply}`;
        console.log(`  ${config.name} (type ${item.itemTypeId}) - ${ethers.formatEther(item.price)} FREG [${supply}]${item.soldOut ? " SOLD OUT" : ""}`);
    }

    const COPIES = 2;
    const buyable = activeItems.filter((item) => !item.soldOut);
    const totalCost = buyable.reduce((sum, item) => sum + item.price * BigInt(COPIES), 0n);

    console.log(`\nBuying ${COPIES} of each (${buyable.length} items, ${COPIES * buyable.length} total)`);
    console.log(`Total cost: ${ethers.formatEther(totalCost)} FREG`);

    if (balance < totalCost) {
        const needed = totalCost - balance;
        console.log(`Insufficient balance, minting ${ethers.formatEther(needed)} FREG...`);
        const tx = await fregCoin.ownerMint(deployerAddress, needed);
        await tx.wait();
        console.log("Minted!");
    }

    let purchased = 0;
    for (const item of buyable) {
        const config = await fregsItems.itemTypeConfigs(item.itemTypeId);
        for (let copy = 1; copy <= COPIES; copy++) {
            const tx = await fregCoin.buyItem(item.itemTypeId);
            await tx.wait();
            purchased++;
            console.log(`  Bought ${config.name} #${copy} (type ${item.itemTypeId}) [${purchased}/${COPIES * buyable.length}]`);
        }
    }

    const finalBalance = await fregCoin.balanceOf(deployerAddress);
    const totalMinted = await fregsItems.totalMinted();
    console.log(`\nDone! Purchased ${purchased} items.`);
    console.log(`FREG balance: ${ethers.formatEther(finalBalance)}`);
    console.log(`Total items minted: ${totalMinted}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
