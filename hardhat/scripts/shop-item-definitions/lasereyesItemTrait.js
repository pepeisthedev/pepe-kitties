const path = require("path");

module.exports = {
    key: "laser",
    name: "Laser eyes",
    description: "Is it getting hot in here?",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Laser eyes",
        classPrefix: "laser",
        sourceSvgPath: path.join(__dirname, "assets/laser-head.svg"),
    },
    icon: {
        svgFile: "laser.svg",
        sourceSvgPath: path.join(__dirname, "assets/laser-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "500000000",
    },
};
