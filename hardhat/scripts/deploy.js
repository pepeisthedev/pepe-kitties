const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ CONFIGURATION ============
const VERIFY_CONTRACTS = true; // Set to false to skip contract verification
const BEAD_PUNKS_TO_MINT = 5;  // Number of mock BeadPunks to mint on testnet
const MINT_PASSES_TO_MINT = 2; // Number of mint passes to mint to deployer
const ADDITIONAL_MINTPASS_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Also mint passes to this address (for testing)
const MAINNET_BEAD_PUNKS_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: Set actual BeadPunks contract address on mainnet

// Path to website ABIs folder (relative to hardhat folder)
const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");

// Copy ABI from artifacts to website
function copyABI(contractName, targetFileName) {
    try {
        const artifactPath = path.join(
            __dirname,
            `../artifacts/contracts/${contractName}.sol/${contractName}.json`
        );
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        const targetPath = path.join(WEBSITE_ABI_PATH, `${targetFileName}.json`);

        fs.writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));
        console.log(`  Copied ${contractName} ABI to ${targetFileName}.json`);
    } catch (error) {
        console.error(`  Failed to copy ${contractName} ABI:`, error.message);
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Deployment Script");
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

    // ============ Deploy Fregs ============
    console.log("\n--- Deploying Fregs ---");
    const Fregs = await ethers.getContractFactory("Fregs");
    const fregs = await Fregs.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Fregs",
        "FREG"
    );
    await fregs.waitForDeployment();
    const fregsAddress = await fregs.getAddress();
    console.log("Fregs deployed to:", fregsAddress);

    // Wait for confirmations on live networks
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregs.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy FregsItems ============
    console.log("\n--- Deploying Fregs Items ---");
    const FregsItems = await ethers.getContractFactory("FregsItems");
    const fregsItems = await FregsItems.deploy(
        ROYALTY_RECEIVER,
        ROYALTY_FEE,
        "Fregs Items",
        "FREGITEM",
        fregsAddress
    );
    await fregsItems.waitForDeployment();
    const fregsItemsAddress = await fregsItems.getAddress();
    console.log("Fregs Items deployed to:", fregsItemsAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregsItems.deploymentTransaction()?.wait(2);
    }

    // ============ Deploy FregsMintPass ============
    console.log("\n--- Deploying Fregs Mint Pass ---");
    const FregsMintPass = await ethers.getContractFactory("FregsMintPass");
    const fregsMintPass = await FregsMintPass.deploy("");
    await fregsMintPass.waitForDeployment();
    const fregsMintPassAddress = await fregsMintPass.getAddress();
    console.log("Fregs Mint Pass deployed to:", fregsMintPassAddress);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Waiting for confirmations...");
        await fregsMintPass.deploymentTransaction()?.wait(2);
    }

    // ============ Configure Cross-Contract References ============
    console.log("\n--- Configuring Cross-Contract References ---");

    console.log("Setting items contract on Fregs...");
    await (await fregs.setItemsContract(fregsItemsAddress)).wait();

    console.log("Setting mint pass contract on Fregs...");
    await (await fregs.setMintPassContract(fregsMintPassAddress)).wait();

    console.log("Setting Fregs on MintPass...");
    await (await fregsMintPass.setFregs(fregsAddress)).wait();

    // ============ Mint Mint Passes to Deployer ============
    console.log("\n--- Minting Mint Passes ---");
    console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to deployer...`);
    await (await fregsMintPass.ownerMint(deployerAddress, MINT_PASSES_TO_MINT)).wait();
    const mintPassBalance = await fregsMintPass.balanceOf(deployerAddress, 1); // Token ID 1 = MINT_PASS
    console.log(`Deployer mint pass balance: ${mintPassBalance}`);

    // Also mint to additional recipient if configured
    if (ADDITIONAL_MINTPASS_RECIPIENT && ADDITIONAL_MINTPASS_RECIPIENT !== "0x0000000000000000000000000000000000000000") {
        console.log(`Minting ${MINT_PASSES_TO_MINT} mint passes to ${ADDITIONAL_MINTPASS_RECIPIENT}...`);
        await (await fregsMintPass.ownerMint(ADDITIONAL_MINTPASS_RECIPIENT, MINT_PASSES_TO_MINT)).wait();
        const additionalBalance = await fregsMintPass.balanceOf(ADDITIONAL_MINTPASS_RECIPIENT, 1);
        console.log(`Additional recipient mint pass balance: ${additionalBalance}`);
    }

    // ============ Configure BeadPunks ============
    if (beadPunksAddress && beadPunksAddress !== "0x0000000000000000000000000000000000000000") {
        console.log("\n--- Configuring BeadPunks ---");
        console.log("Setting BeadPunks contract on Fregs Items...");
        await (await fregsItems.setBeadPunksContract(beadPunksAddress)).wait();

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

            console.log(`Transferring ${BEAD_PUNKS_TO_MINT} BeadPunks to Fregs Items contract...`);
            for (const tokenId of mintedTokenIds) {
                const tx = await beadPunksContract["safeTransferFrom(address,address,uint256)"](
                    deployerAddress,
                    fregsItemsAddress,
                    tokenId
                );
                await tx.wait();
                console.log(`  Transferred BeadPunk #${tokenId}`);
            }

            // Verify BeadPunks are in Items contract
            const beadPunksInContract = await fregsItems.getAvailableBeadPunks();
            console.log(`BeadPunks in Items contract: ${beadPunksInContract}`);
        }
    } else if (isMainnet) {
        console.log("\n--- WARNING: BeadPunks not configured ---");
        console.log("Set MAINNET_BEAD_PUNKS_ADDRESS in deploy script and call:");
        console.log(`  await fregsItems.setBeadPunksContract("0x...")`);
    }

    console.log("\nCross-contract references configured!");

    // ============ Copy ABIs to Website ============
    console.log("\n--- Copying ABIs to Website ---");

    // Ensure the ABI directory exists
    if (!fs.existsSync(WEBSITE_ABI_PATH)) {
        fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
        console.log(`Created ABI directory: ${WEBSITE_ABI_PATH}`);
    }

    copyABI("Fregs", "Fregs");
    copyABI("FregsItems", "FregsItems");
    copyABI("FregsMintPass", "FregsMintPass");

    console.log("ABIs copied successfully!");

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

        // Verify Fregs
        try {
            console.log("Verifying Fregs...");
            await run("verify:verify", {
                address: fregsAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs", "FREG"]
            });
            console.log("Fregs verified!");
        } catch (error) {
            console.log("Fregs verification failed:", error.message);
        }

        // Verify Fregs Items
        try {
            console.log("Verifying Fregs Items...");
            await run("verify:verify", {
                address: fregsItemsAddress,
                constructorArguments: [ROYALTY_RECEIVER, ROYALTY_FEE, "Fregs Items", "FREGITEM", fregsAddress]
            });
            console.log("Fregs Items verified!");
        } catch (error) {
            console.log("Fregs Items verification failed:", error.message);
        }

        // Verify Fregs Mint Pass
        try {
            console.log("Verifying Fregs Mint Pass...");
            await run("verify:verify", {
                address: fregsMintPassAddress,
                constructorArguments: [""]
            });
            console.log("Fregs Mint Pass verified!");
        } catch (error) {
            console.log("Fregs Mint Pass verification failed:", error.message);
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
    console.log("  Fregs:          ", fregsAddress);
    console.log("  Fregs Items:    ", fregsItemsAddress);
    console.log("  Fregs Mint Pass:", fregsMintPassAddress);
    if (beadPunksAddress) {
        console.log("  BeadPunks:          ", beadPunksAddress, isTestnet ? "(Mock)" : "(Mainnet)");
    }
    console.log("\nConfiguration:");
    console.log("  Royalty Receiver:", ROYALTY_RECEIVER);
    console.log("  Royalty Fee:", ROYALTY_FEE / 100, "%");
    console.log("  Deployer Mint Passes:", mintPassBalance.toString());
    if (isTestnet && beadPunksAddress) {
        const beadPunksInContract = await fregsItems.getAvailableBeadPunks();
        console.log("  BeadPunks in Items Contract:", beadPunksInContract.toString());
    }
    console.log("\nNext Steps:");
    console.log("  1. Deploy SVG Renderer contract");
    console.log("  2. Call fregs.setSVGRenderer(rendererAddress)");
    console.log("  3. Fund items contract for chest rewards:");
    console.log("     await fregsItems.depositETH({ value: ethers.parseEther('0.5') })");
    console.log("  4. Activate mint pass sale:");
    console.log("     await fregsMintPass.setMintPassSaleActive(true)");
    if (isMainnet && (!beadPunksAddress || beadPunksAddress === "0x0000000000000000000000000000000000000000")) {
        console.log("  5. Set BeadPunks contract (mainnet):");
        console.log("     await fregsItems.setBeadPunksContract('0x...')");
    }
    console.log("\n" + "=".repeat(60));

    // Output for .env file
    console.log("\nFor .env file:");
    console.log(`VITE_FREGS_ADDRESS=${fregsAddress}`);
    console.log(`VITE_FREGS_ITEMS_ADDRESS=${fregsItemsAddress}`);
    console.log(`VITE_FREGS_MINTPASS_ADDRESS=${fregsMintPassAddress}`);
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
