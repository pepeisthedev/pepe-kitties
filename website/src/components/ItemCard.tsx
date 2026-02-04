import React, { useState, useEffect } from "react"
import { ITEM_TYPES, ITEM_TYPE_NAMES, ITEM_TYPE_DESCRIPTIONS } from "../config/contracts"

// Map item types to their image paths
const ITEM_IMAGES: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "/items/1.svg",
  [ITEM_TYPES.HEAD_REROLL]: "/items/2.svg",
  [ITEM_TYPES.BRONZE_SKIN]: "/items/3.svg",
  [ITEM_TYPES.METAL_SKIN]: "/items/4.svg",
  [ITEM_TYPES.GOLD_SKIN]: "/items/5.svg",
  [ITEM_TYPES.TREASURE_CHEST]: "/items/6.svg",
  [ITEM_TYPES.BEAD_PUNK]: "/beadpunks.png",
  [ITEM_TYPES.DIAMOND_SKIN]: "/items/8.svg",
  [ITEM_TYPES.SPECIAL_DICE]: "/items/100.svg",
}

interface ItemCardProps {
  tokenId: number
  itemType: number
  itemName?: string  // Override name from ITEM_TYPE_NAMES for dynamic items
  selected?: boolean
  onClick?: () => void
  showDescription?: boolean
  size?: "sm" | "md" | "lg"
}

const ITEM_COLORS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "border-lime-400/50 bg-black/30",
  [ITEM_TYPES.HEAD_REROLL]: "border-lime-400/50 bg-black/30",
  [ITEM_TYPES.BRONZE_SKIN]: "border-amber-600/50 bg-black/30",
  [ITEM_TYPES.METAL_SKIN]: "border-gray-400/50 bg-black/30",
  [ITEM_TYPES.GOLD_SKIN]: "border-yellow-400/50 bg-black/30",
  [ITEM_TYPES.TREASURE_CHEST]: "border-lime-400/50 bg-black/30",
  [ITEM_TYPES.BEAD_PUNK]: "border-purple-400/50 bg-black/30",
  [ITEM_TYPES.DIAMOND_SKIN]: "border-cyan-400/50 bg-black/30",
  [ITEM_TYPES.SPECIAL_DICE]: "border-cyan-400/50 bg-black/30",
}

const ITEM_SELECTED_COLORS: Record<number, string> = {
  [ITEM_TYPES.COLOR_CHANGE]: "ring-lime-400",
  [ITEM_TYPES.HEAD_REROLL]: "ring-lime-400",
  [ITEM_TYPES.BRONZE_SKIN]: "ring-amber-600",
  [ITEM_TYPES.METAL_SKIN]: "ring-gray-400",
  [ITEM_TYPES.GOLD_SKIN]: "ring-yellow-400",
  [ITEM_TYPES.TREASURE_CHEST]: "ring-lime-400",
  [ITEM_TYPES.BEAD_PUNK]: "ring-purple-400",
  [ITEM_TYPES.DIAMOND_SKIN]: "ring-cyan-400",
  [ITEM_TYPES.SPECIAL_DICE]: "ring-cyan-400",
}

export default function ItemCard({
  tokenId,
  itemType,
  itemName,
  selected = false,
  onClick,
  showDescription = false,
  size = "md",
}: ItemCardProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgSrc = ITEM_IMAGES[itemType] || `/items/${itemType}.svg`
  const colorClass = ITEM_COLORS[itemType] || "border-yellow-400/50 bg-black/30"
  const selectedRingClass = ITEM_SELECTED_COLORS[itemType] || "ring-yellow-400"
  const name = itemName || ITEM_TYPE_NAMES[itemType] || "Unknown Item"
  const description = ITEM_TYPE_DESCRIPTIONS[itemType] || ""

  // Reset loading state when itemType changes
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)

    // Fallback timeout to hide spinner after 2 seconds
    const timeout = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(timeout)
  }, [itemType])

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
        ${selected ? `ring-2 ${selectedRingClass}` : "hover:border-lime-400"}
        ${onClick ? "cursor-pointer" : "cursor-default"}
      `}
    >
      {/* Item icon */}
      <div className={`${sizeClass.icon} mx-auto mb-2 relative`}>
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700/50 rounded animate-pulse">
            <div className="w-4 h-4 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          key={`${itemType}-${tokenId}`}
          src={hasError ? "/items/placeholder.svg" : imgSrc}
          alt={name}
          className={`w-full h-full object-contain transition-opacity ${isLoading && !hasError ? "opacity-0" : "opacity-100"}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false)
            setHasError(true)
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
