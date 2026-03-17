const { ethers, network } = require("hardhat");
const { retryWithBackoff } = require("./deployUtils");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

const DEFAULT_VRF_WRAPPER_ADDRESSES = {
    baseSepolia: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed",
    base: "0xb0407dbe851f8318bd31404A49e658143C982F23",
};

function getVrfWrapperAddress() {
    if (network.name === "localhost" || network.name === "hardhat") {
        return null;
    }
    if (network.name === "baseSepolia") {
        return process.env.BASE_SEPOLIA_VRF_WRAPPER_ADDRESS || DEFAULT_VRF_WRAPPER_ADDRESSES.baseSepolia;
    }
    if (network.name === "base") {
        return process.env.BASE_VRF_WRAPPER_ADDRESS || DEFAULT_VRF_WRAPPER_ADDRESSES.base;
    }
    return process.env.VRF_WRAPPER_ADDRESS || "";
}

async function sendTx(txPromise, confirmations = 1) {
    return retryWithBackoff(async () => {
        const tx = await txPromise;
        const receipt = await tx.wait(confirmations);
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return receipt;
    }, 3, 5000);
}

async function deployContract(factory, args = [], name = "Contract") {
    return retryWithBackoff(async () => {
        console.log(`Deploying ${name}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();

        if (network.name !== "localhost" && network.name !== "hardhat") {
            await contract.deploymentTransaction()?.wait(2);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log(`${name} deployed to: ${await contract.getAddress()}`);
        return contract;
    }, 3, 5000);
}

async function main() {
    const status = loadDeploymentStatus(network.name);
    const vrfWrapperAddress = getVrfWrapperAddress();

    if (!vrfWrapperAddress) {
        throw new Error(`Missing VRF wrapper address for ${network.name}`);
    }

    if (!status.contracts?.fregs || !status.contracts?.fregsItems || !status.contracts?.spinTheWheel) {
        throw new Error(`Missing Fregs/FregsItems/SpinTheWheel addresses in deployment-status-${network.name}.json`);
    }

    const [deployer] = await ethers.getSigners();
    console.log(`Redeploying randomizer on ${network.name} with ${deployer.address}`);
    console.log(`Wrapper: ${vrfWrapperAddress}`);

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const items = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const spin = await ethers.getContractAt("SpinTheWheel", status.contracts.spinTheWheel);

    let mintCallbackGasLimit = 700000;
    let claimItemCallbackGasLimit = 500000;
    let headRerollCallbackGasLimit = 350000;
    let spinCallbackGasLimit = 450000;
    let requestConfirmations = 3;
    let autoFulfill = network.name === "localhost" || network.name === "hardhat";

    if (status.contracts.fregsRandomizer) {
        try {
            const previousRandomizer = await ethers.getContractAt("FregsRandomizer", status.contracts.fregsRandomizer);
            mintCallbackGasLimit = Number(await previousRandomizer.mintCallbackGasLimit());
            claimItemCallbackGasLimit = Number(await previousRandomizer.claimItemCallbackGasLimit());
            headRerollCallbackGasLimit = Number(await previousRandomizer.headRerollCallbackGasLimit());
            spinCallbackGasLimit = Number(await previousRandomizer.spinCallbackGasLimit());
            requestConfirmations = Number(await previousRandomizer.requestConfirmations());
            autoFulfill = await previousRandomizer.autoFulfill();
        } catch (error) {
            console.warn("Could not read previous randomizer config, falling back to defaults.");
        }
    }

    const FregsRandomizer = await ethers.getContractFactory("FregsRandomizer");
    const randomizer = await deployContract(FregsRandomizer, [vrfWrapperAddress], "FregsRandomizer");
    const randomizerAddress = await randomizer.getAddress();

    console.log("Configuring FregsRandomizer...");
    await sendTx(randomizer.setContracts(await fregs.getAddress(), await items.getAddress(), await spin.getAddress()));
    await sendTx(
        randomizer.setCallbackGasLimits(
            mintCallbackGasLimit,
            claimItemCallbackGasLimit,
            headRerollCallbackGasLimit,
            spinCallbackGasLimit
        )
    );
    await sendTx(randomizer.setRequestConfirmations(requestConfirmations));
    if (autoFulfill) {
        await sendTx(randomizer.setAutoFulfill(true));
    }

    console.log("Rewiring contracts to the new randomizer...");
    await sendTx(fregs.setRandomizer(randomizerAddress));
    await sendTx(items.setRandomizer(randomizerAddress));
    await sendTx(spin.setRandomizer(randomizerAddress));

    status.network = network.name;
    status.contracts = {
        ...status.contracts,
        vrfWrapper: vrfWrapperAddress,
        fregsRandomizer: randomizerAddress,
    };
    saveDeploymentStatus(status, network.name);

    console.log("\nDone.");
    console.log(`  FregsRandomizer: ${randomizerAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
