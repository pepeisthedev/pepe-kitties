const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const DEFAULT_CHEST_COUNT = Number(process.env.CHEST_COUNT || 1000);

async function main() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const status = loadDeploymentStatus(network.name);

    const fregCoinAddress = status.contracts?.fregCoin;
    const fregsItemsAddress = status.contracts?.fregsItems;

    if (!fregCoinAddress || !fregsItemsAddress) {
        throw new Error(`Missing FregCoin/FregsItems in deployment-status-${network.name}.json`);
    }

    const fregCoin = await ethers.getContractAt("FregCoin", fregCoinAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

    const chestCoinReward = await fregsItems.chestCoinReward();
    const amount = process.env.FREG_AMOUNT
        ? ethers.parseEther(process.env.FREG_AMOUNT)
        : chestCoinReward * BigInt(DEFAULT_CHEST_COUNT);

    const [
        deployerBalanceBefore,
        itemsBalanceBefore,
        activeChestCount,
    ] = await Promise.all([
        fregCoin.balanceOf(deployerAddress),
        fregCoin.balanceOf(fregsItemsAddress),
        fregsItems.totalChestsMinted().then((minted) => fregsItems.chestsBurned().then((burned) => minted - burned)),
    ]);

    console.log(`Network: ${network.name}`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`FregCoin: ${fregCoinAddress}`);
    console.log(`FregsItems: ${fregsItemsAddress}`);
    console.log(`Chest reward: ${ethers.formatEther(chestCoinReward)} FREG`);
    console.log(`Funding amount: ${ethers.formatEther(amount)} FREG`);
    console.log(`Equivalent chests: ${amount / chestCoinReward}`);
    console.log(`Active chests currently outstanding: ${activeChestCount}`);
    console.log(`\nBalances before:`);
    console.log(`  Deployer: ${ethers.formatEther(deployerBalanceBefore)} FREG`);
    console.log(`  FregsItems: ${ethers.formatEther(itemsBalanceBefore)} FREG`);

    const mintTx = await fregCoin.ownerMint(deployerAddress, amount);
    await mintTx.wait();
    console.log(`\nMint tx: ${mintTx.hash}`);

    const approveTx = await fregCoin.approve(fregsItemsAddress, amount);
    await approveTx.wait();
    console.log(`Approve tx: ${approveTx.hash}`);

    const depositTx = await fregsItems.depositCoins(amount);
    await depositTx.wait();
    console.log(`Deposit tx: ${depositTx.hash}`);

    const [deployerBalanceAfter, itemsBalanceAfter] = await Promise.all([
        fregCoin.balanceOf(deployerAddress),
        fregCoin.balanceOf(fregsItemsAddress),
    ]);

    console.log(`\nBalances after:`);
    console.log(`  Deployer: ${ethers.formatEther(deployerBalanceAfter)} FREG`);
    console.log(`  FregsItems: ${ethers.formatEther(itemsBalanceAfter)} FREG`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
