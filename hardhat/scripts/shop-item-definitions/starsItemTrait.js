const path = require("path");

module.exports = {
    key: "stars",
    name: "Stars",
    description: "A starry night sky behind your Freg!",
    category: "background",
    targetTraitType: 0,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Stars",
        classPrefix: "starsbackground",
        sourceSvgPath: path.join(__dirname, "assets/stars-background.svg"),
    },
    icon: {
        svgFile: "stars.svg",
        sourceSvgPath: path.join(__dirname, "assets/stars-icon.svg"),
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
