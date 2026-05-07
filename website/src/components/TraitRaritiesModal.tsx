import React, { useState, useEffect, useMemo } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./ui/dialog"

type TraitEntry = {
    name: string
    rarity?: number
    isNone?: boolean
}
type TraitsConfig = {
    head?: TraitEntry[]
    mouth?: TraitEntry[]
    stomach?: TraitEntry[]
}

const formatPercent = (value: number): string =>
    Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`

// The "baseline" trait (Normal Eyes for head, Normal for mouth/belly) is pinned
// to the top so users see the default first regardless of its rarity weight.
const isBaselineTrait = (name: string) => name === "Normal Eyes" || name === "Normal"

const buildRarityRows = (entries: TraitEntry[] | undefined): Array<{ name: string; percent: number }> => {
    if (!entries || entries.length === 0) return []
    const total = entries.reduce((sum, e) => sum + (e.rarity ?? 0), 0)
    const rows = total === 0
        ? entries.map(e => ({ name: e.name, percent: 0 }))
        : entries.map(e => ({ name: e.name, percent: ((e.rarity ?? 0) / total) * 100 }))
    return rows.sort((a, b) => {
        const aPin = isBaselineTrait(a.name)
        const bPin = isBaselineTrait(b.name)
        if (aPin && !bPin) return -1
        if (!aPin && bPin) return 1
        return b.percent - a.percent || a.name.localeCompare(b.name)
    })
}

export default function TraitRaritiesModal({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (value: boolean) => void
}): React.JSX.Element {
    const [traitsConfig, setTraitsConfig] = useState<TraitsConfig | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch('/frogz/default/traits.json')
            .then(res => res.json())
            .then(data => { if (!cancelled) setTraitsConfig(data) })
            .catch(err => console.error('Failed to load traits config:', err))
        return () => { cancelled = true }
    }, [])

    const headRows = useMemo(() => buildRarityRows(traitsConfig?.head), [traitsConfig])
    const mouthRows = useMemo(() => buildRarityRows(traitsConfig?.mouth), [traitsConfig])
    const stomachRows = useMemo(() => buildRarityRows(traitsConfig?.stomach), [traitsConfig])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-theme-mint-modal border-2 border-theme rounded-2xl max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader className="text-left">
                    <DialogTitle className="font-bangers text-3xl xl:text-4xl text-theme-primary">
                        Trait Rarities
                    </DialogTitle>
                    <DialogDescription className="font-righteous text-theme-muted text-sm xl:text-base">
                        Odds of each trait appearing on a freshly minted Freg.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {[
                        { title: "Head", rows: headRows },
                        { title: "Mouth", rows: mouthRows },
                        { title: "Belly", rows: stomachRows },
                    ].map(({ title, rows }) => (
                        <div key={title} className="rounded-xl border border-theme-muted/30 bg-black/20 p-4">
                            <div className="mb-3 flex items-center justify-between border-b border-theme-muted/20 pb-2">
                                <p className="font-righteous text-xs uppercase tracking-[0.24em] text-theme-muted">{title}</p>
                                <p className="font-righteous text-xs uppercase tracking-[0.24em] text-theme-muted">Odds</p>
                            </div>
                            {rows.length === 0 ? (
                                <p className="font-righteous text-sm text-theme-subtle text-center py-2">
                                    Loading…
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {rows.map(row => (
                                        <div key={row.name} className="flex items-center justify-between gap-4">
                                            <span className="font-righteous text-sm xl:text-base text-white">
                                                {row.name}
                                            </span>
                                            <span className="font-bangers text-base xl:text-lg text-theme-primary tabular-nums whitespace-nowrap">
                                                {formatPercent(row.percent)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    <p className="font-righteous text-xs text-theme-subtle">
                        Traits with 0% (e.g. Hoodie, Frog Suit) can't be minted — they're earned through Spin the Wheel.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
