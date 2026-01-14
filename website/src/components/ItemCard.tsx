import React from "react"
import { ITEM_TYPES, ITEM_TYPE_NAMES, ITEM_TYPE_DESCRIPTIONS } from "../config/contracts"

interface ItemCardProps {
  tokenId: number
  itemType: number
  selected?: boolean
  onClick?: () => void
  showDescription?: boolean
  size?: "sm" | "md" | "lg"
}

const ITEM_COLORS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "border-pink-400 bg-pink-400/10",
  [ITEM_TYPES.HEAD_REROLL]: "border-purple-400 bg-purple-400/10",
  [ITEM_TYPES.BRONZE_SKIN]: "border-amber-600 bg-amber-600/10",
  [ITEM_TYPES.SILVER_SKIN]: "border-gray-300 bg-gray-300/10",
  [ITEM_TYPES.GOLD_SKIN]: "border-yellow-400 bg-yellow-400/10",
  [ITEM_TYPES.TREASURE_CHEST]: "border-amber-700 bg-amber-700/10",
}

const ITEM_SELECTED_COLORS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "ring-pink-400",
  [ITEM_TYPES.HEAD_REROLL]: "ring-purple-400",
  [ITEM_TYPES.BRONZE_SKIN]: "ring-amber-600",
  [ITEM_TYPES.SILVER_SKIN]: "ring-gray-300",
  [ITEM_TYPES.GOLD_SKIN]: "ring-yellow-400",
  [ITEM_TYPES.TREASURE_CHEST]: "ring-amber-700",
}

export default function ItemCard({
  tokenId,
  itemType,
  selected = false,
  onClick,
  showDescription = false,
  size = "md",
}: ItemCardProps): React.JSX.Element {
  const colorClass = ITEM_COLORS[itemType] || "border-white/30 bg-white/5"
  const selectedRingClass = ITEM_SELECTED_COLORS[itemType] || "ring-lime-400"
  const name = ITEM_TYPE_NAMES[itemType] || "Unknown Item"
  const description = ITEM_TYPE_DESCRIPTIONS[itemType] || ""

  const sizeClasses = {
    sm: { icon: "w-12 h-12", padding: "p-2", name: "text-xs", id: "text-[10px]" },
    md: { icon: "w-16 h-16", padding: "p-3", name: "text-sm", id: "text-xs" },
    lg: { icon: "w-24 h-24", padding: "p-4", name: "text-lg", id: "text-sm" },
  }
  const sizeClass = sizeClasses[size]

  return (
    <button
      onClick={onClick}
      className={`
        relative ${sizeClass.padding} rounded-xl border-2 transition-all duration-200
        ${colorClass}
        ${selected ? `ring-4 ${selectedRingClass} scale-105` : "hover:scale-105"}
        ${onClick ? "cursor-pointer" : "cursor-default"}
      `}
    >
      {/* Item icon */}
      <div className={`${sizeClass.icon} mx-auto mb-2`}>
        <img
          src={`/items/${itemType}.svg`}
          alt={name}
          className="w-full h-full object-contain"
          onError={(e) => {
            // Fallback if image doesn't exist
            e.currentTarget.style.display = "none"
          }}
        />
      </div>

      {/* Item name */}
      <p className={`font-bangers ${sizeClass.name} text-white text-center`}>{name}</p>

      {/* Token ID */}
      <p className={`font-righteous ${sizeClass.id} text-white/50 text-center`}>#{tokenId}</p>

      {/* Description */}
      {showDescription && description && (
        <p className="font-righteous text-xs text-white/60 text-center mt-2">
          {description}
        </p>
      )}

      {/* Selection indicator */}
      {selected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-lime-400 rounded-full flex items-center justify-center">
          <span className="text-black font-bold text-sm">✓</span>
        </div>
      )}
    </button>
  )
}
