import PepeKittiesABI from "../assets/abis/PepeKitties.json"
import PepeKittiesItemsABI from "../assets/abis/PepeKittiesItems.json"
import PepeKittiesMintPassABI from "../assets/abis/PepeKittiesMintPass.json"

// Contract addresses from environment variables
export const PEPE_KITTIES_ADDRESS = import.meta.env.VITE_PEPE_KITTIES_ADDRESS as string
export const PEPE_KITTIES_ITEMS_ADDRESS = import.meta.env.VITE_PEPE_KITTIES_ITEMS_ADDRESS as string
export const PEPE_KITTIES_MINTPASS_ADDRESS = import.meta.env.VITE_PEPE_KITTIES_MINTPASS_ADDRESS as string

// Export ABIs
export { PepeKittiesABI, PepeKittiesItemsABI, PepeKittiesMintPassABI }

// Item type constants (must match PepeKittiesItems.sol)
export const ITEM_TYPES = {
  COLOR_CHANGE: 1,
  HEAD_REROLL: 2,
  BRONZE_SKIN: 3,
  SILVER_SKIN: 4,
  GOLD_SKIN: 5,
  TREASURE_CHEST: 6,
  BEAD_PUNK: 7,
} as const

// Item type names for display
export const ITEM_TYPE_NAMES: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "Color Change",
  [ITEM_TYPES.HEAD_REROLL]: "Head Reroll",
  [ITEM_TYPES.BRONZE_SKIN]: "Bronze Skin",
  [ITEM_TYPES.SILVER_SKIN]: "Silver Skin",
  [ITEM_TYPES.GOLD_SKIN]: "Gold Skin",
  [ITEM_TYPES.TREASURE_CHEST]: "Treasure Chest",
  [ITEM_TYPES.BEAD_PUNK]: "Bead Punk",
}

// Item descriptions
export const ITEM_TYPE_DESCRIPTIONS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "Change your Pepe Kitty's body color",
  [ITEM_TYPES.HEAD_REROLL]: "Reroll your Pepe Kitty's head trait",
  [ITEM_TYPES.BRONZE_SKIN]: "Apply a bronze skin to your Pepe Kitty",
  [ITEM_TYPES.SILVER_SKIN]: "Apply a silver skin to your Pepe Kitty",
  [ITEM_TYPES.GOLD_SKIN]: "Apply a golden skin (+ free treasure chest!)",
  [ITEM_TYPES.TREASURE_CHEST]: "Burn to claim ETH rewards",
  [ITEM_TYPES.BEAD_PUNK]: "A rare Bead Punk NFT!",
}
