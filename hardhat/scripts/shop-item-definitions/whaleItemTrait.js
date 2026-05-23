const path = require("path");

module.exports = {
    key: "whale",
    name: "Whale Suit",
    description: "Got Fregs stacked to the gills? Time to dress like the whale you are.",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    hiddenInShop: true,
    incompatibleWithSkins: [4],
    trait: {
        name: "Whale Suit",
        classPrefix: "whalehead",
        sourceSvgPath: path.join(__dirname, "assets/whale-head.svg"),
    },
    icon: {
        svgFile: "whale.svg",
        sourceSvgPath: path.join(__dirname, "assets/whale-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 5,
        priceFreg: "1",
    },
};
