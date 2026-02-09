import React, { useState, useEffect } from "react"

interface KittyRendererProps {
  bodyColor: string
  background?: number  // 0 = use bodyColor, 1+ = special background
  body?: number        // 0 = use base colorable skin, 1+ = special skin (Bronze=1, Diamond=2, Metal=3, Gold=4)
  head?: number
  mouth?: number
  stomach?: number
  size?: "sm" | "md" | "lg"
  className?: string
  hideTraits?: boolean // Hide mouth, stomach - for mint preview (head/eyes always show)
}

// Paths to SVG assets
const FROGZ_PATH = "/frogz/default"
const FROM_ITEMS_PATH = "/frogz/from_items"

// Base trait counts - heads with IDs above this are item heads (stored in added/head folder)
const BASE_HEAD_COUNT = 19

// Cache for original SVG content to avoid repeated fetches
const svgCache: { body: string | null; background: string | null } = {
  body: null,
  background: null,
}

export default function KittyRenderer({
  bodyColor,
  background = 0,
  body = 0,
  head = 11,  // Default eyes (Mohawk head includes base eyes)
  mouth = 1,
  stomach = 1,
  size = "md",
  className = "",
  hideTraits = false,
}: KittyRendererProps): React.JSX.Element {
  const [bodySvgUrl, setBodySvgUrl] = useState<string | null>(null)
  const [backgroundSvgUrl, setBackgroundSvgUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const sizeClasses = {
    sm: "w-full h-full",
    md: "w-40 h-40",
    lg: "w-64 h-64",
  }

  // Simplified trait system:
  // body=0 means use base colorable skin (skin/1.svg), body>0 means special skin
  // Contract mapping: Bronze=1, Diamond=2, Metal=3, Gold=4 → directly maps to skin/{body}.svg
  // Stomach only renders for default body (special skins cover the belly area)
  const hasSpecialBody = body > 0

  // Fetch body SVG and replace color
  useEffect(() => {
    if (hasSpecialBody) {
      setBodySvgUrl(null)
      return
    }

    const loadBody = async () => {
      try {
        // Fetch and cache the original SVG if not already cached
        if (!svgCache.body) {
          const response = await fetch(`${FROGZ_PATH}/skin/1.svg`)
          svgCache.body = await response.text()
        }

        // Replace the default green color with the kitty's body color
        const coloredSvg = svgCache.body.replace(/#65b449/gi, bodyColor)

        // Create a blob URL for the modified SVG
        const blob = new Blob([coloredSvg], { type: "image/svg+xml" })
        const url = URL.createObjectURL(blob)
        setBodySvgUrl(url)
      } catch (err) {
        console.error("Error loading body SVG:", err)
      }
    }

    loadBody()
  }, [bodyColor, hasSpecialBody])

  // Fetch background SVG and replace color
  useEffect(() => {
    const loadBackground = async () => {
      try {
        // Fetch and cache the original SVG if not already cached
        if (!svgCache.background) {
          const response = await fetch(`${FROGZ_PATH}/background/1.svg`)
          svgCache.background = await response.text()
        }

        // Replace the default green color with the kitty's body color
        const coloredSvg = svgCache.background.replace(/#65b449/gi, bodyColor)

        // Create a blob URL for the modified SVG
        const blob = new Blob([coloredSvg], { type: "image/svg+xml" })
        const url = URL.createObjectURL(blob)
        setBackgroundSvgUrl(url)
      } catch (err) {
        console.error("Error loading background SVG:", err)
      }
    }

    loadBackground()
  }, [bodyColor])

  // Track loading state
  useEffect(() => {
    const bgReady = backgroundSvgUrl !== null
    const bodyReady = hasSpecialBody || bodySvgUrl !== null
    setIsLoading(!bgReady || !bodyReady)
  }, [backgroundSvgUrl, bodySvgUrl, hasSpecialBody])

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Loading placeholder */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 animate-pulse rounded-lg">
          <div className="w-8 h-8 border-3 spinner-theme rounded-full animate-spin" />
        </div>
      )}

      {/* Background - always rendered first */}
      {backgroundSvgUrl && (
        <img
          src={backgroundSvgUrl}
          alt="Background"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Body - special skin or color-based */}
      {hasSpecialBody ? (
        <img
          src={`${FROM_ITEMS_PATH}/skin/${body}.svg`}
          alt={`Special Skin ${body}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : (
        bodySvgUrl && (
          <img
            src={bodySvgUrl}
            alt="Body"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )
      )}

      {/* Stomach - only renders for default body (special skins cover the belly) */}
      {!hideTraits && !hasSpecialBody && (
        <img
          src={`${FROGZ_PATH}/stomach/${stomach}.svg`}
          alt={`Stomach ${stomach}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Head - each head trait includes eyes in its SVG
          Base heads (1-19) are in default/head/, item heads (20+) are in from_items/head/ */}
      {head > BASE_HEAD_COUNT ? (
        <img
          src={`${FROM_ITEMS_PATH}/head/${head - BASE_HEAD_COUNT}.svg`}
          alt={`Head ${head}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : (
        <img
          src={`${FROGZ_PATH}/head/${head}.svg`}
          alt={`Head ${head}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Mouth - hidden in preview mode */}
      {!hideTraits && (
        <img
          src={`${FROGZ_PATH}/mouth/${mouth}.svg`}
          alt={`Mouth ${mouth}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}
    </div>
  )
}
