const path = require("path");

module.exports = {
    key: "godzilla",
    name: "Godzilla Suit",
    description: "Roooooaaarrrr!",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    hiddenInShop: true,
    trait: {
        name: "Godzilla Suit",
        classPrefix: "godzilla",
        sourceSvgPath: path.join(__dirname, "assets/godzilla-head.svg"),
    },
    icon: {
        svgFile: "godzilla.svg",
        sourceSvgPath: path.join(__dirname, "assets/godzilla-head.svg"),
    },
};
