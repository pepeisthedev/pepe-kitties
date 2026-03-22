const path = require("path");

module.exports = {
    key: "tophat",
    name: "Top Hat",
    description: "A classy top hat for your distinguished Freg!",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Top Hat",
        classPrefix: "tophathead",
        sourceSvgPath: path.join(__dirname, "assets/tophat-head.svg"),
    },
    icon: {
        svgFile: "tophat.svg",
        sourceSvgPath: path.join(__dirname, "assets/tophat-icon.svg"),
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
