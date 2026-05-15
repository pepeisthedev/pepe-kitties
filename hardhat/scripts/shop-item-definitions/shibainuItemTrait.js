const path = require("path");

module.exports = {
    key: "shibainu",
    name: "Shiba Inu Suit",
    description: "A comfy Shiba Inu suit for your Freg.",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Shiba Inu Suit",
        classPrefix: "shibainuhead",
        sourceSvgPath: path.join(__dirname, "assets/shibainu-head.svg"),
    },
    icon: {
        svgFile: "shibainu.svg",
        sourceSvgPath: path.join(__dirname, "assets/shibainu-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "401100000",
    },
};
