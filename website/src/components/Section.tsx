import React from "react"
import { cn } from "../lib/utils"

interface SectionProps {
    id?: string
    className?: string
    children: React.ReactNode
    variant?: "default" | "alternate" | "dark"
}

const variantStyles = {
    default: "bg-gradient-to-br from-emerald-900/90 via-green-800/80 to-lime-900/90",
    alternate: "bg-gradient-to-br from-purple-900/90 via-pink-800/80 to-orange-900/90",
    dark: "bg-gradient-to-br from-gray-900/95 via-slate-800/90 to-zinc-900/95",
}

export default function Section({
    id,
    className,
    children,
    variant = "default"
}: SectionProps): React.JSX.Element {
    return (
        <section
            id={id}
            className={cn(
                "h-full flex flex-col",
                "relative overflow-hidden",
                variantStyles[variant],
                className
            )}
        >
            {/* Decorative background elements */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-10 left-10 w-32 h-32 bg-lime-400/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-20 w-48 h-48 bg-pink-400/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-orange-400/10 rounded-full blur-2xl" />
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
                <div className="max-w-6xl mx-auto relative z-10">
                    {children}
                </div>
            </div>
        </section>
    )
}
