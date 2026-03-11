const { handleRoutedRequest } = require("../lib/router");

function normalizeRoute(route) {
  const values = Array.isArray(route) ? route : route ? [route] : [];

  return values.flatMap((value) =>
    String(value)
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
  );
}

function parseRouteFromUrl(req, prefixes) {
  const pathname = String(req.url || "").split("?")[0];

  for (const prefix of prefixes) {
    if (pathname === prefix || pathname === `${prefix}/`) {
      return [];
    }

    if (pathname.startsWith(`${prefix}/`)) {
      return pathname
        .slice(prefix.length + 1)
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
  }

  return [];
}

module.exports = async function handler(req, res) {
  const route = normalizeRoute(req.query?.route);
  const segments =
    route.length > 0
      ? route
      : parseRouteFromUrl(req, ["/api/fregs-handler", "/api/fregs", "/fregs"]);

  return handleRoutedRequest(req, res, ["fregs", ...segments]);
};
