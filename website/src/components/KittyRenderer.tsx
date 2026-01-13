import React, { useState, useEffect } from "react"

interface KittyRendererProps {
  bodyColor: string
  head: number
  mouth: number
  belly: number
  specialSkin: number
  background: number
  size?: "sm" | "md" | "lg"
  className?: string
}

// Cache for body SVG to avoid repeated fetches
let bodySvgCache: string | null = null

export default function KittyRenderer({
  bodyColor,
  head,
  mouth,
  belly,
  specialSkin,
  background,
  size = "md",
  className = "",
}: KittyRendererProps): React.JSX.Element {
  const [bodySvgUrl, setBodySvgUrl] = useState<string | null>(null)

  const sizeClasses = {
    sm: "w-full h-full",
    md: "w-40 h-40",
    lg: "w-64 h-64",
  }

  // If special skin is set, render: background + special-skin + head + mouth (no body/belly)
  // Otherwise render: background + body + belly + head + mouth
  const hasSpecialSkin = specialSkin > 0

  // Default to background 1 if not set (for old kitties minted before update)
  const bgIndex = background || 1

  // Fetch body SVG and replace color
  useEffect(() => {
    if (hasSpecialSkin) return

    const loadBody = async () => {
      try {
        // Use cache if available
        let svgText = bodySvgCache
        if (!svgText) {
          const response = await fetch("/frogz/body/1.svg")
          svgText = await response.text()
          bodySvgCache = svgText
        }

        // Replace the default green color with the kitty's body color
        const coloredSvg = svgText.replace(/#65b449/gi, bodyColor)

        // Create a blob URL for the modified SVG
        const blob = new Blob([coloredSvg], { type: "image/svg+xml" })
        const url = URL.createObjectURL(blob)
        setBodySvgUrl(url)

        // Cleanup old URL
        return () => URL.revokeObjectURL(url)
      } catch (err) {
        console.error("Error loading body SVG:", err)
      }
    }

    loadBody()
  }, [bodyColor, hasSpecialSkin])

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Background - always rendered first */}
      <img
        src={`/frogz/background/${bgIndex}.svg`}
        alt={`Background ${bgIndex}`}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {hasSpecialSkin ? (
        // Special skin renders (replaces body + belly)
        <img
          src={`/frogz/special/${specialSkin}.svg`}
          alt={`Special Skin ${specialSkin}`}
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : (
        // Normal body + belly renders
        <>
          {/* Body with dynamic color */}
          {bodySvgUrl && (
            <img
              src={bodySvgUrl}
              alt="Body"
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}
          {/* Belly */}
          <img
            src={`/frogz/belly/${belly}.svg`}
            alt={`Belly ${belly}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </>
      )}

      {/* Head - always rendered */}
      <img
        src={`/frogz/head/${head}.svg`}
        alt={`Head ${head}`}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Mouth - always rendered */}
      <img
        src={`/frogz/mouth/${mouth}.svg`}
        alt={`Mouth ${mouth}`}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  )
}
