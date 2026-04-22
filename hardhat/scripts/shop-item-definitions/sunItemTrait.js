const path = require("path");

module.exports = {
    key: "sun",
    name: "Sun",
    description: "A blazing sun on your Freg's belly!",
    category: "stomach",
    targetTraitType: 4,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Sun",
        classPrefix: "sunstomach",
        sourceSvgPath: path.join(__dirname, "assets/sun-stomach.svg"),
    },
    icon: {
        svgFile: "sun.svg",
        sourceSvgPath: path.join(__dirname, "assets/sun-icon.svg"),
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
