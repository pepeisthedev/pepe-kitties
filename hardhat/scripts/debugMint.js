const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const NONE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const WHITELIST_PHASE = 1;
const PUBLIC_PHASE = 2;
const MINT_COUNT = 30;
const EXTRA_PASSES = 20;
const MINT_GAS_LIMIT = 800000n;
const CLAIM_GAS_LIMIT = 700000n;
const EVENT_TIMEOUT_MS = Number(process.env.VRF_EVENT_TIMEOUT_MS || 180000);
const EVENT_POLL_MS = Number(process.env.VRF_EVENT_POLL_MS || 3000);

const ITEM_NAMES = {
    1: "Color Change",
    2: "Head Reroll",
    4: "Robot",
    5: "Gold Skin",
    6: "Treasure Chest",
    8: "Diamond Skin",
    9: "Hoodie",
    10: "Frogsuit",
    11: "Bone",
};

function parseEvent(receipt, contract, eventName) {
    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog(log);
            if (parsed?.name === eventName) {
                return parsed;
            }
        } catch {
            // Ignore non-matching logs
        }
    }
    return null;
}

function formatTrait(value) {
    return value === NONE ? "NONE" : value;
}

function formatWei(value) {
    return `${ethers.formatEther(value)} ETH`;
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callUint(contract, functionName, args = [], overrides = {}) {
    const data = contract.interface.encodeFunctionData(functionName, args);
    const result = await ethers.provider.call({
        to: await contract.getAddress(),
        data,
        ...overrides,
    });
    return contract.interface.decodeFunctionResult(functionName, result)[0];
}

async function getTxGasPrice() {
    const feeData = await ethers.provider.getFeeData();
    const candidates = [feeData.gasPrice, feeData.maxFeePerGas].filter(
        (value) => typeof value === "bigint" && value > 0n
    );

    if (candidates.length === 0) {
        return 1n;
    }

    return candidates.reduce((max, value) => value > max ? value : max);
}

async function readGasAwareQuote(contract, functionName, gasPrice) {
    return callUint(contract, functionName, [], { gasPrice });
}

async function waitForEvent({ contract, filter, fromBlock, description, match }) {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    let nextFromBlock = Number(fromBlock);

    while (Date.now() < deadline) {
        const latestBlock = await ethers.provider.getBlockNumber();
        const logs = await contract.queryFilter(filter, nextFromBlock, latestBlock);

        for (const log of logs) {
            if (!match || match(log)) {
                return log;
            }
        }

        nextFromBlock = latestBlock + 1;
        await sleep(EVENT_POLL_MS);
    }

    throw new Error(`Timed out waiting for ${description}`);
}

async function syncNonceState(nonceState) {
    const pendingNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
    if (pendingNonce > nonceState.nextNonce) {
        nonceState.nextNonce = pendingNonce;
    }
    return nonceState.nextNonce;
}

async function sendTx(sendFn, txOptions, nonceState) {
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const nonce = await syncNonceState(nonceState);

        try {
            const tx = await sendFn({
                ...txOptions,
                nonce,
            });
            nonceState.nextNonce = nonce + 1;
            const receipt = await tx.wait();
            return { tx, receipt };
        } catch (error) {
            lastError = error;
            const message = String(error?.message || error);

            if (
                message.includes("nonce too low") ||
                message.includes("already known") ||
                message.includes("replacement transaction underpriced")
            ) {
                nonceState.nextNonce = await ethers.provider.getTransactionCount(nonceState.address, "pending");
                await sleep(1000);
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}

async function mintBatch({ count, deployer, fregs, label, mintPrice, needsMintPrice, color, mintedTokenIds, nonceState }) {
    console.log(`\n--- ${label} ---`);

    for (let i = 0; i < count; i++) {
        try {
            const gasPrice = await getTxGasPrice();
            const vrfFee = await readGasAwareQuote(fregs, "quoteMintFee", gasPrice);
            const totalValue = needsMintPrice ? mintPrice + vrfFee : vrfFee;
            const { receipt } = await sendTx(
                (txOptions) => fregs.mint(color, txOptions),
                {
                    value: totalValue,
                    gasLimit: MINT_GAS_LIMIT,
                    gasPrice,
                },
                nonceState
            );

            let parsed = parseEvent(receipt, fregs, "FregMinted");
            if (!parsed) {
                const mintEvent = await waitForEvent({
                    contract: fregs,
                    filter: fregs.filters.FregMinted(null, deployer.address),
                    fromBlock: receipt.blockNumber,
                    description: `FregMinted for mint ${i}`,
                });
                parsed = mintEvent;
            }

            if (!parsed) {
                console.log(`  Mint ${i}: OK (gas: ${receipt.gasUsed}) [no FregMinted event parsed]`);
                continue;
            }

            const tokenId = Number(parsed.args.tokenId);
            const head = parsed.args.head;
            const mouth = parsed.args.mouth;
            const belly = parsed.args.belly;

            mintedTokenIds.push(tokenId);
            console.log(
                `  Mint ${i}: OK (gas: ${receipt.gasUsed}) fee=${formatWei(vrfFee)} token=${tokenId} head=${head} mouth=${formatTrait(mouth)} belly=${formatTrait(belly)}`
            );
        } catch (error) {
            console.log(`  Mint ${i}: FAILED - ${String(error.message || error).slice(0, 300)}`);
        }
    }
}

async function main() {
    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const mintPass = await ethers.getContractAt("FregsMintPass", status.contracts.fregsMintPass);
    const fregsItems = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const nonceState = {
        address: deployer.address,
        nextNonce: await ethers.provider.getTransactionCount(deployer.address, "pending"),
    };

    const originalMintPhase = Number(await fregs.mintPhase());
    const mintPrice = await fregs.mintPrice();
    const initialGasPrice = await getTxGasPrice();
    const mintVrfFee = await readGasAwareQuote(fregs, "quoteMintFee", initialGasPrice);
    const claimVrfFee = await readGasAwareQuote(fregsItems, "quoteClaimItemFee", initialGasPrice);

    console.log(`Network: ${network.name}`);
    console.log(`Mint price: ${ethers.formatEther(mintPrice)} ETH`);
    console.log(`Current tx gas price: ${initialGasPrice} wei`);
    console.log(`Mint VRF fee: ${ethers.formatEther(mintVrfFee)} ETH`);
    console.log(`Claim VRF fee: ${ethers.formatEther(claimVrfFee)} ETH`);

    console.log(`Minting ${EXTRA_PASSES} extra passes for testing...`);
    await sendTx(
        (txOptions) => mintPass.ownerMint(deployer.address, EXTRA_PASSES, txOptions),
        {
            gasLimit: 200000n,
            gasPrice: initialGasPrice,
        },
        nonceState
    );

    const balance = await mintPass.balanceOf(deployer.address, 1);
    console.log(`Mint passes: ${balance}`);

    const mintedTokenIds = [];

    try {
        console.log("\nSetting mint phase to Whitelist (1)...");
        await sendTx(
            (txOptions) => fregs.setMintPhase(WHITELIST_PHASE, txOptions),
            {
                gasLimit: 200000n,
                gasPrice: await getTxGasPrice(),
            },
            nonceState
        );

        await mintBatch({
            count: MINT_COUNT,
            color: "#ff5733",
            deployer,
            fregs,
            label: `Minting via MintPass in whitelist phase with gasLimit ${MINT_GAS_LIMIT}`,
            mintPrice,
            needsMintPrice: true,
            mintedTokenIds,
            nonceState,
        });

        console.log("\nSetting mint phase to Public (2)...");
        await sendTx(
            (txOptions) => fregs.setMintPhase(PUBLIC_PHASE, txOptions),
            {
                gasLimit: 200000n,
                gasPrice: await getTxGasPrice(),
            },
            nonceState
        );

        await mintBatch({
            count: MINT_COUNT,
            color: "#33ff57",
            deployer,
            fregs,
            label: `Direct public mint with gasLimit ${MINT_GAS_LIMIT}`,
            mintPrice,
            needsMintPrice: true,
            mintedTokenIds,
            nonceState,
        });
    } finally {
        if (Number(await fregs.mintPhase()) !== originalMintPhase) {
            console.log(`\nRestoring mint phase to ${originalMintPhase}...`);
            await sendTx(
                (txOptions) => fregs.setMintPhase(originalMintPhase, txOptions),
                {
                    gasLimit: 200000n,
                    gasPrice: await getTxGasPrice(),
                },
                nonceState
            );
        }
    }

    console.log(`\n--- Claiming items for ${mintedTokenIds.length} fregs ---`);
    const claimCounts = {};

    for (const tokenId of mintedTokenIds) {
        try {
            const gasPrice = await getTxGasPrice();
            const vrfFee = await readGasAwareQuote(fregsItems, "quoteClaimItemFee", gasPrice);
            const { receipt } = await sendTx(
                (txOptions) => fregsItems.claimItem(tokenId, txOptions),
                {
                    value: vrfFee,
                    gasLimit: CLAIM_GAS_LIMIT,
                    gasPrice,
                },
                nonceState
            );

            let parsed = parseEvent(receipt, fregsItems, "ItemClaimed");
            if (!parsed) {
                const claimEvent = await waitForEvent({
                    contract: fregsItems,
                    filter: fregsItems.filters.ItemClaimed(tokenId, null, deployer.address),
                    fromBlock: receipt.blockNumber,
                    description: `ItemClaimed for Freg #${tokenId}`,
                });
                parsed = claimEvent;
            }

            if (!parsed) {
                console.log(`  Freg #${tokenId}: claimed (gas: ${receipt.gasUsed}) [no ItemClaimed event parsed]`);
                continue;
            }

            const itemType = Number(parsed.args.itemType);
            const name = ITEM_NAMES[itemType] || `Unknown(${itemType})`;
            claimCounts[name] = (claimCounts[name] || 0) + 1;
            console.log(`  Freg #${tokenId}: ${name} (gas: ${receipt.gasUsed}, fee=${formatWei(vrfFee)})`);
        } catch (error) {
            console.log(`  Freg #${tokenId}: FAILED - ${String(error.message || error).slice(0, 300)}`);
        }
    }

    console.log("\n--- Claim Summary ---");
    if (mintedTokenIds.length === 0) {
        console.log("  No fregs minted, nothing to summarize.");
        return;
    }

    const sorted = Object.entries(claimCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
        const pct = ((count / mintedTokenIds.length) * 100).toFixed(1);
        console.log(`  ${name}: ${count} (${pct}%)`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
