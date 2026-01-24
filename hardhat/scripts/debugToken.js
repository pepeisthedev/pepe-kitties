const { ethers, network } = require("hardhat");

async function main() {
    console.log("=".repeat(60));
    console.log("Fregs Token Debugger");
    console.log("=".repeat(60));
    console.log("Network:", network.name);

    const fregsAddress = process.env.VITE_FREGS_ADDRESS;
    const tokenId = process.env.TOKEN_ID || 1;

    if (!fregsAddress) {
        console.error("\nError: VITE_FREGS_ADDRESS not set");
        process.exit(1);
    }

    console.log("Fregs address:", fregsAddress);
    console.log("Token ID:", tokenId);

    const fregs = await ethers.getContractAt("Fregs", fregsAddress);

    // Check if token exists
    console.log("\n--- Token Check ---");
    try {
        const owner = await fregs.ownerOf(tokenId);
        console.log("✅ Token exists, owner:", owner);
    } catch (e) {
        console.log("❌ Token does not exist");
        return;
    }

    // Check SVG Renderer
    console.log("\n--- SVG Renderer Check ---");
    const svgRendererAddress = await fregs.svgRenderer();
    console.log("SVG Renderer address:", svgRendererAddress);

    if (svgRendererAddress === ethers.ZeroAddress) {
        console.log("❌ SVG Renderer not set!");
        return;
    }
    console.log("✅ SVG Renderer is set");

    const svgRenderer = await ethers.getContractAt("FregsSVGRenderer", svgRendererAddress);

    // Check trait contracts on renderer
    console.log("\n--- Trait Contract Check ---");
    const bodyContract = await svgRenderer.bodyContract();
    const bellyContract = await svgRenderer.bellyContract();
    const headContract = await svgRenderer.headContract();
    const mouthContract = await svgRenderer.mouthContract();
    const specialSkinContract = await svgRenderer.specialSkinContract();

    console.log("Body contract:        ", bodyContract, bodyContract === ethers.ZeroAddress ? "❌ NOT SET" : "✅");
    console.log("Belly contract:       ", bellyContract, bellyContract === ethers.ZeroAddress ? "❌ NOT SET" : "✅");
    console.log("Head contract:        ", headContract, headContract === ethers.ZeroAddress ? "❌ NOT SET" : "✅");
    console.log("Mouth contract:       ", mouthContract, mouthContract === ethers.ZeroAddress ? "❌ NOT SET" : "✅");
    console.log("Special skin contract:", specialSkinContract, specialSkinContract === ethers.ZeroAddress ? "❌ NOT SET" : "✅");

    // Get token traits
    console.log("\n--- Token Traits ---");
    const bodyColor = await fregs.bodyColor(tokenId);
    const headTrait = await fregs.head(tokenId);
    const mouthTrait = await fregs.mouth(tokenId);
    const bellyTrait = await fregs.belly(tokenId);
    const specialSkin = await fregs.specialSkin(tokenId);

    console.log("Body color:   ", bodyColor);
    console.log("Head trait:   ", headTrait.toString());
    console.log("Mouth trait:  ", mouthTrait.toString());
    console.log("Belly trait:  ", bellyTrait.toString());
    console.log("Special skin: ", specialSkin.toString());

    // Try each render step individually
    console.log("\n--- Render Tests ---");

    // Test body render
    if (bodyContract !== ethers.ZeroAddress) {
        try {
            const body = await ethers.getContractAt("BodyRenderer", bodyContract);
            const bodyResult = await body.render(bodyColor);
            console.log("✅ Body renders OK (length:", bodyResult.length, ")");
        } catch (e) {
            console.log("❌ Body render failed:", e.message);
        }
    }

    // Test belly render
    if (bellyContract !== ethers.ZeroAddress && specialSkin == 0n) {
        try {
            const belly = await ethers.getContractAt("SVGRouter", bellyContract);
            const bellyResult = await belly.render(bellyTrait);
            console.log("✅ Belly renders OK (length:", bellyResult.length, ")");
        } catch (e) {
            console.log("❌ Belly render failed:", e.message);
        }
    }

    // Test head render
    if (headContract !== ethers.ZeroAddress) {
        try {
            const head = await ethers.getContractAt("SVGRouter", headContract);
            const headResult = await head.render(headTrait);
            console.log("✅ Head renders OK (length:", headResult.length, ")");
        } catch (e) {
            console.log("❌ Head render failed:", e.message);
        }
    }

    // Test mouth render
    if (mouthContract !== ethers.ZeroAddress) {
        try {
            const mouth = await ethers.getContractAt("SVGRouter", mouthContract);
            const mouthResult = await mouth.render(mouthTrait);
            console.log("✅ Mouth renders OK (length:", mouthResult.length, ")");
        } catch (e) {
            console.log("❌ Mouth render failed:", e.message);
        }
    }

    // Test special skin render if applicable
    if (specialSkinContract !== ethers.ZeroAddress && specialSkin > 0n) {
        try {
            const special = await ethers.getContractAt("SVGRouter", specialSkinContract);
            const specialResult = await special.render(specialSkin);
            console.log("✅ Special skin renders OK (length:", specialResult.length, ")");
        } catch (e) {
            console.log("❌ Special skin render failed:", e.message);
        }
    }

    // Try the full render
    console.log("\n--- Full Render Test ---");
    try {
        const fullSvg = await svgRenderer.render(
            bodyColor,
            headTrait,
            mouthTrait,
            bellyTrait,
            specialSkin
        );
        console.log("✅ Full render OK (length:", fullSvg.length, ")");
        console.log("\nFirst 500 chars of SVG:");
        console.log(fullSvg.substring(0, 500));
    } catch (e) {
        console.log("❌ Full render failed:", e.message);
    }

    // Try tokenURI
    console.log("\n--- TokenURI Test ---");
    try {
        const uri = await fregs.tokenURI(tokenId);
        console.log("✅ tokenURI OK (length:", uri.length, ")");
    } catch (e) {
        console.log("❌ tokenURI failed:", e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
