const FREGS_ABI = [
  "function getAllTokenIds() view returns (uint256[] tokenIds)",
  "function getBurnedTokenIds() view returns (uint256[] tokenIds)",
  "function getOwnedFregs(address owner) view returns (uint256[] tokenIds, string[] bodyColors, uint256[] backgrounds, uint256[] bodies, uint256[] heads, uint256[] mouths, uint256[] bellies)",
  "function getTokenPage(uint256 cursor, uint256 limit, bool includeBurned) view returns (uint256[] tokenIds, bool[] existsFlags, uint256 nextCursor, uint256 supply, uint256 totalMintedValue)",
  "function getFregDataBatch(uint256[] tokenIds) view returns (string[] bodyColors, uint256[] backgrounds, uint256[] bodies, uint256[] heads, uint256[] mouths, uint256[] bellies)",
  "function bodyColor(uint256 tokenId) view returns (string)",
  "function background(uint256 tokenId) view returns (uint256)",
  "function body(uint256 tokenId) view returns (uint256)",
  "function head(uint256 tokenId) view returns (uint256)",
  "function mouth(uint256 tokenId) view returns (uint256)",
  "function belly(uint256 tokenId) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const FREGS_ITEMS_ABI = [
  "function getOwnedItems(address owner) view returns (uint256[] tokenIds, uint256[] types)",
  "function itemTypeConfigs(uint256 itemTypeId) view returns (string name, string description, uint256 targetTraitType, uint256 traitValue, bool isOwnerMintable, bool isClaimable, uint256 claimWeight)",
  "function svgRenderer() view returns (address)",
  "function totalMinted() view returns (uint256)",
  "function itemType(uint256 tokenId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)"
];

const FREGS_ITEMS_RENDERER_ABI = [
  "function render(uint256 itemType) view returns (string)"
];

module.exports = {
  FREGS_ABI,
  FREGS_ITEMS_ABI,
  FREGS_ITEMS_RENDERER_ABI
};
