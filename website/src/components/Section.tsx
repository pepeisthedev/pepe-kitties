import React from "react"
import { cn } from "../lib/utils"

interface SectionProps {
    id?: string
    className?: string
    children: React.ReactNode
    wide?: boolean
}

export default function Section({
    id,
    className,
    children,
    wide = false,
}: SectionProps): React.JSX.Element {
    return (
        <section
            id={id}
            className={cn(
                "h-full flex flex-col",
                "relative overflow-hidden",
                "bg-theme-surface",
                className
            )}
        >
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
                <div className={cn(
                    "mx-auto relative z-10",
                    wide ? "max-w-7xl" : "max-w-6xl"
                )}>
                    {children}
                </div>
            </div>
        </section>
    )
}
