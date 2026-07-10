import React from "react"
import { FregRarity, TIER_COLORS } from "../lib/rarity"

// Compact tier + rank chip. Used as a front-of-card overlay and inline on the
// card back. Renders nothing until rarity has been computed for the collection.
export default function RarityBadge({
  rarity,
  size = "sm",
  className = "",
}: {
  rarity: FregRarity | undefined
  size?: "sm" | "md"
  className?: string
}): React.JSX.Element | null {
  if (!rarity) return null

  const color = TIER_COLORS[rarity.tier]
  const isMd = size === "md"

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full font-bangers text-white backdrop-blur-sm ${
        isMd ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[9px]"
      } ${className}`}
      style={{ backgroundColor: `${color}cc`, border: `1px solid ${color}` }}
      title={`${rarity.tier} — rank ${rarity.rank} of ${rarity.total}`}
    >
      <span className="uppercase tracking-wide">{rarity.tier}</span>
      <span className="opacity-80">
        #{rarity.rank}/{rarity.total}
      </span>
    </div>
  )
}
