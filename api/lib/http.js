function setCommonHeaders(res, extraHeaders = {}) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
}

function handleOptions(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  setCommonHeaders(res);
  res.statusCode = 204;
  res.end();
  return true;
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  setCommonHeaders(res, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });

  res.statusCode = statusCode;
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  setCommonHeaders(res, {
    "Content-Type": contentType,
    ...extraHeaders
  });

  res.statusCode = statusCode;
  res.end(body);
}

function sendSvg(res, statusCode, svg, extraHeaders = {}) {
  sendText(res, statusCode, svg, "image/svg+xml; charset=utf-8", extraHeaders);
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

function notFound(res, message = "Not found") {
  sendJson(res, 404, { error: message });
}

function gone(res, message = "Resource no longer exists") {
  sendJson(res, 410, { error: message });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function serverError(res, error) {
  sendJson(res, 500, {
    error: error?.message || "Internal server error"
  });
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseInteger(value, fallback, options = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (options.min !== undefined && parsed < options.min) {
    return options.min;
  }

  if (options.max !== undefined && parsed > options.max) {
    return options.max;
  }

  return parsed;
}

module.exports = {
  badRequest,
  gone,
  handleOptions,
  methodNotAllowed,
  notFound,
  parseBoolean,
  parseInteger,
  sendJson,
  sendSvg,
  sendText,
  serverError
};
