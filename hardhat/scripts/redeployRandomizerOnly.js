const { ethers, network } = require("hardhat");
const { retryWithBackoff } = require("./deployUtils");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

const DEFAULT_VRF_COORDINATOR_ADDRESSES = {
    baseSepolia: "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE",
    base: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
};

const DEFAULT_VRF_KEY_HASHES = {
    baseSepolia: "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71",
    base: "0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab",
};

function getVrfConfig() {
    if (network.name === "localhost" || network.name === "hardhat") {
        return { coordinator: null, subscriptionId: 0, keyHash: ethers.ZeroHash };
    }
    if (network.name === "baseSepolia") {
        return {
            coordinator: process.env.BASE_SEPOLIA_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.baseSepolia,
            subscriptionId: BigInt(process.env.BASE_SEPOLIA_VRF_SUBSCRIPTION_ID || 0),
            keyHash: process.env.BASE_SEPOLIA_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.baseSepolia,
        };
    }
    if (network.name === "base") {
        return {
            coordinator: process.env.BASE_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.base,
            subscriptionId: BigInt(process.env.BASE_VRF_SUBSCRIPTION_ID || 0),
            keyHash: process.env.BASE_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.base,
        };
    }
    return {
        coordinator: process.env.VRF_COORDINATOR || "",
        subscriptionId: BigInt(process.env.VRF_SUBSCRIPTION_ID || 0),
        keyHash: process.env.VRF_KEY_HASH || ethers.ZeroHash,
    };
}

async function sendTx(txFn, confirmations = 1) {
    return retryWithBackoff(async () => {
        const tx = await txFn();
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
    const isLocalhost = network.name === "localhost" || network.name === "hardhat";
    const vrfConfig = getVrfConfig();
    let vrfCoordinatorAddress = vrfConfig.coordinator;
    let vrfSubscriptionId = vrfConfig.subscriptionId;
    let vrfKeyHash = vrfConfig.keyHash;

    if (!vrfCoordinatorAddress && !isLocalhost) {
        throw new Error(`Missing VRF coordinator for ${network.name}`);
    }

    if (!isLocalhost && (!vrfSubscriptionId || vrfSubscriptionId === 0n)) {
        throw new Error(`Missing VRF subscription ID for ${network.name}`);
    }

    if (!status.contracts?.fregs || !status.contracts?.fregsItems || !status.contracts?.spinTheWheel) {
        throw new Error(`Missing Fregs/FregsItems/SpinTheWheel addresses in deployment-status-${network.name}.json`);
    }

    const [deployer] = await ethers.getSigners();
    console.log(`Redeploying randomizer on ${network.name} with ${deployer.address}`);
    if (isLocalhost) {
        console.log("Using localhost mock VRF coordinator");
    } else {
        console.log(`Coordinator: ${vrfCoordinatorAddress}`);
        console.log(`Subscription: ${vrfSubscriptionId.toString()}`);
    }

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
            const pendingRequestCount = Number(await previousRandomizer.pendingRequestCount());
            if (pendingRequestCount !== 0) {
                throw new Error(`Existing randomizer still has ${pendingRequestCount} pending request(s). Rescue/cancel them before redeploying.`);
            }
            mintCallbackGasLimit = Number(await previousRandomizer.mintCallbackGasLimit());
            claimItemCallbackGasLimit = Number(await previousRandomizer.claimItemCallbackGasLimit());
            headRerollCallbackGasLimit = Number(await previousRandomizer.headRerollCallbackGasLimit());
            spinCallbackGasLimit = Number(await previousRandomizer.spinCallbackGasLimit());
            requestConfirmations = Number(await previousRandomizer.requestConfirmations());
            autoFulfill = await previousRandomizer.autoFulfill();
        } catch (error) {
            if (error.message.includes("pending request")) {
                throw error;
            }
            console.warn("Could not read previous randomizer config, falling back to defaults.");
        }
    }

    const pendingMintCount = Number(await fregs.pendingMintCount());
    const pendingFregHeadRerollCount = Number(await fregs.pendingHeadRerollCount());
    const pendingClaimCount = Number(await items.pendingClaimCount());
    const pendingItemHeadRerollCount = Number(await items.pendingHeadRerollCount());
    const pendingSpinCount = Number(await spin.pendingSpinCount());

    if (
        pendingMintCount !== 0 ||
        pendingFregHeadRerollCount !== 0 ||
        pendingClaimCount !== 0 ||
        pendingItemHeadRerollCount !== 0 ||
        pendingSpinCount !== 0
    ) {
        throw new Error(
            "Cannot rewire randomizer while requests are pending " +
            `(mints=${pendingMintCount}, fregHeadRerolls=${pendingFregHeadRerollCount}, ` +
            `itemClaims=${pendingClaimCount}, itemHeadRerolls=${pendingItemHeadRerollCount}, spins=${pendingSpinCount}).`
        );
    }

    if (isLocalhost) {
        const MockVRFV2PlusWrapper = await ethers.getContractFactory("MockVRFV2PlusWrapper");
        const mockCoordinator = await deployContract(MockVRFV2PlusWrapper, [], "MockVRFV2PlusWrapper");
        vrfCoordinatorAddress = await mockCoordinator.getAddress();
        vrfSubscriptionId = 1;
        vrfKeyHash = ethers.ZeroHash;
    }

    const FregsRandomizer = await ethers.getContractFactory("FregsRandomizer");
    const randomizer = await deployContract(
        FregsRandomizer,
        [vrfCoordinatorAddress, vrfSubscriptionId, vrfKeyHash],
        "FregsRandomizer"
    );
    const randomizerAddress = await randomizer.getAddress();

    console.log("Configuring FregsRandomizer...");
    const fregsAddress = await fregs.getAddress();
    const itemsAddress = await items.getAddress();
    const spinAddress = await spin.getAddress();
    await sendTx(() => randomizer.setContracts(fregsAddress, itemsAddress, spinAddress));
    await sendTx(() => 
        randomizer.setCallbackGasLimits(
            mintCallbackGasLimit,
            claimItemCallbackGasLimit,
            headRerollCallbackGasLimit,
            spinCallbackGasLimit
        )
    );
    await sendTx(() => randomizer.setRequestConfirmations(requestConfirmations));
    if (autoFulfill) {
        await sendTx(() => randomizer.setAutoFulfill(true));
    } else {
        console.log("Adding FregsRandomizer as VRF subscription consumer...");
        const coordinator = await ethers.getContractAt("IVRFCoordinatorV2Plus", vrfCoordinatorAddress);
        await sendTx(() => coordinator.addConsumer(vrfSubscriptionId, randomizerAddress));
        console.log("  FregsRandomizer added as consumer!");
    }

    console.log("Rewiring contracts to the new randomizer...");
    await sendTx(() => fregs.setRandomizer(randomizerAddress));
    await sendTx(() => items.setRandomizer(randomizerAddress));
    await sendTx(() => spin.setRandomizer(randomizerAddress));

    status.network = network.name;
    status.contracts = {
        ...status.contracts,
        vrfCoordinator: vrfCoordinatorAddress,
        vrfSubscriptionId: vrfSubscriptionId.toString(),
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
