import React, { useState, useEffect, useMemo, useCallback } from "react"
import Section from "./Section"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import RarityBadge from "./RarityBadge"
import RarityInfoModal from "./RarityInfoModal"
import { useCollectionRarity } from "../hooks"
import {
    buildTraitCatalog,
    matchesSlotFilter,
    RARITY_SLOTS,
    FregTraits,
    FregRarity,
} from "../lib/rarity"
import { TraitsConfig, makeRarityResolver, getTraitName } from "../lib/traitNames"
import { CircleHelp, ChevronDown, X, Search } from "lucide-react"

const INITIAL_VISIBLE = 24
const LOAD_STEP = 24

export default function ExploreSection(): React.JSX.Element {
    const [traitsConfig, setTraitsConfig] = useState<TraitsConfig | null>(null)
    const [isInfoOpen, setIsInfoOpen] = useState(false)
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
    // Selected values per slot (OR within a slot, AND across slots).
    const [filters, setFilters] = useState<Record<string, Set<string>>>({})
    const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set([RARITY_SLOTS[0]]))
    const [searchId, setSearchId] = useState("")

    useEffect(() => {
        let cancelled = false
        fetch("/frogz/default/traits.json")
            .then((res) => res.json())
            .then((data) => { if (!cancelled) setTraitsConfig(data) })
            .catch((err) => console.error("Failed to load traits config:", err))
        return () => { cancelled = true }
    }, [])

    const resolve = useMemo(() => makeRarityResolver(traitsConfig), [traitsConfig])
    const { fregs, rarityByToken, total, isLoading, error } = useCollectionRarity(resolve)

    const catalog = useMemo(() => buildTraitCatalog(fregs, resolve), [fregs, resolve])

    const activeFilterCount = useMemo(
        () => Object.values(filters).reduce((sum, set) => sum + set.size, 0),
        [filters],
    )

    // Apply trait filters + token-id search, then sort rarest-first.
    const filtered = useMemo(() => {
        const idQuery = searchId.trim()
        const result = fregs.filter((freg) => {
            if (idQuery && !String(freg.tokenId).includes(idQuery)) return false
            for (const slot of RARITY_SLOTS) {
                const selected = filters[slot]
                if (selected && selected.size > 0 && !matchesSlotFilter(freg, slot, selected, resolve)) {
                    return false
                }
            }
            return true
        })
        result.sort((a, b) => {
            const ra = rarityByToken.get(a.tokenId)?.rank ?? Number.MAX_SAFE_INTEGER
            const rb = rarityByToken.get(b.tokenId)?.rank ?? Number.MAX_SAFE_INTEGER
            return ra - rb
        })
        return result
    }, [fregs, filters, resolve, rarityByToken, searchId])

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE)
    }, [filters, searchId])

    const toggleValue = useCallback((slot: string, value: string) => {
        setFilters((prev) => {
            const next = { ...prev }
            const set = new Set(next[slot] ?? [])
            if (set.has(value)) set.delete(value)
            else set.add(value)
            if (set.size === 0) delete next[slot]
            else next[slot] = set
            return next
        })
    }, [])

    const clearAll = useCallback(() => setFilters({}), [])

    const toggleSlot = useCallback((slot: string) => {
        setExpandedSlots((prev) => {
            const next = new Set(prev)
            if (next.has(slot)) next.delete(slot)
            else next.add(slot)
            return next
        })
    }, [])

    const visible = filtered.slice(0, visibleCount)

    return (
        <Section wide>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                    <h2 className="font-bangers text-4xl xl:text-5xl text-theme-primary">Explore Fregs</h2>
                    <p className="font-righteous text-sm text-theme-muted">
                        {isLoading
                            ? "Loading collection…"
                            : `${filtered.length.toLocaleString()} of ${total.toLocaleString()} Fregs`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsInfoOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-theme-muted/40 bg-theme-card px-3 py-1.5 text-theme-muted hover:text-theme-primary hover:border-theme-primary/60 transition-colors cursor-pointer"
                    aria-label="How rarity works"
                >
                    <CircleHelp className="w-4 h-4" />
                    <span className="font-righteous text-xs">How rarity works</span>
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 font-righteous text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="flex gap-6">
                {/* Filter sidebar */}
                <aside className="hidden md:block w-64 shrink-0">
                    <div className="sticky top-0 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
                            <input
                                type="text"
                                inputMode="numeric"
                                value={searchId}
                                onChange={(e) => setSearchId(e.target.value.replace(/[^0-9]/g, ""))}
                                placeholder="Search by #ID"
                                className="w-full rounded-lg border border-theme-muted/40 bg-theme-card pl-9 pr-3 py-2 font-righteous text-sm text-white placeholder:text-theme-subtle focus:outline-none focus:border-theme-primary/60"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="font-bangers text-lg text-theme-primary">Filters</span>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="inline-flex items-center gap-1 font-righteous text-xs text-theme-muted hover:text-theme-primary"
                                >
                                    <X className="w-3 h-3" /> Clear ({activeFilterCount})
                                </button>
                            )}
                        </div>

                        {RARITY_SLOTS.map((slot) => {
                            const values = catalog[slot] ?? []
                            const isOpen = expandedSlots.has(slot)
                            const selectedCount = filters[slot]?.size ?? 0
                            return (
                                <div key={slot} className="rounded-xl border border-theme-muted/30 bg-black/20 overflow-hidden">
                                    <button
                                        onClick={() => toggleSlot(slot)}
                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5"
                                    >
                                        <span className="font-righteous text-sm text-white">
                                            {slot}
                                            {selectedCount > 0 && (
                                                <span className="ml-1.5 text-theme-primary">({selectedCount})</span>
                                            )}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-theme-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                    </button>
                                    {isOpen && (
                                        <div className="max-h-60 overflow-y-auto px-2 pb-2 space-y-0.5">
                                            {values.length === 0 && (
                                                <p className="px-1 py-1 font-righteous text-xs text-theme-subtle">
                                                    {isLoading ? "Loading…" : "No data"}
                                                </p>
                                            )}
                                            {values.map((v) => {
                                                const checked = filters[slot]?.has(v.value) ?? false
                                                return (
                                                    <label
                                                        key={v.value}
                                                        className={`flex items-center gap-2 rounded-lg px-2 py-1 cursor-pointer text-xs ${checked ? "bg-theme-primary/20" : "hover:bg-white/5"}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleValue(slot, v.value)}
                                                            className="accent-theme-primary"
                                                        />
                                                        <span className="flex-1 truncate font-righteous text-white" title={v.value}>
                                                            {v.value}
                                                        </span>
                                                        <span className="font-mono text-theme-muted tabular-nums">{v.count}</span>
                                                        <span className="font-mono text-theme-subtle tabular-nums w-10 text-right">
                                                            {v.percent < 1 ? v.percent.toFixed(1) : Math.round(v.percent)}%
                                                        </span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </aside>

                {/* Grid */}
                <div className="flex-1 min-w-0">
                    {isLoading && fregs.length === 0 ? (
                        <div className="flex justify-center py-20">
                            <LoadingSpinner />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="py-20 text-center font-righteous text-theme-muted">
                            No Fregs match these filters.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                {visible.map((freg) => (
                                    <ExploreCard
                                        key={freg.tokenId}
                                        freg={freg}
                                        rarity={rarityByToken.get(freg.tokenId)}
                                        traitsConfig={traitsConfig}
                                    />
                                ))}
                            </div>
                            {visibleCount < filtered.length && (
                                <div className="flex justify-center pt-6">
                                    <button
                                        onClick={() => setVisibleCount((c) => c + LOAD_STEP)}
                                        className="font-bangers text-lg px-6 py-3 rounded-xl btn-theme-primary"
                                    >
                                        Load More ({visible.length} / {filtered.length})
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <RarityInfoModal open={isInfoOpen} onOpenChange={setIsInfoOpen} />
        </Section>
    )
}

function ExploreCard({
    freg,
    rarity,
    traitsConfig,
}: {
    freg: FregTraits
    rarity: FregRarity | undefined
    traitsConfig: TraitsConfig | null
}): React.JSX.Element {
    return (
        <div className="rounded-xl border-2 border-theme bg-theme-card overflow-hidden">
            <div className="relative bg-white" style={{ aspectRatio: "617.49 / 644.18" }}>
                <KittyRenderer
                    bodyColor={freg.bodyColor}
                    background={freg.background}
                    body={freg.body}
                    head={freg.head}
                    mouth={freg.mouth}
                    stomach={freg.belly}
                    size="sm"
                    className="w-full h-full"
                />
                <div className="absolute top-2 left-2 z-10">
                    <RarityBadge rarity={rarity} />
                </div>
            </div>
            <div className="p-2 space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-bangers text-base text-theme-primary">#{freg.tokenId}</span>
                    <span className="font-mono text-[9px] text-theme-muted flex items-center gap-1">
                        <span
                            className="inline-block w-2.5 h-2.5 rounded border border-white/30"
                            style={{ backgroundColor: freg.bodyColor }}
                        />
                        {freg.bodyColor}
                    </span>
                </div>
                <div className="text-[10px] font-righteous text-theme-muted space-y-0.5">
                    <Row label="Head" value={getTraitName(traitsConfig, "head", freg.head)} />
                    {freg.body > 0 ? (
                        <Row label="Skin" value={getTraitName(traitsConfig, "skin", freg.body)} />
                    ) : (
                        <Row label="Belly" value={getTraitName(traitsConfig, "stomach", freg.belly)} />
                    )}
                    {freg.background > 0 && (
                        <Row label="Background" value={getTraitName(traitsConfig, "background", freg.background)} />
                    )}
                </div>
            </div>
        </div>
    )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
        <div className="flex justify-between gap-2">
            <span>{label}:</span>
            <span className="font-bangers text-theme-primary truncate">{value}</span>
        </div>
    )
}
