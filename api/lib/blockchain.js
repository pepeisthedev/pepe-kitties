const { Contract, JsonRpcProvider } = require("ethers");
const {
  BODY_RENDERER_ABI,
  FREGS_ABI,
  FREGS_SVG_RENDERER_ABI,
  SVG_ROUTER_ABI
} = require("./abis");
const { getConfig } = require("./config");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const READ_GAS_LIMIT = 50_000_000n;
const TRAIT_TYPE_IDS = {
  background: 0,
  body: 1,
  head: 2,
  mouth: 3,
  belly: 4
};

let provider;
let fregsContract;
let rendererContractPromise;
let rendererInfoPromise;
let traitContractsPromise;

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

function isZeroAddress(address) {
  return !address || address.toLowerCase() === NULL_ADDRESS;
}

async function getSvgRendererContract() {
  if (!rendererContractPromise) {
    rendererContractPromise = (async () => {
      const config = getConfig();
      const address = config.svgRendererAddress || await getFregsContract().svgRenderer();
      return new Contract(address, FREGS_SVG_RENDERER_ABI, getProvider());
    })();
  }

  return rendererContractPromise;
}

async function getRendererInfo() {
  if (!rendererInfoPromise) {
    rendererInfoPromise = (async () => {
      const renderer = await getSvgRendererContract();
      const [svgHeader, svgFooter, baseHeadCount] = await Promise.all([
        renderer.svgHeader(),
        renderer.svgFooter(),
        renderer.getBaseTraitCount(TRAIT_TYPE_IDS.head)
      ]);

      return {
        baseHeadCount: Number(baseHeadCount),
        renderer,
        svgFooter,
        svgHeader
      };
    })();
  }

  return rendererInfoPromise;
}

function createOptionalContract(address, abi) {
  if (isZeroAddress(address)) {
    return null;
  }

  return new Contract(address, abi, getProvider());
}

async function getTraitContracts() {
  if (!traitContractsPromise) {
    traitContractsPromise = (async () => {
      const renderer = await getSvgRendererContract();
      const [background, body, skin, head, mouth, belly] = await Promise.all([
        renderer.backgroundContract(),
        renderer.bodyContract(),
        renderer.skinContract(),
        renderer.headContract(),
        renderer.mouthContract(),
        renderer.bellyContract()
      ]);

      return {
        background: createOptionalContract(background, SVG_ROUTER_ABI),
        belly: createOptionalContract(belly, SVG_ROUTER_ABI),
        body: createOptionalContract(body, BODY_RENDERER_ABI),
        head: createOptionalContract(head, SVG_ROUTER_ABI),
        mouth: createOptionalContract(mouth, SVG_ROUTER_ABI),
        skin: createOptionalContract(skin, SVG_ROUTER_ABI)
      };
    })();
  }

  return traitContractsPromise;
}

async function getBaseHeadCount() {
  const rendererInfo = await getRendererInfo();
  return rendererInfo.baseHeadCount;
}

function buildBackgroundFragment(color) {
  return `<rect width='100%' height='100%' fill='${color}' opacity='0.3'/>`;
}

async function wrapSvg(fragment) {
  const rendererInfo = await getRendererInfo();
  return `${rendererInfo.svgHeader}${fragment}${rendererInfo.svgFooter}`;
}

function normalizeColor(color) {
  const input = String(color || getConfig().defaultColor).trim();
  const normalized = input.startsWith("#") ? input : `#${input}`;

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized) && !/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    throw new Error("Color must be a hex value like #65b449");
  }

  return normalized;
}

async function fetchTraitSvg(traitType, traitId, options = {}) {
  const contracts = await getTraitContracts();
  const color = normalizeColor(options.color);
  let fragment;

  if (traitType === "background") {
    if (traitId === 0) {
      fragment = buildBackgroundFragment(color);
    } else {
      fragment = await contracts.background.render(traitId, { gasLimit: READ_GAS_LIMIT });
    }
  } else if (traitType === "body") {
    if (traitId === 0) {
      fragment = await contracts.body.renderWithColor(color, { gasLimit: READ_GAS_LIMIT });
    } else {
      fragment = await contracts.skin.render(traitId, { gasLimit: READ_GAS_LIMIT });
    }
  } else if (traitType === "head") {
    fragment = await contracts.head.render(traitId, { gasLimit: READ_GAS_LIMIT });
  } else if (traitType === "mouth") {
    fragment = await contracts.mouth.render(traitId, { gasLimit: READ_GAS_LIMIT });
  } else if (traitType === "belly") {
    fragment = await contracts.belly.render(traitId, { gasLimit: READ_GAS_LIMIT });
  } else {
    throw new Error(`Unsupported trait type: ${traitType}`);
  }

  return wrapSvg(fragment);
}

async function fetchTraitName(traitType, traitId) {
  if (traitId === 0) {
    if (traitType === "background") {
      return "Dynamic Background";
    }

    if (traitType === "body") {
      return "Base";
    }

    return "None";
  }

  const contracts = await getTraitContracts();

  if (traitType === "background") {
    return contracts.background.meta(traitId);
  }

  if (traitType === "body") {
    return contracts.skin.meta(traitId);
  }

  if (traitType === "head") {
    return contracts.head.meta(traitId);
  }

  if (traitType === "mouth") {
    return contracts.mouth.meta(traitId);
  }

  if (traitType === "belly") {
    return contracts.belly.meta(traitId);
  }

  throw new Error(`Unsupported trait type: ${traitType}`);
}

async function fetchTotalMinted() {
  const totalMinted = await getFregsContract().totalMinted();
  return Number(totalMinted);
}

async function fetchSupply() {
  const supply = await getFregsContract().totalSupply();
  return Number(supply);
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

module.exports = {
  fetchOwner,
  fetchSupply,
  fetchTokenUri,
  fetchTotalMinted,
  fetchTraitName,
  fetchTraitSvg,
  getBaseHeadCount,
  getConfig,
  normalizeColor
};
