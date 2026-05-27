const path = require("path");

module.exports = {
    key: "vegasbackground",
    name: "Vegas",
    description: "What happens in Freg Vegas, stays in Freg vegas.",
    category: "background",
    targetTraitType: 0,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Vegas",
        classPrefix: "vegasbackground",
        sourceSvgPath: path.join(__dirname, "assets/vegas-background.svg"),
    },
    icon: {
        svgFile: "vegas.svg",
        sourceSvgPath: path.join(__dirname, "assets/vegas-background.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "500000000",
    },
};
