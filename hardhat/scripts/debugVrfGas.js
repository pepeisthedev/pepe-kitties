const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const WRAPPER_ABI = [
    "function calculateRequestPriceNative(uint32 callbackGasLimit, uint32 numWords) view returns (uint256)",
];

function getCliArg(flag) {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    if (index === -1 || index + 1 >= args.length) {
        return null;
    }
    return args[index + 1];
}

function formatWei(value) {
    return `${value.toString()} wei (${ethers.formatEther(value)} ETH)`;
}

function selectorOf(data) {
    return typeof data === "string" && data.length >= 10 ? data.slice(0, 10) : "0x";
}

async function callUint(contract, functionName, args = [], overrides = {}, blockTag = "latest") {
    const data = contract.interface.encodeFunctionData(functionName, args);
    const result = await ethers.provider.call(
        {
            to: await contract.getAddress(),
            data,
            ...overrides,
        },
        blockTag
    );
    return contract.interface.decodeFunctionResult(functionName, result)[0];
}

async function callWrapperQuote(wrapper, gasLimit, gasPrice, blockTag = "latest") {
    const data = wrapper.interface.encodeFunctionData("calculateRequestPriceNative", [gasLimit, 1]);
    const tx = {
        to: await wrapper.getAddress(),
        data,
    };

    if (gasPrice !== null && gasPrice !== undefined) {
        tx.gasPrice = gasPrice;
    }

    const result = await ethers.provider.call(tx, blockTag);
    return wrapper.interface.decodeFunctionResult("calculateRequestPriceNative", result)[0];
}

async function printQuoteComparison(label, contract, functionName, wrapper, gasLimit, gasPrice, blockTag = "latest") {
    const quoteWithoutGasPrice = await callUint(contract, functionName, [], {}, blockTag);
    const quoteWithGasPrice = await callUint(contract, functionName, [], { gasPrice }, blockTag);
    const wrapperWithoutGasPrice = await callWrapperQuote(wrapper, gasLimit, null, blockTag);
    const wrapperWithGasPrice = await callWrapperQuote(wrapper, gasLimit, gasPrice, blockTag);

    console.log(`\n${label}`);
    console.log(`  Contract quote without gasPrice override: ${formatWei(quoteWithoutGasPrice)}`);
    console.log(`  Contract quote with gasPrice=${gasPrice.toString()}: ${formatWei(quoteWithGasPrice)}`);
    console.log(`  Wrapper quote without gasPrice override:  ${formatWei(wrapperWithoutGasPrice)}`);
    console.log(`  Wrapper quote with gasPrice=${gasPrice.toString()}:  ${formatWei(wrapperWithGasPrice)}`);
}

async function inspectMintContext(fregs, from, gasPrice, blockTag = "latest") {
    const mintPrice = await callUint(fregs, "mintPrice", [], {}, blockTag);
    const mintPhase = await callUint(fregs, "mintPhase", [], {}, blockTag);
    const freeMints = await callUint(fregs, "freeMints", [from], {}, blockTag);
    const quoteWithoutGasPrice = await callUint(fregs, "quoteMintFee", [], {}, blockTag);
    const quoteWithGasPrice = await callUint(fregs, "quoteMintFee", [], { gasPrice }, blockTag);

    console.log("\nMint Context");
    console.log(`  Mint phase: ${mintPhase.toString()}`);
    console.log(`  Mint price: ${formatWei(mintPrice)}`);
    console.log(`  Free mints for sender: ${freeMints.toString()}`);
    console.log(`  quoteMintFee() without gasPrice override: ${formatWei(quoteWithoutGasPrice)}`);
    console.log(`  quoteMintFee() with gasPrice=${gasPrice.toString()}: ${formatWei(quoteWithGasPrice)}`);

    return { mintPhase, mintPrice, freeMints, quoteWithoutGasPrice, quoteWithGasPrice };
}

async function inspectTransaction(txHash, fregs, wrapper) {
    const tx = await ethers.provider.getTransaction(txHash);
    const receipt = await ethers.provider.getTransactionReceipt(txHash);

    if (!tx || !receipt) {
        throw new Error(`Transaction not found: ${txHash}`);
    }

    console.log("\n=== Transaction Inspection ===");
    console.log(`Hash: ${txHash}`);
    console.log(`To: ${tx.to}`);
    console.log(`From: ${tx.from}`);
    console.log(`Selector: ${selectorOf(tx.data)}`);
    console.log(`Value: ${formatWei(tx.value)}`);
    console.log(`Gas price: ${tx.gasPrice ? formatWei(tx.gasPrice) : "n/a"}`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Status: ${receipt.status}`);

    const blockTag = receipt.blockNumber;
    const gasPrice = tx.gasPrice ?? 0n;
    const mintContext = await inspectMintContext(fregs, tx.from, gasPrice, blockTag);

    const wrapperMintQuote = await callWrapperQuote(wrapper, 700000, gasPrice, blockTag);
    console.log(`  Wrapper mint quote at tx gas price: ${formatWei(wrapperMintQuote)}`);

    if (selectorOf(tx.data) === fregs.interface.getFunction("mint").selector) {
        const requiredValue = mintContext.freeMints > 0n
            ? mintContext.quoteWithGasPrice
            : mintContext.mintPrice + mintContext.quoteWithGasPrice;

        console.log(`  Required payment at tx gas price: ${formatWei(requiredValue)}`);
        console.log(`  Sent payment: ${formatWei(tx.value)}`);
        console.log(`  Payment delta: ${formatWei(tx.value - requiredValue)}`);
    }

    try {
        await ethers.provider.call(
            {
                to: tx.to,
                from: tx.from,
                data: tx.data,
                value: tx.value,
                gasPrice,
            },
            blockTag
        );
        console.log("  Simulation with tx gas price unexpectedly succeeded.");
    } catch (error) {
        console.log(`  Simulation reverted: ${error.shortMessage || error.message}`);
        if (error.reason) {
            console.log(`  Revert reason: ${error.reason}`);
        }
        if (error.data) {
            console.log(`  Revert data: ${error.data}`);
        }
    }
}

async function main() {
    const txHash = process.env.DEBUG_TX_HASH || process.env.TX_HASH || getCliArg("--tx");
    const status = loadDeploymentStatus(network.name);

    if (!status.contracts?.fregs || !status.contracts?.fregsRandomizer || !status.contracts?.vrfWrapper) {
        throw new Error(`Missing Fregs / FregsRandomizer / vrfWrapper in deployment-status-${network.name}.json`);
    }

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const items = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const spin = await ethers.getContractAt("SpinTheWheel", status.contracts.spinTheWheel);
    const randomizer = await ethers.getContractAt("FregsRandomizer", status.contracts.fregsRandomizer);
    const wrapper = new ethers.Contract(status.contracts.vrfWrapper, WRAPPER_ABI, ethers.provider);

    const feeData = await ethers.provider.getFeeData();
    const networkGasPrice = feeData.gasPrice ?? 0n;
    const [mintGas, claimGas, rerollGas, spinGas] = await Promise.all([
        randomizer.mintCallbackGasLimit(),
        randomizer.claimItemCallbackGasLimit(),
        randomizer.headRerollCallbackGasLimit(),
        randomizer.spinCallbackGasLimit(),
    ]);

    console.log("=== VRF Quote Debugger ===");
    console.log(`Network: ${network.name}`);
    console.log(`Fregs: ${await fregs.getAddress()}`);
    console.log(`Randomizer: ${await randomizer.getAddress()}`);
    console.log(`Wrapper: ${await wrapper.getAddress()}`);
    console.log(`Current provider gasPrice: ${formatWei(networkGasPrice)}`);
    console.log(`Callback gas limits: mint=${mintGas}, claim=${claimGas}, reroll=${rerollGas}, spin=${spinGas}`);

    await printQuoteComparison("Mint", fregs, "quoteMintFee", wrapper, mintGas, networkGasPrice);
    await printQuoteComparison("Claim Item", items, "quoteClaimItemFee", wrapper, claimGas, networkGasPrice);
    await printQuoteComparison("Head Reroll", items, "quoteHeadRerollFee", wrapper, rerollGas, networkGasPrice);
    await printQuoteComparison("Spin", spin, "quoteSpinFee", wrapper, spinGas, networkGasPrice);

    if (txHash) {
        await inspectTransaction(txHash, fregs, wrapper);
    } else {
        console.log("\nPass DEBUG_TX_HASH=<hash> to inspect a specific failed transaction.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
