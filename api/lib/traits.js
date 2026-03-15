const defaultTraits = require("../data/default-traits.json");
const baseItemTraits = require("../data/item-traits.json");
const dynamicItemTraits = require("../data/dynamic-item-traits.json");
const baseItemsConfig = require("../data/items.json");
const dynamicItemsConfig = require("../data/dynamic-items.json");
const { getConfig } = require("./config");

const CANONICAL_TYPES = ["background", "body", "head", "mouth", "belly"];
const TYPE_ALIASES = {
  background: "background",
  belly: "belly",
  body: "body",
  head: "head",
  mouth: "mouth",
  skin: "body",
  stomach: "belly"
};

function mergeItemsConfig() {
  const activeDynamicItems = getDynamicItemsForChain(dynamicItemsConfig, getConfig().chainId);
  const mergedItems = new Map();

  for (const item of baseItemsConfig.items || []) {
    mergedItems.set(item.id, item);
  }

  for (const item of activeDynamicItems.items || []) {
    mergedItems.set(item.id, item);
  }

  return {
    ...baseItemsConfig,
    items: Array.from(mergedItems.values()).sort((left, right) => left.id - right.id)
  };
}

function mergeTraitEntries(baseEntries = [], dynamicEntries = []) {
  const mergedEntries = new Map();

  for (const entry of baseEntries) {
    mergedEntries.set(entry.fileName, entry);
  }

  for (const entry of dynamicEntries) {
    mergedEntries.set(entry.fileName, entry);
  }

  return Array.from(mergedEntries.values()).sort((left, right) => {
    const leftId = Number.parseInt(String(left.fileName || "0").replace(".svg", ""), 10);
    const rightId = Number.parseInt(String(right.fileName || "0").replace(".svg", ""), 10);
    return leftId - rightId;
  });
}

function emptyTraitDocument() {
  return {
    background: [],
    head: [],
    mouth: [],
    skin: [],
    stomach: []
  };
}

function getDynamicItemsForChain(document, chainId) {
  const chainKey = String(chainId);

  if (document?.byChainId) {
    return document.byChainId[chainKey] || { items: [] };
  }

  return document?.items ? { items: document.items } : { items: [] };
}

function getDynamicTraitsForChain(document, chainId) {
  const chainKey = String(chainId);

  if (document?.byChainId) {
    return {
      ...emptyTraitDocument(),
      ...(document.byChainId[chainKey] || {})
    };
  }

  return {
    ...emptyTraitDocument(),
    ...(document || {})
  };
}

const activeDynamicTraits = getDynamicTraitsForChain(dynamicItemTraits, getConfig().chainId);
const itemTraits = {
  background: mergeTraitEntries(baseItemTraits.background, activeDynamicTraits.background),
  head: mergeTraitEntries(baseItemTraits.head, activeDynamicTraits.head),
  mouth: mergeTraitEntries(baseItemTraits.mouth, activeDynamicTraits.mouth),
  skin: mergeTraitEntries(baseItemTraits.skin, activeDynamicTraits.skin),
  stomach: mergeTraitEntries(baseItemTraits.stomach, activeDynamicTraits.stomach)
};

const itemsConfig = mergeItemsConfig();

function normalizeTraitType(rawTraitType) {
  return TYPE_ALIASES[String(rawTraitType || "").toLowerCase()] || null;
}

function buildItemLookup() {
  const lookup = {
    belly: new Map(),
    body: new Map(),
    head: new Map()
  };

  for (const item of itemsConfig.items || []) {
    if (!item.traitFileName) {
      continue;
    }

    if (item.category === "skin") {
      lookup.body.set(item.traitFileName, item);
    }

    if (item.category === "head") {
      lookup.head.set(item.traitFileName, item);
    }

    if (item.category === "stomach") {
      lookup.belly.set(item.traitFileName, item);
    }
  }

  return lookup;
}

const itemLookup = buildItemLookup();

function makeTraitDescriptor(traitType, id, values) {
  return {
    dynamicColor: Boolean(values.dynamicColor),
    fileName: values.fileName || null,
    id,
    isNone: Boolean(values.isNone),
    itemId: values.itemId || null,
    itemName: values.itemName || null,
    name: values.name,
    renderable: Boolean(values.renderable),
    source: values.source
  };
}

function sortById(traits) {
  return traits.sort((left, right) => left.id - right.id);
}

async function getTraitsCatalog() {
  const baseHeadCount = defaultTraits.head.length;
  const baseBellyCount = defaultTraits.stomach.filter((entry) => !entry.isNone).length;

  const backgroundTraits = [
    makeTraitDescriptor("background", 0, {
      dynamicColor: true,
      name: "Dynamic Background",
      renderable: true,
      source: "dynamic"
    })
  ];

  const bodyTraits = [
    makeTraitDescriptor("body", 0, {
      dynamicColor: true,
      fileName: defaultTraits.skin[0]?.fileName || null,
      name: defaultTraits.skin[0]?.name || "Base",
      renderable: true,
      source: "dynamic"
    }),
    ...itemTraits.skin.map((entry) => {
      const item = itemLookup.body.get(entry.fileName);
      return makeTraitDescriptor("body", Number.parseInt(entry.fileName.replace(".svg", ""), 10), {
        fileName: entry.fileName,
        itemId: item?.id,
        itemName: item?.name,
        name: entry.name,
        renderable: true,
        source: "from_items"
      });
    })
  ];

  const headTraits = [
    ...defaultTraits.head.map((entry) =>
      makeTraitDescriptor("head", Number.parseInt(entry.fileName.replace(".svg", ""), 10), {
        fileName: entry.fileName,
        name: entry.name,
        rarity: entry.rarity,
        renderable: true,
        source: "default"
      })
    ),
    ...itemTraits.head.map((entry) => {
      const item = itemLookup.head.get(entry.fileName);
      const fileId = Number.parseInt(entry.fileName.replace(".svg", ""), 10);
      return makeTraitDescriptor("head", baseHeadCount + fileId, {
        fileName: entry.fileName,
        itemId: item?.id,
        itemName: item?.name,
        name: entry.name,
        renderable: true,
        source: "from_items"
      });
    })
  ];

  const mouthTraits = defaultTraits.mouth.map((entry) => {
    if (entry.isNone) {
      return makeTraitDescriptor("mouth", 0, {
        isNone: true,
        name: entry.name,
        rarity: entry.rarity,
        renderable: false,
        source: "default"
      });
    }

    return makeTraitDescriptor("mouth", Number.parseInt(entry.fileName.replace(".svg", ""), 10), {
      fileName: entry.fileName,
      name: entry.name,
      rarity: entry.rarity,
      renderable: true,
      source: "default"
    });
  });

  const bellyTraits = [
    ...defaultTraits.stomach.map((entry) => {
      if (entry.isNone) {
        return makeTraitDescriptor("belly", 0, {
          isNone: true,
          name: entry.name,
          rarity: entry.rarity,
          renderable: false,
          source: "default"
        });
      }

      return makeTraitDescriptor("belly", Number.parseInt(entry.fileName.replace(".svg", ""), 10), {
        fileName: entry.fileName,
        name: entry.name,
        rarity: entry.rarity,
        renderable: true,
        source: "default"
      });
    }),
    ...itemTraits.stomach.map((entry) => {
      const item = itemLookup.belly.get(entry.fileName);
      const fileId = Number.parseInt(entry.fileName.replace(".svg", ""), 10);
      return makeTraitDescriptor("belly", baseBellyCount + fileId, {
        fileName: entry.fileName,
        itemId: item?.id,
        itemName: item?.name,
        name: entry.name,
        renderable: true,
        source: "from_items"
      });
    })
  ];

  return {
    background: sortById(backgroundTraits),
    belly: sortById(bellyTraits),
    body: sortById(bodyTraits),
    head: sortById(headTraits),
    mouth: sortById(mouthTraits)
  };
}

async function getTraitGroup(traitType) {
  const normalized = normalizeTraitType(traitType);
  if (!normalized) {
    return null;
  }

  const catalog = await getTraitsCatalog();
  return catalog[normalized] || null;
}

async function getTraitDescriptor(traitType, traitId) {
  const group = await getTraitGroup(traitType);
  if (!group) {
    return null;
  }

  return group.find((trait) => trait.id === traitId) || null;
}

async function getTraitsSummary() {
  const catalog = await getTraitsCatalog();

  return CANONICAL_TYPES.reduce((accumulator, traitType) => {
    const traits = catalog[traitType] || [];
    accumulator[traitType] = {
      count: traits.length,
      renderableCount: traits.filter((trait) => trait.renderable).length,
      traits
    };
    return accumulator;
  }, {});
}

module.exports = {
  getTraitDescriptor,
  getTraitGroup,
  getTraitsSummary,
  normalizeTraitType
};
