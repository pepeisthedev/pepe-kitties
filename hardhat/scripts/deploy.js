const { ethers, network, run } = require("hardhat");

// ============ CONFIGURATION ============
const VERIFY_CONTRACTS = true; // Set to false to skip contract verification
const BEAD_PUNKS_TO_MINT = 5;  // Number of mock BeadPunks to mint on testnet
const MAINNET_BEAD_PUNKS_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: Set actual BeadPunks contract address on mainnet

async function main() {
    console.log("=".repeat(60));
    console.log("Pepe Kitties Deployment Script");
    console.log("=".repeat(60));

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
        console.error("\nError: No wallet configured for this network!");
        console.error("Make sure you have set the private key in your .env file:");
        console.error("  - For baseSepolia: BASE_SEPOLIA_PRIVATE_KEY=your_private_key");
        console.error("  - For base mainnet: BASE_PRIVATE_KEY=your_private_key");
        console.error("\nThe private key can be with or without '0x' prefix.");
        process.exit(1);
    }

    const [deployer] = signers;
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();

    console.log("\nNetwork:", network.name);
    console.log("Chain ID:", networkInfo.chainId.toString());
    console.log("Deployer:", deployerAddress);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "ETH");
    console.log("Verify Contracts:", VERIFY_CONTRACTS);

    const isTestnet = network.name === "localhost" || network.name === "hardhat" || network.name === "baseSepolia";
    const isMainnet = network.name === "base";

    // Configuration
    const ROYALTY_RECEIVER = deployerAddress;
    const ROYALTY_FEE = 500; // 5% (500/10000)

    // ============ Deploy MockERC721 (BeadPunks) on testnet ============
    let beadPunksAddress = null;
    let beadPunksContract = null;

    if (isTestnet) {
        console.log("\n--- Deploying MockERC721 (BeadPunks) ---");
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        beadPunksContract = await MockERC721.deploy("Bead Punks", "BEADPUNK");
        await beadPunksContract.waitForDeployment();
        beadPunksAddress = await beadPunksContract.getAddress();
        console.log("MockERC721 (BeadPunks) deployed to:", beadPunksAddress);

        if (network.name === "baseSepolia") {
            console.log("Waiting for confirmations...");
            await beadPunksContract.deploymentTransaction()?.wait(2);
        }
    } else if (isMainnet) {
        beadPunksAddress = MAINNET_BEAD_PUNKS_ADDRESS;
        console.log("\n--- Using existing BeadPunks contract ---");
        console.log("BeadPunks address:", beadPunksAddress);
    }

    // ============ Deploy PepeKitties ============
    console.log("\n--- Deploying PepeKitties ---");
    const PepeKitties = await ethers.getContractFactory("PepeKitties");
    const pepeKitties = await PepeKitties.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Pepe Kitties",
        "PEPEKITTY"
    );
    await pepeKitties.waitForDeployment();
    const pepeKittiesAddress = await pepeKitties.getAddress();
    console.log("PepeKitties deployed to:", pepeKittiesAddress);

    // Wait for confirmations on live networks
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await pepeKitties.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy PepeKittiesItems ============
    console.log("\n--- Deploying PepeKittiesItems ---");
    const PepeKittiesItems = await ethers.getContractFactory("PepeKittiesItems");
    const pepeKittiesItems = await PepeKittiesItems.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Pepe Kitties Items",
        "PEPEKITTYITEM",
        pepeKittiesAddress
    );
    await pepeKittiesItems.waitForDeployment();
    const pepeKittiesItemsAddress = await pepeKittiesItems.getAddress();
    console.log("PepeKittiesItems deployed to:", pepeKittiesItemsAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await pepeKittiesItems.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy PepeKittiesMintPass ============
    console.log("\n--- Deploying PepeKittiesMintPass ---");
    const PepeKittiesMintPass = await ethers.getContractFactory("PepeKittiesMintPass");
    const pepeKittiesMintPass = await PepeKittiesMintPass.deploy("");
    await pepeKittiesMintPass.waitForDeployment();
    const pepeKittiesMintPassAddress = await pepeKittiesMintPass.getAddress();
    console.log("PepeKittiesMintPass deployed to:", pepeKittiesMintPassAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await pepeKittiesMintPass.deploymentTransaction()?.wait(2);
    }

    // ============ Configure Cross-Contract References ============
    console.log("\n--- Configuring Cross-Contract References ---");

    console.log("Setting items contract on PepeKitties...");
    await (await pepeKitties.setItemsContract(pepeKittiesItemsAddress)).wait();

    console.log("Setting mint pass contract on PepeKitties...");
    await (await pepeKitties.setMintPassContract(pepeKittiesMintPassAddress)).wait();

    console.log("Setting PepeKitties on MintPass...");
    await (await pepeKittiesMintPass.setPepeKitties(pepeKittiesAddress)).wait();

    // ============ Configure BeadPunks ============
    if (beadPunksAddress && beadPunksAddress !== "0x0000000000000000000000000000000000000000") {
        console.log("\n--- Configuring BeadPunks ---");
        console.log("Setting BeadPunks contract on PepeKittiesItems...");
        await (await pepeKittiesItems.setBeadPunksContract(beadPunksAddress)).wait();

        // On testnet, mint BeadPunks and transfer to Items contract
        if (isTestnet && beadPunksContract) {
            console.log(`Minting ${BEAD_PUNKS_TO_MINT} BeadPunks to deployer...`);
            const mintedTokenIds = [];
            for (let i = 0; i < BEAD_PUNKS_TO_MINT; i++) {
                const tx = await beadPunksContract.mint(deployerAddress);
                const receipt = await tx.wait();
                mintedTokenIds.push(i);
                console.log(`  Minted BeadPunk #${i}`);
            }

            console.log(`Transferring ${BEAD_PUNKS_TO_MINT} BeadPunks to PepeKittiesItems contract...`);
            for (const tokenId of mintedTokenIds) {
                const tx = await beadPunksContract["safeTransferFrom(address,address,uint256)"](
                    deployerAddress,
                    pepeKittiesItemsAddress,
                    tokenId
                );
                await tx.wait();
                console.log(`  Transferred BeadPunk #${tokenId}`);
            }

            // Verify BeadPunks are in Items contract
            const beadPunksInContract = await pepeKittiesItems.getAvailableBeadPunks();
            console.log(`BeadPunks in Items contract: ${beadPunksInContract}`);
        }
    } else if (isMainnet) {
        console.log("\n--- WARNING: BeadPunks not configured ---");
        console.log("Set MAINNET_BEAD_PUNKS_ADDRESS in deploy script and call:");
        console.log(`  await pepeKittiesItems.setBeadPunksContract("0x...")`);
    }

    console.log("\nCross-contract references configured!");

    // ============ Verify Contracts (if enabled and not localhost) ============
    if (VERIFY_CONTRACTS && network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contracts on Basescan ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Verify MockERC721 (BeadPunks) on testnet
        if (isTestnet && beadPunksAddress) {
            try {
                console.log("Verifying MockERC721 (BeadPunks)...");
                await run("verify:verify", {
                    address: beadPunksAddress,
                    constructorArguments: ["Bead Punks", "BEADPUNK"]
                });
                console.log("MockERC721 (BeadPunks) verified!");
            } catch (error) {
                console.log("MockERC721 verification failed:", error.message);
            }
        }

        // Verify PepeKitties
        try {
            console.log("Verifying PepeKitties...");
            await run("verify:verify", {
                address: pepeKittiesAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Pepe Kitties", "PEPEKITTY"]
            });
            console.log("PepeKitties verified!");
        } catch (error) {
            console.log("PepeKitties verification failed:", error.message);
        }

        // Verify PepeKittiesItems
        try {
            console.log("Verifying PepeKittiesItems...");
            await run("verify:verify", {
                address: pepeKittiesItemsAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Pepe Kitties Items", "PEPEKITTYITEM", pepeKittiesAddress]
            });
            console.log("PepeKittiesItems verified!");
        } catch (error) {
            console.log("PepeKittiesItems verification failed:", error.message);
        }

        // Verify PepeKittiesMintPass
        try {
            console.log("Verifying PepeKittiesMintPass...");
            await run("verify:verify", {
                address: pepeKittiesMintPassAddress,
                constructorArguments: [""]
            });
            console.log("PepeKittiesMintPass verified!");
        } catch (error) {
            console.log("PepeKittiesMintPass verification failed:", error.message);
        }
    } else if (!VERIFY_CONTRACTS) {
        console.log("\n--- Skipping Contract Verification (VERIFY_CONTRACTS = false) ---");
    }

    // ============ Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("\nNetwork:", network.name);
    console.log("\nContract Addresses:");
    console.log("  PepeKitties:        ", pepeKittiesAddress);
    console.log("  PepeKittiesItems:   ", pepeKittiesItemsAddress);
    console.log("  PepeKittiesMintPass:", pepeKittiesMintPassAddress);
    if (beadPunksAddress) {
        console.log("  BeadPunks:          ", beadPunksAddress, isTestnet ? "(Mock)" : "(Mainnet)");
    }
    console.log("\nConfiguration:");
    console.log("  Royalty Receiver:", ROYALTY_RECEIVER);
    console.log("  Royalty Fee:", ROYALTY_FEE / 100, "%");
    if (isTestnet && beadPunksAddress) {
        const beadPunksInContract = await pepeKittiesItems.getAvailableBeadPunks();
        console.log("  BeadPunks in Items Contract:", beadPunksInContract.toString());
    }
    console.log("\nNext Steps:");
    console.log("  1. Deploy SVG Renderer contract");
    console.log("  2. Call pepeKitties.setSVGRenderer(rendererAddress)");
    console.log("  3. Fund items contract for chest rewards:");
    console.log("     await pepeKittiesItems.depositETH({ value: ethers.parseEther('0.5') })");
    console.log("  4. Activate mint pass sale:");
    console.log("     await pepeKittiesMintPass.setMintPassSaleActive(true)");
    if (isMainnet && (!beadPunksAddress || beadPunksAddress === "0x0000000000000000000000000000000000000000")) {
        console.log("  5. Set BeadPunks contract (mainnet):");
        console.log("     await pepeKittiesItems.setBeadPunksContract('0x...')");
    }
    console.log("\n" + "=".repeat(60));

    // Output for .env file
    console.log("\nFor .env file:");
    console.log(`VITE_PEPE_KITTIES_ADDRESS=${pepeKittiesAddress}`);
    console.log(`VITE_PEPE_KITTIES_ITEMS_ADDRESS=${pepeKittiesItemsAddress}`);
    console.log(`VITE_PEPE_KITTIES_MINTPASS_ADDRESS=${pepeKittiesMintPassAddress}`);
    if (beadPunksAddress) {
        console.log(`VITE_BEAD_PUNKS_ADDRESS=${beadPunksAddress}`);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
