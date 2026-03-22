const path = require("path");

module.exports = {
    key: "tongue",
    name: "Tongue",
    description: "A cheeky tongue sticking out of your Freg's mouth!",
    category: "mouth",
    targetTraitType: 3,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Tongue",
        classPrefix: "tonguemouth",
        sourceSvgPath: path.join(__dirname, "assets/tongue-mouth.svg"),
    },
    icon: {
        svgFile: "tongue.svg",
        sourceSvgPath: path.join(__dirname, "assets/tongue-icon.svg"),
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
