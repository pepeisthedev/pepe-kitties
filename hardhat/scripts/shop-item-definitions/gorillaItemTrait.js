const path = require("path");

module.exports = {
    key: "gorilla",
    name: "Gorilla Suit",
    description: "Who like bananas?",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    incompatibleWithSkins: [4],
    trait: {
        name: "Gorilla Suit",
        classPrefix: "gorilla",
        sourceSvgPath: path.join(__dirname, "assets/gorilla-head.svg"),
    },
    icon: {
        svgFile: "gorilla.svg",
        sourceSvgPath: path.join(__dirname, "assets/gorilla-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "500000000",
    },
};
