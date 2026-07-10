const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

async function main() {
    const to = process.env.TO;
    const amount = process.env.AMOUNT;

    if (!to || !ethers.isAddress(to)) {
        throw new Error("Missing or invalid TO env var (recipient address)");
    }
    if (!amount) {
        throw new Error("Missing AMOUNT env var (whole tokens, e.g. 1000)");
    }

    const status = loadDeploymentStatus(network.name);
    const fregCoinAddress = status.contracts?.fregCoin;
    if (!fregCoinAddress) {
        throw new Error(`No FregCoin address found in deployment status for ${network.name}`);
    }

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const fregCoin = await ethers.getContractAt("FregCoin", fregCoinAddress);

    const value = ethers.parseEther(String(amount));
    const balance = await fregCoin.balanceOf(deployerAddress);

    console.log("=".repeat(60));
    console.log("Send FregCoin");
    console.log("=".repeat(60));
    console.log(`Network:   ${network.name}`);
    console.log(`FregCoin:  ${fregCoinAddress}`);
    console.log(`From:      ${deployerAddress}`);
    console.log(`To:        ${to}`);
    console.log(`Amount:    ${amount} FREG (${value} wei)`);
    console.log(`Balance:   ${ethers.formatEther(balance)} FREG`);

    if (balance < value) {
        throw new Error(
            `Insufficient FREG balance. Need ${ethers.formatEther(value - balance)} more.`
        );
    }

    const tx = await fregCoin.transfer(to, value);
    console.log(`\nTx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Confirmed in block ${receipt.blockNumber}`);

    const finalBalance = await fregCoin.balanceOf(deployerAddress);
    const recipientBalance = await fregCoin.balanceOf(to);
    console.log(`\nDeployer balance:  ${ethers.formatEther(finalBalance)} FREG`);
    console.log(`Recipient balance: ${ethers.formatEther(recipientBalance)} FREG`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
