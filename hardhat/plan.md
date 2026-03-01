# Plan: Weighted trait rarity system

## Summary
Replace the current "noneChance + uniform random" system with per-trait weighted probabilities configured from `traits.json`.

## Current system
- `_getRandomTrait(max, noneChance)`: rolls 0-99, if < noneChance → "none", else uniform random 1..max
- Head "none" → `headDefaultTrait` (1), mouth/belly "none" → `NONE_TRAIT` sentinel
- All non-none traits have equal probability

## New system
- Each trait type has a `uint256[]` weights array stored on-chain (e.g. `[11, 1, 11, 2, 2, 5, ...]`)
- Weights are percentages that must sum to 100
- A "Normal" entry (rarity > 0) means "no SVG layer" — stored as `NONE_TRAIT` for mouth/belly, as `headDefaultTrait` for head
- Traits with rarity 0 (Hoodie=13, Frog Suit=19) are item-only — weight 0 means never minted randomly

## Changes

### 1. Update `traits.json`
Add `rarity` field to every trait. Add new traits per user data. "Normal" entries get an SVG filename of `null` (no image).

Head (22 traits), Mouth (7 traits, #7=Normal), Stomach (5 traits, #5=Normal).

### 2. Modify `Fregs.sol`
- Add `mapping(uint256 => uint256[]) public traitWeights` — maps trait type → weights array
- Add `function setTraitWeights(uint256 traitType, uint256[] calldata weights) external onlyOwner` — validates sum == 100
- Replace `_getRandomTrait` with `_getWeightedRandomTrait(uint256 traitType)` that:
  - Rolls 0-99
  - Walks through weights array, accumulating until roll < cumulative → return traitId
- Same for `_getRandomTraitForAddress` variant
- Remove `headNoneChance`, `mouthNoneChance`, `bellyNoneChance` variables
- Keep `headDefaultTrait` — used when head resolves to "Normal Eyes" trait
- Keep `NONE_TRAIT` — used when mouth/stomach resolves to "Normal"
- Update `mint()` and `freeMint()` to use new weighted function
- Update `rerollHead()` to use weighted random too
- Remove `setTraitNoneChances()`

### 3. Update `deploy.js`
- Read rarity from `traits.json` for each trait type
- After deploying Fregs, call `fregs.setTraitWeights(TRAIT_HEAD, [11,1,11,2,...])` etc.
- Remove old `setTraitNoneChances` call if present

### 4. Handle "Normal" traits (no SVG)
- Head #1 "Normal Eyes" (rarity 11): maps to `headDefaultTrait` (1) — already has SVG (eyes-only)
- Mouth #7 "Normal" (rarity 45): maps to `NONE_TRAIT` — no SVG rendered
- Stomach #5 "Normal" (rarity 70): maps to `NONE_TRAIT` — no SVG rendered

In the weighted selection: if the selected index corresponds to the "Normal" entry, we return the appropriate sentinel value. The contract stores which index is the "none/default" index per trait type.

### 5. Design detail: Normal trait handling
Add `mapping(uint256 => uint256) public traitNoneIndex` — for each trait type, which 1-based index in the weights array means "none/default". Set during config:
- Head: noneIndex = 0 (no none index — trait 1 "Normal Eyes" has its own SVG)
- Mouth: noneIndex = 7 (the "Normal" entry)
- Stomach: noneIndex = 5 (the "Normal" entry)

When weighted roll selects a trait whose index == noneIndex, return NONE_TRAIT (or headDefaultTrait for head).

Actually simpler: the deploy script simply doesn't deploy SVGs for "Normal" entries, and the weights array in the contract maps 1:1 to trait IDs. The contract just picks a weighted random ID. For mouth/stomach, if the ID has no deployed SVG renderer, SVGRenderer returns empty string — already handled. But this could break metadata.

**Simplest approach**: Keep it clean — the contract picks a trait ID 1..N based on weights. The SVG renderer handles rendering (or not rendering) based on what's deployed. For "Normal" entries:
- Head trait 1 = "Normal Eyes" → has SVG (just eyes), renders normally
- Mouth trait 7 = "Normal" → NONE_TRAIT sentinel, no SVG layer
- Stomach trait 5 = "Normal" → NONE_TRAIT sentinel, no SVG layer

So: in the weights array, "Normal" entries for mouth/stomach need special handling. The contract needs to know which trait index means "none".

**Final design**:
- `traitWeights[traitType]` = array of weights, length = number of traits
- `traitNoneIndex[traitType]` = 0 means no none-index, >0 means that 1-based trait ID maps to NONE_TRAIT
- Weighted roll picks 1-based ID. If ID == noneIndex → return NONE_TRAIT (or headDefaultTrait for head)
- Head: noneIndex = 0 (trait 1 "Normal Eyes" is a real trait with SVG)
- Mouth: noneIndex = 7
- Stomach: noneIndex = 5
