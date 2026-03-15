import FregsABI from "../assets/abis/Fregs.json"
import FregsItemsABI from "../assets/abis/FregsItems.json"
import FregsMintPassABI from "../assets/abis/FregsMintPass.json"
import SpinTheWheelABI from "../assets/abis/SpinTheWheel.json"
import FregsLiquidityABI from "../assets/abis/FregsLiquidity.json"
import FregShopABI from "../assets/abis/FregShop.json"
import FregCoinABI from "../assets/abis/FregCoin.json"
import itemsData from "./items.json"
import dynamicItemsData from "./dynamic-items.json"

function parseChainId(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getDynamicItemsForChain(chainId: number): ItemConfig[] {
  const parsedData = dynamicItemsData as {
    byChainId?: Record<string, { items?: ItemConfig[] }>
    items?: ItemConfig[]
  }
  const chainEntry = parsedData.byChainId?.[String(chainId)]

  if (Array.isArray(chainEntry?.items)) {
    return chainEntry.items
  }

  return Array.isArray(parsedData.items) ? parsedData.items : []
}

// Contract addresses from environment variables
export const FREGS_ADDRESS = import.meta.env.VITE_FREGS_ADDRESS as string
export const FREGS_ITEMS_ADDRESS = import.meta.env.VITE_FREGS_ITEMS_ADDRESS as string
export const FREGS_MINTPASS_ADDRESS = import.meta.env.VITE_FREGS_MINTPASS_ADDRESS as string
export const SPIN_THE_WHEEL_ADDRESS = import.meta.env.VITE_SPIN_THE_WHEEL_ADDRESS as string
export const FREGS_LIQUIDITY_ADDRESS = import.meta.env.VITE_FREGS_LIQUIDITY_ADDRESS as string
export const FREG_SHOP_ADDRESS = import.meta.env.VITE_FREG_SHOP_ADDRESS as string
export const FREG_COIN_ADDRESS = import.meta.env.VITE_FREGCOIN_ADDRESS as string
export const ACTIVE_CHAIN_ID = parseChainId(import.meta.env.VITE_CHAIN_ID, 84532)

// Export ABIs
export { FregsABI, FregsItemsABI, FregsMintPassABI, SpinTheWheelABI, FregsLiquidityABI, FregShopABI, FregCoinABI }

function mergeItems() {
  const mergedItems = new Map<number, ItemConfig>()

  for (const item of itemsData.items as ItemConfig[]) {
    mergedItems.set(item.id, item)
  }

  for (const item of getDynamicItemsForChain(ACTIVE_CHAIN_ID)) {
    mergedItems.set(item.id, item)
  }

  return Array.from(mergedItems.values()).sort((left, right) => left.id - right.id)
}

// Item configuration loaded from built-in items.json plus the active chain's dynamic overlay
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

// Load items from base config + dynamic overlay
export const ITEMS: ItemConfig[] = mergeItems()

// Build ITEM_TYPES lookup from merged item config
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

// Build item type names from merged item config
export const ITEM_TYPE_NAMES: Record<number, string> = ITEMS.reduce((acc, item) => {
  acc[item.id] = item.name
  return acc
}, {} as Record<number, string>)

// Build item descriptions from merged item config
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
export const BASE_HEAD_COUNT = 22

// Base stomach count for calculating stomach trait values from fileNames
export const BASE_STOMACH_COUNT = 4

// Check if an item is incompatible with a freg's current traits
export function checkItemIncompatibility(
  itemConfig: ItemConfig,
  fregBody: number,
  fregHead: number
): { incompatible: boolean; reason: string } {
  // Stomach items have no effect on special skins (they cover the belly area)
  if (itemConfig.category === 'stomach' && fregBody > 0) {
    return {
      incompatible: true,
      reason: "Cannot apply stomach trait on special skin!"
    }
  }

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
