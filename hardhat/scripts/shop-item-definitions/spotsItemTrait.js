const path = require("path");

module.exports = {
    key: "spots",
    name: "Spots",
    description: "Spotted pattern on your Freg's body!",
    category: "skin",
    targetTraitType: 1,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Spots",
        classPrefix: "spotsskin",
        sourceSvgPath: path.join(__dirname, "assets/spots-skin.svg"),
    },
    icon: {
        svgFile: "spots.svg",
        sourceSvgPath: path.join(__dirname, "assets/spots-icon.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 50,
        priceFreg: "1000000",
    },
    localhost: {
        mintFregToDeployer: "10000000",
    },
};
