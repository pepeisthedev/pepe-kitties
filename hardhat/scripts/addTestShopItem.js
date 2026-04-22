const path = require("path");

process.env.SHOP_ITEM_DEFINITION = path.join(__dirname, "shop-item-definitions/sunItemTrait.js");

const { main } = require("./deployNewShopItem");

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
