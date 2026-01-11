const { ethers, network, run } = require("hardhat");

async function main() {
    console.log("=".repeat(60));
    console.log("Pepe Kitties Deployment Script");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const networkInfo = await ethers.provider.getNetwork();

    console.log("\nNetwork:", network.name);
    console.log("Chain ID:", networkInfo.chainId.toString());
    console.log("Deployer:", deployerAddress);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "ETH");

    // Configuration
    const ROYALTY_RECEIVER = deployerAddress;
    const ROYALTY_FEE = 500; // 5% (500/10000)

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

    console.log("Cross-contract references configured!");

    // ============ Verify Contracts (non-localhost) ============
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n--- Verifying Contracts on Basescan ---");
        console.log("Waiting 30s for indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000));

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
    console.log("\nConfiguration:");
    console.log("  Royalty Receiver:", ROYALTY_RECEIVER);
    console.log("  Royalty Fee:", ROYALTY_FEE / 100, "%");
    console.log("\nNext Steps:");
    console.log("  1. Deploy SVG Renderer contract");
    console.log("  2. Call pepeKitties.setSVGRenderer(rendererAddress)");
    console.log("  3. Fund items contract for chest rewards:");
    console.log("     await pepeKittiesItems.depositETH({ value: ethers.parseEther('0.5') })");
    console.log("  4. Activate mint pass sale:");
    console.log("     await pepeKittiesMintPass.setMintPassSaleActive(true)");
    console.log("\n" + "=".repeat(60));

    // Output for .env file
    console.log("\nFor .env file:");
    console.log(`VITE_PEPE_KITTIES_ADDRESS=${pepeKittiesAddress}`);
    console.log(`VITE_PEPE_KITTIES_ITEMS_ADDRESS=${pepeKittiesItemsAddress}`);
    console.log(`VITE_PEPE_KITTIES_MINTPASS_ADDRESS=${pepeKittiesMintPassAddress}`);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
