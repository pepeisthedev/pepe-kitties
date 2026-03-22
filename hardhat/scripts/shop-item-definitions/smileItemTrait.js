const path = require("path");

module.exports = {
    key: "smile",
    name: "Smile",
    description: "A big toothy grin for your Freg!",
    category: "mouth",
    targetTraitType: 3,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Smile",
        classPrefix: "smilemouth",
        sourceSvgPath: path.join(__dirname, "assets/smile-mouth.svg"),
    },
    icon: {
        svgFile: "smile.svg",
        sourceSvgPath: path.join(__dirname, "assets/smile-icon.svg"),
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
