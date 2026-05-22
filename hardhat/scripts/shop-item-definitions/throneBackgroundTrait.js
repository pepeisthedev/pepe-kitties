const path = require("path");

module.exports = {
    key: "throne",
    name: "Throne",
    description: "A Throne fit for a Freg!",
    category: "background",
    targetTraitType: 0,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Throne",
        classPrefix: "thronebackground",
        sourceSvgPath: path.join(__dirname, "assets/throne-background.svg"),
    },
    icon: {
        svgFile: "throne.svg",
        sourceSvgPath: path.join(__dirname, "assets/throne-background.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "400000000",
    },
};
