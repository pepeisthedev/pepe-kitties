const path = require("path");

module.exports = {
    key: "wizard",
    name: "Wizard",
    description: "Make your Freg a magical Freg.",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Wizard",
        classPrefix: "wizardhead",
        sourceSvgPath: path.join(__dirname, "assets/wizard-head.svg"),
    },
    icon: {
        svgFile: "wizard.svg",
        sourceSvgPath: path.join(__dirname, "assets/wizard-head.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 10,
        priceFreg: "401100000",
    },
};
