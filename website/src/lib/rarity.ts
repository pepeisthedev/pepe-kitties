// Custom rarity engine for Fregs.
//
// OpenSea ranks by trait-value frequency, and the immutable Fregs contract emits
// the raw mint hex color as the Background/Body attribute value whenever no special
// trait is applied. Every color is ~unique, so OpenSea treats plain-color fregs as
// 1/1 and (wrongly) ranks them above shared item traits like the Gorilla Suit.
//
// This module computes a fair, collection-relative rarity entirely client-side:
//   1. Mint colors are bucketed into color families so a plain color is a normal,
//      common trait — not a fake 1/1.
//   2. Each trait slot gets a statistical rarity score (sum of inverse frequencies),
//      so genuinely scarce items (low supply) rise to the top.
//   3. Aggregate scores map to collection ranks and tiers by percentile.

export interface FregTraits {
  tokenId: number
  bodyColor: string // "#RRGGBB"
  background: number // 0 = solid color background, >0 = special background
  body: number // 0 = colorable body, >0 = special skin
  head: number // 0 = none, base 1..22, items above BASE_HEAD_COUNT
  mouth: number // 0 = none/normal, base + items
  belly: number // 0 = none/normal, base + items (hidden when body > 0)
}

export type RarityTier = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary"

export interface SlotRarity {
  slot: string // display label, e.g. "Head"
  value: string // display value, e.g. "Gorilla Suit"
  count: number // how many fregs share this slot value
  percent: number // share of the collection, 0..100
}

export interface FregRarity {
  tokenId: number
  score: number // higher = rarer
  rank: number // 1 = rarest
  total: number // collection size scored
  tier: RarityTier
  slots: SlotRarity[]
}

// ---------------------------------------------------------------------------
// Color families
// ---------------------------------------------------------------------------

// A plain mint color is grouped into one of these buckets so it counts as a
// normal-frequency trait instead of a unique 1/1.
export type ColorFamily =
  | "Red"
  | "Orange"
  | "Yellow"
  | "Green"
  | "Teal"
  | "Blue"
  | "Purple"
  | "Pink"
  | "Black"
  | "Grey"
  | "White"

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const int = parseInt(match[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

// Returns hue in [0,360), saturation and lightness in [0,1].
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min

  let h = 0
  let s = 0
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6
        break
      case gn:
        h = (bn - rn) / delta + 2
        break
      default:
        h = (rn - gn) / delta + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

// Maps any mint hex color to a named family. Unparseable colors fall back to Grey.
export function colorFamily(hex: string): ColorFamily {
  const rgb = hexToRgb(hex)
  if (!rgb) return "Grey"
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)

  // Low-saturation colors read as greyscale regardless of hue.
  if (s < 0.12 || l < 0.06 || l > 0.94) {
    if (l < 0.2) return "Black"
    if (l > 0.8) return "White"
    return "Grey"
  }

  if (h < 15 || h >= 345) return "Red"
  if (h < 45) return "Orange"
  if (h < 70) return "Yellow"
  if (h < 165) return "Green"
  if (h < 195) return "Teal"
  if (h < 255) return "Blue"
  if (h < 285) return "Purple"
  return "Pink"
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Each freg contributes one value per slot. Scoring keys are numeric/derived
// (not display names) so distinct variants that happen to share a name — e.g.
// two "Hoodie" heads — are counted as separate traits.
interface SlotDef {
  slot: string
  key: (f: FregTraits) => string
  // When present and false for a freg, the slot does not apply to it — the freg
  // is excluded from that slot's counts, catalog, and scoring (not scored as a
  // separate "none"/"hidden" value).
  applies?: (f: FregTraits) => boolean
  // When false, the slot is a browsable filter facet only and never contributes
  // to a freg's rarity score. Color is user-chosen at mint, so it must not make
  // a freg "rare" — only randomized traits and earned items count. Defaults true.
  scored?: boolean
}

const SLOT_DEFS: SlotDef[] = [
  { slot: "Color", key: (f) => `color:${colorFamily(f.bodyColor)}`, scored: false },
  { slot: "Background", key: (f) => (f.background > 0 ? `bg:${f.background}` : "bg:solid") },
  { slot: "Body", key: (f) => (f.body > 0 ? `skin:${f.body}` : "body:colorable") },
  { slot: "Head", key: (f) => (f.head > 0 ? `head:${f.head}` : "head:none") },
  { slot: "Mouth", key: (f) => (f.mouth > 0 ? `mouth:${f.mouth}` : "mouth:none") },
  {
    slot: "Belly",
    // Special skins cover the belly and the on-chain metadata omits the Belly
    // attribute entirely, so the slot simply doesn't apply to those fregs.
    key: (f) => (f.belly > 0 ? `belly:${f.belly}` : "belly:none"),
    applies: (f) => f.body === 0,
  },
]

const TIER_THRESHOLDS: Array<{ tier: RarityTier; maxPercentile: number }> = [
  { tier: "Legendary", maxPercentile: 0.01 },
  { tier: "Epic", maxPercentile: 0.05 },
  { tier: "Rare", maxPercentile: 0.2 },
  { tier: "Uncommon", maxPercentile: 0.6 },
  { tier: "Common", maxPercentile: 1 },
]

function tierForPercentile(percentile: number): RarityTier {
  for (const { tier, maxPercentile } of TIER_THRESHOLDS) {
    if (percentile <= maxPercentile) return tier
  }
  return "Common"
}

// Resolves a display name for a slot value; supplied by the caller since names
// live in traits.json + the item config, which this pure module doesn't import.
export type NameResolver = (slot: string, freg: FregTraits) => string

/**
 * Computes rarity for every freg in the collection.
 *
 * @param fregs   Every minted freg's traits (collection-wide, not just owned).
 * @param resolve Maps (slot, freg) to a human-readable trait value for display.
 */
export function computeCollectionRarity(
  fregs: FregTraits[],
  resolve: NameResolver,
): Map<number, FregRarity> {
  const result = new Map<number, FregRarity>()
  const total = fregs.length
  if (total === 0) return result

  // 1. Count frequency of each value within each slot, plus how many fregs the
  //    slot applies to (the denominator for that slot's frequencies).
  const counts: Record<string, Map<string, number>> = {}
  const slotTotals: Record<string, number> = {}
  for (const def of SLOT_DEFS) {
    counts[def.slot] = new Map()
    slotTotals[def.slot] = 0
  }
  for (const freg of fregs) {
    for (const def of SLOT_DEFS) {
      if (def.applies && !def.applies(freg)) continue
      const k = def.key(freg)
      const map = counts[def.slot]
      map.set(k, (map.get(k) ?? 0) + 1)
      slotTotals[def.slot] += 1
    }
  }

  // 2. Score each freg as the sum of inverse frequencies across its slots.
  //    Slots that don't apply (e.g. Belly on a special skin) are skipped — the
  //    freg's rarity comes from the rare Body instead. Filter-only slots (Color)
  //    are recorded for display but never added to the score.
  const scored = fregs.map((freg) => {
    let score = 0
    const slots: SlotRarity[] = []
    for (const def of SLOT_DEFS) {
      if (def.applies && !def.applies(freg)) continue
      const k = def.key(freg)
      const slotTotal = slotTotals[def.slot] || total
      const count = counts[def.slot].get(k) ?? 1
      const freq = count / slotTotal
      if (def.scored !== false) score += 1 / freq
      slots.push({
        slot: def.slot,
        value: resolve(def.slot, freg),
        count,
        percent: freq * 100,
      })
    }
    return { freg, score, slots }
  })

  // 3. Rank by score (rarest first) and assign tiers by percentile.
  scored.sort((a, b) => b.score - a.score || a.freg.tokenId - b.freg.tokenId)
  scored.forEach((entry, index) => {
    const rank = index + 1
    const percentile = rank / total
    result.set(entry.freg.tokenId, {
      tokenId: entry.freg.tokenId,
      score: entry.score,
      rank,
      total,
      tier: tierForPercentile(percentile),
      slots: entry.slots,
    })
  })

  return result
}

// One selectable value within a trait slot, with its collection-wide frequency.
export interface TraitValueStat {
  value: string
  count: number
  percent: number // share of the collection, 0..100
}

// Ordered list of the trait slots exposed to the explorer/filter UI.
export const RARITY_SLOTS: string[] = SLOT_DEFS.map((d) => d.slot)

/**
 * Builds the per-slot catalog of distinct trait values and their frequencies,
 * grouped by the display name from `resolve` (so filtering and the shown label
 * always agree). Values within each slot are sorted rarest-first.
 */
export function buildTraitCatalog(
  fregs: FregTraits[],
  resolve: NameResolver,
): Record<string, TraitValueStat[]> {
  const catalog: Record<string, TraitValueStat[]> = {}

  for (const def of SLOT_DEFS) {
    const counts = new Map<string, number>()
    let slotTotal = 0
    for (const freg of fregs) {
      if (def.applies && !def.applies(freg)) continue
      const value = resolve(def.slot, freg)
      counts.set(value, (counts.get(value) ?? 0) + 1)
      slotTotal += 1
    }
    catalog[def.slot] = Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percent: slotTotal === 0 ? 0 : (count / slotTotal) * 100,
      }))
      .sort((a, b) => a.count - b.count || a.value.localeCompare(b.value))
  }

  return catalog
}

// True when a freg's resolved value for `slot` is one of the selected values.
// Fregs the slot doesn't apply to (e.g. Belly on a special skin) never match a
// selection for that slot.
export function matchesSlotFilter(
  freg: FregTraits,
  slot: string,
  selected: Set<string>,
  resolve: NameResolver,
): boolean {
  if (selected.size === 0) return true
  const def = SLOT_DEFS.find((d) => d.slot === slot)
  if (def?.applies && !def.applies(freg)) return false
  return selected.has(resolve(slot, freg))
}

export const TIER_ORDER: RarityTier[] = ["Legendary", "Epic", "Rare", "Uncommon", "Common"]

// Tailwind-friendly accent per tier for badges/labels.
export const TIER_COLORS: Record<RarityTier, string> = {
  Legendary: "#f59e0b",
  Epic: "#a855f7",
  Rare: "#3b82f6",
  Uncommon: "#22c55e",
  Common: "#9ca3af",
}
