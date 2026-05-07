import React, { useMemo } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./ui/dialog"
import { useContractData } from "../hooks"

const formatPercent = (value: number): string =>
    Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`

// Item claim weights the contract uses when a freg claims a random item.
// Reading live from the Fregs contract via useContractData so the numbers
// always reflect on-chain truth (owner can tweak weights post-deploy).
const ITEM_SPECS = [
    { key: "colorChangeWeight", label: "Color Change" },
    { key: "headRerollWeight", label: "Head Reroll" },
    { key: "treasureChestWeight", label: "Treasure Chest" },
    { key: "metalSkinWeight", label: "Robot Skin" },
    { key: "goldSkinWeight", label: "Gold Skin" },
    { key: "diamondSkinWeight", label: "Diamond Skin" },
    { key: "boneWeight", label: "Skeleton Skin (Bone)" },
] as const

export default function ItemRaritiesModal({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (value: boolean) => void
}): React.JSX.Element {
    const { data: contractData } = useContractData()

    const rows = useMemo(() => {
        if (!contractData) return []
        const weights = ITEM_SPECS.map(spec => ({
            label: spec.label,
            weight: (contractData[spec.key] as number) ?? 0,
        }))
        const total = weights.reduce((sum, r) => sum + r.weight, 0)
        if (total === 0) return weights.map(r => ({ label: r.label, percent: 0 }))
        return weights
            .map(r => ({ label: r.label, percent: (r.weight / total) * 100 }))
            .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label))
    }, [contractData])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-theme-mint-modal border-2 border-theme rounded-2xl max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader className="text-left">
                    <DialogTitle className="font-bangers text-3xl xl:text-4xl text-theme-primary">
                        Item Rarities
                    </DialogTitle>
                    <DialogDescription className="font-righteous text-theme-muted text-sm xl:text-base">
                        Odds of each item when a Freg claims a random item.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-theme-muted/30 bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between border-b border-theme-muted/20 pb-2">
                        <p className="font-righteous text-xs uppercase tracking-[0.24em] text-theme-muted">Item</p>
                        <p className="font-righteous text-xs uppercase tracking-[0.24em] text-theme-muted">Odds</p>
                    </div>
                    {rows.length === 0 ? (
                        <p className="font-righteous text-sm text-theme-subtle text-center py-2">
                            Loading…
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {rows.map(row => (
                                <div key={row.label} className="flex items-center justify-between gap-4">
                                    <span className="font-righteous text-sm xl:text-base text-white">
                                        {row.label}
                                    </span>
                                    <span className="font-bangers text-base xl:text-lg text-theme-primary tabular-nums whitespace-nowrap">
                                        {formatPercent(row.percent)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
