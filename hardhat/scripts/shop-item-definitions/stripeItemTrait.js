const path = require("path");

module.exports = {
    key: "stripe",
    name: "Stripe",
    description: "Tiger-like stripes on your Freg's body!",
    category: "skin",
    targetTraitType: 1,
    isOwnerMintable: true,
    isClaimable: false,
    claimWeight: 0,
    trait: {
        name: "Stripe",
        classPrefix: "stripeskin",
        sourceSvgPath: path.join(__dirname, "assets/stripe-skin.svg"),
    },
    icon: {
        svgFile: "stripe.svg",
        sourceSvgPath: path.join(__dirname, "assets/stripe-icon.svg"),
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
