const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const NONE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

async function main() {
    const status = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployment-status.json"), "utf8"));
    const [deployer] = await ethers.getSigners();

    const fregs = await ethers.getContractAt("Fregs", status.contracts.fregs);
    const mintPass = await ethers.getContractAt("FregsMintPass", status.contracts.fregsMintPass);

    // Mint extra passes for testing
    console.log("Minting 20 extra passes for testing...");
    await (await mintPass.ownerMint(deployer.address, 20, { gasLimit: 200000n })).wait();

    const balance = await mintPass.balanceOf(deployer.address, 1);
    console.log(`Mint passes: ${balance}`);

    // Mint via MintPass with HIGH fixed gas limit
    console.log("\n--- Minting via MintPass with fixed gasLimit 500000 ---");
    for (let i = 0; i < 10; i++) {
        try {
            const tx = await mintPass.mintFreg("#ff5733", { gasLimit: 500000n });
            const receipt = await tx.wait();
            // Parse FregMinted event from logs
            const event = receipt.logs.find(l => {
                try { return fregs.interface.parseLog(l)?.name === "FregMinted"; } catch { return false; }
            });
            const parsed = event ? fregs.interface.parseLog(event) : null;
            if (parsed) {
                const [tokenId, , , h, m, b] = parsed.args;
                console.log(`  Mint ${i}: OK (gas: ${receipt.gasUsed}) token=${tokenId} head=${h} mouth=${m === NONE ? "NONE" : m} belly=${b === NONE ? "NONE" : b}`);
            } else {
                console.log(`  Mint ${i}: OK (gas: ${receipt.gasUsed}) [no event parsed]`);
            }
        } catch (e) {
            console.log(`  Mint ${i}: FAILED - ${e.message.slice(0, 300)}`);
        }
    }

    // Direct mint with fixed gas
    console.log("\n--- Direct mint with fixed gasLimit 500000 ---");
    const mintPrice = await fregs.mintPrice();
    for (let i = 0; i < 10; i++) {
        try {
            const tx = await fregs.mint("#33ff57", { value: mintPrice, gasLimit: 500000n });
            const receipt = await tx.wait();
            const event = receipt.logs.find(l => {
                try { return fregs.interface.parseLog(l)?.name === "FregMinted"; } catch { return false; }
            });
            const parsed = event ? fregs.interface.parseLog(event) : null;
            if (parsed) {
                const [tokenId, , , h, m, b] = parsed.args;
                console.log(`  Mint ${i}: OK (gas: ${receipt.gasUsed}) token=${tokenId} head=${h} mouth=${m === NONE ? "NONE" : m} belly=${b === NONE ? "NONE" : b}`);
            } else {
                console.log(`  Mint ${i}: OK (gas: ${receipt.gasUsed}) [no event parsed]`);
            }
        } catch (e) {
            console.log(`  Mint ${i}: FAILED - ${e.message.slice(0, 300)}`);
        }
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
