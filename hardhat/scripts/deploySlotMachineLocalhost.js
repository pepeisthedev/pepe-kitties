const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { main: deployNewShopItem } = require("./deployNewShopItem");

const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");
const GODZILLA_DEFINITION = path.join(__dirname, "shop-item-definitions/godzillaTrait.js");

const SPIN_COST = ethers.parseEther(process.env.SLOT_SPIN_COST_FREG || "100000000");
const CALLBACK_GAS_LIMIT = Number(process.env.LOCAL_SLOT_CALLBACK_GAS_LIMIT || process.env.SLOT_CALLBACK_GAS_LIMIT || 1000000);
const GODZILLA_PRIZE_COUNT = Number(process.env.LOCAL_SLOT_GODZILLA_PRIZE_COUNT || 1);

const PRIZE_WEIGHTS = {
  godzilla: Number(process.env.LOCAL_SLOT_GODZILLA_WEIGHT_BPS || 300),
};

async function sendTx(txFactoryOrPromise, confirmations = 1) {
  const tx = typeof txFactoryOrPromise === "function" ? await txFactoryOrPromise() : await txFactoryOrPromise;
  const receipt = await tx.wait(confirmations);
  if (receipt.status !== 1) {
    throw new Error(`Transaction failed: ${tx.hash}`);
  }
  return receipt;
}

function requireLocalhost() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("deploySlotMachineLocalhost.js is only for localhost/hardhat networks");
  }
}

function requireStatusAddress(status, key) {
  const value = status.contracts?.[key];
  if (!value || value === ethers.ZeroAddress) {
    throw new Error(`Missing ${key} in deployment-status-${network.name}.json`);
  }
  return value;
}

function copyABI(contractName) {
  const artifactPath = path.join(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
  fs.writeFileSync(path.join(WEBSITE_ABI_PATH, `${contractName}.json`), JSON.stringify(artifact.abi, null, 2));
}

function findStatusItem(status, definitionKey, name) {
  return Object.entries(status.itemTypes || {}).find(([, config]) => {
    return config?.definitionKey === definitionKey || config?.name === name;
  }) || null;
}

async function getConfiguredItemType(status, fregsItems, definitionKey, name) {
  const entry = findStatusItem(status, definitionKey, name);
  if (!entry) return null;

  const [itemTypeId] = entry;
  try {
    const config = await fregsItems.itemTypeConfigs(itemTypeId);
    if (config.name && config.name.length > 0) {
      return Number(itemTypeId);
    }
  } catch {}

  delete status.itemTypes[itemTypeId];
  saveDeploymentStatus(status, network.name);
  return null;
}

async function ensureDynamicItem(definitionPath, definitionKey, name) {
  let status = loadDeploymentStatus(network.name);
  const fregsItems = await ethers.getContractAt("FregsItems", requireStatusAddress(status, "fregsItems"));
  const existingItemType = await getConfiguredItemType(status, fregsItems, definitionKey, name);

  if (existingItemType !== null) {
    console.log(`  ${name} already configured as itemType ${existingItemType}`);
    return existingItemType;
  }

  console.log(`  Deploying ${name} with deployNewShopItem.js...`);
  await deployNewShopItem({ definitionPath });

  status = loadDeploymentStatus(network.name);
  const deployedItemType = await getConfiguredItemType(status, fregsItems, definitionKey, name);
  if (deployedItemType === null) {
    throw new Error(`Could not find deployed item type for ${name}`);
  }

  return deployedItemType;
}

async function getOwnedItemIdsByType(fregsItems, owner, itemTypeId) {
  const [tokenIds, itemTypes] = await fregsItems.getOwnedItems(owner);
  const ids = [];
  for (let i = 0; i < tokenIds.length; i += 1) {
    if (Number(itemTypes[i]) === Number(itemTypeId)) {
      ids.push(Number(tokenIds[i]));
    }
  }
  return ids;
}

function diffIds(after, before) {
  const beforeSet = new Set(before.map(Number));
  return after.filter((id) => !beforeSet.has(Number(id)));
}

async function mintItemsDirectlyToSlotMachine(fregsItems, slotMachine, slotMachineAddress, prizeId, itemTypeId, count, label) {
  if (count <= 0) return [];

  console.log(`  Minting ${count} ${label} item prize${count === 1 ? "" : "s"} directly to SlotMachine...`);
  const before = await getOwnedItemIdsByType(fregsItems, slotMachineAddress, itemTypeId);
  await sendTx(() => fregsItems.ownerMint(slotMachineAddress, itemTypeId, count));
  const after = await getOwnedItemIdsByType(fregsItems, slotMachineAddress, itemTypeId);
  const minted = diffIds(after, before);

  if (minted.length !== count) {
    throw new Error(`Expected ${count} new ${label} items in SlotMachine, found ${minted.length}`);
  }
  for (const tokenId of minted) {
    await sendTx(() => slotMachine.registerERC721Prize(prizeId, tokenId));
  }
  return minted;
}

async function disableLocalTransferValidator(contract, label) {
  try {
    const currentValidator = await contract.getTransferValidator();
    if (currentValidator !== ethers.ZeroAddress) {
      console.log(`  Disabling ${label} transfer validator for localhost transfers...`);
      await sendTx(() => contract.setTransferValidator(ethers.ZeroAddress));
    }
  } catch (error) {
    console.log(`  Could not update ${label} transfer validator: ${error.message}`);
  }
}

async function deployMockCoordinatorIfNeeded(status) {
  if (status.contracts?.vrfCoordinator && status.contracts.vrfCoordinator !== ethers.ZeroAddress) {
    return status.contracts.vrfCoordinator;
  }

  console.log("  Deploying local mock VRF coordinator...");
  const MockVRF = await ethers.getContractFactory("MockVRFV2PlusWrapper");
  const mock = await MockVRF.deploy();
  await mock.waitForDeployment();

  const coordinatorAddress = await mock.getAddress();
  status.contracts = status.contracts || {};
  status.contracts.vrfCoordinator = coordinatorAddress;
  status.contracts.vrfSubscriptionId = 1;
  saveDeploymentStatus(status, network.name);
  return coordinatorAddress;
}

async function main() {
  requireLocalhost();

  console.log("\n" + "=".repeat(60));
  console.log("LOCALHOST SLOT MACHINE DEPLOYMENT + FUNDING");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  let status = loadDeploymentStatus(network.name);

  const fregsItemsAddress = requireStatusAddress(status, "fregsItems");
  const fregCoinAddress = requireStatusAddress(status, "fregCoin");
  const liquidityAddress = requireStatusAddress(status, "fregsLiquidity");
  const coordinatorAddress = await deployMockCoordinatorIfNeeded(status);

  console.log("  Deployer:", await deployer.getAddress());
  console.log("  FregsItems:", fregsItemsAddress);
  console.log("  FregCoin:", fregCoinAddress);
  console.log("  Liquidity vault:", liquidityAddress);
  console.log("  VRF coordinator:", coordinatorAddress);

  const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

  console.log("\n--- Preparing local transfer rules ---");
  await disableLocalTransferValidator(fregsItems, "FregsItems");

  console.log("\n--- Ensuring dynamic prize item traits ---");
  const godzillaItemType = await ensureDynamicItem(GODZILLA_DEFINITION, "godzilla", "Godzilla Suit");

  status = loadDeploymentStatus(network.name);

  console.log("\n--- Deploying fresh SlotMachine ---");
  const SlotMachine = await ethers.getContractFactory("SlotMachine");
  const slotMachine = await SlotMachine.deploy(
    coordinatorAddress,
    0,
    ethers.ZeroHash,
    fregCoinAddress,
    liquidityAddress,
    SPIN_COST
  );
  await slotMachine.waitForDeployment();
  const slotMachineAddress = await slotMachine.getAddress();

  console.log("  Routing spin payments to SlotMachine FREG balance...");
  await sendTx(() => slotMachine.setPaymentConfig(fregCoinAddress, slotMachineAddress, SPIN_COST));
  await sendTx(() => slotMachine.setCallbackGasLimit(CALLBACK_GAS_LIMIT));
  await sendTx(() => slotMachine.setRequestConfirmations(1));
  await sendTx(() => slotMachine.setAutoFulfill(true));

  console.log("  SlotMachine:", slotMachineAddress);
  console.log("  Spin cost:", ethers.formatEther(SPIN_COST), "FREG");

  console.log("\n--- Configuring slot prizes ---");
  await sendTx(() => slotMachine.addERC721MintPrize(
    "Godzilla Suit",
    fregsItemsAddress,
    godzillaItemType,
    PRIZE_WEIGHTS.godzilla,
    GODZILLA_PRIZE_COUNT
  ));
  await sendTx(() => fregsItems.setSpinTheWheelContract(slotMachineAddress));

  console.log(`  Prize 1 (Godzilla Suit) stock: ${(await slotMachine.getPrizeStock(1)).toString()}`);

  await sendTx(() => slotMachine.setActive(true));
  copyABI("SlotMachine");

  status = loadDeploymentStatus(network.name);
  status.network = network.name;
  status.contracts = status.contracts || {};
  status.contracts.slotMachine = slotMachineAddress;
  status.contracts.slotMachinePaymentVault = slotMachineAddress;
  status.contracts.slotMachineMockVrfCoordinator = coordinatorAddress;
  status.localSlotMachine = {
    lastFundedAt: new Date().toISOString(),
    spinCostFreg: ethers.formatEther(SPIN_COST),
    prizes: {
      1: {
        name: "Godzilla Suit",
        token: fregsItemsAddress,
        itemType: godzillaItemType,
        weightBps: PRIZE_WEIGHTS.godzilla,
        mintOnWin: true,
        maxSupply: GODZILLA_PRIZE_COUNT,
      },
    },
  };
  saveDeploymentStatus(status, network.name);

  console.log("\n" + "=".repeat(60));
  console.log("LOCAL SLOT MACHINE READY");
  console.log("=".repeat(60));
  console.log(`VITE_SLOT_MACHINE_ADDRESS=${slotMachineAddress}`);
  console.log("Spin payments route to SlotMachine FREG balance.");
  console.log(`Prize 1 Godzilla mint-on-win supply: ${GODZILLA_PRIZE_COUNT}`);
  console.log("Set the website env above or restart your local website with that value.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
