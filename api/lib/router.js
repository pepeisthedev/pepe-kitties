const {
  fetchOwner,
  fetchSupply,
  fetchTokenUri,
  fetchTotalMinted,
  fetchTraitName,
  fetchTraitSvg,
  getConfig,
  normalizeColor
} = require("./blockchain");
const {
  badRequest,
  gone,
  handleOptions,
  methodNotAllowed,
  notFound,
  parseBoolean,
  parseInteger,
  sendJson,
  sendSvg,
  serverError
} = require("./http");
const {
  buildAttributesIndex,
  decodeTokenUri,
  extractSvgFromImage
} = require("./metadata");
const {
  getTraitDescriptor,
  getTraitGroup,
  getTraitsSummary,
  normalizeTraitType
} = require("./traits");

const TRAITS_CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=604800";
const NFTS_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";
const NFT_LIST_CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=120";

function getCollectionInfo() {
  const config = getConfig();
  return {
    collection: config.collectionName,
    contractAddress: config.fregsAddress
  };
}

function getRequestOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "http";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

function buildAbsoluteUrl(req, path) {
  const origin = getRequestOrigin(req);
  return origin ? `${origin}${path}` : path;
}

function getOpenSeaUrl(tokenId) {
  const config = getConfig();
  const contractAddress = config.fregsAddress;

  if (config.chainId === 8453) {
    return `https://opensea.io/item/base/${contractAddress}/${tokenId}`;
  }

  if (config.chainId === 84532) {
    return `https://testnets.opensea.io/assets/base_sepolia/${contractAddress}/${tokenId}`;
  }

  return undefined;
}

function getTokenLinks(req, tokenId) {
  return {
    imageSvg: buildAbsoluteUrl(req, `/fregs/${tokenId}/image.svg`),
    metadata: buildAbsoluteUrl(req, `/fregs/${tokenId}/metadata`),
    opensea: getOpenSeaUrl(tokenId),
    owner: buildAbsoluteUrl(req, `/fregs/${tokenId}/owner`),
    self: buildAbsoluteUrl(req, `/fregs/${tokenId}`)
  };
}

function buildRootPayload() {
  return {
    ...getCollectionInfo(),
    endpoints: {
      fregIds: "/fregs/ids",
      fregs: "/fregs",
      traits: "/fregs/traits"
    },
    examples: [
      "/fregs/traits/head/1",
      `/fregs/traits/body/0?color=${encodeURIComponent(getConfig().defaultColor)}`,
      "/fregs/traits/head/1?format=json",
      "/fregs?limit=25",
      "/fregs/12",
      "/fregs/12/owner",
      "/fregs/12/metadata"
    ]
  };
}

function parseTokenId(value) {
  if (!/^\d+$/.test(String(value || ""))) {
    return null;
  }

  return Number.parseInt(String(value), 10);
}

function buildPublicTokenPayload(req, tokenId, owner, metadata) {
  const svg = extractSvgFromImage(metadata.image);

  return {
    tokenId,
    name: metadata.name || `Freg #${tokenId}`,
    description: metadata.description || getCollectionInfo().collection,
    owner,
    image: svg || metadata.image || null,
    attributes: Array.isArray(metadata.attributes) ? metadata.attributes : [],
    links: getTokenLinks(req, tokenId)
  };
}

async function buildTokenMetadataResponse(req, tokenId) {
  const owner = await fetchOwner(tokenId);
  const totalMinted = owner ? null : await fetchTotalMinted();

  if (!owner) {
    if (tokenId < totalMinted) {
      return {
        error: "Token was minted but no longer exists",
        status: 410
      };
    }

    return {
      error: "Token not found",
      status: 404
    };
  }

  const tokenUri = await fetchTokenUri(tokenId);
  const metadata = decodeTokenUri(tokenUri);

  return {
    data: buildPublicTokenPayload(req, tokenId, owner, metadata),
    metadata,
    svg: extractSvgFromImage(metadata.image),
    status: 200
  };
}

async function handleTraitsRoute(req, res, segments) {
  if (segments.length === 0) {
    const traitTypes = await getTraitsSummary();
    return sendJson(res, 200, {
      ...getCollectionInfo(),
      traitTypes
    }, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  const traitType = normalizeTraitType(segments[0]);
  if (!traitType) {
    return notFound(res, "Unknown trait type");
  }

  if (segments.length === 1) {
    const traits = await getTraitGroup(traitType);
    return sendJson(res, 200, {
      ...getCollectionInfo(),
      count: traits.length,
      traitType,
      traits
    }, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  if (segments.length !== 2) {
    return notFound(res);
  }

  const traitId = parseTokenId(segments[1]);
  if (traitId === null) {
    return badRequest(res, "Trait id must be a non-negative integer");
  }

  const trait = await getTraitDescriptor(traitType, traitId);
  if (!trait) {
    return notFound(res, "Trait not found");
  }

  const wantsJson = String(req.query?.format || "").toLowerCase() === "json";

  if (!trait.renderable && !wantsJson) {
    return badRequest(res, "This trait has no standalone SVG");
  }

  if (!trait.renderable) {
    return sendJson(res, 200, {
      ...getCollectionInfo(),
      trait: {
        ...trait
      }
    }, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  let color;
  try {
    color = req.query?.color ? normalizeColor(req.query.color) : getConfig().defaultColor;
  } catch (error) {
    return badRequest(res, error.message);
  }

  const onChainName = await fetchTraitName(traitType, traitId).catch(() => trait.name);

  const svg = await fetchTraitSvg(traitType, traitId, { color });

  if (!wantsJson) {
    return sendSvg(res, 200, svg, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  return sendJson(res, 200, {
    ...getCollectionInfo(),
    svg,
    trait: {
      ...trait,
      color,
      name: onChainName
    }
  }, {
    "Cache-Control": TRAITS_CACHE_HEADER
  });
}

async function handleNftsRoute(req, res, segments) {
  if (segments.length === 0) {
    const config = getConfig();
    const cursor = parseInteger(req.query?.cursor, 0, { min: 0 });
    const limit = parseInteger(req.query?.limit, 25, { min: 1, max: config.maxNftsPerPage });
    const includeMetadata = parseBoolean(req.query?.includeMetadata);
    const includeBurned = parseBoolean(req.query?.includeBurned);
    const supply = await fetchSupply();
    const totalMinted = await fetchTotalMinted();
    const items = [];
    let scanIndex = cursor;

    while (scanIndex < totalMinted && items.length < limit) {
      const tokenId = scanIndex;
      scanIndex += 1;

      const owner = await fetchOwner(tokenId);
      if (!owner && !includeBurned) {
        continue;
      }

      const item = {
        exists: Boolean(owner),
        links: getTokenLinks(req, tokenId),
        owner,
        tokenId
      };

      if (!owner) {
        item.status = "burned";
      }

      if (includeMetadata && owner) {
        const tokenUri = await fetchTokenUri(tokenId);
        const metadata = decodeTokenUri(tokenUri);
        item.name = metadata.name || `Freg #${tokenId}`;
        item.description = metadata.description || getCollectionInfo().collection;
        item.attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];
        item.attributesByType = buildAttributesIndex(metadata);
        item.image = extractSvgFromImage(metadata.image) || metadata.image || null;
      }

      items.push(item);
    }

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      count: items.length,
      cursor,
      includeBurned,
      includeMetadata,
      items,
      limit,
      nextCursor: scanIndex < totalMinted ? scanIndex : null,
      supply
    }, {
      "Cache-Control": NFT_LIST_CACHE_HEADER
    });
  }

  if (segments[0] === "ids") {
    const includeBurned = parseBoolean(req.query?.includeBurned);
    const totalMinted = await fetchTotalMinted();
    const tokenIds = [];
    const burnedTokenIds = [];

    for (let tokenId = 0; tokenId < totalMinted; tokenId += 1) {
      const owner = await fetchOwner(tokenId);
      if (owner) {
        tokenIds.push(tokenId);
      } else if (includeBurned) {
        burnedTokenIds.push(tokenId);
      }
    }

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      burnedTokenIds: includeBurned ? burnedTokenIds : undefined,
      supply: tokenIds.length,
      tokenIds
    }, {
      "Cache-Control": NFT_LIST_CACHE_HEADER
    });
  }

  const tokenId = parseTokenId(segments[0]);
  if (tokenId === null) {
    return notFound(res);
  }

  if (segments.length === 1) {
    const response = await buildTokenMetadataResponse(req, tokenId);

    if (response.status === 404) {
      return notFound(res, response.error);
    }

    if (response.status === 410) {
      return gone(res, response.error);
    }

    return sendJson(res, 200, response.data, {
      "Cache-Control": NFTS_CACHE_HEADER
    });
  }

  if (segments.length === 2 && segments[1] === "image.svg") {
    const response = await buildTokenMetadataResponse(req, tokenId);

    if (response.status === 404) {
      return notFound(res, response.error);
    }

    if (response.status === 410) {
      return gone(res, response.error);
    }

    if (!response.svg) {
      return serverError(res, new Error("Token metadata did not include an SVG image"));
    }

    return sendSvg(res, 200, response.svg, {
      "Cache-Control": NFTS_CACHE_HEADER
    });
  }

  if (segments.length === 2 && segments[1] === "owner") {
    const owner = await fetchOwner(tokenId);
    const totalMinted = owner ? null : await fetchTotalMinted();

    if (!owner) {
      if (tokenId < totalMinted) {
        return gone(res, "Token was minted but no longer exists");
      }

      return notFound(res, "Token not found");
    }

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      owner,
      tokenId
    }, {
      "Cache-Control": NFTS_CACHE_HEADER
    });
  }

  if (segments.length === 2 && segments[1] === "metadata") {
    const response = await buildTokenMetadataResponse(req, tokenId);

    if (response.status === 404) {
      return notFound(res, response.error);
    }

    if (response.status === 410) {
      return gone(res, response.error);
    }

    return sendJson(res, 200, response.metadata, {
      "Cache-Control": NFTS_CACHE_HEADER
    });
  }

  return notFound(res);
}

async function routeRequest(req, res, segments) {
  if (handleOptions(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return methodNotAllowed(res);
  }

  if (segments.length === 0) {
    return sendJson(res, 200, buildRootPayload(), {
      "Cache-Control": NFT_LIST_CACHE_HEADER
    });
  }

  if (segments[0] === "fregs") {
    if (segments[1] === "traits") {
      return handleTraitsRoute(req, res, segments.slice(2));
    }

    return handleNftsRoute(req, res, segments.slice(1));
  }

  return notFound(res);
}

async function handleRootRequest(req, res) {
  try {
    return routeRequest(req, res, []);
  } catch (error) {
    console.error(error);
    return serverError(res, error);
  }
}

async function handleRoutedRequest(req, res, segments) {
  try {
    return routeRequest(req, res, segments);
  } catch (error) {
    console.error(error);
    return serverError(res, error);
  }
}

module.exports = {
  handleRootRequest,
  handleRoutedRequest
};
