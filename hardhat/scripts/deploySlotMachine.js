const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeploymentStatus, saveDeploymentStatus } = require("./deploymentStatus");

const WEBSITE_ABI_PATH = path.join(__dirname, "../../website/src/assets/abis");

const DEFAULT_VRF_COORDINATOR_ADDRESSES = {
  baseSepolia: "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE",
  base: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
};

const DEFAULT_VRF_KEY_HASHES = {
  baseSepolia: "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71",
  base: "0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab",
};

const SPIN_COST = ethers.parseEther(process.env.SLOT_SPIN_COST_FREG || "100000000");
const CALLBACK_GAS_LIMIT = Number(process.env.SLOT_CALLBACK_GAS_LIMIT || 500000);
const REQUEST_CONFIRMATIONS = Number(process.env.SLOT_REQUEST_CONFIRMATIONS || 3);
const CONFIGURE_DEFAULT_PRIZES = process.env.CONFIGURE_DEFAULT_SLOT_PRIZES !== "false";
const VERIFY_CONTRACTS = process.env.VERIFY_CONTRACTS === "true";
const DEFAULT_PRIZE_WEIGHTS = {
  godzilla: Number(process.env.SLOT_GODZILLA_WEIGHT_BPS || 300),
  freg: Number(process.env.SLOT_FREG_WEIGHT_BPS || 300),
  shibainu: Number(process.env.SLOT_SHIBA_WEIGHT_BPS || 1000),
  bull: Number(process.env.SLOT_BULL_WEIGHT_BPS || 1500),
};

function getVrfConfig() {
  if (network.name === "localhost" || network.name === "hardhat") {
    return { coordinator: null, subscriptionId: 0n, keyHash: ethers.ZeroHash };
  }
  if (network.name === "baseSepolia") {
    return {
      coordinator: process.env.BASE_SEPOLIA_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.baseSepolia,
      subscriptionId: BigInt(process.env.BASE_SEPOLIA_VRF_SUBSCRIPTION_ID || 0),
      keyHash: process.env.BASE_SEPOLIA_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.baseSepolia,
    };
  }
  if (network.name === "base") {
    return {
      coordinator: process.env.BASE_VRF_COORDINATOR || DEFAULT_VRF_COORDINATOR_ADDRESSES.base,
      subscriptionId: BigInt(process.env.BASE_VRF_SUBSCRIPTION_ID || 0),
      keyHash: process.env.BASE_VRF_KEY_HASH || DEFAULT_VRF_KEY_HASHES.base,
    };
  }
  return {
    coordinator: process.env.VRF_COORDINATOR || "",
    subscriptionId: BigInt(process.env.VRF_SUBSCRIPTION_ID || 0),
    keyHash: process.env.VRF_KEY_HASH || ethers.ZeroHash,
  };
}

async function sendTx(txFactoryOrPromise, confirmations = 1) {
  const tx = typeof txFactoryOrPromise === "function" ? await txFactoryOrPromise() : await txFactoryOrPromise;
  const receipt = await tx.wait(confirmations);
  if (network.name !== "localhost" && network.name !== "hardhat") {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return receipt;
}

function requireAddress(value, label) {
  if (!value || value === ethers.ZeroAddress) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function copyABI(contractName) {
  const artifactPath = path.join(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.mkdirSync(WEBSITE_ABI_PATH, { recursive: true });
  fs.writeFileSync(path.join(WEBSITE_ABI_PATH, `${contractName}.json`), JSON.stringify(artifact.abi, null, 2));
  console.log(`  Copied ${contractName} ABI to website`);
}

function findStatusItemType(status, definitionKey, name) {
  const entry = Object.entries(status.itemTypes || {}).find(([, config]) => {
    return config?.definitionKey === definitionKey || config?.name === name;
  });
  return entry ? Number(entry[0]) : null;
}

function requireStatusItemType(status, definitionKey, name) {
  const itemTypeId = findStatusItemType(status, definitionKey, name);
  if (itemTypeId === null) {
    throw new Error(
      `Missing ${name} item type in deployment-status-${network.name}.json. ` +
      "Deploy the matching shop item definition first."
    );
  }
  return itemTypeId;
}

async function maybeAddChainlinkConsumer(coordinatorAddress, subscriptionId, slotMachineAddress) {
  if (network.name === "localhost" || network.name === "hardhat") {
    return;
  }

  if (process.env.SKIP_VRF_ADD_CONSUMER === "true" || process.env.SKIP_CHAINLINK_ADD_CONSUMER === "true") {
    console.log("  Skipping Chainlink addConsumer by env flag.");
    console.log(`  Add this consumer manually to subscription ${subscriptionId}: ${slotMachineAddress}`);
    return;
  }

  const coordinator = await ethers.getContractAt("IVRFCoordinatorV2Plus", coordinatorAddress);
  console.log("Adding SlotMachine as Chainlink VRF subscription consumer...");
  await sendTx(() => coordinator.addConsumer(subscriptionId, slotMachineAddress));
  console.log("  SlotMachine added as VRF consumer");
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("SLOT MACHINE DEPLOYMENT");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const isLocalhost = network.name === "localhost" || network.name === "hardhat";
  const status = loadDeploymentStatus(network.name);
  const vrf = getVrfConfig();

  const fregCoinAddress = requireAddress(
    process.env.VITE_FREGCOIN_ADDRESS || status.contracts?.fregCoin,
    "FregCoin address"
  );
  const liquidityVaultAddress = requireAddress(
    process.env.VITE_FREGS_LIQUIDITY_ADDRESS || status.contracts?.fregsLiquidity,
    "FregsLiquidity address"
  );

  let coordinatorAddress = vrf.coordinator;
  if (isLocalhost) {
    const MockVRF = await ethers.getContractFactory("MockVRFV2PlusWrapper");
    const mock = await MockVRF.deploy();
    await mock.waitForDeployment();
    coordinatorAddress = await mock.getAddress();
    console.log("  Mock VRF coordinator:", coordinatorAddress);
  } else {
    requireAddress(coordinatorAddress, "VRF coordinator");
    if (!vrf.subscriptionId || vrf.subscriptionId === 0n) {
      throw new Error(`Missing VRF subscription ID for ${network.name}`);
    }
  }

  console.log("  Deployer:", deployerAddress);
  console.log("  Network:", network.name);
  console.log("  FregCoin:", fregCoinAddress);
  console.log("  Liquidity vault:", liquidityVaultAddress);
  console.log("  Spin cost:", ethers.formatEther(SPIN_COST), "FREG");

  const SlotMachine = await ethers.getContractFactory("SlotMachine");
  const slotMachine = await SlotMachine.deploy(
    coordinatorAddress,
    vrf.subscriptionId,
    vrf.keyHash,
    fregCoinAddress,
    liquidityVaultAddress,
    SPIN_COST
  );
  await slotMachine.waitForDeployment();
  if (!isLocalhost) {
    await slotMachine.deploymentTransaction()?.wait(2);
  }

  const slotMachineAddress = await slotMachine.getAddress();
  console.log("  SlotMachine:", slotMachineAddress);

  await sendTx(() => slotMachine.setCallbackGasLimit(CALLBACK_GAS_LIMIT));
  await sendTx(() => slotMachine.setRequestConfirmations(REQUEST_CONFIRMATIONS));

  if (isLocalhost) {
    await sendTx(() => slotMachine.setAutoFulfill(true));
  } else {
    await maybeAddChainlinkConsumer(coordinatorAddress, vrf.subscriptionId, slotMachineAddress);
  }

  if (CONFIGURE_DEFAULT_PRIZES) {
    const fregsAddress = process.env.VITE_FREGS_ADDRESS || status.contracts?.fregs;
    const fregsItemsAddress = process.env.VITE_FREGS_ITEMS_ADDRESS || status.contracts?.fregsItems;
    const godzillaItemType = requireStatusItemType(status, "godzilla", "Godzilla Suit");
    const shibainuItemType = requireStatusItemType(status, "shibainu", "Shiba Inu Suit");
    const bullItemType = requireStatusItemType(status, "bull", "Bull Suit");

    console.log("\n--- Configuring default prizes ---");
    await sendTx(() => slotMachine.addERC721ItemPrize(
      "Godzilla Suit",
      requireAddress(fregsItemsAddress, "FregsItems address"),
      godzillaItemType,
      DEFAULT_PRIZE_WEIGHTS.godzilla
    ));
    await sendTx(() => slotMachine.addERC721Prize("Freg", requireAddress(fregsAddress, "Fregs address"), DEFAULT_PRIZE_WEIGHTS.freg));
    await sendTx(() => slotMachine.addERC721ItemPrize(
      "Shiba Inu Suit",
      requireAddress(fregsItemsAddress, "FregsItems address"),
      shibainuItemType,
      DEFAULT_PRIZE_WEIGHTS.shibainu
    ));
    await sendTx(() => slotMachine.addERC721ItemPrize(
      "Bull Suit",
      requireAddress(fregsItemsAddress, "FregsItems address"),
      bullItemType,
      DEFAULT_PRIZE_WEIGHTS.bull
    ));
    const configuredWeight = Object.values(DEFAULT_PRIZE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    console.log(`  Godzilla Suit: ${DEFAULT_PRIZE_WEIGHTS.godzilla / 100}% (prize 1, itemType ${godzillaItemType})`);
    console.log(`  Freg: ${DEFAULT_PRIZE_WEIGHTS.freg / 100}%`);
    console.log(`  Shiba Inu Suit: ${DEFAULT_PRIZE_WEIGHTS.shibainu / 100}% (itemType ${shibainuItemType})`);
    console.log(`  Bull Suit: ${DEFAULT_PRIZE_WEIGHTS.bull / 100}% (itemType ${bullItemType})`);
    console.log(`  Lose: ${(10000 - configuredWeight) / 100}% plus any stocked-out prize weight`);
  }

  await sendTx(() => slotMachine.setActive(process.env.SLOT_MACHINE_ACTIVE === "true"));

  status.network = network.name;
  status.contracts = status.contracts || {};
  status.contracts.slotMachine = slotMachineAddress;
  if (isLocalhost) {
    status.contracts.slotMachineMockVrfCoordinator = coordinatorAddress;
  }
  saveDeploymentStatus(status, network.name);
  copyABI("SlotMachine");

  if (VERIFY_CONTRACTS && !isLocalhost) {
    console.log("\nWaiting 30s for explorer indexing...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    await run("verify:verify", {
      address: slotMachineAddress,
      constructorArguments: [
        coordinatorAddress,
        vrf.subscriptionId,
        vrf.keyHash,
        fregCoinAddress,
        liquidityVaultAddress,
        SPIN_COST,
      ],
    });
  }

  console.log("\nNext steps:");
  console.log(`  VITE_SLOT_MACHINE_ADDRESS=${slotMachineAddress}`);
  console.log("  Fund Godzilla with FregsItems.ownerMint(slotMachine, godzillaItemType, amount), then registerERC721Prize(1, tokenId).");
  console.log("  Other ERC721 prizes can be funded with depositERC721Prize(prizeId, tokenIds).");
  console.log("  Activate with setActive(true) when funded and ready.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
