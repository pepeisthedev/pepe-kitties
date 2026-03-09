const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

// How much FregCoin to mint (in whole tokens)
const AMOUNT = "1000000000"; // 1 billion

async function main() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    const status = loadDeploymentStatus(network.name);
    const fregCoinAddress = status.contracts?.fregCoin;

    if (!fregCoinAddress) {
        throw new Error(`No FregCoin address found in deployment status for ${network.name}`);
    }

    console.log(`Network: ${network.name}`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`FregCoin: ${fregCoinAddress}`);
    console.log(`Minting: ${AMOUNT} FregCoin`);

    const fregCoin = await ethers.getContractAt("FregCoin", fregCoinAddress);

    const balanceBefore = await fregCoin.balanceOf(deployerAddress);
    console.log(`\nBalance before: ${ethers.formatEther(balanceBefore)}`);

    const tx = await fregCoin.ownerMint(deployerAddress, ethers.parseEther(AMOUNT));
    await tx.wait();
    console.log(`Mint tx: ${tx.hash}`);

    const balanceAfter = await fregCoin.balanceOf(deployerAddress);
    console.log(`Balance after: ${ethers.formatEther(balanceAfter)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
