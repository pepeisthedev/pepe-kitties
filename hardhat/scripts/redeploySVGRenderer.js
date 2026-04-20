const { ethers, network } = require("hardhat");
const { retryWithBackoff } = require("./deployUtils");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

async function sendTx(txPromise) {
    return await retryWithBackoff(async () => {
        const tx = await txPromise;
        const confirmations = network.name !== "localhost" && network.name !== "hardhat" ? 2 : undefined;
        const receipt = await tx.wait(confirmations);
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return receipt;
    }, 3, 5000);
}

async function main() {
    console.log("=".repeat(60));
    console.log("Redeploy FregsSVGRenderer");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    const status = loadDeploymentStatus(network.name);
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const { contracts, routers, defaultTraits } = status;

    if (!contracts.fregs) throw new Error("No fregs address in deployment status");
    if (!routers.background) throw new Error("No background router in deployment status");
    if (!routers.body) throw new Error("No body router in deployment status");
    if (!routers.skin) throw new Error("No skin router in deployment status");
    if (!routers.head) throw new Error("No head router in deployment status");
    if (!routers.mouth) throw new Error("No mouth router in deployment status");
    if (!routers.stomach) throw new Error("No stomach router in deployment status");

    // 1. Deploy new FregsSVGRenderer
    console.log("\n1. Deploying new FregsSVGRenderer...");
    const FregsSVGRenderer = await ethers.getContractFactory("FregsSVGRenderer");
    const renderer = await retryWithBackoff(async () => {
        const c = await FregsSVGRenderer.deploy();
        await c.waitForDeployment();
        if (network.name !== "localhost" && network.name !== "hardhat") {
            await c.deploymentTransaction()?.wait(2);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return c;
    }, 3, 5000);

    const rendererAddress = await renderer.getAddress();
    console.log("   FregsSVGRenderer deployed:", rendererAddress);

    // 2. Wire all routers into the new renderer
    console.log("\n2. Wiring routers into new FregsSVGRenderer...");
    console.log("   background:", routers.background);
    console.log("   body:      ", routers.body);
    console.log("   skin:      ", routers.skin);
    console.log("   head:      ", routers.head);
    console.log("   mouth:     ", routers.mouth);
    console.log("   stomach:   ", routers.stomach);

    await sendTx(renderer.setAllContracts(
        routers.background,
        routers.body,
        routers.skin,
        routers.head,
        routers.mouth,
        routers.stomach
    ));
    console.log("   Routers wired.");

    // 3. Set base trait counts from deployment status
    console.log("\n3. Setting base trait counts...");
    const headCount = defaultTraits?.head ? Object.keys(defaultTraits.head).filter(k => {
        const t = defaultTraits.head[k];
        return t.source === "default";
    }).length : 0;
    const mouthCount = defaultTraits?.mouth ? Object.keys(defaultTraits.mouth).length : 0;
    const stomachCount = defaultTraits?.stomach ? Object.keys(defaultTraits.stomach).length : 0;

    console.log(`   head base traits:    ${headCount}`);
    console.log(`   mouth base traits:   ${mouthCount}`);
    console.log(`   stomach base traits: ${stomachCount}`);

    await sendTx(renderer.setAllBaseTraitCounts(headCount, mouthCount, stomachCount));
    console.log("   Base trait counts set.");

    // 4. Point Fregs to the new renderer
    console.log("\n4. Updating Fregs to use new renderer...");
    const fregs = await ethers.getContractAt("Fregs", contracts.fregs);
    await sendTx(fregs.setSVGRenderer(rendererAddress));
    console.log("   Fregs.svgRenderer updated.");

    // 5. Save updated deployment status
    status.contracts.svgRenderer = rendererAddress;
    saveDeploymentStatus(status, network.name);

    console.log("\n" + "=".repeat(60));
    console.log("Done!");
    console.log("New FregsSVGRenderer:", rendererAddress);
    console.log("Fregs contract:      ", contracts.fregs);
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
