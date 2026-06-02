const path = require("path");

module.exports = {
    key: "penguin",
    name: "Penguin Suit",
    description: "Nice tuxedo",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    hiddenInShop: true,
    incompatibleWithSkins: [4],
    trait: {
        name: "Penguin Suit",
        classPrefix: "penguin",
        sourceSvgPath: path.join(__dirname, "assets/penguin-head.svg"),
    },
    icon: {
        svgFile: "penguin.svg",
        sourceSvgPath: path.join(__dirname, "assets/penguin-head.svg"),
    },
};
