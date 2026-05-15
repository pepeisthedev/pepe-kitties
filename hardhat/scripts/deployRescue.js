/* eslint-disable no-console */
// Burns nonces on Ethereum until the deployer hits TARGET_NONCE, then deploys
// FregsRescue via CREATE so it lands at the stuck address. Finally calls
// sweep() to pull the stuck ETH out.
//
// Run against mainnet only after checkRescueFeasibility.js confirms it's safe.
//
// Required env:
//   ETH_RPC_URL
//   DEPLOYER_PRIVATE_KEY          must be the same EOA that deployed Fregs on Base
//   TARGET_NONCE                  nonce where FregsRescue must deploy
//   EXPECTED_ADDRESS              the stuck address; tx aborts if CREATE math disagrees
//   RESCUE_RECIPIENT              where to send the swept ETH
//   DRY_RUN=1                     (optional) print the plan, send nothing
//
// Usage:
//   ETH_RPC_URL=... DEPLOYER_PRIVATE_KEY=0x... TARGET_NONCE=42 \
//     EXPECTED_ADDRESS=0x... RESCUE_RECIPIENT=0x... \
//     DRY_RUN=1 node scripts/deployRescue.js

const { ethers } = require("ethers");
const hre = require("hardhat");

const ETH_RPC_URL = process.env.ETH_RPC_URL;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const TARGET_NONCE = process.env.TARGET_NONCE !== undefined ? Number(process.env.TARGET_NONCE) : NaN;
const EXPECTED_ADDRESS = process.env.EXPECTED_ADDRESS;
const RESCUE_RECIPIENT = process.env.RESCUE_RECIPIENT;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function requireEnv(name, value) {
    if (!value) {
        console.error(`Missing env: ${name}`);
        process.exit(1);
    }
}

requireEnv("ETH_RPC_URL", ETH_RPC_URL);
requireEnv("DEPLOYER_PRIVATE_KEY", DEPLOYER_PRIVATE_KEY);
requireEnv("EXPECTED_ADDRESS", EXPECTED_ADDRESS);
requireEnv("RESCUE_RECIPIENT", RESCUE_RECIPIENT);
if (!Number.isInteger(TARGET_NONCE) || TARGET_NONCE < 0) {
    console.error("TARGET_NONCE must be a non-negative integer");
    process.exit(1);
}

async function main() {
    const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
    const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

    const net = await provider.getNetwork();
    if (Number(net.chainId) !== 1) {
        console.error(`Expected Ethereum mainnet (chainId 1), got ${net.chainId}`);
        process.exit(1);
    }

    const predicted = ethers.getCreateAddress({ from: wallet.address, nonce: TARGET_NONCE });
    if (predicted.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
        console.error(`CREATE math does not match.`);
        console.error(`  deployer:        ${wallet.address}`);
        console.error(`  target nonce:    ${TARGET_NONCE}`);
        console.error(`  predicted addr:  ${predicted}`);
        console.error(`  expected addr:   ${EXPECTED_ADDRESS}`);
        process.exit(1);
    }

    const [currentNonce, stuckBalance, gasPrice, deployerBalance, codeAtTarget] = await Promise.all([
        provider.getTransactionCount(wallet.address),
        provider.getBalance(EXPECTED_ADDRESS),
        provider.getFeeData(),
        provider.getBalance(wallet.address),
        provider.getCode(EXPECTED_ADDRESS),
    ]);

    if (codeAtTarget !== "0x") {
        console.error("Target address already has code on Ethereum. Aborting.");
        process.exit(1);
    }

    console.log("Deployer:             ", wallet.address);
    console.log("Deployer balance:     ", ethers.formatEther(deployerBalance), "ETH");
    console.log("Current nonce:        ", currentNonce);
    console.log("Target nonce:         ", TARGET_NONCE);
    console.log("Nonces to burn:       ", Math.max(0, TARGET_NONCE - currentNonce));
    console.log("Stuck balance:        ", ethers.formatEther(stuckBalance), "ETH");
    console.log("Predicted rescue addr:", predicted);
    console.log("Recipient:            ", RESCUE_RECIPIENT);
    console.log("");

    if (currentNonce > TARGET_NONCE) {
        console.error("Current nonce is already past target. Cannot reach this address via CREATE.");
        process.exit(1);
    }

    if (DRY_RUN) {
        console.log("DRY_RUN set. Exiting without sending any transactions.");
        return;
    }

    // 1) Burn nonces with no-op self-transfers (0 value, empty data)
    while (true) {
        const nonce = await provider.getTransactionCount(wallet.address);
        if (nonce >= TARGET_NONCE) break;
        console.log(`Burning nonce ${nonce} (need to reach ${TARGET_NONCE})...`);
        const tx = await wallet.sendTransaction({
            to: wallet.address,
            value: 0n,
            nonce,
        });
        await tx.wait(1);
    }

    // 2) Deploy FregsRescue at TARGET_NONCE
    const nonceNow = await provider.getTransactionCount(wallet.address);
    if (nonceNow !== TARGET_NONCE) {
        console.error(`Nonce drifted: expected ${TARGET_NONCE}, got ${nonceNow}. Aborting.`);
        process.exit(1);
    }

    const artifact = await hre.artifacts.readArtifact("FregsRescue");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    console.log(`Deploying FregsRescue at nonce ${TARGET_NONCE}...`);
    const rescue = await factory.deploy(wallet.address, { nonce: TARGET_NONCE });
    await rescue.waitForDeployment();
    const rescueAddress = await rescue.getAddress();

    if (rescueAddress.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
        console.error(`Rescue deployed at ${rescueAddress}, expected ${EXPECTED_ADDRESS}. Aborting sweep.`);
        process.exit(1);
    }
    console.log("Rescue deployed at:", rescueAddress);

    // 3) Sweep
    console.log("Sweeping...");
    const sweepTx = await rescue.sweep(RESCUE_RECIPIENT);
    const receipt = await sweepTx.wait(1);
    console.log("Sweep tx:", receipt.hash);

    const after = await provider.getBalance(rescueAddress);
    console.log("Remaining balance at rescue:", ethers.formatEther(after), "ETH");
    void gasPrice;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
