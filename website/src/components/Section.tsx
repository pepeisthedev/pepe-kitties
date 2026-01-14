import React from "react"
import { cn } from "../lib/utils"

interface SectionProps {
    id?: string
    className?: string
    children: React.ReactNode
}

export default function Section({
    id,
    className,
    children,
}: SectionProps): React.JSX.Element {
    return (
        <section
            id={id}
            className={cn(
                "h-full flex flex-col",
                "relative overflow-hidden",
                "bg-black/40",
                className
            )}
        >
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
                <div className="max-w-6xl mx-auto relative z-10">
                    {children}
                </div>
            </div>
        </section>
    )
}
