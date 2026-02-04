import FregsABI from "../assets/abis/Fregs.json"
import FregsItemsABI from "../assets/abis/FregsItems.json"
import FregsMintPassABI from "../assets/abis/FregsMintPass.json"

// Contract addresses from environment variables
export const FREGS_ADDRESS = import.meta.env.VITE_FREGS_ADDRESS as string
export const FREGS_ITEMS_ADDRESS = import.meta.env.VITE_FREGS_ITEMS_ADDRESS as string
export const FREGS_MINTPASS_ADDRESS = import.meta.env.VITE_FREGS_MINTPASS_ADDRESS as string

// Export ABIs
export { FregsABI, FregsItemsABI, FregsMintPassABI }

// Item type constants (must match FregsItems.sol)
export const ITEM_TYPES = {
  COLOR_CHANGE: 1,
  HEAD_REROLL: 2,
  BRONZE_SKIN: 3,
  METAL_SKIN: 4,
  GOLD_SKIN: 5,
  TREASURE_CHEST: 6,
  BEAD_PUNK: 7,
  DIAMOND_SKIN: 8,
  SPECIAL_DICE: 100,
} as const

// Trait type constants (must match Fregs.sol - simplified system)
export const TRAIT_TYPES = {
  BACKGROUND: 0,
  BODY: 1,
  HEAD: 2,
  MOUTH: 3,
  STOMACH: 4,
} as const

// Item type names for display
export const ITEM_TYPE_NAMES: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "Color Change",
  [ITEM_TYPES.HEAD_REROLL]: "Head Reroll",
  [ITEM_TYPES.BRONZE_SKIN]: "Bronze Skin",
  [ITEM_TYPES.METAL_SKIN]: "Metal Skin",
  [ITEM_TYPES.GOLD_SKIN]: "Gold Skin",
  [ITEM_TYPES.TREASURE_CHEST]: "Treasure Chest",
  [ITEM_TYPES.BEAD_PUNK]: "Bead Punk",
  [ITEM_TYPES.DIAMOND_SKIN]: "Diamond Skin",
  [ITEM_TYPES.SPECIAL_DICE]: "Special Dice",
}

// Item descriptions
export const ITEM_TYPE_DESCRIPTIONS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "Change your Freg's body color",
  [ITEM_TYPES.HEAD_REROLL]: "Reroll your Freg's head trait",
  [ITEM_TYPES.BRONZE_SKIN]: "Give your Freg a bronze skin",
  [ITEM_TYPES.METAL_SKIN]: "Give your Freg a shiny metal skin",
  [ITEM_TYPES.GOLD_SKIN]: "Give your Freg a luxurious gold skin",
  [ITEM_TYPES.TREASURE_CHEST]: "Burn to claim ETH rewards",
  [ITEM_TYPES.BEAD_PUNK]: "A rare Bead Punk NFT!",
  [ITEM_TYPES.DIAMOND_SKIN]: "Give your Freg a dazzling diamond skin",
  [ITEM_TYPES.SPECIAL_DICE]: "Roll the dice for a random special trait!",
}
