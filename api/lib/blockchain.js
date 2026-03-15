const { Contract, JsonRpcProvider, getAddress } = require("ethers");
const { FREGS_ABI, FREGS_ITEMS_ABI, FREGS_ITEMS_RENDERER_ABI } = require("./abis");
const { getConfig } = require("./config");

const DEFAULT_TRAIT_COLOR = "#65b449";
const NONE_TRAIT = (1n << 256n) - 1n;
const READ_GAS_LIMIT = 50_000_000n;

let provider;
let fregsContract;
let fregsItemsContract;
let fregsItemsRendererAddress;
let fregsItemsRendererContract;

function getProvider() {
  if (!provider) {
    const config = getConfig();
    provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  }

  return provider;
}

function getFregsContract() {
  if (!fregsContract) {
    fregsContract = new Contract(getConfig().fregsAddress, FREGS_ABI, getProvider());
  }

  return fregsContract;
}

function getFregsItemsContract() {
  const { fregsItemsAddress } = getConfig();
  if (!fregsItemsAddress) {
    return null;
  }

  if (!fregsItemsContract) {
    fregsItemsContract = new Contract(fregsItemsAddress, FREGS_ITEMS_ABI, getProvider());
  }

  return fregsItemsContract;
}

async function getFregsItemsRendererContract() {
  const contract = getFregsItemsContract();
  if (!contract) {
    return null;
  }

  if (!fregsItemsRendererAddress) {
    fregsItemsRendererAddress = await contract.svgRenderer();
  }

  if (!fregsItemsRendererAddress || /^0x0{40}$/i.test(fregsItemsRendererAddress)) {
    return null;
  }

  if (!fregsItemsRendererContract) {
    fregsItemsRendererContract = new Contract(
      fregsItemsRendererAddress,
      FREGS_ITEMS_RENDERER_ABI,
      getProvider()
    );
  }

  return fregsItemsRendererContract;
}

function normalizeColor(color) {
  const input = String(color || DEFAULT_TRAIT_COLOR).trim();
  const normalized = input.startsWith("#") ? input : `#${input}`;

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized) && !/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    throw new Error("Color must be a hex value like #65b449");
  }

  return normalized;
}

async function fetchTotalMinted() {
  const totalMinted = await getFregsContract().totalMinted();
  return Number(totalMinted);
}

async function fetchSupply() {
  const supply = await getFregsContract().totalSupply();
  return Number(supply);
}

async function fetchAllTokenIds() {
  const tokenIds = await getFregsContract().getAllTokenIds();
  return tokenIds.map((tokenId) => Number(tokenId));
}

async function fetchBurnedTokenIds() {
  const tokenIds = await getFregsContract().getBurnedTokenIds();
  return tokenIds.map((tokenId) => Number(tokenId));
}

async function fetchTokenPage(cursor, limit, includeBurned) {
  const result = await getFregsContract().getTokenPage(cursor, limit, includeBurned);

  return {
    existsFlags: Array.from(result[1]),
    nextCursor: Number(result[2]),
    supply: Number(result[3]),
    tokenIds: result[0].map((tokenId) => Number(tokenId)),
    totalMinted: Number(result[4])
  };
}

function normalizeWalletAddress(address) {
  return getAddress(address);
}

function normalizeTraitValue(value) {
  if (typeof value === "bigint") {
    if (value === NONE_TRAIT) {
      return 0;
    }

    return Number(value);
  }

  return Number(value || 0);
}

async function fetchFregDataFromMappings(tokenId) {
  const contract = getFregsContract();
  const [bodyColor, background, body, head, mouth, belly] = await Promise.all([
    contract.bodyColor(tokenId),
    contract.background(tokenId),
    contract.body(tokenId),
    contract.head(tokenId),
    contract.mouth(tokenId),
    contract.belly(tokenId)
  ]);

  return {
    background: normalizeTraitValue(background),
    belly: normalizeTraitValue(belly),
    body: normalizeTraitValue(body),
    bodyColor,
    head: normalizeTraitValue(head),
    mouth: normalizeTraitValue(mouth),
    tokenId: Number(tokenId)
  };
}

async function fetchFregDataBatch(tokenIds) {
  if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
    return [];
  }

  try {
    const result = await getFregsContract().getFregDataBatch(tokenIds);
    const bodyColors = result[0];
    const backgrounds = result[1];
    const bodies = result[2];
    const heads = result[3];
    const mouths = result[4];
    const bellies = result[5];

    return tokenIds.map((tokenId, index) => ({
      background: normalizeTraitValue(backgrounds[index]),
      belly: normalizeTraitValue(bellies[index]),
      body: normalizeTraitValue(bodies[index]),
      bodyColor: bodyColors[index],
      head: normalizeTraitValue(heads[index]),
      mouth: normalizeTraitValue(mouths[index]),
      tokenId: Number(tokenId)
    }));
  } catch (error) {
    return Promise.all(tokenIds.map((tokenId) => fetchFregDataFromMappings(tokenId)));
  }
}

async function fetchFregData(tokenId) {
  const [fregData] = await fetchFregDataBatch([tokenId]);
  return fregData || null;
}

async function fetchOwnedFregs(owner) {
  const normalizedOwner = normalizeWalletAddress(owner);

  try {
    const result = await getFregsContract().getOwnedFregs(normalizedOwner);
    const tokenIds = result[0].map((tokenId) => Number(tokenId));
    const bodyColors = result[1];
    const backgrounds = result[2];
    const bodies = result[3];
    const heads = result[4];
    const mouths = result[5];
    const bellies = result[6];

    return tokenIds.map((tokenId, index) => ({
      background: normalizeTraitValue(backgrounds[index]),
      belly: normalizeTraitValue(bellies[index]),
      body: normalizeTraitValue(bodies[index]),
      bodyColor: bodyColors[index],
      head: normalizeTraitValue(heads[index]),
      mouth: normalizeTraitValue(mouths[index]),
      tokenId
    }));
  } catch (error) {
    const tokenIds = await fetchAllTokenIds();
    const ownedTokenIds = [];

    for (const tokenId of tokenIds) {
      const tokenOwner = await fetchOwner(tokenId);
      if (tokenOwner && tokenOwner.toLowerCase() === normalizedOwner.toLowerCase()) {
        ownedTokenIds.push(tokenId);
      }
    }

    return fetchFregDataBatch(ownedTokenIds);
  }
}

async function fetchOwner(tokenId) {
  try {
    return await getFregsContract().ownerOf(tokenId);
  } catch (error) {
    return null;
  }
}

async function fetchTokenUri(tokenId) {
  return getFregsContract().tokenURI(tokenId, { gasLimit: READ_GAS_LIMIT });
}

async function fetchItemTypeConfig(itemType) {
  const contract = getFregsItemsContract();
  if (!contract) {
    throw new Error("FregsItems contract not configured");
  }

  const config = await contract.itemTypeConfigs(itemType);
  return {
    claimWeight: Number(config.claimWeight ?? config[6] ?? 0),
    description: config.description ?? config[1] ?? "",
    isClaimable: Boolean(config.isClaimable ?? config[5]),
    isOwnerMintable: Boolean(config.isOwnerMintable ?? config[4]),
    name: config.name ?? config[0] ?? "",
    targetTraitType: Number(config.targetTraitType ?? config[2] ?? 0),
    traitValue: Number(config.traitValue ?? config[3] ?? 0)
  };
}

async function fetchItemSvg(itemType) {
  const renderer = await getFregsItemsRendererContract();
  if (!renderer) {
    throw new Error("FregsItems renderer not configured");
  }

  return renderer.render(itemType, { gasLimit: READ_GAS_LIMIT });
}

async function fetchOwnedItems(owner) {
  const normalizedOwner = normalizeWalletAddress(owner);
  const contract = getFregsItemsContract();
  if (!contract) {
    throw new Error("FregsItems contract not configured");
  }

  try {
    const result = await contract.getOwnedItems(normalizedOwner);
    return {
      tokenIds: result[0].map((tokenId) => Number(tokenId)),
      types: result[1].map((itemType) => Number(itemType))
    };
  } catch (error) {
    const totalMinted = Number(await contract.totalMinted());
    const tokenIds = [];
    const types = [];

    for (let tokenId = 0; tokenId < totalMinted; tokenId += 1) {
      try {
        const tokenOwner = await contract.ownerOf(tokenId);
        if (tokenOwner.toLowerCase() !== normalizedOwner.toLowerCase()) {
          continue;
        }

        tokenIds.push(tokenId);
        types.push(Number(await contract.itemType(tokenId)));
      } catch (innerError) {
        continue;
      }
    }

    return {
      tokenIds,
      types
    };
  }
}

module.exports = {
  fetchAllTokenIds,
  fetchBurnedTokenIds,
  fetchFregData,
  fetchFregDataBatch,
  fetchItemSvg,
  fetchItemTypeConfig,
  fetchOwnedFregs,
  fetchOwnedItems,
  fetchOwner,
  fetchSupply,
  fetchTokenPage,
  fetchTokenUri,
  fetchTotalMinted,
  getConfig,
  normalizeColor,
  normalizeWalletAddress
};
