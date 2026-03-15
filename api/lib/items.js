const baseItemsConfig = require("../data/items.json");
const dynamicItemsConfig = require("../data/dynamic-items.json");
const { getConfig } = require("./config");

function getDynamicItemsForChain(document, chainId) {
  const chainKey = String(chainId);

  if (document?.byChainId) {
    return document.byChainId[chainKey] || { items: [] };
  }

  return document?.items ? { items: document.items } : { items: [] };
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSvgStem(svgFile) {
  return String(svgFile || "").replace(/\.svg$/i, "");
}

function getPreferredItemSlug(item) {
  if (item.slug) {
    return toSlug(item.slug);
  }

  if (String(item.name || "").toLowerCase() === "treasure chest") {
    return "chest";
  }

  return toSlug(item.name || getSvgStem(item.svgFile) || item.id);
}

function getItemAliases(item, preferredSlug) {
  const aliases = new Set([preferredSlug]);
  const nameSlug = toSlug(item.name);
  const svgSlug = toSlug(getSvgStem(item.svgFile));

  if (nameSlug) {
    aliases.add(nameSlug);
  }

  if (svgSlug) {
    aliases.add(svgSlug);
  }

  if (item.id !== undefined && item.id !== null) {
    aliases.add(String(item.id));
  }

  return Array.from(aliases);
}

function mergeItemsConfig() {
  const activeDynamicItems = getDynamicItemsForChain(dynamicItemsConfig, getConfig().chainId);
  const mergedItems = new Map();

  for (const item of baseItemsConfig.items || []) {
    mergedItems.set(item.id, item);
  }

  for (const item of activeDynamicItems.items || []) {
    mergedItems.set(item.id, item);
  }

  return Array.from(mergedItems.values())
    .sort((left, right) => left.id - right.id)
    .map((item) => {
      const slug = getPreferredItemSlug(item);
      return {
        ...item,
        aliases: getItemAliases(item, slug),
        itemType: item.id,
        slug
      };
    });
}

const itemsCatalog = mergeItemsConfig();
const itemsByType = new Map(itemsCatalog.map((item) => [item.itemType, item]));
const itemsBySlug = new Map();

for (const item of itemsCatalog) {
  for (const alias of item.aliases) {
    itemsBySlug.set(alias, item);
  }
}

function getItemsCatalog() {
  return itemsCatalog;
}

function getItemDescriptorByType(itemType) {
  return itemsByType.get(Number(itemType)) || null;
}

function getItemDescriptorBySlug(slug) {
  return itemsBySlug.get(toSlug(slug)) || null;
}

function getItemSlug(item) {
  return item?.slug || null;
}

module.exports = {
  getItemDescriptorBySlug,
  getItemDescriptorByType,
  getItemSlug,
  getItemsCatalog
};
