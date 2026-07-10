const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

function resolveSenderWallet() {
    const raw = process.env.SENDER_PRIVATE_KEY;
    if (!raw) {
        return null;
    }
    const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
    return new ethers.Wallet(normalized, ethers.provider);
}

async function main() {
    const to = process.env.TO;
    const itemTypeId = Number(process.env.ITEM_TYPE_ID);
    const count = process.env.COUNT ? Number(process.env.COUNT) : null;

    if (!to || !ethers.isAddress(to)) {
        throw new Error("Missing or invalid TO env var (recipient address)");
    }
    if (!Number.isInteger(itemTypeId) || itemTypeId < 0) {
        throw new Error("Missing or invalid ITEM_TYPE_ID env var");
    }
    if (count !== null && (!Number.isInteger(count) || count < 1)) {
        throw new Error("Invalid COUNT env var, must be a positive integer (omit to send all)");
    }

    const status = loadDeploymentStatus(network.name);
    if (!status.contracts?.fregsItems) {
        throw new Error(`Missing FregsItems in deployment-status-${network.name}.json`);
    }

    const senderWallet = resolveSenderWallet();
    const signer = senderWallet ?? (await ethers.getSigners())[0];
    const senderAddress = await signer.getAddress();

    const fregsItems = (await ethers.getContractAt("FregsItems", status.contracts.fregsItems)).connect(signer);

    const [tokenIds, types] = await fregsItems.getOwnedItems(senderAddress);
    const matching = [];
    for (let i = 0; i < tokenIds.length; i++) {
        if (Number(types[i]) === itemTypeId) {
            matching.push(Number(tokenIds[i]));
        }
    }

    const toSend = count === null ? matching : matching.slice(0, count);

    console.log("=".repeat(60));
    console.log(`Send Item Type ${itemTypeId}`);
    console.log("=".repeat(60));
    console.log(`Network:     ${network.name}`);
    console.log(`FregsItems:  ${status.contracts.fregsItems}`);
    console.log(`From:        ${senderAddress}`);
    console.log(`To:          ${to}`);
    console.log(`Owned of type ${itemTypeId}: ${matching.length}`);
    console.log(`Sending:     ${toSend.length}${count === null ? " (all)" : ""}`);
    console.log(`Token IDs:   ${toSend.join(", ") || "(none)"}`);

    if (toSend.length === 0) {
        console.log("\nNothing to send.");
        return;
    }
    if (count !== null && matching.length < count) {
        throw new Error(`Sender only owns ${matching.length} of item type ${itemTypeId}, requested ${count}`);
    }

    for (let i = 0; i < toSend.length; i++) {
        const tokenId = toSend[i];
        const tx = await fregsItems["safeTransferFrom(address,address,uint256)"](senderAddress, to, tokenId);
        const receipt = await tx.wait();
        console.log(`  [${i + 1}/${toSend.length}] tokenId ${tokenId} sent, tx ${receipt.hash}`);
    }

    console.log(`\nDone. Transferred ${toSend.length} item(s) of type ${itemTypeId}.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
