import React from "react"

interface LoadingSpinnerProps {
  message?: string
  size?: "sm" | "md" | "lg"
}

export default function LoadingSpinner({
  message,
  size = "md",
}: LoadingSpinnerProps): React.JSX.Element {
  const sizeClasses = {
    sm: "w-6 h-6 border-2",
    md: "w-10 h-10 border-3",
    lg: "w-16 h-16 border-4",
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} spinner-theme rounded-full animate-spin`}
      />
      {message && (
        <p className="font-righteous text-theme-muted text-sm animate-pulse">
          {message}
        </p>
      )}
    </div>
  )
}
