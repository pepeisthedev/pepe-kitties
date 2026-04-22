const path = require("path");

module.exports = {
    key: "heart",
    name: "Heart",
    description: "A big red heart on your Freg's belly!",
    category: "stomach",
    targetTraitType: 4,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Heart",
        classPrefix: "heartstomach",
        sourceSvgPath: path.join(__dirname, "assets/heart-stomach.svg"),
    },
    icon: {
        svgFile: "heart.svg",
        sourceSvgPath: path.join(__dirname, "assets/heart-icon.svg"),
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
