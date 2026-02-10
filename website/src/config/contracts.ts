import FregsABI from "../assets/abis/Fregs.json"
import FregsItemsABI from "../assets/abis/FregsItems.json"
import FregsMintPassABI from "../assets/abis/FregsMintPass.json"
import itemsData from "./items.json"

// Contract addresses from environment variables
export const FREGS_ADDRESS = import.meta.env.VITE_FREGS_ADDRESS as string
export const FREGS_ITEMS_ADDRESS = import.meta.env.VITE_FREGS_ITEMS_ADDRESS as string
export const FREGS_MINTPASS_ADDRESS = import.meta.env.VITE_FREGS_MINTPASS_ADDRESS as string

// Export ABIs
export { FregsABI, FregsItemsABI, FregsMintPassABI }

// Item configuration loaded from items.json (single source of truth)
export interface ItemConfig {
  id: number
  name: string
  description: string
  category: string
  svgFile?: string
  targetTraitType?: number
  traitFileName?: string
  isClaimable: boolean
  claimWeight: number
  isOwnerMintable: boolean
  maxSupply?: number
  incompatibleWithSkins?: number[]  // Body trait values that make this item unusable
  incompatibleWithHeads?: number[]  // Head trait values that make this item unusable
}

// Load items from items.json
export const ITEMS: ItemConfig[] = itemsData.items as ItemConfig[]

// Build ITEM_TYPES lookup from items.json
export const ITEM_TYPES = ITEMS.reduce((acc, item) => {
  // Create key from name (e.g., "Color Change" -> "COLOR_CHANGE")
  const key = item.name.toUpperCase().replace(/\s+/g, '_')
  acc[key] = item.id
  return acc
}, {} as Record<string, number>)

// Trait type constants (must match Fregs.sol - simplified system)
export const TRAIT_TYPES = {
  BACKGROUND: 0,
  BODY: 1,
  HEAD: 2,
  MOUTH: 3,
  STOMACH: 4,
} as const

// Build item type names from items.json
export const ITEM_TYPE_NAMES: Record<number, string> = ITEMS.reduce((acc, item) => {
  acc[item.id] = item.name
  return acc
}, {} as Record<number, string>)

// Build item descriptions from items.json
export const ITEM_TYPE_DESCRIPTIONS: Record<number, string> = ITEMS.reduce((acc, item) => {
  acc[item.id] = item.description
  return acc
}, {} as Record<number, string>)

// Helper to get item config by ID
export function getItemConfig(itemId: number): ItemConfig | undefined {
  return ITEMS.find(item => item.id === itemId)
}

// Helper to get items by category
export function getItemsByCategory(category: string): ItemConfig[] {
  return ITEMS.filter(item => item.category === category)
}

// Base head count for calculating head trait values from fileNames
export const BASE_HEAD_COUNT = 19

// Check if an item is incompatible with a freg's current traits
export function checkItemIncompatibility(
  itemConfig: ItemConfig,
  fregBody: number,
  fregHead: number
): { incompatible: boolean; reason: string } {
  // Check if item is incompatible with freg's current skin
  if (itemConfig.incompatibleWithSkins?.includes(fregBody)) {
    return {
      incompatible: true,
      reason: "Skeleton fregs don't wear clothes!"
    }
  }

  // Check if item is incompatible with freg's current head
  if (itemConfig.incompatibleWithHeads?.includes(fregHead)) {
    return {
      incompatible: true,
      reason: "Skeleton fregs don't wear clothes!"
    }
  }

  return { incompatible: false, reason: "" }
}

// Get skeleton skin trait value (4 from traitFileName)
export function getSkeletonSkinTraitValue(): number {
  const skeletonItem = ITEMS.find(item => item.name === "Skeleton Skin")
  if (skeletonItem?.traitFileName) {
    return parseInt(skeletonItem.traitFileName.replace('.svg', ''))
  }
  return 4 // Default fallback
}
