const { ethers, network } = require("hardhat");
const { loadDeploymentStatus } = require("./deploymentStatus");

function resolveBuyerWallet() {
    const raw = process.env.BUYER_PRIVATE_KEY;
    if (!raw) {
        throw new Error("BUYER_PRIVATE_KEY env var is required");
    }
    const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
    return new ethers.Wallet(normalized, ethers.provider);
}

async function buildPermit(fregCoin, fregShopAddress, buyer, price) {
    const buyerAddress = await buyer.getAddress();
    const [eip712Domain, nonce, block, fregCoinAddress] = await Promise.all([
        fregCoin.eip712Domain(),
        fregCoin.nonces(buyerAddress),
        ethers.provider.getBlock("latest"),
        fregCoin.getAddress(),
    ]);

    const nowOnChain = Number(block.timestamp);
    const nowWallClock = Math.floor(Date.now() / 1000);
    const deadline = Math.max(nowOnChain, nowWallClock) + 3600;

    const domain = {
        name: eip712Domain.name,
        version: eip712Domain.version,
        chainId: eip712Domain.chainId,
        verifyingContract: fregCoinAddress,
    };
    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };
    const value = {
        owner: buyerAddress,
        spender: fregShopAddress,
        value: price,
        nonce,
        deadline,
    };

    const rawSig = await buyer.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(rawSig);
    return { deadline, v, r, s };
}

async function main() {
    const itemTypeId = Number(process.env.ITEM_TYPE_ID);
    const count = process.env.COUNT ? Number(process.env.COUNT) : 1;

    if (!Number.isInteger(itemTypeId) || itemTypeId < 0) {
        throw new Error("Missing or invalid ITEM_TYPE_ID env var");
    }
    if (!Number.isInteger(count) || count < 1) {
        throw new Error("Invalid COUNT env var, must be a positive integer");
    }

    const status = loadDeploymentStatus(network.name);
    if (!status.contracts?.fregShop || !status.contracts?.fregCoin) {
        throw new Error(`Missing FregShop/FregCoin in deployment-status-${network.name}.json`);
    }

    const buyer = resolveBuyerWallet();
    const buyerAddress = await buyer.getAddress();

    const fregCoin = await ethers.getContractAt("FregCoin", status.contracts.fregCoin);
    const fregShop = await ethers.getContractAt("FregShop", status.contracts.fregShop);
    const fregShopAddress = await fregShop.getAddress();

    const price = await fregShop.getPrice(itemTypeId);
    const totalCost = price * BigInt(count);
    const balance = await fregCoin.balanceOf(buyerAddress);

    console.log("=".repeat(60));
    console.log(`Buy Shop Item ${itemTypeId} x ${count}`);
    console.log("=".repeat(60));
    console.log(`Network:    ${network.name}`);
    console.log(`Buyer:      ${buyerAddress}`);
    console.log(`Shop:       ${fregShopAddress}`);
    console.log(`Unit price: ${ethers.formatEther(price)} FREG`);
    console.log(`Total cost: ${ethers.formatEther(totalCost)} FREG`);
    console.log(`Balance:    ${ethers.formatEther(balance)} FREG`);

    if (balance < totalCost) {
        throw new Error(
            `Insufficient FREG balance. Need ${ethers.formatEther(totalCost - balance)} more.`
        );
    }

    const fregShopAsBuyer = fregShop.connect(buyer);

    for (let i = 1; i <= count; i++) {
        const { deadline, v, r, s } = await buildPermit(fregCoin, fregShopAddress, buyer, price);
        const tx = await fregShopAsBuyer.buyItem(itemTypeId, deadline, v, r, s);
        const receipt = await tx.wait();
        console.log(`  [${i}/${count}] bought, tx ${receipt.hash}`);
    }

    const finalBalance = await fregCoin.balanceOf(buyerAddress);
    console.log(`\nDone. Buyer FREG balance: ${ethers.formatEther(finalBalance)} FREG`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
