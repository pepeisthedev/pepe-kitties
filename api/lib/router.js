const {
  fetchAllTokenIds,
  fetchBurnedTokenIds,
  fetchFregData,
  fetchFregDataBatch,
  fetchOwnedFregs,
  fetchOwner,
  fetchSupply,
  fetchTokenPage,
  fetchTokenUri,
  fetchTotalMinted,
  getConfig,
  normalizeColor,
  normalizeWalletAddress
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
  buildSvgImageDataUri,
  renderFregSvg,
  renderTraitSvg
} = require("./render");
const {
  getTraitDescriptor,
  getTraitGroup,
  getTraitsSummary,
  normalizeTraitType
} = require("./traits");

const TRAITS_CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=604800";
const NFTS_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";
const NFT_LIST_CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=120";
const DEFAULT_DYNAMIC_TRAIT_COLOR = "#65b449";

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

function buildQueryString(params) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
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

function getTraitLinks(req, traitType, trait) {
  const basePath = `/fregs/traits/${traitType}/${trait.id}`;
  const color = trait.dynamicColor ? DEFAULT_DYNAMIC_TRAIT_COLOR : undefined;
  const jsonPath = `${basePath}${buildQueryString({ color })}`;
  const links = {
    json: buildAbsoluteUrl(req, jsonPath)
  };

  if (trait.renderable) {
    links.svg = buildAbsoluteUrl(req, `${basePath}/image.svg${buildQueryString({ color })}`);
  }

  return links;
}

function serializeTrait(req, traitType, trait) {
  const payload = {
    links: getTraitLinks(req, traitType, trait),
    name: trait.name
  };

  if (trait.itemId !== null && trait.itemId !== undefined) {
    payload.itemId = trait.itemId;
  }

  if (trait.itemName) {
    payload.itemName = trait.itemName;
  }

  return payload;
}

function serializeTraitGroup(req, traitType, traits) {
  return {
    count: traits.length,
    traitType,
    traits: traits.map((trait) => serializeTrait(req, traitType, trait))
  };
}

function buildRootPayload() {
  return {
    ...getCollectionInfo(),
    endpoints: {
      fregIds: "/fregs/ids",
      fregs: "/fregs",
      ownedByWallet: "/fregs/owners/:address",
      traits: "/fregs/traits"
    },
    examples: [
      "/fregs/traits/head/1",
      `/fregs/traits/body/0?color=${encodeURIComponent(DEFAULT_DYNAMIC_TRAIT_COLOR)}`,
      "/fregs/traits/head/1/image.svg",
      "/fregs?limit=25",
      "/fregs/owners/0x0000000000000000000000000000000000000000",
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

async function buildAttributesFromFregData(fregData) {
  const [backgroundTrait, bodyTrait, headTrait, mouthTrait, bellyTrait] = await Promise.all([
    fregData.background > 0 ? getTraitDescriptor("background", fregData.background) : null,
    fregData.body > 0 ? getTraitDescriptor("body", fregData.body) : null,
    getTraitDescriptor("head", fregData.head),
    fregData.mouth > 0 ? getTraitDescriptor("mouth", fregData.mouth) : null,
    fregData.belly > 0 && fregData.body === 0 ? getTraitDescriptor("belly", fregData.belly) : null
  ]);

  if (fregData.background > 0 && !backgroundTrait) {
    throw new Error(`Unknown background trait: ${fregData.background}`);
  }

  if (fregData.body > 0 && !bodyTrait) {
    throw new Error(`Unknown body trait: ${fregData.body}`);
  }

  if (!headTrait) {
    throw new Error(`Unknown head trait: ${fregData.head}`);
  }

  if (fregData.mouth > 0 && !mouthTrait) {
    throw new Error(`Unknown mouth trait: ${fregData.mouth}`);
  }

  if (fregData.belly > 0 && fregData.body === 0 && !bellyTrait) {
    throw new Error(`Unknown belly trait: ${fregData.belly}`);
  }

  const attributes = [
    {
      trait_type: "Background",
      value: fregData.background > 0 ? backgroundTrait?.name || String(fregData.background) : fregData.bodyColor
    },
    {
      trait_type: "Body",
      value: fregData.body > 0 ? bodyTrait?.name || String(fregData.body) : fregData.bodyColor
    },
    {
      trait_type: "Head",
      value: headTrait?.name || String(fregData.head)
    },
    {
      trait_type: "Mouth",
      value: fregData.mouth > 0 ? mouthTrait?.name || String(fregData.mouth) : "None"
    }
  ];

  if (fregData.body === 0) {
    attributes.push({
      trait_type: "Belly",
      value: fregData.belly > 0 ? bellyTrait?.name || String(fregData.belly) : "None"
    });
  }

  return attributes;
}

async function buildPublicTokenPayloadFromFregData(req, tokenId, owner, fregData) {
  return {
    tokenId,
    name: `Freg #${tokenId}`,
    description: getCollectionInfo().collection,
    owner,
    image: renderFregSvg(fregData),
    attributes: await buildAttributesFromFregData(fregData),
    links: getTokenLinks(req, tokenId)
  };
}

async function buildCanonicalMetadataFromFregData(tokenId, fregData) {
  return {
    attributes: await buildAttributesFromFregData(fregData),
    description: getCollectionInfo().collection,
    image: buildSvgImageDataUri(renderFregSvg(fregData)),
    name: `Freg #${tokenId}`
  };
}

function buildPublicTokenPayloadFromMetadata(req, tokenId, owner, metadata) {
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

async function getTokenExistence(tokenId) {
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

  return {
    owner,
    status: 200
  };
}

async function buildTokenSummaryResponse(req, tokenId) {
  const existence = await getTokenExistence(tokenId);
  if (existence.status !== 200) {
    return existence;
  }

  try {
    const fregData = await fetchFregData(tokenId);
    const data = await buildPublicTokenPayloadFromFregData(req, tokenId, existence.owner, fregData);

    return {
      data,
      status: 200,
      svg: data.image
    };
  } catch (error) {
    const tokenUri = await fetchTokenUri(tokenId);
    const metadata = decodeTokenUri(tokenUri);

    return {
      data: buildPublicTokenPayloadFromMetadata(req, tokenId, existence.owner, metadata),
      status: 200,
      svg: extractSvgFromImage(metadata.image)
    };
  }
}

async function buildCanonicalMetadataResponse(tokenId) {
  const existence = await getTokenExistence(tokenId);
  if (existence.status !== 200) {
    return existence;
  }

  try {
    const fregData = await fetchFregData(tokenId);

    if (!fregData) {
      throw new Error("Missing Freg data");
    }

    return {
      metadata: await buildCanonicalMetadataFromFregData(tokenId, fregData),
      owner: existence.owner,
      status: 200
    };
  } catch (error) {
    const tokenUri = await fetchTokenUri(tokenId);
    const metadata = decodeTokenUri(tokenUri);

    return {
      metadata,
      owner: existence.owner,
      status: 200
    };
  }
}

async function fetchListPageWithFallback(cursor, limit, includeBurned) {
  try {
    return await fetchTokenPage(cursor, limit, includeBurned);
  } catch (error) {
    const supply = await fetchSupply();
    const totalMinted = await fetchTotalMinted();
    const tokenIds = [];
    const existsFlags = [];
    let scanIndex = cursor;

    while (scanIndex < totalMinted && tokenIds.length < limit) {
      const owner = await fetchOwner(scanIndex);
      const exists = Boolean(owner);

      if (exists || includeBurned) {
        tokenIds.push(scanIndex);
        existsFlags.push(exists);
      }

      scanIndex += 1;
    }

    return {
      existsFlags,
      nextCursor: scanIndex,
      supply,
      tokenIds,
      totalMinted
    };
  }
}

async function fetchIdsWithFallback(includeBurned) {
  try {
    const tokenIds = await fetchAllTokenIds();
    const burnedTokenIds = includeBurned ? await fetchBurnedTokenIds() : undefined;

    return {
      burnedTokenIds,
      supply: tokenIds.length,
      tokenIds
    };
  } catch (error) {
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

    return {
      burnedTokenIds: includeBurned ? burnedTokenIds : undefined,
      supply: tokenIds.length,
      tokenIds
    };
  }
}

async function handleOwnedByWalletRoute(req, res, segments) {
  if (segments.length === 3 && segments[2] !== "image.svg") {
    return notFound(res);
  }

  if (segments.length !== 2 && segments.length !== 3) {
    return notFound(res);
  }

  let owner;
  try {
    owner = normalizeWalletAddress(segments[1]);
  } catch (error) {
    return badRequest(res, "Owner address must be a valid EVM address");
  }

  const includeMetadata = parseBoolean(req.query?.includeMetadata);
  const ownedFregs = await fetchOwnedFregs(owner);
  const tokenIds = ownedFregs.map((entry) => entry.tokenId);
  const payload = {
    ...getCollectionInfo(),
    count: tokenIds.length,
    includeMetadata,
    owner,
    tokenIds
  };

  if (includeMetadata) {
    payload.fregs = await Promise.all(
      ownedFregs.map(async (fregData) => {
        try {
          const metadata = {
            attributes: await buildAttributesFromFregData(fregData),
            description: getCollectionInfo().collection,
            image: renderFregSvg(fregData),
            name: `Freg #${fregData.tokenId}`
          };

          return {
            attributes: metadata.attributes,
            attributesByType: buildAttributesIndex(metadata),
            description: metadata.description,
            image: metadata.image,
            links: getTokenLinks(req, fregData.tokenId),
            name: metadata.name,
            owner,
            tokenId: fregData.tokenId
          };
        } catch (error) {
          const tokenUri = await fetchTokenUri(fregData.tokenId);
          const metadata = decodeTokenUri(tokenUri);

          return {
            attributes: Array.isArray(metadata.attributes) ? metadata.attributes : [],
            attributesByType: buildAttributesIndex(metadata),
            description: metadata.description || getCollectionInfo().collection,
            image: extractSvgFromImage(metadata.image) || metadata.image || null,
            links: getTokenLinks(req, fregData.tokenId),
            name: metadata.name || `Freg #${fregData.tokenId}`,
            owner,
            tokenId: fregData.tokenId
          };
        }
      })
    );
  }

  return sendJson(res, 200, payload, {
    "Cache-Control": NFT_LIST_CACHE_HEADER
  });
}

async function handleTraitsRoute(req, res, segments) {
  if (segments.length === 0) {
    const traitTypes = await getTraitsSummary();
    const publicTraitTypes = Object.fromEntries(
      Object.entries(traitTypes).map(([traitType, group]) => [
        traitType,
        serializeTraitGroup(req, traitType, group.traits)
      ])
    );

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      traitTypes: publicTraitTypes
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
      ...serializeTraitGroup(req, traitType, traits)
    }, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  if (segments.length === 3 && segments[2] !== "image.svg") {
    return notFound(res);
  }

  if (segments.length !== 2 && segments.length !== 3) {
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

  const wantsSvg = segments[2] === "image.svg" || String(req.query?.format || "").toLowerCase() === "svg";

  if (!trait.renderable && wantsSvg) {
    return badRequest(res, "This trait has no standalone SVG");
  }

  if (!trait.renderable) {
    return sendJson(res, 200, {
      ...getCollectionInfo(),
      trait: serializeTrait(req, traitType, trait)
    }, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  let color;
  try {
    color = req.query?.color ? normalizeColor(req.query.color) : DEFAULT_DYNAMIC_TRAIT_COLOR;
  } catch (error) {
    return badRequest(res, error.message);
  }

  const svg = renderTraitSvg(traitType, trait, { color });

  if (wantsSvg) {
    return sendSvg(res, 200, svg, {
      "Cache-Control": TRAITS_CACHE_HEADER
    });
  }

  return sendJson(res, 200, {
    ...getCollectionInfo(),
    svg,
    trait: serializeTrait(req, traitType, trait)
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
    const page = await fetchListPageWithFallback(cursor, limit, includeBurned);
    let metadataResults = [];

    if (includeMetadata) {
      try {
        const existingTokenIds = page.tokenIds.filter((_, index) => page.existsFlags[index]);
        const batchResults = await fetchFregDataBatch(existingTokenIds);
        const batchById = new Map(batchResults.map((entry) => [entry.tokenId, entry]));

        metadataResults = await Promise.all(
          page.tokenIds.map(async (tokenId, index) => {
            if (!page.existsFlags[index]) {
              return null;
            }

            const fregData = batchById.get(tokenId);

            if (!fregData) {
              const tokenUri = await fetchTokenUri(tokenId);
              return decodeTokenUri(tokenUri);
            }

            return {
              attributes: await buildAttributesFromFregData(fregData),
              description: getCollectionInfo().collection,
              image: renderFregSvg(fregData),
              name: `Freg #${tokenId}`
            };
          })
        );
      } catch (error) {
        metadataResults = await Promise.all(
          page.tokenIds.map((tokenId, index) => {
            if (!page.existsFlags[index]) {
              return Promise.resolve(null);
            }

            return fetchTokenUri(tokenId).then((tokenUri) => decodeTokenUri(tokenUri));
          })
        );
      }
    }

    const items = page.tokenIds.map((tokenId, index) => {
      const exists = page.existsFlags[index];
      const item = {
        links: getTokenLinks(req, tokenId),
        tokenId
      };

      if (includeBurned) {
        item.exists = exists;
        if (!exists) {
          item.status = "burned";
        }
      }

      if (includeMetadata && exists) {
        const metadata = metadataResults[index];
        item.name = metadata.name || `Freg #${tokenId}`;
        item.description = metadata.description || getCollectionInfo().collection;
        item.attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];
        item.attributesByType = buildAttributesIndex(metadata);
        item.image = extractSvgFromImage(metadata.image) || metadata.image || null;
      }

      return item;
    });

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      count: items.length,
      cursor,
      includeBurned,
      includeMetadata,
      items,
      limit,
      nextCursor: page.nextCursor < page.totalMinted ? page.nextCursor : null,
      supply: page.supply
    }, {
      "Cache-Control": NFT_LIST_CACHE_HEADER
    });
  }

  if (segments[0] === "ids") {
    const includeBurned = parseBoolean(req.query?.includeBurned);
    const result = await fetchIdsWithFallback(includeBurned);

    return sendJson(res, 200, {
      ...getCollectionInfo(),
      burnedTokenIds: result.burnedTokenIds,
      supply: result.supply,
      tokenIds: result.tokenIds
    }, {
      "Cache-Control": NFT_LIST_CACHE_HEADER
    });
  }

  if (segments[0] === "owners") {
    return handleOwnedByWalletRoute(req, res, segments);
  }

  const tokenId = parseTokenId(segments[0]);
  if (tokenId === null) {
    return notFound(res);
  }

  if (segments.length === 1) {
    const response = await buildTokenSummaryResponse(req, tokenId);

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
    const response = await buildTokenSummaryResponse(req, tokenId);

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
    const response = await buildCanonicalMetadataResponse(tokenId);

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
