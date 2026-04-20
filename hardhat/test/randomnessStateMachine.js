const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const HEAD_REROLL = 2n;
const SPIN_TOKEN = 1n;

async function deployCoreFixture() {
  const [owner, alice] = await ethers.getSigners();

  const coordinator = await ethers.deployContract("MockVRFV2PlusWrapper");
  await coordinator.waitForDeployment();

  const randomizer = await ethers.deployContract("FregsRandomizer", [
    coordinator.target,
    0,
    ethers.ZeroHash,
  ]);
  await randomizer.waitForDeployment();

  const fregs = await ethers.deployContract("Fregs", [
    owner.address,
    0,
    "Fregs",
    "FREG",
  ]);
  await fregs.waitForDeployment();

  const items = await ethers.deployContract("FregsItems", [
    owner.address,
    0,
    "Fregs Items",
    "FITEM",
    fregs.target,
  ]);
  await items.waitForDeployment();

  const mintPass = await ethers.deployContract("FregsMintPass", [""]);
  await mintPass.waitForDeployment();

  const spin = await ethers.deployContract("SpinTheWheel", [""]);
  await spin.waitForDeployment();

  await fregs.setItemsContract(items.target);
  await fregs.setMintPassContract(mintPass.target);
  await fregs.setRandomizer(randomizer.target);
  await fregs.setMintPhase(2);
  await fregs.setTraitWeights(2, [100, 0], 0);
  await fregs.setTraitWeights(3, [100], 1);
  await fregs.setTraitWeights(4, [100], 1);

  await items.setRandomizer(randomizer.target);
  await items.setSpinTheWheelContract(owner.address);
  await items.setBuiltInItemConfig(Number(HEAD_REROLL), "Head Reroll", "Reroll your freg head");

  await mintPass.setFregsContract(fregs.target);
  await mintPass.setSpinTheWheelContract(spin.target);

  await spin.setMintPassContract(mintPass.target);
  await spin.setItemsContract(items.target);
  await spin.setRandomizer(randomizer.target);
  await spin.setActive(true);

  await randomizer.setContracts(fregs.target, items.target, spin.target);

  return { owner, alice, coordinator, randomizer, fregs, items, mintPass, spin };
}

async function mintFreeFreg(ctx, minter, color = "#112233") {
  await ctx.fregs.addFreeMintWallets([minter.address], [1]);
  await ctx.fregs.connect(minter).mint(color);
  const requestId = await ctx.coordinator.lastRequestId();
  await ctx.coordinator.fulfillRequest(requestId);
  return { requestId, tokenId: 0n };
}

describe("Randomness state machine", function () {
  it("rescues pending mints by restoring the free mint and ignoring the old callback", async function () {
    const ctx = await loadFixture(deployCoreFixture);

    await ctx.fregs.addFreeMintWallets([ctx.alice.address], [1]);
    await ctx.fregs.connect(ctx.alice).mint("#123456");
    const requestId = await ctx.coordinator.lastRequestId();

    expect(await ctx.fregs.pendingMintCount()).to.equal(1);
    expect(await ctx.fregs.freeMints(ctx.alice.address)).to.equal(0);

    await ctx.fregs.rescuePendingMints([requestId]);

    expect(await ctx.fregs.pendingMintCount()).to.equal(0);
    expect(await ctx.fregs.freeMints(ctx.alice.address)).to.equal(1);
    expect(await ctx.fregs.totalMinted()).to.equal(0);

    await ctx.coordinator.fulfillRequest(requestId);

    expect(await ctx.fregs.totalMinted()).to.equal(0);
    expect(await ctx.fregs.balanceOf(ctx.alice.address)).to.equal(0);
  });

  it("rescues pending item claims by restoring claim eligibility and ignoring the old callback", async function () {
    const ctx = await loadFixture(deployCoreFixture);
    await mintFreeFreg(ctx, ctx.alice);

    await ctx.items.connect(ctx.alice).claimItem(0);
    const requestId = await ctx.coordinator.lastRequestId();

    expect(await ctx.items.pendingClaimCount()).to.equal(1);
    expect(await ctx.items.hasClaimed(0)).to.equal(true);

    await ctx.items.rescuePendingClaims([requestId]);

    expect(await ctx.items.pendingClaimCount()).to.equal(0);
    expect(await ctx.items.hasClaimed(0)).to.equal(false);
    expect(await ctx.items.totalMinted()).to.equal(0);

    await ctx.coordinator.fulfillRequest(requestId);

    expect(await ctx.items.hasClaimed(0)).to.equal(false);
    expect(await ctx.items.totalMinted()).to.equal(0);
  });

  it("rescues pending spins by refunding the token and ignoring the old callback", async function () {
    const ctx = await loadFixture(deployCoreFixture);

    await ctx.spin.ownerMint(ctx.alice.address, 1);
    expect(await ctx.spin.balanceOf(ctx.alice.address, SPIN_TOKEN)).to.equal(1);

    await ctx.spin.connect(ctx.alice).spin();
    const requestId = await ctx.coordinator.lastRequestId();

    expect(await ctx.spin.pendingSpinCount()).to.equal(1);
    expect(await ctx.spin.balanceOf(ctx.alice.address, SPIN_TOKEN)).to.equal(0);

    await ctx.spin.rescuePendingSpins([requestId]);

    expect(await ctx.spin.pendingSpinCount()).to.equal(0);
    expect(await ctx.spin.balanceOf(ctx.alice.address, SPIN_TOKEN)).to.equal(1);

    await ctx.coordinator.fulfillRequest(requestId);

    expect(await ctx.spin.balanceOf(ctx.alice.address, SPIN_TOKEN)).to.equal(1);
    expect(await ctx.mintPass.balanceOf(ctx.alice.address, 1)).to.equal(0);
    expect(await ctx.items.totalMinted()).to.equal(0);
  });

  it("rescues pending head rerolls by cancelling the exact request and blocking replay", async function () {
    const ctx = await loadFixture(deployCoreFixture);
    await mintFreeFreg(ctx, ctx.alice);

    await ctx.fregs.setTraitWeights(2, [0, 100], 0);

    await ctx.items.mintFromCoin(ctx.alice.address, HEAD_REROLL);
    expect(await ctx.items.ownerOf(0)).to.equal(ctx.alice.address);

    const originalHead = await ctx.fregs.head(0);
    expect(originalHead).to.equal(1);

    await ctx.items.connect(ctx.alice).useHeadReroll(0, 0);
    const requestId = await ctx.coordinator.lastRequestId();

    expect(await ctx.items.pendingHeadRerollCount()).to.equal(1);
    expect(await ctx.fregs.pendingHeadReroll(0)).to.equal(true);

    await ctx.items.connect(ctx.alice).rescueHeadReroll(0);

    expect(await ctx.items.pendingHeadRerollCount()).to.equal(0);
    expect(await ctx.fregs.pendingHeadReroll(0)).to.equal(false);
    expect(await ctx.items.ownerOf(1)).to.equal(ctx.alice.address);
    expect(await ctx.items.itemType(1)).to.equal(HEAD_REROLL);

    await ctx.coordinator.fulfillRequest(requestId);

    expect(await ctx.fregs.head(0)).to.equal(originalHead);
    expect(await ctx.fregs.pendingHeadReroll(0)).to.equal(false);
  });
});
