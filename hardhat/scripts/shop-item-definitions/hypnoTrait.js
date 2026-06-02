const path = require("path");

module.exports = {
    key: "hypnobackground",
    name: "Hypno",
    description: "Lets get trippy",
    category: "background",
    targetTraitType: 0,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Hypno",
        classPrefix: "hypnobackground",
        sourceSvgPath: path.join(__dirname, "assets/hypno-background.svg"),
    },
    icon: {
        svgFile: "hypno.svg",
        sourceSvgPath: path.join(__dirname, "assets/hypno-background.svg"),
    }
};
