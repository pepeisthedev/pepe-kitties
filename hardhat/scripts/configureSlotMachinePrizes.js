const { ethers, network } = require("hardhat");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

const DEFAULT_PRIZES = [
  {
    key: "penguin",
    names: ["Penguin Suit"],
    label: "Penguin Suit",
    envPrefix: "SLOT_PENGUIN",
    defaultWeightBps: 500,
    defaultMaxSupply: 10,
  },
  {
    key: "hypnobackground",
    names: ["Hypno", "Hypno Background"],
    label: "Hypno Background",
    envPrefix: "SLOT_HYPNO",
    defaultWeightBps: 500,
    defaultMaxSupply: 10,
  },
];

const WEIGHT_DENOMINATOR = 10_000;
const PRIZE_TYPE_ERC721 = 1;
const CONFIGURE_MINT_AUTH = process.env.CONFIGURE_SLOT_MINT_AUTH !== "false";
const CONFIGURE_PRIZE_ACTIVE = process.env.SLOT_CONFIGURE_PRIZES_ACTIVE !== "false";

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function requireAddress(value, label) {
  if (!value || value === ethers.ZeroAddress) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function findStatusItemType(status, prize) {
  const override = process.env[`${prize.envPrefix}_ITEM_TYPE`];
  if (override) {
    const itemTypeId = Number(override);
    if (!Number.isInteger(itemTypeId) || itemTypeId <= 0) {
      throw new Error(`${prize.envPrefix}_ITEM_TYPE must be a positive integer`);
    }
    return itemTypeId;
  }

  const entry = Object.entries(status.itemTypes || {}).find(([, config]) => {
    return config?.definitionKey === prize.key || prize.names.includes(config?.name);
  });
  return entry ? Number(entry[0]) : null;
}

function getPrizeConfig(status, prize) {
  const itemTypeId = findStatusItemType(status, prize);
  if (itemTypeId === null) {
    throw new Error(
      `Missing ${prize.label} item type in deployment-status-${network.name}.json. ` +
      `Deploy ${prize.key} first or set ${prize.envPrefix}_ITEM_TYPE.`
    );
  }

  const weightBps = Number(process.env[`${prize.envPrefix}_WEIGHT_BPS`] || prize.defaultWeightBps);
  const maxSupply = Number(process.env[`${prize.envPrefix}_MAX_SUPPLY`] || prize.defaultMaxSupply);

  if (!Number.isInteger(weightBps) || weightBps < 0 || weightBps > WEIGHT_DENOMINATOR) {
    throw new Error(`${prize.envPrefix}_WEIGHT_BPS must be between 0 and ${WEIGHT_DENOMINATOR}`);
  }

  if (!Number.isInteger(maxSupply) || maxSupply <= 0) {
    throw new Error(`${prize.envPrefix}_MAX_SUPPLY must be a positive integer`);
  }

  return {
    ...prize,
    itemTypeId,
    weightBps,
    maxSupply,
  };
}

async function sendTx(txFactoryOrPromise, confirmations = 1) {
  const tx = typeof txFactoryOrPromise === "function" ? await txFactoryOrPromise() : await txFactoryOrPromise;
  const receipt = await tx.wait(confirmations);
  if (receipt.status !== 1) {
    throw new Error(`Transaction failed: ${tx.hash}`);
  }
  if (network.name !== "localhost" && network.name !== "hardhat") {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return receipt;
}

async function loadSlotPrizes(slotMachine, fregsItemsAddress) {
  const count = Number(await slotMachine.getPrizesCount());
  const prizes = [];

  for (let prizeId = 1; prizeId <= count; prizeId += 1) {
    const info = await slotMachine.getPrizeInfo(prizeId);
    let itemTypeId = 0;
    let mintOnWin = false;
    let maxSupply = 0n;
    let minted = 0n;

    try {
      itemTypeId = Number(await slotMachine.getPrizeItemTypeId(prizeId));
    } catch {}

    try {
      const mintConfig = await slotMachine.getERC721PrizeMintConfig(prizeId);
      mintOnWin = Boolean(mintConfig[0]);
      maxSupply = BigInt(mintConfig[1]);
      minted = BigInt(mintConfig[2]);
    } catch {}

    prizes.push({
      prizeId,
      name: String(info[0]),
      token: String(info[1]),
      prizeType: Number(info[2]),
      weightBps: Number(info[3]),
      active: Boolean(info[5]),
      stock: BigInt(info[6]),
      itemTypeId,
      mintOnWin,
      maxSupply,
      minted,
      matchesFregsItems: sameAddress(String(info[1]), fregsItemsAddress),
    });
  }

  return prizes;
}

function findExistingPrize(slotPrizes, itemTypeId, fregsItemsAddress) {
  return slotPrizes.find(prize =>
    prize.prizeType === PRIZE_TYPE_ERC721 &&
    prize.itemTypeId === itemTypeId &&
    sameAddress(prize.token, fregsItemsAddress)
  ) || null;
}

function validateTotalWeight(slotPrizes, configuredPrizes, fregsItemsAddress) {
  let total = 0;
  const configuredByExistingPrizeId = new Map();

  for (const configured of configuredPrizes) {
    const existing = findExistingPrize(slotPrizes, configured.itemTypeId, fregsItemsAddress);
    if (existing) {
      configuredByExistingPrizeId.set(existing.prizeId, configured.weightBps);
    } else {
      total += configured.weightBps;
    }
  }

  for (const prize of slotPrizes) {
    total += configuredByExistingPrizeId.has(prize.prizeId)
      ? configuredByExistingPrizeId.get(prize.prizeId)
      : prize.weightBps;
  }

  if (total > WEIGHT_DENOMINATOR) {
    throw new Error(`Configured prize weights would total ${total} bps, above ${WEIGHT_DENOMINATOR}`);
  }

  return total;
}

async function configureMintAuth(fregsItems, slotMachineAddress) {
  if (!CONFIGURE_MINT_AUTH) {
    return;
  }

  const currentCaller = await fregsItems.spinTheWheelContract();
  if (sameAddress(currentCaller, slotMachineAddress)) {
    console.log("  FregsItems mintFromCoin caller already set to SlotMachine");
    return;
  }

  console.log("  Setting FregsItems mintFromCoin caller to SlotMachine...");
  await sendTx(() => fregsItems.setSpinTheWheelContract(slotMachineAddress));
}

async function configurePrize(slotMachine, fregsItemsAddress, slotPrizes, prize) {
  const existing = findExistingPrize(slotPrizes, prize.itemTypeId, fregsItemsAddress);

  if (!existing) {
    console.log(
      `  Adding ${prize.label}: itemType ${prize.itemTypeId}, ` +
      `${prize.weightBps / 100}% odds, max ${prize.maxSupply}`
    );
    await sendTx(() => slotMachine.addERC721MintPrize(
      prize.label,
      fregsItemsAddress,
      prize.itemTypeId,
      prize.weightBps,
      prize.maxSupply
    ));
    return "added";
  }

  console.log(`  ${prize.label} already exists as prize ${existing.prizeId}`);

  if (existing.weightBps !== prize.weightBps) {
    console.log(`    Updating odds: ${existing.weightBps / 100}% -> ${prize.weightBps / 100}%`);
    await sendTx(() => slotMachine.setPrizeWeight(existing.prizeId, prize.weightBps));
  }

  if (!existing.mintOnWin || existing.maxSupply !== BigInt(prize.maxSupply)) {
    if (existing.minted > BigInt(prize.maxSupply)) {
      throw new Error(
        `${prize.label} prize ${existing.prizeId} has already minted ${existing.minted.toString()}, ` +
        `above requested max ${prize.maxSupply}`
      );
    }
    console.log(`    Updating mint config: mintOnWin=true, max ${prize.maxSupply}`);
    await sendTx(() => slotMachine.setERC721PrizeMintConfig(existing.prizeId, true, prize.maxSupply));
  }

  if (CONFIGURE_PRIZE_ACTIVE && !existing.active) {
    console.log("    Activating prize");
    await sendTx(() => slotMachine.setPrizeActive(existing.prizeId, true));
  }

  return "updated";
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("CONFIGURE SLOT MACHINE MINT PRIZES");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  const status = loadDeploymentStatus(network.name);

  const slotMachineAddress = requireAddress(
    process.env.VITE_SLOT_MACHINE_ADDRESS || status.contracts?.slotMachine,
    "SlotMachine address"
  );
  const fregsItemsAddress = requireAddress(
    process.env.VITE_FREGS_ITEMS_ADDRESS || status.contracts?.fregsItems,
    "FregsItems address"
  );

  const configuredPrizes = DEFAULT_PRIZES.map(prize => getPrizeConfig(status, prize));
  const slotMachine = await ethers.getContractAt("SlotMachine", slotMachineAddress);
  const fregsItems = await ethers.getContractAt("FregsItems", fregsItemsAddress);

  console.log("  Deployer:", await deployer.getAddress());
  console.log("  Network:", network.name);
  console.log("  SlotMachine:", slotMachineAddress);
  console.log("  FregsItems:", fregsItemsAddress);

  const pendingCount = BigInt(await slotMachine.pendingSpinCount());
  if (pendingCount !== 0n) {
    throw new Error(`SlotMachine has ${pendingCount.toString()} pending spin(s). Configure prizes after they settle.`);
  }

  await configureMintAuth(fregsItems, slotMachineAddress);

  let slotPrizes = await loadSlotPrizes(slotMachine, fregsItemsAddress);
  const totalWeight = validateTotalWeight(slotPrizes, configuredPrizes, fregsItemsAddress);
  console.log(`  Final configured win odds after this run: ${totalWeight / 100}%`);

  const results = {};
  for (const prize of configuredPrizes) {
    const action = await configurePrize(slotMachine, fregsItemsAddress, slotPrizes, prize);
    results[prize.key] = {
      action,
      itemTypeId: prize.itemTypeId,
      weightBps: prize.weightBps,
      maxSupply: prize.maxSupply,
    };
    slotPrizes = await loadSlotPrizes(slotMachine, fregsItemsAddress);
  }

  status.slotMachinePrizes = status.slotMachinePrizes || {};
  status.slotMachinePrizes[slotMachineAddress] = {
    ...(status.slotMachinePrizes[slotMachineAddress] || {}),
    updatedAt: new Date().toISOString(),
    configuredBy: "configureSlotMachinePrizes.js",
    prizes: {
      ...(status.slotMachinePrizes[slotMachineAddress]?.prizes || {}),
      ...results,
    },
  };
  saveDeploymentStatus(status, network.name);

  console.log("\nConfigured slot mint prizes:");
  for (const prize of configuredPrizes) {
    const existing = findExistingPrize(slotPrizes, prize.itemTypeId, fregsItemsAddress);
    console.log(
      `  Prize ${existing?.prizeId || "?"}: ${prize.label}, itemType ${prize.itemTypeId}, ` +
      `${prize.weightBps / 100}% odds, stock ${existing?.stock?.toString() || "?"}/${prize.maxSupply}`
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
