import React, { useState, useEffect } from "react"

interface KittyRendererProps {
  bodyColor: string
  head: number
  mouth: number
  belly: number
  specialSkin: number
  size?: "sm" | "md" | "lg"
  className?: string
}

// Cache for original SVG content to avoid repeated fetches
const svgCache: { body: string | null; background: string | null } = {
  body: null,
  background: null,
}

export default function KittyRenderer({
  bodyColor,
  head,
  mouth,
  belly,
  specialSkin,
  size = "md",
  className = "",
}: KittyRendererProps): React.JSX.Element {
  const [bodySvgUrl, setBodySvgUrl] = useState<string | null>(null)
  const [backgroundSvgUrl, setBackgroundSvgUrl] = useState<string | null>(null)

  const sizeClasses = {
    sm: "w-full h-full",
    md: "w-40 h-40",
    lg: "w-64 h-64",
  }

  // If special skin is set, render: background + special-skin + head + mouth (no body/belly)
  // Otherwise render: background + body + belly + head + mouth
  const hasSpecialSkin = specialSkin > 0

  // Fetch body SVG and replace color
  useEffect(() => {
    if (hasSpecialSkin) return

    const loadBody = async () => {
      try {
        // Fetch and cache the original SVG if not already cached
        if (!svgCache.body) {
          const response = await fetch("/frogz/body/1.svg")
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
  }, [bodyColor, hasSpecialSkin])

  // Fetch background SVG and replace color
  useEffect(() => {
    const loadBackground = async () => {
      try {
        // Fetch and cache the original SVG if not already cached
        if (!svgCache.background) {
          const response = await fetch("/frogz/background/1.svg")
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

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Background - always rendered first */}
      {backgroundSvgUrl && (
        <img
          src={backgroundSvgUrl}
          alt="Background"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

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
