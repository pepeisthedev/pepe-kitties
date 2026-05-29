const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("SlotMachine", function () {
  const SPIN_COST = ethers.parseEther("100000000");

  async function deployFixture() {
    const [owner, player, liquidityVault] = await ethers.getSigners();

    const fregCoin = await ethers.deployContract("FregCoin");
    const prizeCoin = await ethers.deployContract("FregCoin");
    const nft = await ethers.deployContract("MockERC721", ["Fregs", "FREG"]);
    const coordinator = await ethers.deployContract("MockVRFV2PlusWrapper");

    const slot = await ethers.deployContract("SlotMachine", [
      coordinator.target,
      0,
      ethers.ZeroHash,
      fregCoin.target,
      liquidityVault.address,
      SPIN_COST,
    ]);

    await slot.setAutoFulfill(true);
    await slot.setActive(true);

    await fregCoin.transfer(player.address, SPIN_COST * 10n);
    await fregCoin.connect(player).approve(slot.target, SPIN_COST * 10n);

    return { owner, player, liquidityVault, fregCoin, prizeCoin, nft, slot };
  }

  async function deployItemsContract(owner) {
    return await ethers.deployContract("FregsItems", [
      owner.address,
      0,
      "Fregs Items",
      "FREGITEM",
      ethers.ZeroAddress,
    ]);
  }

  it("routes the FREG spin cost to the liquidity vault", async function () {
    const { player, liquidityVault, fregCoin, slot } = await deployFixture();

    await slot.addERC721Prize("Freg", ethers.Wallet.createRandom().address, 10_000);

    await expect(slot.connect(player).spin())
      .to.emit(slot, "SpinPayment")
      .withArgs(player.address, SPIN_COST, liquidityVault.address);

    expect(await fregCoin.balanceOf(liquidityVault.address)).to.equal(SPIN_COST);
  });

  it("awards ERC721 prizes from tracked inventory", async function () {
    const { owner, player, liquidityVault, fregCoin, nft, slot } = await deployFixture();

    await slot.addERC721Prize("Freg", nft.target, 10_000);
    await nft.mint(owner.address);
    await nft.mint(owner.address);
    await nft.setApprovalForAll(slot.target, true);
    await slot.depositERC721Prize(1, [0, 1]);

    await expect(slot.connect(player).spin())
      .to.emit(slot, "SpinResult")
      .withArgs(player.address, anyValue, true, 1, 1, nft.target, anyValue, 0);

    expect(await nft.balanceOf(player.address)).to.equal(1);
    expect(await slot.getPrizeStock(1)).to.equal(1);
    expect(await fregCoin.balanceOf(liquidityVault.address)).to.equal(SPIN_COST);
  });

  it("falls back to losing when a selected ERC721 prize is out of stock", async function () {
    const { player, liquidityVault, fregCoin, nft, slot } = await deployFixture();

    await slot.addERC721Prize("Freg", nft.target, 10_000);

    await expect(slot.connect(player).spin())
      .to.emit(slot, "PrizeOutOfStock")
      .withArgs(anyValue, player.address, 1)
      .and.to.emit(slot, "SpinResult")
      .withArgs(player.address, anyValue, false, 1, 1, nft.target, 0, 0);

    expect(await nft.balanceOf(player.address)).to.equal(0);
    expect(await fregCoin.balanceOf(liquidityVault.address)).to.equal(SPIN_COST);
  });

  it("uses current ERC721 inventory as the available supply", async function () {
    const { owner, player, nft, slot } = await deployFixture();

    await slot.addERC721Prize("Freg", nft.target, 10_000);
    await nft.mint(owner.address);
    await nft.mint(owner.address);
    await nft.setApprovalForAll(slot.target, true);
    await slot.depositERC721Prize(1, [0, 1]);

    await slot.connect(player).spin();
    await slot.connect(player).spin();
    await slot.connect(player).spin();

    expect(await nft.balanceOf(player.address)).to.equal(2);
    expect(await slot.getPrizeStock(1)).to.equal(0);
  });

  it("allows direct-minted ERC721 item prizes to be registered after ownerMint", async function () {
    const { owner, slot } = await deployFixture();
    const items = await deployItemsContract(owner);

    await items.addItemType("Godzilla Suit", "Prize", 2, 23, true, false, 0);
    await slot.addERC721ItemPrize("Godzilla Suit", items.target, 101, 10_000);

    await expect(items.ownerMint(slot.target, 101, 1))
      .to.emit(slot, "ERC721PrizeReceivedUntracked")
      .withArgs(items.target, 0);

    expect(await items.ownerOf(0)).to.equal(slot.target);
    expect(await items.itemType(0)).to.equal(101);
    expect(await slot.getPrizeStock(1)).to.equal(0);

    await expect(slot.registerERC721Prize(1, 0))
      .to.emit(slot, "ERC721PrizeFunded")
      .withArgs(1, items.target, 0);

    expect(await slot.getPrizeStock(1)).to.equal(1);
    expect(await slot.getERC721PrizeTokenIds(1)).to.deep.equal([0n]);
  });

  it("rejects ERC721 item prizes with the wrong item type", async function () {
    const { owner, slot } = await deployFixture();
    const items = await deployItemsContract(owner);

    await items.addItemType("Godzilla Suit", "Prize", 2, 23, true, false, 0);
    await items.addItemType("Bull Suit", "Prize", 2, 24, true, false, 0);
    await slot.addERC721ItemPrize("Godzilla Suit", items.target, 101, 10_000);
    await items.ownerMint(owner.address, 102, 1);
    await items.setApprovalForAll(slot.target, true);

    await expect(slot.depositERC721Prize(1, [0])).to.be.reverted;
  });

  it("can pay ERC20 prizes when configured and funded", async function () {
    const { owner, player, prizeCoin, slot } = await deployFixture();
    const prizeAmount = ethers.parseEther("5");

    await slot.addERC20Prize("Prize Coin", prizeCoin.target, 10_000, prizeAmount);
    await prizeCoin.approve(slot.target, prizeAmount);
    await slot.depositERC20Prize(1, prizeAmount);

    await expect(slot.connect(player).spin())
      .to.emit(slot, "SpinResult")
      .withArgs(player.address, anyValue, true, 1, 2, prizeCoin.target, 0, prizeAmount);

    expect(await prizeCoin.balanceOf(player.address)).to.equal(prizeAmount);
    expect(await prizeCoin.balanceOf(owner.address)).to.equal(await prizeCoin.MAX_SUPPLY() - prizeAmount);
  });

  it("requires the slot machine to be active", async function () {
    const { player, nft, slot } = await deployFixture();

    await slot.setActive(false);
    await slot.addERC721Prize("Freg", nft.target, 10_000);

    await expect(slot.connect(player).spin()).to.be.revertedWith("Slot machine is not active");
  });
});
