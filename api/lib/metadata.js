function parseJsonPayload(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    return JSON.parse(decodeURIComponent(jsonString));
  }
}

function decodeTokenUri(tokenUri) {
  if (typeof tokenUri !== "string" || tokenUri.length === 0) {
    throw new Error("Missing token URI");
  }

  if (tokenUri.startsWith("data:application/json,")) {
    return parseJsonPayload(tokenUri.slice("data:application/json,".length));
  }

  if (tokenUri.startsWith("data:application/json;base64,")) {
    const payload = tokenUri.slice("data:application/json;base64,".length);
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  }

  throw new Error("Unsupported token URI format");
}

function extractSvgFromImage(image) {
  if (typeof image !== "string" || image.length === 0) {
    return null;
  }

  if (image.startsWith("data:image/svg+xml,")) {
    const payload = image.slice("data:image/svg+xml,".length);

    try {
      return decodeURIComponent(payload);
    } catch (error) {
      return payload;
    }
  }

  if (image.startsWith("data:image/svg+xml;base64,")) {
    const payload = image.slice("data:image/svg+xml;base64,".length);
    return Buffer.from(payload, "base64").toString("utf8");
  }

  return image.startsWith("<svg") ? image : null;
}

function buildAttributesIndex(metadata) {
  const attributes = Array.isArray(metadata?.attributes) ? metadata.attributes : [];
  return attributes.reduce((accumulator, attribute) => {
    if (!attribute?.trait_type) {
      return accumulator;
    }

    accumulator[attribute.trait_type] = attribute.value;
    return accumulator;
  }, {});
}

module.exports = {
  buildAttributesIndex,
  decodeTokenUri,
  extractSvgFromImage
};
