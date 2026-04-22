const path = require("path");

module.exports = {
    key: "crown",
    name: "Crown",
    description: "A golden crown for your royal Freg!",
    category: "head",
    targetTraitType: 2,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Crown",
        classPrefix: "crownhead",
        sourceSvgPath: path.join(__dirname, "assets/crown-head.svg"),
    },
    icon: {
        svgFile: "crown.svg",
        sourceSvgPath: path.join(__dirname, "assets/crown-icon.svg"),
    },
    shop: {
        isActive: true,
        maxSupply: 50,
        priceFreg: "1000000",
    },
    localhost: {
        mintFregToDeployer: "10000000",
    },
};
