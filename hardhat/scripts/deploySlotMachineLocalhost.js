const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");
const { main: deployNewShopItem } = require("./deployNewShopItem");

const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");
const GODZILLA_DEFINITION = path.join(__dirname, "shop-item-definitions/godzillaTrait.js");
const BULL_DEFINITION = path.join(__dirname, "shop-item-definitions/bullItemTrait.js");
const WHALE_DEFINITION = path.join(__dirname, "shop-item-definitions/whaleItemTrait.js");

const SPIN_COST = ethers.parseEther(process.env.SLOT_SPIN_COST_FREG || "100000000");
const GODZILLA_PRIZE_COUNT = Number(process.env.LOCAL_SLOT_GODZILLA_PRIZE_COUNT || 1);
const FREG_PRIZE_COUNT = Number(process.env.LOCAL_SLOT_FREG_PRIZE_COUNT || 3);
const BULL_PRIZE_COUNT = Number(process.env.LOCAL_SLOT_BULL_PRIZE_COUNT || 5);
const WHALE_PRIZE_COUNT = Number(process.env.LOCAL_SLOT_WHALE_PRIZE_COUNT || 5);

const PRIZE_WEIGHTS = {
  godzilla: Number(process.env.LOCAL_SLOT_GODZILLA_WEIGHT_BPS || 300),
  freg: Number(process.env.LOCAL_SLOT_FREG_WEIGHT_BPS || 300),
  bull: Number(process.env.LOCAL_SLOT_BULL_WEIGHT_BPS || 1000),
  whale: Number(process.env.LOCAL_SLOT_WHALE_WEIGHT_BPS || 1500),
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

async function getOwnedFregIds(fregs, owner) {
  const result = await fregs.getOwnedFregs(owner);
  return result[0].map((id) => Number(id));
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

async function mintFregsForPrize(fregs, randomizer, ownerAddress, count) {
  if (count <= 0) return [];

  console.log(`  Minting ${count} Freg NFT prize${count === 1 ? "" : "s"}...`);
  try {
    await sendTx(() => randomizer.setAutoFulfill(true));
  } catch (error) {
    console.log(`  Could not set randomizer autoFulfill: ${error.message}`);
  }

  const previousMintPhase = Number(await fregs.mintPhase());
  if (previousMintPhase !== 0) {
    await sendTx(() => fregs.setMintPhase(0));
  }

  const before = await getOwnedFregIds(fregs, ownerAddress);
  const colors = ["#85d45c", "#f5c842", "#d946ef", "#38bdf8", "#fb7185", "#a3e635"];

  for (let i = 0; i < count; i += 1) {
    await sendTx(() => fregs.mint(colors[i % colors.length]));
  }

  if (previousMintPhase !== 0) {
    await sendTx(() => fregs.setMintPhase(previousMintPhase));
  }

  const after = await getOwnedFregIds(fregs, ownerAddress);
  const minted = diffIds(after, before);
  if (minted.length !== count) {
    throw new Error(`Expected ${count} new Fregs, found ${minted.length}`);
  }
  return minted;
}

async function mintItemsForPrize(fregsItems, ownerAddress, itemTypeId, count, label) {
  if (count <= 0) return [];

  console.log(`  Minting ${count} ${label} item prize${count === 1 ? "" : "s"}...`);
  const before = await getOwnedItemIdsByType(fregsItems, ownerAddress, itemTypeId);
  await sendTx(() => fregsItems.ownerMint(ownerAddress, itemTypeId, count));
  const after = await getOwnedItemIdsByType(fregsItems, ownerAddress, itemTypeId);
  const minted = diffIds(after, before);

  if (minted.length !== count) {
    throw new Error(`Expected ${count} new ${label} items, found ${minted.length}`);
  }
  return minted;
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

async function depositERC721Prize(slotMachine, tokenContract, prizeId, tokenIds, label) {
  if (tokenIds.length === 0) return;

  console.log(`  Funding prize ${prizeId} (${label}) with token IDs: ${tokenIds.join(", ")}`);
  await sendTx(() => tokenContract.setApprovalForAll(slotMachine.target, true));
  await sendTx(() => slotMachine.depositERC721Prize(prizeId, tokenIds));
  const stock = await slotMachine.getPrizeStock(prizeId);
  console.log(`  Prize ${prizeId} stock: ${stock.toString()}`);
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
  const deployerAddress = await deployer.getAddress();
  let status = loadDeploymentStatus(network.name);

  const fregsAddress = requireStatusAddress(status, "fregs");
  const fregsItemsAddress = requireStatusAddress(status, "fregsItems");
  const fregCoinAddress = requireStatusAddress(status, "fregCoin");
  const liquidityAddress = requireStatusAddress(status, "fregsLiquidity");
  const randomizerAddress = requireStatusAddress(status, "fregsRandomizer");
  const coordinatorAddress = await deployMockCoordinatorIfNeeded(status);

  console.log("  Deployer:", deployerAddress);
  console.log("  Fregs:", fregsAddress);
  console.log("  FregsItems:", fregsItemsAddress);
  console.log("  FregCoin:", fregCoinAddress);
  console.log("  Liquidity vault:", liquidityAddress);
  console.log("  VRF coordinator:", coordinatorAddress);

  const fregs = await ethers.getContractAt("Fregs", fregsAddress);
  const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);
  const randomizer = await ethers.getContractAt("FregsRandomizer", randomizerAddress);

  console.log("\n--- Preparing local transfer rules ---");
  await disableLocalTransferValidator(fregs, "Fregs");
  await disableLocalTransferValidator(fregsItems, "FregsItems");

  console.log("\n--- Ensuring dynamic prize item traits ---");
  const godzillaItemType = await ensureDynamicItem(GODZILLA_DEFINITION, "godzilla", "Godzilla Suit");
  const bullItemType = await ensureDynamicItem(BULL_DEFINITION, "bull", "Bull Suit");
  const whaleItemType = await ensureDynamicItem(WHALE_DEFINITION, "whale", "Whale Suit");

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

  await sendTx(() => slotMachine.setRequestConfirmations(1));
  await sendTx(() => slotMachine.setAutoFulfill(true));

  console.log("  SlotMachine:", slotMachineAddress);
  console.log("  Spin cost:", ethers.formatEther(SPIN_COST), "FREG");

  console.log("\n--- Configuring slot prizes ---");
  await sendTx(() => slotMachine.addERC721ItemPrize("Godzilla Suit", fregsItemsAddress, godzillaItemType, PRIZE_WEIGHTS.godzilla));
  await sendTx(() => slotMachine.addERC721Prize("Freg", fregsAddress, PRIZE_WEIGHTS.freg));
  await sendTx(() => slotMachine.addERC721ItemPrize("Bull Suit", fregsItemsAddress, bullItemType, PRIZE_WEIGHTS.bull));
  await sendTx(() => slotMachine.addERC721ItemPrize("Whale Suit", fregsItemsAddress, whaleItemType, PRIZE_WEIGHTS.whale));

  console.log("\n--- Minting and funding prizes ---");
  const godzillaItemTokenIds = await mintItemsDirectlyToSlotMachine(
    fregsItems,
    slotMachine,
    slotMachineAddress,
    1,
    godzillaItemType,
    GODZILLA_PRIZE_COUNT,
    "Godzilla Suit"
  );
  const fregTokenIds = await mintFregsForPrize(fregs, randomizer, deployerAddress, FREG_PRIZE_COUNT);
  const bullItemTokenIds = await mintItemsForPrize(fregsItems, deployerAddress, bullItemType, BULL_PRIZE_COUNT, "Bull Suit");
  const whaleItemTokenIds = await mintItemsForPrize(fregsItems, deployerAddress, whaleItemType, WHALE_PRIZE_COUNT, "Whale Suit");

  console.log(`  Prize 1 (Godzilla Suit) stock: ${(await slotMachine.getPrizeStock(1)).toString()}`);
  await depositERC721Prize(slotMachine, fregs, 2, fregTokenIds, "Freg");
  await depositERC721Prize(slotMachine, fregsItems, 3, bullItemTokenIds, "Bull Suit");
  await depositERC721Prize(slotMachine, fregsItems, 4, whaleItemTokenIds, "Whale Suit");

  await sendTx(() => slotMachine.setActive(true));
  copyABI("SlotMachine");

  status = loadDeploymentStatus(network.name);
  status.network = network.name;
  status.contracts = status.contracts || {};
  status.contracts.slotMachine = slotMachineAddress;
  status.contracts.slotMachineMockVrfCoordinator = coordinatorAddress;
  status.localSlotMachine = {
    lastFundedAt: new Date().toISOString(),
    spinCostFreg: ethers.formatEther(SPIN_COST),
    prizes: {
      1: { name: "Godzilla Suit", token: fregsItemsAddress, itemType: godzillaItemType, weightBps: PRIZE_WEIGHTS.godzilla, tokenIds: godzillaItemTokenIds },
      2: { name: "Freg", token: fregsAddress, weightBps: PRIZE_WEIGHTS.freg, tokenIds: fregTokenIds },
      3: { name: "Bull Suit", token: fregsItemsAddress, itemType: bullItemType, weightBps: PRIZE_WEIGHTS.bull, tokenIds: bullItemTokenIds },
      4: { name: "Whale Suit", token: fregsItemsAddress, itemType: whaleItemType, weightBps: PRIZE_WEIGHTS.whale, tokenIds: whaleItemTokenIds },
    },
  };
  saveDeploymentStatus(status, network.name);

  console.log("\n" + "=".repeat(60));
  console.log("LOCAL SLOT MACHINE READY");
  console.log("=".repeat(60));
  console.log(`VITE_SLOT_MACHINE_ADDRESS=${slotMachineAddress}`);
  console.log(`Prize 1 Godzilla stock: ${godzillaItemTokenIds.length}`);
  console.log(`Prize 2 Freg stock: ${fregTokenIds.length}`);
  console.log(`Prize 3 Bull stock: ${bullItemTokenIds.length}`);
  console.log(`Prize 4 Whale stock: ${whaleItemTokenIds.length}`);
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
