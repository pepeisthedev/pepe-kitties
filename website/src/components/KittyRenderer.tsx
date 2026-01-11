import React from "react"

interface KittyRendererProps {
  bodyColor: string
  head: number
  mouth: number
  belly: number
  specialSkin: number
  size?: "sm" | "md" | "lg"
  className?: string
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
  const sizeClasses = {
    sm: "w-24 h-24",
    md: "w-40 h-40",
    lg: "w-64 h-64",
  }

  // If special skin is set, render: special-skin + head + mouth (no body/belly)
  // Otherwise render: body (with color) + belly + head + mouth
  const hasSpecialSkin = specialSkin > 0

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {hasSpecialSkin ? (
        // Special skin renders
        <>
          <img
            src={`/traits/special-skin/${specialSkin}.svg`}
            alt={`Special Skin ${specialSkin}`}
            className="absolute inset-0 w-full h-full"
          />
        </>
      ) : (
        // Normal body + belly renders
        <>
          {/* Body with color overlay */}
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundColor: bodyColor,
              WebkitMask: "url(/traits/body/base.svg) center/contain no-repeat",
              mask: "url(/traits/body/base.svg) center/contain no-repeat",
            }}
          />
          {/* Belly */}
          <img
            src={`/traits/belly/${belly}.svg`}
            alt={`Belly ${belly}`}
            className="absolute inset-0 w-full h-full"
          />
        </>
      )}

      {/* Head - always rendered */}
      <img
        src={`/traits/head/${head}.svg`}
        alt={`Head ${head}`}
        className="absolute inset-0 w-full h-full"
      />

      {/* Mouth - always rendered */}
      <img
        src={`/traits/mouth/${mouth}.svg`}
        alt={`Mouth ${mouth}`}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
