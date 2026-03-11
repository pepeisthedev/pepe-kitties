const FREGS_ABI = [
  "function svgRenderer() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const FREGS_SVG_RENDERER_ABI = [
  "function backgroundContract() view returns (address)",
  "function bodyContract() view returns (address)",
  "function skinContract() view returns (address)",
  "function headContract() view returns (address)",
  "function mouthContract() view returns (address)",
  "function bellyContract() view returns (address)",
  "function svgHeader() view returns (string)",
  "function svgFooter() view returns (string)",
  "function getBaseTraitCount(uint256 traitType) view returns (uint256)"
];

const SVG_ROUTER_ABI = [
  "function render(uint256 typeId) view returns (string)",
  "function meta(uint256 typeId) view returns (string)",
  "function isValidTrait(uint256 typeId) view returns (bool)"
];

const BODY_RENDERER_ABI = [
  "function renderWithColor(string color) view returns (string)"
];

module.exports = {
  BODY_RENDERER_ABI,
  FREGS_ABI,
  FREGS_SVG_RENDERER_ABI,
  SVG_ROUTER_ABI
};
