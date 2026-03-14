const defaultTraits = require("../data/default-traits.json");
const itemTraits = require("../data/item-traits.json");
const itemsConfig = require("../data/items.json");

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

function normalizeTraitType(rawTraitType) {
  return TYPE_ALIASES[String(rawTraitType || "").toLowerCase()] || null;
}

function buildItemLookup() {
  const lookup = {
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

  const bellyTraits = defaultTraits.stomach.map((entry) => {
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
  });

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
