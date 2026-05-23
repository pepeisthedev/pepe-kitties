const path = require("path");

module.exports = {
    key: "whale",
    name: "Whale Suit",
    description: "When you have lots of Fregs you have to dress like one!",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    hiddenInShop: true,
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
