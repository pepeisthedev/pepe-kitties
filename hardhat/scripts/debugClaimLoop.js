const { ethers, network } = require("hardhat");

async function main() {
    console.log("=".repeat(60));
    console.log("Debug claimItem Loop - Mint & Claim until failure");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    const [deployer, user] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User:", user.address);

    // Get contract addresses from env or use deployed ones
    const fregsAddress = process.env.FREGS_ADDRESS;
    const fregsItemsAddress = process.env.FREGS_ITEMS_ADDRESS;
    const mintPassAddress = process.env.MINTPASS_ADDRESS;

    if (!fregsAddress || !fregsItemsAddress || !mintPassAddress) {
        console.error("\nSet env vars: FREGS_ADDRESS, FREGS_ITEMS_ADDRESS, MINTPASS_ADDRESS");
        process.exit(1);
    }

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);
    const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);
    const mintPass = await ethers.getContractAt("FregsMintPass", mintPassAddress);

    console.log("\nFregs:", fregsAddress);
    console.log("FregsItems:", fregsItemsAddress);
    console.log("MintPass:", mintPassAddress);

    // Check user has mint passes
    const mintPassBalance = await mintPass.balanceOf(user.address, 1);
    console.log("\nUser mint pass balance:", mintPassBalance.toString());

    if (mintPassBalance === 0n) {
        console.log("User has no mint passes. Minting some...");
        await (await mintPass.connect(deployer).ownerMint(user.address, 100)).wait();
        console.log("Minted 100 mint passes to user");
    }

    const MAX_ITERATIONS = 100;
    const COLORS = ["#7CB342", "#E53935", "#1E88E5", "#8E24AA", "#FB8C00", "#00ACC1"];
    const ITEM_TYPES = ["", "ColorChange", "HeadReroll", "BronzeSkin", "SilverSkin", "GoldSkin", "TreasureChest", "BeadPunk"];

    // Track claimed items
    const claimedCounts = {
        1: 0, // ColorChange
        2: 0, // HeadReroll
        3: 0, // BronzeSkin
        4: 0, // SilverSkin
        5: 0, // GoldSkin
        6: 0, // TreasureChest
        7: 0, // BeadPunk
    };
    let totalClaimed = 0;
    let failedAt = null;

    console.log("\n" + "=".repeat(60));
    console.log("Starting mint + claim loop (max", MAX_ITERATIONS, "iterations)");
    console.log("=".repeat(60));

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const color = COLORS[i % COLORS.length];
        console.log(`\n--- Iteration ${i + 1} ---`);

        // Mint a freg
        let fregId;
        try {
            console.log(`Minting freg with color ${color}...`);
            const mintTx = await mintPass.connect(user).mintFreg(color);
            const mintReceipt = await mintTx.wait();

            // Get the minted token ID from events
            const transferEvent = mintReceipt.logs.find(log => {
                try {
                    const parsed = fregs.interface.parseLog(log);
                    return parsed?.name === "Transfer";
                } catch { return false; }
            });

            if (transferEvent) {
                const parsed = fregs.interface.parseLog(transferEvent);
                fregId = parsed.args.tokenId;
                console.log(`  Minted freg #${fregId}`);
            } else {
                // Fallback: get from totalSupply
                const supply = await fregs.totalSupply();
                fregId = supply - 1n;
                console.log(`  Minted freg #${fregId} (from supply)`);
            }
        } catch (e) {
            console.log(`  MINT FAILED at iteration ${i + 1}:`, e.message);
            console.log("\n" + "=".repeat(60));
            console.log("FAILURE DETECTED - Mint failed");
            console.log("=".repeat(60));
            break;
        }

        // Claim item
        try {
            console.log(`Claiming item for freg #${fregId}...`);
            const claimTx = await fregsItems.connect(user).claimItem(fregId);
            const claimReceipt = await claimTx.wait();

            // Find what item was claimed
            const itemEvent = claimReceipt.logs.find(log => {
                try {
                    const parsed = fregsItems.interface.parseLog(log);
                    return parsed?.name === "ItemClaimed";
                } catch { return false; }
            });

            if (itemEvent) {
                const parsed = fregsItems.interface.parseLog(itemEvent);
                const itemTypeNum = Number(parsed.args.itemType);
                claimedCounts[itemTypeNum] = (claimedCounts[itemTypeNum] || 0) + 1;
                totalClaimed++;
                console.log(`  Claimed: ${ITEM_TYPES[itemTypeNum] || "Unknown"} (token #${parsed.args.itemTokenId})`);
            } else {
                console.log(`  Claimed item (no event parsed)`);
                totalClaimed++;
            }
        } catch (e) {
            console.log(`\n${"!".repeat(60)}`);
            console.log(`CLAIM FAILED at iteration ${i + 1} for freg #${fregId}`);
            console.log(`${"!".repeat(60)}`);
            console.log("\nError:", e.message);

            if (e.data) {
                console.log("Error data:", e.data);
            }

            // Additional debugging
            console.log("\n--- Debug Info ---");
            try {
                const owner = await fregs.ownerOf(fregId);
                console.log(`Freg #${fregId} owner:`, owner);
                console.log("User address:", user.address);
                console.log("Owner matches user?", owner.toLowerCase() === user.address.toLowerCase());
            } catch (e2) {
                console.log("Could not get owner:", e2.message);
            }

            try {
                const hasClaimed = await fregsItems.hasClaimed(fregId);
                console.log(`hasClaimed[${fregId}]:`, hasClaimed);
            } catch (e2) {
                console.log("Could not get hasClaimed:", e2.message);
            }

            try {
                const fregsOnItems = await fregsItems.fregs();
                console.log("fregsItems.fregs():", fregsOnItems);
            } catch (e2) {
                console.log("Could not get fregs:", e2.message);
            }

            try {
                const beadPunks = await fregsItems.beadPunksContract();
                console.log("beadPunksContract:", beadPunks);
                if (beadPunks !== ethers.ZeroAddress) {
                    const bp = await ethers.getContractAt("MockERC721", beadPunks);
                    const balance = await bp.balanceOf(fregsItemsAddress);
                    console.log("BeadPunks balance:", balance.toString());
                }
            } catch (e2) {
                console.log("Could not get beadPunks info:", e2.message);
            }

            console.log("\n" + "=".repeat(60));
            console.log("FAILURE DETECTED - Claim failed");
            console.log("=".repeat(60));
            failedAt = i + 1;
            break;
        }

        // Small delay to let state settle
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));

    if (failedAt) {
        console.log(`\nFailed at iteration: ${failedAt}`);
    } else {
        console.log(`\nCompleted all ${MAX_ITERATIONS} iterations successfully!`);
    }

    console.log(`\nTotal items claimed: ${totalClaimed}`);
    console.log("\nItems by type:");
    console.log("-".repeat(40));

    for (let type = 1; type <= 7; type++) {
        const count = claimedCounts[type] || 0;
        const percent = totalClaimed > 0 ? ((count / totalClaimed) * 100).toFixed(1) : "0.0";
        const bar = "█".repeat(Math.round(count / totalClaimed * 20)) || "";
        console.log(`  ${ITEM_TYPES[type].padEnd(14)} : ${String(count).padStart(3)} (${percent.padStart(5)}%) ${bar}`);
    }

    console.log("-".repeat(40));
    console.log(`  ${"TOTAL".padEnd(14)} : ${String(totalClaimed).padStart(3)} (100.0%)`);

    // Expected vs actual comparison
    console.log("\n" + "=".repeat(60));
    console.log("EXPECTED VS ACTUAL (based on weights)");
    console.log("=".repeat(60));

    const weights = {
        1: 4000,  // ColorChange 40%
        2: 3000,  // HeadReroll 30%
        3: 1500,  // BronzeSkin 15%
        4: 1000,  // SilverSkin 10%
        5: 500,   // GoldSkin 5%
        6: 50,    // TreasureChest 0.5%
        7: 100,   // BeadPunk 1%
    };
    const totalWeight = 10150; // Sum of all weights (including beadpunk and chest)

    console.log("\n  Type           Expected  Actual   Diff");
    console.log("-".repeat(45));

    for (let type = 1; type <= 7; type++) {
        const count = claimedCounts[type] || 0;
        const actualPercent = totalClaimed > 0 ? (count / totalClaimed) * 100 : 0;
        const expectedPercent = (weights[type] / totalWeight) * 100;
        const diff = actualPercent - expectedPercent;
        const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
        console.log(`  ${ITEM_TYPES[type].padEnd(14)} ${expectedPercent.toFixed(1).padStart(5)}%   ${actualPercent.toFixed(1).padStart(5)}%   ${diffStr.padStart(6)}%`);
    }

    console.log("\n" + "=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
