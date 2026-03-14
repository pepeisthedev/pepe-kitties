const FREGS_ABI = [
  "function getAllTokenIds() view returns (uint256[] tokenIds)",
  "function getBurnedTokenIds() view returns (uint256[] tokenIds)",
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

module.exports = {
  FREGS_ABI
};
