const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleRoutedRequest } = require("./lib/router");
const { notFound, sendText } = require("./lib/http");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const INDEX_HTML_PATH = path.join(__dirname, "index.html");

function buildQueryObject(url) {
  const query = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (query[key] === undefined) {
      query[key] = value;
      continue;
    }

    if (Array.isArray(query[key])) {
      query[key].push(value);
      continue;
    }

    query[key] = [query[key], value];
  }

  return query;
}

function getRouteSegments(pathname, basePath) {
  if (pathname === basePath || pathname === `${basePath}/`) {
    return [];
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  return pathname
    .slice(basePath.length + 1)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function serveDocsPage(res) {
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  return sendText(res, 200, html, "text/html; charset=utf-8");
}

async function requestListener(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  req.query = buildQueryObject(url);

  if (url.pathname === "/") {
    return serveDocsPage(res);
  }

  const fregsSegments = getRouteSegments(url.pathname, "/fregs");
  if (fregsSegments) {
    return handleRoutedRequest(req, res, ["fregs", ...fregsSegments]);
  }

  const apiSegments = getRouteSegments(url.pathname, "/api");
  if (apiSegments) {
    return handleRoutedRequest(req, res, apiSegments);
  }

  return notFound(res);
}

function createServer() {
  return http.createServer((req, res) => {
    Promise.resolve(requestListener(req, res)).catch((error) => {
      console.error(error);
      sendText(res, 500, error?.message || "Internal server error");
    });
  });
}

function startServer() {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Fregs API listening on http://${HOST}:${PORT}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  requestListener,
  startServer
};
