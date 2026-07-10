import { ITEMS, BASE_HEAD_COUNT, BASE_STOMACH_COUNT, BASE_MOUTH_COUNT } from "../config/contracts"
import { colorFamily, FregTraits, NameResolver } from "./rarity"

// Trait names loaded from public/frogz/default/traits.json.
export interface TraitInfo {
  fileName?: string
  name: string
  description?: string
}

export interface TraitsConfig {
  head: TraitInfo[]
  mouth: TraitInfo[]
  stomach: TraitInfo[]
  skin: TraitInfo[]
  background: TraitInfo[]
}

// Resolve a trait name by contract index (1-indexed). Base traits come from
// traits.json; item-applied traits (index above the base count) resolve through
// the merged ITEMS config. Shared by the collection cards and the rarity engine
// so displayed names always agree.
export function getTraitName(
  traitsConfig: TraitsConfig | null,
  traitType: keyof TraitsConfig,
  index: number,
): string {
  if (!traitsConfig || index === 0) return "Normal"
  const traits = traitsConfig[traitType]
  if (!traits || index > traits.length) {
    if (traitType === "head" && index > BASE_HEAD_COUNT) {
      const itemHead = ITEMS.find(
        (item) => item.category === "head" && item.traitFileName === `${index - BASE_HEAD_COUNT}.svg`,
      )
      return itemHead?.name || `Special #${index - BASE_HEAD_COUNT}`
    }
    if (traitType === "skin" && index > 1) {
      const itemSkin = ITEMS.find(
        (item) => item.category === "skin" && item.traitFileName === `${index}.svg`,
      )
      return itemSkin?.name || `Special #${index}`
    }
    if (traitType === "stomach" && index > BASE_STOMACH_COUNT) {
      const itemStomach = ITEMS.find(
        (item) => item.category === "stomach" && item.traitFileName === `${index - BASE_STOMACH_COUNT}.svg`,
      )
      return itemStomach?.name || `Special #${index - BASE_STOMACH_COUNT}`
    }
    if (traitType === "mouth" && index > BASE_MOUTH_COUNT) {
      const itemMouth = ITEMS.find(
        (item) => item.category === "mouth" && item.traitFileName === `${index - BASE_MOUTH_COUNT}.svg`,
      )
      return itemMouth?.name || `Special #${index - BASE_MOUTH_COUNT}`
    }
    if (traitType === "background" && index > 0) {
      const itemBg = ITEMS.find(
        (item) => item.category === "background" && item.traitFileName === `${index}.svg`,
      )
      return itemBg?.name || `Special #${index}`
    }
    return `#${index}`
  }
  return traits[index - 1]?.name || `#${index}`
}

// Builds the NameResolver used by the rarity engine. Belly maps to the 'stomach'
// config; a special skin covers the belly, mirroring the on-chain metadata.
export function makeRarityResolver(traitsConfig: TraitsConfig | null): NameResolver {
  return (slot: string, freg: FregTraits): string => {
    switch (slot) {
      case "Color":
        return colorFamily(freg.bodyColor)
      case "Background":
        return freg.background > 0
          ? getTraitName(traitsConfig, "background", freg.background)
          : `Solid ${colorFamily(freg.bodyColor)}`
      case "Body":
        return freg.body > 0 ? getTraitName(traitsConfig, "skin", freg.body) : "Colorable"
      case "Head":
        return getTraitName(traitsConfig, "head", freg.head)
      case "Mouth":
        return getTraitName(traitsConfig, "mouth", freg.mouth)
      case "Belly":
        return freg.body > 0 ? "Hidden" : getTraitName(traitsConfig, "stomach", freg.belly)
      default:
        return "—"
    }
  }
}
