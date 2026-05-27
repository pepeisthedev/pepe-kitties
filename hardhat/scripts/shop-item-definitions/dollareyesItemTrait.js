const path = require("path");

module.exports = {
    key: "dollar",
    name: "Dollar eyes",
    description: "Going for the dough",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Dollar eyes",
        classPrefix: "dollar",
        sourceSvgPath: path.join(__dirname, "assets/dollar-head.svg"),
    },
    icon: {
        svgFile: "dollar.svg",
        sourceSvgPath: path.join(__dirname, "assets/dollar-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 20,
        priceFreg: "300000000",
    },
};
