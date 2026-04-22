const fs = require("fs");
const path = require("path");

const WEBSITE_DYNAMIC_ITEMS_PATH = path.join(__dirname, "../../website/src/config/dynamic-items.json");
const API_DYNAMIC_ITEMS_PATH = path.join(__dirname, "../../api/data/dynamic-items.json");
const WEBSITE_DYNAMIC_TRAITS_PATH = path.join(__dirname, "../../website/public/frogz/from_items/dynamic-traits.json");
const API_DYNAMIC_TRAITS_DATA_PATH = path.join(__dirname, "../../api/data/dynamic-item-traits.json");
const API_DYNAMIC_TRAITS_ASSET_PATH = path.join(__dirname, "../../api/assets/frogz/from_items/dynamic-traits.json");
const WEBSITE_ITEMS_PATH = path.join(__dirname, "../../website/public/items");
const WEBSITE_FROM_ITEMS_PATH = path.join(__dirname, "../../website/public/frogz/from_items");
const API_FROM_ITEMS_PATH = path.join(__dirname, "../../api/assets/frogz/from_items");

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallbackValue) {
    if (!fs.existsSync(filePath)) {
        return fallbackValue;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function ensureTraitDocument(doc) {
    return {
        background: Array.isArray(doc?.background) ? doc.background : [],
        head: Array.isArray(doc?.head) ? doc.head : [],
        mouth: Array.isArray(doc?.mouth) ? doc.mouth : [],
        skin: Array.isArray(doc?.skin) ? doc.skin : [],
        stomach: Array.isArray(doc?.stomach) ? doc.stomach : [],
    };
}

function emptyTraitDocument() {
    return ensureTraitDocument({});
}

function ensureChainItemDocument(doc) {
    return {
        byChainId: { ...(doc?.byChainId || {}) },
    };
}

function ensureChainTraitDocument(doc) {
    return {
        byChainId: { ...(doc?.byChainId || {}) },
    };
}

function getOrCreateChainItems(doc, chainId, legacyItems = []) {
    const chainKey = String(chainId);
    if (!doc.byChainId[chainKey]) {
        doc.byChainId[chainKey] = { items: legacyItems };
    }

    if (!Array.isArray(doc.byChainId[chainKey].items)) {
        doc.byChainId[chainKey].items = [];
    }

    return doc.byChainId[chainKey];
}

function getOrCreateChainTraits(doc, chainId, legacyTraits = emptyTraitDocument()) {
    const chainKey = String(chainId);
    const current = ensureTraitDocument(doc.byChainId[chainKey] || legacyTraits);
    doc.byChainId[chainKey] = current;
    return current;
}

function upsertItem(items, item) {
    const nextItems = Array.isArray(items) ? [...items] : [];
    const existingIndex = nextItems.findIndex((entry) => Number(entry.id) === Number(item.id));

    if (existingIndex >= 0) {
        nextItems[existingIndex] = { ...nextItems[existingIndex], ...item };
    } else {
        nextItems.push(item);
    }

    nextItems.sort((left, right) => Number(left.id) - Number(right.id));
    return nextItems;
}

function upsertTrait(entries, traitEntry) {
    const nextEntries = Array.isArray(entries) ? [...entries] : [];
    const existingIndex = nextEntries.findIndex((entry) => entry.fileName === traitEntry.fileName);

    if (existingIndex >= 0) {
        nextEntries[existingIndex] = { ...nextEntries[existingIndex], ...traitEntry };
    } else {
        nextEntries.push(traitEntry);
    }

    nextEntries.sort((left, right) => {
        const leftId = Number.parseInt(String(left.fileName || "0").replace(".svg", ""), 10);
        const rightId = Number.parseInt(String(right.fileName || "0").replace(".svg", ""), 10);
        return leftId - rightId;
    });

    return nextEntries;
}

function copyFileIfChanged(sourcePath, targetPath) {
    ensureDirectory(path.dirname(targetPath));

    const resolvedSource = path.resolve(sourcePath);
    const resolvedTarget = path.resolve(targetPath);

    if (resolvedSource === resolvedTarget) {
        return;
    }

    const sourceContent = fs.readFileSync(resolvedSource, "utf8");
    const targetContent = fs.existsSync(resolvedTarget) ? fs.readFileSync(resolvedTarget, "utf8") : null;

    if (targetContent === sourceContent) {
        return;
    }

    fs.writeFileSync(resolvedTarget, sourceContent);
}

function syncDynamicShopItemArtifacts(config) {
    const {
        chainId,
        item,
        itemIconSourceSvgPath,
        trait,
        traitSourceSvgPath,
    } = config;

    const websiteDynamicItemsSource = readJson(WEBSITE_DYNAMIC_ITEMS_PATH, {});
    const websiteDynamicItems = ensureChainItemDocument(websiteDynamicItemsSource);
    const websiteChainItems = getOrCreateChainItems(
        websiteDynamicItems,
        chainId,
        Array.isArray(websiteDynamicItemsSource?.items) ? websiteDynamicItemsSource.items : []
    );
    websiteChainItems.items = upsertItem(websiteChainItems.items, item);
    writeJson(WEBSITE_DYNAMIC_ITEMS_PATH, websiteDynamicItems);

    const apiDynamicItemsSource = readJson(API_DYNAMIC_ITEMS_PATH, {});
    const apiDynamicItems = ensureChainItemDocument(apiDynamicItemsSource);
    const apiChainItems = getOrCreateChainItems(
        apiDynamicItems,
        chainId,
        Array.isArray(apiDynamicItemsSource?.items) ? apiDynamicItemsSource.items : []
    );
    apiChainItems.items = upsertItem(apiChainItems.items, item);
    writeJson(API_DYNAMIC_ITEMS_PATH, apiDynamicItems);

    const traitDocuments = [
        WEBSITE_DYNAMIC_TRAITS_PATH,
        API_DYNAMIC_TRAITS_DATA_PATH,
        API_DYNAMIC_TRAITS_ASSET_PATH,
    ];

    for (const filePath of traitDocuments) {
        const sourceDoc = readJson(filePath, {});
        const doc = ensureChainTraitDocument(sourceDoc);
        const chainTraits = getOrCreateChainTraits(
            doc,
            chainId,
            sourceDoc?.byChainId ? emptyTraitDocument() : ensureTraitDocument(sourceDoc)
        );
        chainTraits[trait.category] = upsertTrait(chainTraits[trait.category], {
            fileName: trait.fileName,
            name: trait.name,
        });
        writeJson(filePath, doc);
    }

    copyFileIfChanged(
        traitSourceSvgPath,
        path.join(WEBSITE_FROM_ITEMS_PATH, trait.category, trait.fileName)
    );
    copyFileIfChanged(
        traitSourceSvgPath,
        path.join(API_FROM_ITEMS_PATH, trait.category, trait.fileName)
    );

    if (item.svgFile && itemIconSourceSvgPath) {
        copyFileIfChanged(
            itemIconSourceSvgPath,
            path.join(WEBSITE_ITEMS_PATH, item.svgFile)
        );
    }
}

module.exports = {
    syncDynamicShopItemArtifacts,
};
