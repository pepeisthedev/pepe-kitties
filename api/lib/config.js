const fs = require("fs");
const path = require("path");
const { getAddress } = require("ethers");

const PROJECT_ROOT = path.join(__dirname, "..");
const LOCAL_DEPLOYMENT_PATH = path.join(__dirname, "../../hardhat/deployment-status.json");
const LOCAL_RPC_URL = "http://127.0.0.1:8545";
const LOCAL_ENV_PATHS = [
  path.join(PROJECT_ROOT, ".env.local"),
  path.join(PROJECT_ROOT, ".env")
];

let cachedConfig;
let envLoaded = false;

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return null;
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAddress(value, label) {
  if (!value) {
    return null;
  }

  try {
    return getAddress(value);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function readLocalDeployment() {
  if (!fs.existsSync(LOCAL_DEPLOYMENT_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(LOCAL_DEPLOYMENT_PATH, "utf8"));
}

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnv() {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  for (const envPath of LOCAL_ENV_PATHS) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;
      if (process.env[key] === undefined) {
        process.env[key] = parseEnvValue(rawValue);
      }
    }
  }
}

function shouldUseLocalDeploymentFallback() {
  const enabled = firstEnv(["USE_LOCAL_DEPLOYMENT_FALLBACK", "USE_LOCAL_HARDHAT"]);
  if (!enabled) {
    return false;
  }

  const normalized = String(enabled).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  loadLocalEnv();

  const localDeployment = shouldUseLocalDeploymentFallback() ? readLocalDeployment() : null;
  const localContracts = localDeployment?.contracts || {};

  const rpcUrl =
    firstEnv(["API_RPC_URL", "BASE_MAINNET_RPC_URL", "BASE_RPC_URL", "RPC_URL"]) ||
    (localDeployment ? LOCAL_RPC_URL : null);

  if (!rpcUrl) {
    throw new Error("Missing RPC URL. Set API_RPC_URL. For local Hardhat fallback, set USE_LOCAL_DEPLOYMENT_FALLBACK=1.");
  }

  const fregsAddress = normalizeAddress(
    firstEnv(["FREGS_ADDRESS", "VITE_FREGS_ADDRESS"]) || localContracts.fregs,
    "FREGS_ADDRESS"
  );

  if (!fregsAddress) {
    throw new Error("Missing FREGS address. Set FREGS_ADDRESS.");
  }

  const fregsItemsAddress = normalizeAddress(
    firstEnv(["FREGS_ITEMS_ADDRESS", "VITE_FREGS_ITEMS_ADDRESS"]) || localContracts.fregsItems,
    "FREGS_ITEMS_ADDRESS"
  );

  const defaultChainId = localDeployment ? 31337 : 8453;

  cachedConfig = {
    chainId: parseInteger(firstEnv(["CHAIN_ID"]), defaultChainId),
    collectionName: firstEnv(["COLLECTION_NAME"]) || "Fregs",
    fregsAddress,
    fregsItemsAddress,
    maxNftsPerPage: Math.max(1, parseInteger(firstEnv(["NFTS_MAX_LIMIT"]), 100)),
    rpcUrl
  };

  return cachedConfig;
}

module.exports = {
  getConfig
};
