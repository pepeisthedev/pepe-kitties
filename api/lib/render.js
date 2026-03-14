const fs = require("fs");
const path = require("path");
const defaultTraits = require("../data/default-traits.json");

const ASSET_ROOT = path.join(__dirname, "../assets/frogz");
const BASE_HEAD_COUNT = defaultTraits.head.length;
const BASE_BELLY_COUNT = defaultTraits.stomach.filter((entry) => !entry.isNone).length;
const SVG_VIEWBOX = "0 0 617.49 644.18";
const SVG_WIDTH = "617.49";
const SVG_HEIGHT = "644.18";
const SVG_MIME_PREFIX = "data:image/svg+xml;base64,";
const DEFAULT_COLOR_PATTERN = /#65b449/gi;
const DEFAULT_BODY_COLOR = "#65b449";

const assetCache = new Map();

function readAsset(relativePath) {
  if (assetCache.has(relativePath)) {
    return assetCache.get(relativePath);
  }

  const absolutePath = path.join(ASSET_ROOT, relativePath);
  const svg = fs.readFileSync(absolutePath, "utf8");
  assetCache.set(relativePath, svg);
  return svg;
}

function assetExists(relativePath) {
  return fs.existsSync(path.join(ASSET_ROOT, relativePath));
}

function svgToDataUri(svg) {
  return `${SVG_MIME_PREFIX}${Buffer.from(svg, "utf8").toString("base64")}`;
}

function buildImageLayer(svg) {
  return `<image href="${svgToDataUri(svg)}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" preserveAspectRatio="xMidYMid meet"/>`;
}

function replaceDefaultColor(svg, color) {
  return svg.replace(DEFAULT_COLOR_PATTERN, color);
}

function getTraitAssetPath(traitType, trait) {
  if (!trait?.fileName) {
    return null;
  }

  if (traitType === "background") {
    return `default/background/${trait.fileName}`;
  }

  if (traitType === "body") {
    return `${trait.source === "from_items" ? "from_items/skin" : "default/skin"}/${trait.fileName}`;
  }

  if (traitType === "head") {
    return `${trait.source === "from_items" ? "from_items/head" : "default/head"}/${trait.fileName}`;
  }

  if (traitType === "mouth") {
    return `default/mouth/${trait.fileName}`;
  }

  if (traitType === "belly") {
    return `${trait.source === "from_items" ? "from_items/stomach" : "default/stomach"}/${trait.fileName}`;
  }

  return null;
}

function buildSvgImageDataUri(svg) {
  return `data:image/svg+xml,${svg}`;
}

function renderTraitSvg(traitType, trait, options = {}) {
  if (!trait?.renderable) {
    throw new Error("Trait has no standalone SVG");
  }

  const color = options.color || DEFAULT_BODY_COLOR;

  if (trait.dynamicColor) {
    if (traitType === "background") {
      return replaceDefaultColor(readAsset("default/background/1.svg"), color);
    }

    if (traitType === "body") {
      return replaceDefaultColor(readAsset("default/skin/1.svg"), color);
    }
  }

  const relativePath = getTraitAssetPath(traitType, trait);
  if (!relativePath) {
    throw new Error(`Unsupported trait type: ${traitType}`);
  }

  return readAsset(relativePath);
}

function resolveBackgroundSvg(backgroundId, bodyColor) {
  const relativePath =
    backgroundId > 0 && assetExists(`default/background/${backgroundId}.svg`)
      ? `default/background/${backgroundId}.svg`
      : "default/background/1.svg";

  return replaceDefaultColor(readAsset(relativePath), bodyColor);
}

function resolveBodySvg(bodyId, bodyColor) {
  if (bodyId > 0) {
    return readAsset(`from_items/skin/${bodyId}.svg`);
  }

  return replaceDefaultColor(readAsset("default/skin/1.svg"), bodyColor);
}

function resolveHeadSvg(headId) {
  if (headId > BASE_HEAD_COUNT) {
    return readAsset(`from_items/head/${headId - BASE_HEAD_COUNT}.svg`);
  }

  return readAsset(`default/head/${headId}.svg`);
}

function resolveMouthSvg(mouthId) {
  if (!mouthId) {
    return null;
  }

  return readAsset(`default/mouth/${mouthId}.svg`);
}

function resolveBellySvg(bodyId, bellyId) {
  if (bodyId > 0 || !bellyId) {
    return null;
  }

  if (bellyId > BASE_BELLY_COUNT) {
    return readAsset(`from_items/stomach/${bellyId - BASE_BELLY_COUNT}.svg`);
  }

  return readAsset(`default/stomach/${bellyId}.svg`);
}

function renderFregSvg(fregData) {
  const layers = [
    resolveBackgroundSvg(fregData.background, fregData.bodyColor),
    resolveBodySvg(fregData.body, fregData.bodyColor),
    resolveBellySvg(fregData.body, fregData.belly),
    resolveHeadSvg(fregData.head),
    resolveMouthSvg(fregData.mouth)
  ]
    .filter(Boolean)
    .map((svg) => buildImageLayer(svg));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SVG_VIEWBOX}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">${layers.join("")}</svg>`;
}

module.exports = {
  buildSvgImageDataUri,
  renderFregSvg,
  renderTraitSvg
};
