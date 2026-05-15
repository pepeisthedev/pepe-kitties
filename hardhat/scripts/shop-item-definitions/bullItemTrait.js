const path = require("path");

module.exports = {
    key: "bull",
    name: "Bull Suit",
    description: "Suit up your Freg for the upcoming Bullmarket!",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Bull Head",
        classPrefix: "bullhead",
        sourceSvgPath: path.join(__dirname, "assets/bull-head.svg"),
    },
    icon: {
        svgFile: "bull.svg",
        sourceSvgPath: path.join(__dirname, "assets/bull-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "401100000",
    },
};
