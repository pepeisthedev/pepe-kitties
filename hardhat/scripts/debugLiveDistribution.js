const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

const NONE = (1n << 256n) - 1n;
const PUBLIC_PHASE = 2;
const MAX_PARALLEL_WALLETS = 3;

const DEFAULT_MINT_COUNT = Number(process.env.MINT_COUNT || 1000);
const DEFAULT_SPIN_COUNT = Number(process.env.SPIN_COUNT || 1000);
const EVENT_TIMEOUT_MS = Number(process.env.VRF_EVENT_TIMEOUT_MS || 600000);
const EVENT_POLL_MS = Number(process.env.VRF_EVENT_POLL_MS || 4000);
const LOG_BLOCK_RANGE = Math.max(1, Math.min(10, Number(process.env.LOG_BLOCK_RANGE || 10)));
const ROUND_DELAY_MS = Number(process.env.ROUND_DELAY_MS || 1500);
const RPC_RETRY_ATTEMPTS = Number(process.env.RPC_RETRY_ATTEMPTS || 6);
const RPC_RETRY_BASE_MS = Number(process.env.RPC_RETRY_BASE_MS || 1500);
const AUTO_FUND_PARTICIPANTS = process.env.AUTO_FUND_PARTICIPANTS === "1";

const MINT_GAS_LIMIT = BigInt(process.env.MINT_GAS_LIMIT || "900000");
const CLAIM_GAS_LIMIT = BigInt(process.env.CLAIM_GAS_LIMIT || "800000");
const SPIN_GAS_LIMIT = BigInt(process.env.SPIN_GAS_LIMIT || "800000");
const ADMIN_GAS_LIMIT = BigInt(process.env.ADMIN_GAS_LIMIT || "250000");
const ESTIMATED_MINT_GAS_USED = BigInt(process.env.ESTIMATED_MINT_GAS_USED || "300000");
const ESTIMATED_CLAIM_GAS_USED = BigInt(process.env.ESTIMATED_CLAIM_GAS_USED || "280000");
const ESTIMATED_SPIN_GAS_USED = BigInt(process.env.ESTIMATED_SPIN_GAS_USED || "260000");

const VRF_FEE_BUFFER_BPS = 1500n;
const BPS_DENOMINATOR = 10000n;
const MIN_VRF_FEE_BUFFER_WEI = 1_000_000_000_000n;
const MIN_BALANCE_MARGIN_WEI = BigInt(process.env.MIN_BALANCE_MARGIN_WEI || "2000000000000000");

const PRIZE_TYPE_NAMES = {
    0: "Lose",
    1: "Mint Pass",
    2: "Item",
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPct(value) {
    return `${value.toFixed(2)}%`;
}

function formatEth(value) {
    return `${ethers.formatEther(value)} ETH`;
}

function formatCountPct(count, total) {
    if (total === 0) return "0.00%";
    return `${((count / total) * 100).toFixed(2)}%`;
}

function toNumberish(value) {
    return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function normalisePrivateKey(key) {
    if (!key) return null;
    return key.startsWith("0x") ? key : `0x${key}`;
}

function addVrfFeeBuffer(vrfFee) {
    const proportionalBuffer = (vrfFee * VRF_FEE_BUFFER_BPS + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR;
    const appliedBuffer = proportionalBuffer > MIN_VRF_FEE_BUFFER_WEI ? proportionalBuffer : MIN_VRF_FEE_BUFFER_WEI;
    return vrfFee + appliedBuffer;
}

function safeParseInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampWalletCount(requested, available) {
    if (available <= 0) {
        return 0;
    }
    return Math.max(1, Math.min(MAX_PARALLEL_WALLETS, requested, available));
}

function getColorForIndex(index) {
    const value = Number((BigInt(index + 1) * 2654435761n) % 0xffffffn);
    return `#${value.toString(16).padStart(6, "0")}`;
}

function makeLogKey(log) {
    const index = log.index ?? log.logIndex ?? 0;
    return `${log.transactionHash}-${index}`;
}

function isRateLimitError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
        message.includes("too many requests") ||
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("throttle")
    );
}

async function withRpcRetry(label, fn) {
    let lastError;

    for (let attempt = 1; attempt <= RPC_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!isRateLimitError(error) || attempt === RPC_RETRY_ATTEMPTS) {
                throw error;
            }

            const delayMs = RPC_RETRY_BASE_MS * (2 ** (attempt - 1));
            console.log(`  ${label}: RPC rate limit, retrying in ${delayMs}ms...`);
            await sleep(delayMs);
        }
    }

    throw lastError;
}

function safeParseLog(contract, log) {
    try {
        return contract.interface.parseLog(log);
    } catch {
        return null;
    }
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildTraitCatalog() {
    const traitsPath = path.join(__dirname, "..", "..", "website", "public", "frogz", "default", "traits.json");
    const traits = loadJson(traitsPath);

    const buildEntries = (entries) => {
        const result = [];
        let totalWeight = 0;

        for (const entry of entries) {
            const id = entry.isNone ? 0 : safeParseInt(String(entry.fileName || "0").replace(".svg", ""), 0);
            const weight = safeParseInt(entry.rarity ?? 0, 0);
            totalWeight += weight;
            result.push({
                id,
                name: entry.isNone ? "None" : entry.name,
                weight,
            });
        }

        return result.map((entry) => ({
            ...entry,
            expectedPct: totalWeight > 0 ? (entry.weight / totalWeight) * 100 : 0,
        }));
    };

    return {
        head: buildEntries(traits.head || []),
        mouth: buildEntries(traits.mouth || []),
        belly: buildEntries(traits.stomach || []),
    };
}

function buildLocalItemFallbackMap(chainId) {
    const itemsPath = path.join(__dirname, "..", "..", "website", "src", "config", "items.json");
    const dynamicItemsPath = path.join(__dirname, "..", "..", "website", "src", "config", "dynamic-items.json");

    const itemsJson = loadJson(itemsPath);
    const dynamicItemsJson = loadJson(dynamicItemsPath);
    const map = new Map();

    for (const item of itemsJson.items || []) {
        map.set(Number(item.id), item.name);
    }

    const chainBucket = dynamicItemsJson.byChainId?.[String(chainId)]?.items || [];
    for (const item of chainBucket) {
        map.set(Number(item.id), item.name);
    }

    return map;
}

async function callUint(contract, functionName, args = [], overrides = {}) {
    const data = contract.interface.encodeFunctionData(functionName, args);
    const contractAddress = contract.target || await contract.getAddress();
    const result = await withRpcRetry(`${functionName} call`, () => ethers.provider.call({
        to: contractAddress,
        data,
        ...overrides,
    }));
    return contract.interface.decodeFunctionResult(functionName, result)[0];
}

async function getQuoteGasPrice() {
    const feeData = await withRpcRetry("getFeeData", () => ethers.provider.getFeeData());
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

async function getItemTypeName(itemsContract, localFallbacks, cache, itemType) {
    const numericType = Number(itemType);
    if (cache.has(numericType)) {
        return cache.get(numericType);
    }

    let resolved = localFallbacks.get(numericType) || `Item ${numericType}`;

    try {
        const config = await withRpcRetry(
            `itemTypeConfigs(${numericType})`,
            () => itemsContract.itemTypeConfigs(numericType)
        );
        if (config?.name && String(config.name).length > 0) {
            resolved = config.name;
        }
    } catch {
        // Fall back to local manifest name when on-chain lookup is unavailable.
    }

    cache.set(numericType, resolved);
    return resolved;
}

function buildWalletStates(signersOrWallets) {
    return Promise.all(signersOrWallets.map(async (signerLike, index) => {
        const address = signerLike.address || await signerLike.getAddress();
        return {
            index,
            signer: signerLike,
            address,
            nextNonce: null,
        };
    }));
}

async function syncNonceState(walletState) {
    const pendingNonce = await withRpcRetry(
        `getTransactionCount(${walletState.address})`,
        () => ethers.provider.getTransactionCount(walletState.address, "pending")
    );
    if (walletState.nextNonce === null || pendingNonce > walletState.nextNonce) {
        walletState.nextNonce = pendingNonce;
    }
    return walletState.nextNonce;
}

async function waitForReceiptWithRetry(tx) {
    let lastError;

    for (let attempt = 1; attempt <= RPC_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await tx.wait();
        } catch (error) {
            lastError = error;
            if (!isRateLimitError(error) || attempt === RPC_RETRY_ATTEMPTS) {
                throw error;
            }

            const delayMs = RPC_RETRY_BASE_MS * (2 ** (attempt - 1));
            console.log(`  wait(${tx.hash}): RPC rate limit, retrying in ${delayMs}ms...`);
            await sleep(delayMs);
        }
    }

    throw lastError;
}

async function sendTx(walletState, sendFn, txOptions) {
    let lastError;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
        const nonce = await syncNonceState(walletState);

        try {
            const tx = await withRpcRetry(
                `send tx from ${walletState.address}`,
                () => sendFn({
                    ...txOptions,
                    nonce,
                })
            );
            walletState.nextNonce = nonce + 1;
            const receipt = await waitForReceiptWithRetry(tx);
            return { tx, receipt };
        } catch (error) {
            lastError = error;
            const message = String(error?.message || error);
            if (
                message.includes("nonce too low") ||
                message.includes("already known") ||
                message.includes("replacement transaction underpriced")
            ) {
                walletState.nextNonce = await withRpcRetry(
                    `resync nonce ${walletState.address}`,
                    () => ethers.provider.getTransactionCount(walletState.address, "pending")
                );
                await sleep(1200);
                continue;
            }

            if (isRateLimitError(error)) {
                const delayMs = RPC_RETRY_BASE_MS * (2 ** (attempt - 1));
                await sleep(delayMs);
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}

async function collectMatchingEvents({
    contract,
    filter,
    fromBlock,
    wantedCount,
    label,
    match,
}) {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    const found = [];
    const seen = new Set();
    let nextFromBlock = Number(fromBlock);

    while (Date.now() < deadline && found.length < wantedCount) {
        const latestBlock = await withRpcRetry("getBlockNumber", () => ethers.provider.getBlockNumber());

        if (nextFromBlock <= latestBlock) {
            for (let startBlock = nextFromBlock; startBlock <= latestBlock && found.length < wantedCount; startBlock += LOG_BLOCK_RANGE) {
                const endBlock = Math.min(startBlock + LOG_BLOCK_RANGE - 1, latestBlock);
                const logs = await withRpcRetry(
                    `queryFilter ${label} ${startBlock}-${endBlock}`,
                    () => contract.queryFilter(filter, startBlock, endBlock)
                );

                for (const log of logs) {
                    const parsed = safeParseLog(contract, log);
                    if (!parsed) {
                        continue;
                    }

                    const key = makeLogKey(log);
                    if (seen.has(key)) {
                        continue;
                    }

                    if (!match({ log, parsed })) {
                        continue;
                    }

                    seen.add(key);
                    found.push({ log, parsed });

                    if (found.length >= wantedCount) {
                        break;
                    }
                }
            }

            nextFromBlock = latestBlock + 1;
        }

        if (found.length < wantedCount) {
            await sleep(EVENT_POLL_MS);
        }
    }

    if (found.length < wantedCount) {
        console.log(`  Warning: ${label} timed out after collecting ${found.length}/${wantedCount} fulfillments.`);
    }

    return found;
}

function countBy(items, getKey) {
    const counts = new Map();
    for (const item of items) {
        const key = getKey(item);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function printComparisonTable(title, rows, totalCount) {
    console.log(`\n${"=".repeat(90)}`);
    console.log(title);
    console.log(`${"=".repeat(90)}`);
    console.log(`  Total samples: ${totalCount}`);
    console.log("  Name".padEnd(32) + "Expected".padStart(12) + "Observed".padStart(12) + "Count".padStart(10) + "Diff".padStart(12));

    for (const row of rows) {
        const expected = formatPct(row.expectedPct);
        const observed = formatPct(row.observedPct);
        const diff = `${row.observedPct - row.expectedPct >= 0 ? "+" : ""}${(row.observedPct - row.expectedPct).toFixed(2)}%`;
        console.log(
            `  ${row.name.padEnd(30)}${expected.padStart(14)}${observed.padStart(12)}${String(row.count).padStart(10)}${diff.padStart(12)}`
        );
    }
}

function buildRows(expectedEntries, observedCounts, totalCount) {
    return expectedEntries.map((entry) => {
        const count = observedCounts.get(entry.id) || 0;
        const observedPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
        return {
            name: entry.name,
            expectedPct: entry.expectedPct,
            observedPct,
            count,
        };
    });
}

async function resolveParticipantSigners(ownerSigner) {
    const privateKeysEnv = process.env.STATS_PRIVATE_KEYS || process.env.DEBUG_STATS_PRIVATE_KEYS || "";
    const requestedWalletCount = clampWalletCount(
        Number(process.env.WALLET_COUNT || MAX_PARALLEL_WALLETS),
        MAX_PARALLEL_WALLETS
    );

    let participants;

    if (privateKeysEnv.trim()) {
        const rawKeys = privateKeysEnv
            .split(",")
            .map((key) => normalisePrivateKey(key.trim()))
            .filter(Boolean);

        const wallets = [];
        const seen = new Set();
        for (const key of rawKeys) {
            const wallet = new ethers.Wallet(key, ethers.provider);
            const address = wallet.address.toLowerCase();
            if (!seen.has(address)) {
                seen.add(address);
                wallets.push(wallet);
            }
        }
        participants = wallets.slice(0, Math.min(requestedWalletCount, MAX_PARALLEL_WALLETS));
    } else {
        const availableSigners = await ethers.getSigners();
        participants = availableSigners.slice(0, Math.min(requestedWalletCount, MAX_PARALLEL_WALLETS));
    }

    if (participants.length === 0) {
        participants = [ownerSigner];
    }

    return buildWalletStates(participants.slice(0, MAX_PARALLEL_WALLETS));
}

function distributeCounts(total, walletStates) {
    const counts = new Map();
    for (const walletState of walletStates) {
        counts.set(walletState.address.toLowerCase(), 0);
    }
    for (let i = 0; i < total; i += 1) {
        const walletState = walletStates[i % walletStates.length];
        counts.set(walletState.address.toLowerCase(), counts.get(walletState.address.toLowerCase()) + 1);
    }
    return counts;
}

async function estimateParticipantCosts({ walletStates, mintPrice, fregs, items, spin, mintCount, spinCount }) {
    const gasPrice = await getQuoteGasPrice();
    const bufferedMintFee = addVrfFeeBuffer(await readGasAwareQuote(fregs, "quoteMintFee", gasPrice));
    const bufferedClaimFee = addVrfFeeBuffer(await readGasAwareQuote(items, "quoteClaimItemFee", gasPrice));
    const bufferedSpinFee = addVrfFeeBuffer(await readGasAwareQuote(spin, "quoteSpinFee", gasPrice));

    const mintSplit = distributeCounts(mintCount, walletStates);
    const spinSplit = distributeCounts(spinCount, walletStates);

    console.log("\nEstimated contract payments per participant at current gas price");
    console.log("  This excludes normal network gas and assumes every requested mint is later claimed.");

    for (const walletState of walletStates) {
        const walletMintCount = mintSplit.get(walletState.address.toLowerCase()) || 0;
        const walletSpinCount = spinSplit.get(walletState.address.toLowerCase()) || 0;
        const contractValue =
            BigInt(walletMintCount) * (mintPrice + bufferedMintFee) +
            BigInt(walletMintCount) * bufferedClaimFee +
            BigInt(walletSpinCount) * bufferedSpinFee;

        console.log(
            `  ${walletState.address}: ` +
            `${walletMintCount} mints, ${walletMintCount} claims, ${walletSpinCount} spins -> ${formatEth(contractValue)}`
        );
    }

    return {
        gasPrice,
        bufferedMintFee,
        bufferedClaimFee,
        bufferedSpinFee,
    };
}

async function ensureOwner(contract, ownerSigner) {
    const currentOwner = (await contract.owner()).toLowerCase();
    const signerAddress = (ownerSigner.address || await ownerSigner.getAddress()).toLowerCase();
    if (currentOwner !== signerAddress) {
        throw new Error(`Owner signer mismatch. Contract owner is ${currentOwner}, signer is ${signerAddress}`);
    }
}

async function sendJobsInRounds(jobs, walletStates, handler) {
    const results = [];

    for (let i = 0; i < jobs.length; i += walletStates.length) {
        const batch = jobs.slice(i, i + walletStates.length);
        const settled = await Promise.allSettled(batch.map((job) => handler(job)));

        for (let j = 0; j < settled.length; j += 1) {
            const outcome = settled[j];
            const job = batch[j];
            if (outcome.status === "fulfilled") {
                results.push({
                    ...job,
                    ok: true,
                    ...outcome.value,
                });
            } else {
                results.push({
                    ...job,
                    ok: false,
                    error: outcome.reason,
                });
            }
        }

        if (i + walletStates.length < jobs.length) {
            await sleep(ROUND_DELAY_MS);
        }
    }

    return results;
}

async function ensureParticipantFunding({
    ownerSigner,
    ownerWalletState,
    walletStates,
    mintCount,
    spinCount,
    mintPrice,
    gasPrice,
    bufferedMintFee,
    bufferedClaimFee,
    bufferedSpinFee,
}) {
    const mintSplit = distributeCounts(mintCount, walletStates);
    const spinSplit = distributeCounts(spinCount, walletStates);
    const shortages = [];

    console.log("\nRequired balance per participant before starting");

    for (const walletState of walletStates) {
        const walletMintCount = BigInt(mintSplit.get(walletState.address.toLowerCase()) || 0);
        const walletSpinCount = BigInt(spinSplit.get(walletState.address.toLowerCase()) || 0);
        const mintSingleSubmissionCost = mintPrice + bufferedMintFee + (gasPrice * MINT_GAS_LIMIT);
        const claimSingleSubmissionCost = bufferedClaimFee + (gasPrice * CLAIM_GAS_LIMIT);
        const spinSingleSubmissionCost = bufferedSpinFee + (gasPrice * SPIN_GAS_LIMIT);
        const estimatedMintCost = mintPrice + bufferedMintFee + (gasPrice * ESTIMATED_MINT_GAS_USED);
        const estimatedClaimCost = bufferedClaimFee + (gasPrice * ESTIMATED_CLAIM_GAS_USED);
        const estimatedSpinCost = bufferedSpinFee + (gasPrice * ESTIMATED_SPIN_GAS_USED);
        const estimatedRunCost =
            walletMintCount * estimatedMintCost +
            walletMintCount * estimatedClaimCost +
            walletSpinCount * estimatedSpinCost;
        let minimumSingleTxRequirement = 0n;

        if (walletMintCount > 0n) {
            minimumSingleTxRequirement = mintSingleSubmissionCost;
        }
        if (walletMintCount > 0n && claimSingleSubmissionCost > minimumSingleTxRequirement) {
            minimumSingleTxRequirement = claimSingleSubmissionCost;
        }
        if (walletSpinCount > 0n && spinSingleSubmissionCost > minimumSingleTxRequirement) {
            minimumSingleTxRequirement = spinSingleSubmissionCost;
        }

        const requiredBalance = estimatedRunCost + minimumSingleTxRequirement +
            MIN_BALANCE_MARGIN_WEI;
        const balance = await withRpcRetry(
            `getBalance(${walletState.address})`,
            () => ethers.provider.getBalance(walletState.address)
        );

        const shortfall = requiredBalance > balance ? requiredBalance - balance : 0n;
        console.log(
            `  ${walletState.address}: required=${formatEth(requiredBalance)} current=${formatEth(balance)} shortfall=${formatEth(shortfall)}`
        );

        if (shortfall > 0n) {
            shortages.push({
                walletState,
                shortfall,
            });
        }
    }

    if (shortages.length === 0) {
        return;
    }

    if (!AUTO_FUND_PARTICIPANTS) {
        throw new Error(
            "Participant wallets are underfunded for this run.\n" +
            shortages.map((entry) => `${entry.walletState.address} short by ${formatEth(entry.shortfall)}`).join("\n") +
            "\nFund them manually or rerun with AUTO_FUND_PARTICIPANTS=1"
        );
    }

    console.log("\nAuto-funding participant wallets from the owner signer...");

    for (const shortage of shortages) {
        if (shortage.walletState.address.toLowerCase() === ownerWalletState.address.toLowerCase()) {
            throw new Error(`Owner signer is underfunded by ${formatEth(shortage.shortfall)}; auto-funding cannot fix that.`);
        }

        await sendTx(
            ownerWalletState,
            (txOptions) => ownerSigner.sendTransaction({
                to: shortage.walletState.address,
                value: shortage.shortfall,
                ...txOptions,
            }),
            {
                gasLimit: 21000n,
            }
        );
    }
}

async function main() {
    if (network.name === "base" && process.env.ALLOW_MAINNET_STATS !== "1") {
        throw new Error("Refusing to run on base mainnet without ALLOW_MAINNET_STATS=1");
    }

    const mintCount = safeParseInt(DEFAULT_MINT_COUNT, 1000);
    const spinCount = safeParseInt(DEFAULT_SPIN_COUNT, 1000);

    const status = loadDeploymentStatus(network.name);
    if (!status.contracts?.fregs || !status.contracts?.fregsItems || !status.contracts?.spinTheWheel || !status.contracts?.fregsMintPass) {
        throw new Error(`Missing required addresses in deployment-status-${network.name}.json`);
    }

    const [ownerSigner] = await ethers.getSigners();
    const ownerWalletState = (await buildWalletStates([ownerSigner]))[0];
    const participantWalletStates = await resolveParticipantSigners(ownerSigner);

    const chainId = Number((await ethers.provider.getNetwork()).chainId);

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const items = await ethers.getContractAt("FregsItems", status.contracts.fregsItems);
    const spin = await ethers.getContractAt("SpinTheWheel", status.contracts.spinTheWheel);
    const mintPass = await ethers.getContractAt("FregsMintPass", status.contracts.fregsMintPass);

    await ensureOwner(fregs, ownerSigner);
    await ensureOwner(items, ownerSigner);
    await ensureOwner(spin, ownerSigner);
    await ensureOwner(mintPass, ownerSigner);

    const mintPrice = await fregs.mintPrice();
    const originalMintPhase = Number(await fregs.mintPhase());
    const totalMintedBefore = Number(await fregs.totalMinted());
    const supply = Number(await fregs.supply());
    const pendingMintCount = Number(await fregs.pendingMintCount());
    const availableSupply = supply - totalMintedBefore - pendingMintCount;

    if (availableSupply < mintCount) {
        throw new Error(`Not enough mint supply left. Requested ${mintCount}, available ${availableSupply}`);
    }

    const traitCatalog = buildTraitCatalog();
    const localItemFallbacks = buildLocalItemFallbackMap(chainId);
    const itemNameCache = new Map();

    console.log("=== Live Distribution Debugger ===");
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${chainId}`);
    console.log(`Fregs: ${await fregs.getAddress()}`);
    console.log(`FregsItems: ${await items.getAddress()}`);
    console.log(`SpinTheWheel: ${await spin.getAddress()}`);
    console.log(`MintPass: ${await mintPass.getAddress()}`);
    console.log(`Parallel participant wallets: ${participantWalletStates.length} (max ${MAX_PARALLEL_WALLETS})`);
    console.log(`Mint count: ${mintCount}`);
    console.log(`Spin count: ${spinCount}`);
    console.log(`Event timeout: ${EVENT_TIMEOUT_MS} ms`);
    console.log(`Log block range: ${LOG_BLOCK_RANGE}`);

    for (const walletState of participantWalletStates) {
        const balance = await withRpcRetry(
            `getBalance(${walletState.address})`,
            () => ethers.provider.getBalance(walletState.address)
        );
        console.log(`  Participant ${walletState.index + 1}: ${walletState.address} balance=${formatEth(balance)}`);
    }

    const fundingEstimate = await estimateParticipantCosts({
        walletStates: participantWalletStates,
        mintPrice,
        fregs,
        items,
        spin,
        mintCount,
        spinCount,
    });

    await ensureParticipantFunding({
        ownerSigner,
        ownerWalletState,
        walletStates: participantWalletStates,
        mintCount,
        spinCount,
        mintPrice,
        gasPrice: fundingEstimate.gasPrice,
        bufferedMintFee: fundingEstimate.bufferedMintFee,
        bufferedClaimFee: fundingEstimate.bufferedClaimFee,
        bufferedSpinFee: fundingEstimate.bufferedSpinFee,
    });

    const claimChestRemainingAtStart = Number(await items.getRemainingClaimChests());
    const claimWeights = [
        { id: 6, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 6), weight: Number(await items.treasureChestWeight()) },
        { id: 1, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 1), weight: Number(await items.colorChangeWeight()) },
        { id: 2, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 2), weight: Number(await items.headRerollWeight()) },
        { id: 4, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 4), weight: Number(await items.metalSkinWeight()) },
        { id: 5, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 5), weight: Number(await items.goldSkinWeight()) },
        { id: 8, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 8), weight: Number(await items.diamondSkinWeight()) },
        { id: 11, name: await getItemTypeName(items, localItemFallbacks, itemNameCache, 11), weight: Number(await items.boneWeight()) },
    ];

    const claimWeightsEffective = claimWeights.filter((entry) => claimChestRemainingAtStart > 0 || entry.id !== 6);
    const totalClaimWeight = claimWeightsEffective.reduce((sum, entry) => sum + entry.weight, 0);
    const claimExpectedEntries = claimWeightsEffective.map((entry) => ({
        id: entry.id,
        name: entry.name,
        expectedPct: totalClaimWeight > 0 ? (entry.weight / totalClaimWeight) * 100 : 0,
    }));

    const loseWeight = Number(await spin.loseWeight());
    const mintPassWeight = Number(await spin.mintPassWeight());
    const [spinPrizeTypes, spinPrizeWeights] = await spin.getAllItemPrizes();
    const spinExpectedEntries = [
        { id: "lose", name: "Lose", expectedPct: 0, rawWeight: loseWeight, remainingSupply: null },
        { id: "mintpass", name: "Mint Pass", expectedPct: 0, rawWeight: mintPassWeight, remainingSupply: null },
    ];

    let spinTotalWeight = loseWeight + mintPassWeight;

    for (let i = 0; i < spinPrizeTypes.length; i += 1) {
        const itemType = Number(spinPrizeTypes[i]);
        const weight = Number(spinPrizeWeights[i]);
        const remainingSupply = await spin.getRemainingItemSupply(itemType);
        const remainingSupplyNumber = remainingSupply === ethers.MaxUint256 ? null : Number(remainingSupply);
        const name = await getItemTypeName(items, localItemFallbacks, itemNameCache, itemType);

        if (remainingSupplyNumber === 0) {
            spinExpectedEntries[1].rawWeight += weight;
        } else {
            spinExpectedEntries.push({
                id: itemType,
                name,
                expectedPct: 0,
                rawWeight: weight,
                remainingSupply: remainingSupplyNumber,
            });
        }
        spinTotalWeight += weight;
    }

    for (const entry of spinExpectedEntries) {
        entry.expectedPct = spinTotalWeight > 0 ? (entry.rawWeight / spinTotalWeight) * 100 : 0;
    }

    const warnings = [];
    const chestEntry = claimExpectedEntries.find((entry) => entry.id === 6);
    if (chestEntry && mintCount > 0 && claimChestRemainingAtStart > 0) {
        const configuredChestHits = (mintCount * chestEntry.expectedPct) / 100;
        if (configuredChestHits > claimChestRemainingAtStart) {
            warnings.push(
                `Claim chest cap can skew results: expected ~${configuredChestHits.toFixed(2)} chests from ${mintCount} claims, but only ${claimChestRemainingAtStart} chest claims remain.`
            );
        }
    }

    for (const entry of spinExpectedEntries) {
        if (typeof entry.id === "number" && entry.remainingSupply !== null) {
            const configuredHits = (spinCount * entry.expectedPct) / 100;
            if (configuredHits > entry.remainingSupply) {
                warnings.push(
                    `Spin prize cap can skew ${entry.name}: expected ~${configuredHits.toFixed(2)} hits from ${spinCount} spins, but only ${entry.remainingSupply} prizes remain.`
                );
            }
        }
    }

    const mintJobs = [];
    for (let i = 0; i < mintCount; i += 1) {
        const walletState = participantWalletStates[i % participantWalletStates.length];
        mintJobs.push({
            type: "mint",
            jobIndex: i,
            walletState,
            color: getColorForIndex(i),
        });
    }

    const spinJobs = [];
    for (let i = 0; i < spinCount; i += 1) {
        const walletState = participantWalletStates[i % participantWalletStates.length];
        spinJobs.push({
            type: "spin",
            jobIndex: i,
            walletState,
        });
    }

    const mintRequestStartBlock = (await withRpcRetry("getBlockNumber", () => ethers.provider.getBlockNumber())) + 1;
    const mintExpectedKeys = new Map();

    let mintResults;
    try {
        if (originalMintPhase !== PUBLIC_PHASE) {
            console.log(`\nSetting mint phase to Public (${PUBLIC_PHASE})...`);
            await sendTx(
                ownerWalletState,
                (txOptions) => fregs.connect(ownerSigner).setMintPhase(PUBLIC_PHASE, txOptions),
                {
                    gasLimit: ADMIN_GAS_LIMIT,
                }
            );
        }

        console.log(`\nSubmitting ${mintJobs.length} mint requests...`);
        mintResults = await sendJobsInRounds(mintJobs, participantWalletStates, async (job) => {
            const gasPrice = await getQuoteGasPrice();
            const mintFee = await readGasAwareQuote(fregs, "quoteMintFee", gasPrice);
            const totalValue = mintPrice + addVrfFeeBuffer(mintFee);
            const connected = fregs.connect(job.walletState.signer);
            const { receipt } = await sendTx(
                job.walletState,
                (txOptions) => connected.mint(job.color, txOptions),
                {
                    value: totalValue,
                    gasLimit: MINT_GAS_LIMIT,
                }
            );

            const key = `${job.walletState.address.toLowerCase()}:${job.color.toLowerCase()}`;
            mintExpectedKeys.set(key, {
                owner: job.walletState.address,
                color: job.color.toLowerCase(),
                requestBlock: receipt.blockNumber,
            });

            return {
                requestBlock: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                sentValue: totalValue,
            };
        });
    } finally {
        if (Number(await fregs.mintPhase()) !== originalMintPhase) {
            console.log(`\nRestoring mint phase to ${originalMintPhase}...`);
            await sendTx(
                ownerWalletState,
                (txOptions) => fregs.connect(ownerSigner).setMintPhase(originalMintPhase, txOptions),
                {
                    gasLimit: ADMIN_GAS_LIMIT,
                }
            );
        }
    }

    const mintSuccesses = mintResults.filter((result) => result.ok);
    const mintFailures = mintResults.filter((result) => !result.ok);

    for (const failure of mintFailures) {
        console.log(`  Mint ${failure.jobIndex}: FAILED - ${String(failure.error?.message || failure.error).slice(0, 280)}`);
    }

    console.log(`Mint requests accepted: ${mintSuccesses.length}/${mintJobs.length}`);
    console.log("Waiting for mint fulfillments...");

    const mintFulfillments = await collectMatchingEvents({
        contract: fregs,
        filter: fregs.filters.FregMinted(),
        fromBlock: mintRequestStartBlock,
        wantedCount: mintSuccesses.length,
        label: "mint fulfillments",
        match: ({ parsed }) => {
            const owner = String(parsed.args.owner).toLowerCase();
            const color = String(parsed.args.bodyColor).toLowerCase();
            return mintExpectedKeys.has(`${owner}:${color}`);
        },
    });

    const mintedRecords = mintFulfillments.map(({ parsed }) => ({
        tokenId: Number(parsed.args.tokenId),
        owner: String(parsed.args.owner).toLowerCase(),
        color: String(parsed.args.bodyColor).toLowerCase(),
        head: Number(parsed.args.head),
        mouth: parsed.args.mouth === NONE ? 0 : Number(parsed.args.mouth),
        belly: parsed.args.belly === NONE ? 0 : Number(parsed.args.belly),
    }));

    const mintedTokenIds = new Set(mintedRecords.map((record) => record.tokenId));
    const claimJobs = mintedRecords.map((record, index) => ({
        type: "claim",
        jobIndex: index,
        tokenId: record.tokenId,
        owner: record.owner,
        walletState: participantWalletStates.find((walletState) => walletState.address.toLowerCase() === record.owner),
    })).filter((job) => job.walletState);

    const claimRequestStartBlock = (await withRpcRetry("getBlockNumber", () => ethers.provider.getBlockNumber())) + 1;
    const claimExpectedKeys = new Set(claimJobs.map((job) => `${job.owner}:${job.tokenId}`));

    console.log(`\nSubmitting ${claimJobs.length} item-claim requests...`);
    const claimResults = await sendJobsInRounds(claimJobs, participantWalletStates, async (job) => {
        const gasPrice = await getQuoteGasPrice();
        const claimFee = await readGasAwareQuote(items, "quoteClaimItemFee", gasPrice);
        const connected = items.connect(job.walletState.signer);
        const { receipt } = await sendTx(
            job.walletState,
            (txOptions) => connected.claimItem(job.tokenId, txOptions),
            {
                value: addVrfFeeBuffer(claimFee),
                gasLimit: CLAIM_GAS_LIMIT,
            }
        );

        return {
            requestBlock: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
        };
    });

    const claimSuccesses = claimResults.filter((result) => result.ok);
    const claimFailures = claimResults.filter((result) => !result.ok);

    for (const failure of claimFailures) {
        console.log(`  Claim token ${failure.tokenId}: FAILED - ${String(failure.error?.message || failure.error).slice(0, 280)}`);
    }

    console.log(`Claim requests accepted: ${claimSuccesses.length}/${claimJobs.length}`);
    console.log("Waiting for item-claim fulfillments...");

    const claimFulfillments = await collectMatchingEvents({
        contract: items,
        filter: items.filters.ItemClaimed(),
        fromBlock: claimRequestStartBlock,
        wantedCount: claimSuccesses.length,
        label: "claim fulfillments",
        match: ({ parsed }) => {
            const owner = String(parsed.args.owner).toLowerCase();
            const tokenId = Number(parsed.args.fregId);
            return claimExpectedKeys.has(`${owner}:${tokenId}`);
        },
    });

    const claimedRecords = [];
    for (const { parsed } of claimFulfillments) {
        const itemType = Number(parsed.args.itemType);
        claimedRecords.push({
            fregId: Number(parsed.args.fregId),
            itemTokenId: Number(parsed.args.itemTokenId),
            owner: String(parsed.args.owner).toLowerCase(),
            itemType,
            name: await getItemTypeName(items, localItemFallbacks, itemNameCache, itemType),
        });
    }

    const spinsPerWallet = distributeCounts(spinCount, participantWalletStates);
    console.log(`\nMinting SpinTokens for ${spinCount} spins...`);
    for (const walletState of participantWalletStates) {
        const amount = spinsPerWallet.get(walletState.address.toLowerCase()) || 0;
        if (amount === 0) {
            continue;
        }
        await sendTx(
            ownerWalletState,
            (txOptions) => spin.connect(ownerSigner).ownerMint(walletState.address, amount, txOptions),
            {
                gasLimit: ADMIN_GAS_LIMIT,
            }
        );
    }

    const spinRequestStartBlock = (await withRpcRetry("getBlockNumber", () => ethers.provider.getBlockNumber())) + 1;
    const participantAddressSet = new Set(participantWalletStates.map((walletState) => walletState.address.toLowerCase()));

    console.log(`\nSubmitting ${spinJobs.length} spin requests...`);
    const spinResults = await sendJobsInRounds(spinJobs, participantWalletStates, async (job) => {
        const gasPrice = await getQuoteGasPrice();
        const spinFee = await readGasAwareQuote(spin, "quoteSpinFee", gasPrice);
        const connected = spin.connect(job.walletState.signer);
        const { receipt } = await sendTx(
            job.walletState,
            (txOptions) => connected.spin(txOptions),
            {
                value: addVrfFeeBuffer(spinFee),
                gasLimit: SPIN_GAS_LIMIT,
            }
        );

        return {
            requestBlock: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
        };
    });

    const spinSuccesses = spinResults.filter((result) => result.ok);
    const spinFailures = spinResults.filter((result) => !result.ok);

    for (const failure of spinFailures) {
        console.log(`  Spin ${failure.jobIndex}: FAILED - ${String(failure.error?.message || failure.error).slice(0, 280)}`);
    }

    console.log(`Spin requests accepted: ${spinSuccesses.length}/${spinJobs.length}`);
    console.log("Waiting for spin fulfillments...");

    const spinFulfillments = await collectMatchingEvents({
        contract: spin,
        filter: spin.filters.SpinResult(),
        fromBlock: spinRequestStartBlock,
        wantedCount: spinSuccesses.length,
        label: "spin fulfillments",
        match: ({ parsed }) => participantAddressSet.has(String(parsed.args.player).toLowerCase()),
    });

    const spinRecords = [];
    for (const { parsed } of spinFulfillments) {
        const prizeType = Number(parsed.args.prizeType);
        const itemType = Number(parsed.args.itemType);
        spinRecords.push({
            player: String(parsed.args.player).toLowerCase(),
            won: Boolean(parsed.args.won),
            prizeType,
            itemType,
            prizeName: prizeType === 0
                ? "Lose"
                : prizeType === 1
                    ? "Mint Pass"
                    : await getItemTypeName(items, localItemFallbacks, itemNameCache, itemType),
        });
    }

    const observedHeadCounts = countBy(mintedRecords, (record) => record.head);
    const observedMouthCounts = countBy(mintedRecords, (record) => record.mouth);
    const observedBellyCounts = countBy(mintedRecords, (record) => record.belly);
    const observedClaimCounts = countBy(claimedRecords, (record) => record.itemType);
    const observedSpinCounts = new Map();

    for (const record of spinRecords) {
        const key = record.prizeType === 2 ? record.itemType : record.prizeType === 1 ? "mintpass" : "lose";
        observedSpinCounts.set(key, (observedSpinCounts.get(key) || 0) + 1);
    }

    const headRows = buildRows(traitCatalog.head, observedHeadCounts, mintedRecords.length);
    const mouthRows = buildRows(traitCatalog.mouth, observedMouthCounts, mintedRecords.length);
    const bellyRows = buildRows(traitCatalog.belly, observedBellyCounts, mintedRecords.length);
    const claimRows = claimExpectedEntries.map((entry) => {
        const count = observedClaimCounts.get(entry.id) || 0;
        const observedPct = claimedRecords.length > 0 ? (count / claimedRecords.length) * 100 : 0;
        return {
            name: entry.name,
            expectedPct: entry.expectedPct,
            observedPct,
            count,
        };
    });
    const spinRows = spinExpectedEntries.map((entry) => {
        const count = observedSpinCounts.get(entry.id) || 0;
        const observedPct = spinRecords.length > 0 ? (count / spinRecords.length) * 100 : 0;
        return {
            name: entry.name,
            expectedPct: entry.expectedPct,
            observedPct,
            count,
        };
    });

    console.log("\nSummary");
    console.log(`  Mint requests: ${mintSuccesses.length} accepted, ${mintFailures.length} failed`);
    console.log(`  Mint fulfillments: ${mintedRecords.length}`);
    console.log(`  Claim requests: ${claimSuccesses.length} accepted, ${claimFailures.length} failed`);
    console.log(`  Claim fulfillments: ${claimedRecords.length}`);
    console.log(`  Spin requests: ${spinSuccesses.length} accepted, ${spinFailures.length} failed`);
    console.log(`  Spin fulfillments: ${spinRecords.length}`);
    console.log(`  Starting total minted: ${totalMintedBefore}`);
    console.log(`  Highest minted token captured: ${mintedRecords.length > 0 ? Math.max(...mintedRecords.map((record) => record.tokenId)) : "n/a"}`);

    printComparisonTable("HEAD TRAITS", headRows, mintedRecords.length);
    printComparisonTable("MOUTH TRAITS", mouthRows, mintedRecords.length);
    printComparisonTable("BELLY TRAITS", bellyRows, mintedRecords.length);
    printComparisonTable("CLAIMED ITEMS", claimRows, claimedRecords.length);
    printComparisonTable("SPIN RESULTS", spinRows, spinRecords.length);

    if (warnings.length > 0) {
        console.log(`\n${"=".repeat(90)}`);
        console.log("Warnings");
        console.log(`${"=".repeat(90)}`);
        for (const warning of warnings) {
            console.log(`  - ${warning}`);
        }
    }

    console.log(`\n${"=".repeat(90)}`);
    console.log("Notes");
    console.log(`${"=".repeat(90)}`);
    console.log("  - Mint trait expectations come from website/public/frogz/default/traits.json.");
    console.log("  - Claim and spin expectations come from the currently deployed on-chain weights.");
    console.log("  - Spin results are cleanest when run from dedicated test wallets with no other pending spins.");
    console.log(`  - Parallel wallets used: ${participantWalletStates.length} / ${MAX_PARALLEL_WALLETS}.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
