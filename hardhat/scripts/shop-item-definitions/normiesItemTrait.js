const path = require("path");

module.exports = {
    key: "normiesbackground",
    name: "Normie tribute",
    description: "Fregs like Normies.",
    category: "background",
    targetTraitType: 0,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Normie tribute",
        classPrefix: "normiesbackground",
        sourceSvgPath: path.join(__dirname, "assets/normies-background.svg"),
    },
    icon: {
        svgFile: "normies.svg",
        sourceSvgPath: path.join(__dirname, "assets/normies-background.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "500000000",
    },
};
