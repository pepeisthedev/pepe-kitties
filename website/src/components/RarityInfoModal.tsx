import React from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./ui/dialog"
import { TIER_ORDER, TIER_COLORS } from "../lib/rarity"

// Explains how Fregs rarity is calculated. Opened from an info button in the
// Explore section.
export default function RarityInfoModal({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (value: boolean) => void
}): React.JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-theme-mint-modal border-2 border-theme rounded-2xl max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader className="text-left">
                    <DialogTitle className="font-bangers text-3xl xl:text-4xl text-theme-primary">
                        How Rarity Works
                    </DialogTitle>
                    <DialogDescription className="font-righteous text-theme-muted text-sm xl:text-base">
                        Our own fair rarity system — not the marketplace default.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 font-righteous text-sm text-white/90">
                    <div className="rounded-xl border border-theme-muted/30 bg-black/20 p-4 space-y-2">
                        <p className="font-bangers text-lg text-theme-primary">The idea</p>
                        <p>
                            Every Freg is scored on how unusual its traits are compared to the
                            rest of the collection. The rarer your combination, the higher your
                            rank.
                        </p>
                    </div>

                    <div className="rounded-xl border border-theme-muted/30 bg-black/20 p-4 space-y-2">
                        <p className="font-bangers text-lg text-theme-primary">Color doesn't count</p>
                        <p>
                            Your mint color is your choice, not luck — so it never makes a Freg
                            rarer. Only randomly-rolled traits and earned items decide rank. You can
                            still filter by color family (Green, Blue, Purple, Grey…) to browse, but
                            it carries no score.
                        </p>
                    </div>

                    <div className="rounded-xl border border-theme-muted/30 bg-black/20 p-4 space-y-2">
                        <p className="font-bangers text-lg text-theme-primary">Trait score</p>
                        <p>
                            Each scored slot — Background, Body, Head, Mouth, Belly — earns points
                            based on how few Fregs share that exact value. If only 10 Fregs have{" "}
                            <span className="text-theme-primary">Laser Eyes</span>, that trait is
                            worth a lot; if 400 have Normal, it's worth little. A Freg's total score
                            is the sum across all its slots — so scarce items like a{" "}
                            <span className="text-theme-primary">Gorilla Suit</span> rise to the top
                            where they belong.
                        </p>
                        <p className="font-mono text-xs text-theme-muted bg-black/30 rounded px-2 py-1">
                            trait score = total Fregs ÷ Fregs sharing this trait
                        </p>
                    </div>

                    <div className="rounded-xl border border-theme-muted/30 bg-black/20 p-4 space-y-3">
                        <p className="font-bangers text-lg text-theme-primary">Tiers</p>
                        <p>
                            Fregs are ranked by total score, then split into tiers by where they
                            land in the collection:
                        </p>
                        <div className="space-y-1.5">
                            {[
                                { tier: TIER_ORDER[0], range: "Top 1%" },
                                { tier: TIER_ORDER[1], range: "Top 5%" },
                                { tier: TIER_ORDER[2], range: "Top 20%" },
                                { tier: TIER_ORDER[3], range: "Top 60%" },
                                { tier: TIER_ORDER[4], range: "The rest" },
                            ].map(({ tier, range }) => (
                                <div key={tier} className="flex items-center justify-between gap-4">
                                    <span
                                        className="inline-flex items-center rounded-full px-2 py-0.5 font-bangers text-xs text-white"
                                        style={{ backgroundColor: `${TIER_COLORS[tier]}cc`, border: `1px solid ${TIER_COLORS[tier]}` }}
                                    >
                                        {tier}
                                    </span>
                                    <span className="text-theme-muted text-xs">{range}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-theme-subtle">
                        Rarity is calculated live from on-chain data across the whole collection, so
                        it updates as new Fregs are minted and items are applied.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
