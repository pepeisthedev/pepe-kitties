# CLAUDE.md - Pepe Kitties Smart Contracts

## Project Overview

Solidity smart contracts for Pepe Kitties NFT project on Base blockchain. Uses ERC721AC (gas-efficient) with on-chain SVG rendering.

## Commands

```bash
npx hardhat compile          # Compile contracts
npx hardhat test             # Run tests
npx hardhat run scripts/deploy.ts --network base  # Deploy to Base
```

## Contract Architecture

### Core Contracts

| Contract | Type | Purpose |
|----------|------|---------|
| `PepeKitties.sol` | ERC721AC | Main NFT - stores traits, renders SVG |
| `PepeKittiesItems.sol` | ERC721AC | Consumable items - skins, head reroll, treasure chest |
| `PepeKittiesMintPass.sol` | ERC1155 | Mint passes for free mints |

### Dependencies
- `@limitbreak/creator-token-standards` - ERC721AC (gas-efficient ERC721A + creator royalties)
- `@openzeppelin/contracts` - Ownable, ReentrancyGuard, Base64, ERC1155
- `./utils/BasicRoyalties.sol` - ERC2981 royalties implementation

### Constructor Pattern
All ERC721 contracts use this pattern:
```solidity
constructor(
    address royaltyReceiver_,
    uint96 royaltyFeeNumerator_,  // 500 = 5%
    string memory name_,
    string memory symbol_
)
    ERC721AC(name_, symbol_)
    BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
    Ownable(address(msg.sender))
{}
```

## PepeKitties.sol

### Traits (all public mappings)
- `bodyColor[tokenId]` - Hex color string from mint (e.g., "#ff5733")
- `head[tokenId]` - Random trait 1-N
- `mouth[tokenId]` - Random trait 1-N
- `belly[tokenId]` - Random trait 1-N
- `skinType[tokenId]` - 0=none, 1=bronze, 2=silver, 3=gold

### Key Functions
- `mint(string _color)` - Payable mint with random traits
- `freeMint(string _color, address _sender)` - Called by MintPass contract only
- `rerollHead(tokenId, sender)` - Called by Items contract only
- `setSkinType(tokenId, skinType, sender)` - Called by Items contract only
- `getOwnedKitties(owner)` - Returns all traits for owned kitties

### Events
- `KittyMinted(tokenId, owner, bodyColor, head, mouth, belly)`
- `HeadRerolled(tokenId, oldHead, newHead)`
- `SkinTypeChanged(tokenId, oldSkinType, newSkinType)`

## PepeKittiesItems.sol

### Item Types (constants)
```solidity
HEAD_REROLL = 1     // 50% - Rerolls head trait
BRONZE_SKIN = 2     // 30% - Applies bronze skin
SILVER_SKIN = 3     // 15% - Applies silver skin
GOLD_SKIN = 4       // 5%  - Applies gold skin + mints chest
TREASURE_CHEST = 5  // Burnable for ETH
```

### Key Functions
- `claimItem(kittyId)` - Free one-time claim per kitty
- `useHeadReroll(itemId, kittyId)` - Burns item, rerolls head
- `useSkinItem(itemId, kittyId)` - Burns item, applies skin
- `burnChest(chestId)` - Burns chest, receives ETH
- `getOwnedItems(owner)` - Returns owned items with types
- `getUnclaimedKitties(owner)` - Kitties that can still claim

### Events
- `ItemClaimed(kittyId, itemTokenId, owner, itemType)`
- `HeadRerollUsed(itemTokenId, kittyId, owner)`
- `SkinItemUsed(itemTokenId, kittyId, owner, skinType)`
- `TreasureChestMinted(itemTokenId, owner)`
- `TreasureChestBurned(itemTokenId, owner, ethAmount)`

### Constraints
- Max 5 treasure chests total (created when gold skin used)
- `chestETHAmount` configurable by owner

## PepeKittiesMintPass.sol

### Key Functions
- `purchaseMintPass(amount)` - Buy passes (configurable price)
- `mintPepeKitty(color)` - Burns 1 pass, mints free kitty
- `mintPepeKittyBatch(colors[])` - Batch mint multiple
- `ownerMint(to, amount)` - Owner mints for giveaways
- `airdrop(recipients[], amounts[])` - Batch airdrop

### Events
- `MintPassPurchased(buyer, amount)`
- `PepeKittyMinted(user, color)`

## Deployment Order

1. Deploy `PepeKitties`
2. Deploy `PepeKittiesItems` (pass PepeKitties address)
3. Deploy `PepeKittiesMintPass`
4. Configure cross-references:
   ```solidity
   pepeKitties.setItemsContract(itemsAddress)
   pepeKitties.setMintPassContract(mintPassAddress)
   mintPass.setPepeKitties(pepeKittiesAddress)
   ```
5. Deploy SVG renderer and call `pepeKitties.setSVGRenderer(rendererAddress)`
6. Fund items contract for chest rewards: `items.depositETH{value: ...}()`

## Cross-Contract Communication

```
MintPass.mintPepeKitty(color)
    -> burns pass
    -> calls PepeKitties.freeMint(color, user)

Items.useHeadReroll(itemId, kittyId)
    -> burns item
    -> calls PepeKitties.rerollHead(kittyId, user)

Items.useSkinItem(itemId, kittyId)
    -> burns item
    -> calls PepeKitties.setSkinType(kittyId, skinType, user)
    -> if gold: mints treasure chest
```

## Configurable Parameters

All have owner setter functions:

**PepeKitties:**
- `mintPrice`, `supply`, `headTraitCount`, `mouthTraitCount`, `bellyTraitCount`

**PepeKittiesItems:**
- `chestETHAmount`, rarity weights via `setRarityWeights()`

**PepeKittiesMintPass:**
- `mintPassPrice`, `maxMintPasses`, `mintPassSaleActive`
