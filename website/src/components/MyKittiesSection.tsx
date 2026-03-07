import React, { useState, useCallback, useEffect, useMemo } from "react"
import { formatEther } from "ethers"
import { flushSync } from "react-dom"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useOwnedKitties, useUnclaimedKitties, useOwnedItems, useContracts, Kitty, Item } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import ResultModal from "./ResultModal"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES, ITEM_TYPES, ITEM_TYPE_DESCRIPTIONS, TRAIT_TYPES, getItemConfig, ITEMS, checkItemIncompatibility } from "../config/contracts"
import { Gift, LayoutGrid, Rows, Flame, AlertTriangle, Wand2, Palette, Backpack } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog"

// Trait names loaded from traits.json
interface TraitInfo {
    fileName: string
    name: string
    description?: string
}

interface TraitsConfig {
    head: TraitInfo[]
    mouth: TraitInfo[]
    stomach: TraitInfo[]
    skin: TraitInfo[]
    background: TraitInfo[]
}

// Get trait name by index (1-indexed in contract)
const getTraitName = (traitsConfig: TraitsConfig | null, traitType: keyof TraitsConfig, index: number): string => {
    if (!traitsConfig || index === 0) return "None"
    const traits = traitsConfig[traitType]
    if (!traits || index > traits.length) {
        // Check from_items for special traits
        if (traitType === 'head' && index > 22) {
            const itemHead = ITEMS.find(item => item.category === 'head' && item.traitFileName === `${index - 22}.svg`)
            return itemHead?.name || `Special #${index - 22}`
        }
        if (traitType === 'skin' && index > 1) {
            const itemSkin = ITEMS.find(item => item.category === 'skin' && item.traitFileName === `${index}.svg`)
            return itemSkin?.name || `Special #${index}`
        }
        return `#${index}`
    }
    return traits[index - 1]?.name || `#${index}`
}

// --- Item helper functions (from UseItemsSection) ---

const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100
    l /= 100
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
        return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}

const generatePalette = (hue: number): string[] => {
    const variations = [
        { s: 90, l: 85 }, { s: 80, l: 70 }, { s: 90, l: 60 }, { s: 100, l: 50 },
        { s: 80, l: 45 }, { s: 70, l: 40 }, { s: 60, l: 35 }, { s: 50, l: 30 },
        { s: 40, l: 25 }, { s: 30, l: 80 }, { s: 40, l: 60 }, { s: 25, l: 45 },
    ]
    return variations.map(v => hslToHex(hue, v.s, v.l))
}

const isSkinItem = (itemType: number): boolean => getItemConfig(itemType)?.category === 'skin'
const isHeadItem = (itemType: number): boolean => getItemConfig(itemType)?.category === 'head'

const isDynamicTraitItem = (item: Item): boolean => {
    const config = getItemConfig(item.itemType)
    if (!config) return false
    return config.category !== 'utility' && config.category !== 'special' && config.category !== 'external'
}

const getItemDescription = (item: Item): string => {
    if (ITEM_TYPE_DESCRIPTIONS[item.itemType]) return ITEM_TYPE_DESCRIPTIONS[item.itemType]
    if (item.targetTraitType === TRAIT_TYPES.HEAD) return `Apply a special head accessory to your Freg`
    if (item.targetTraitType === TRAIT_TYPES.BODY) return `Apply a special body skin to your Freg`
    return `Apply ${item.name} to your Freg`
}

const isValidHexColor = (color: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(color)

// Carousel Card component with flip support
interface CarouselCardProps {
    kitty: Kitty
    isSelected: boolean
    isFlipped: boolean
    hasClaimable: boolean
    onClick: () => void
    traitsConfig: TraitsConfig | null
    redeemETH: string | null
    redeemCoin: string | null
    liquidityActive: boolean
    onBurn: (tokenId: number) => void
}

function CarouselCard({ kitty, isSelected, isFlipped, hasClaimable, onClick, traitsConfig, redeemETH, redeemCoin, liquidityActive, onBurn }: CarouselCardProps) {
    return (
        <div
            className={`flex-shrink-0 w-40 cursor-pointer transition-transform ${
                isSelected ? "scale-105" : "hover:scale-105"
            }`}
            onClick={onClick}
        >
            {/* Flip container - only wraps the image area */}
            <div
                className="relative"
                style={{ perspective: '1000px' }}
            >
                <div
                    className="relative transition-transform duration-500"
                    style={{
                        transformStyle: 'preserve-3d',
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                >
                    {/* Front - Freg Image */}
                    <div
                        className={`overflow-hidden rounded-xl bg-white ${
                            isSelected ? "ring-2 ring-theme" : ""
                        }`}
                        style={{
                            aspectRatio: '617.49 / 644.18',
                            backfaceVisibility: 'hidden'
                        }}
                    >
                        <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                        {hasClaimable && (
                            <div className="absolute top-1 right-1 z-10">
                                <div className="bg-theme-primary rounded-full p-1 animate-pulse">
                                    <Gift className="w-3 h-3 text-theme-button-text" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Back - Metadata */}
                    <div
                        className="absolute inset-0 bg-theme-card border-2 border-theme rounded-xl p-2 flex flex-col"
                        style={{
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)'
                        }}
                    >
                        <p className="font-bangers text-sm text-theme-primary text-center mb-1">
                            #{kitty.tokenId}
                        </p>
                        <div className="flex-1 space-y-0.5 text-[9px] min-w-0">
                            <div className="flex justify-between gap-1">
                                <span className="font-righteous text-theme-muted">Head:</span>
                                <span className="font-bangers text-theme-primary truncate pr-1">
                                    {getTraitName(traitsConfig, 'head', kitty.head)}
                                </span>
                            </div>
                            <div className="flex justify-between gap-1">
                                <span className="font-righteous text-theme-muted">Mouth:</span>
                                <span className="font-bangers text-theme-primary truncate pr-1">
                                    {getTraitName(traitsConfig, 'mouth', kitty.mouth)}
                                </span>
                            </div>
                            {kitty.body === 0 && (
                                <div className="flex justify-between gap-1">
                                    <span className="font-righteous text-theme-muted">Belly:</span>
                                    <span className="font-bangers text-theme-primary truncate pr-1">
                                        {getTraitName(traitsConfig, 'stomach', kitty.stomach)}
                                    </span>
                                </div>
                            )}
                            {kitty.body > 0 && (
                                <div className="flex justify-between gap-1">
                                    <span className="font-righteous text-theme-muted">Skin:</span>
                                    <span className="font-bangers text-theme-primary truncate pr-1">
                                        {getTraitName(traitsConfig, 'skin', kitty.body)}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between items-center gap-1">
                                <span className="font-righteous text-theme-muted">Color:</span>
                                <div className="flex items-center gap-0.5 min-w-0">
                                    <div
                                        className="w-2.5 h-2.5 rounded border border-white/30 shrink-0"
                                        style={{ backgroundColor: kitty.bodyColor }}
                                    />
                                    <span className="font-mono text-theme-primary text-[8px] truncate">
                                        {kitty.bodyColor}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {redeemETH && (
                            <div className="border-t border-theme-muted/30 pt-0.5 mt-0.5">
                                <p className="text-[8px] text-theme-muted font-righteous text-center">Burn value:</p>
                                <p className="text-[8px] text-theme-primary font-bangers text-center truncate">
                                    {redeemETH} ETH + {redeemCoin} FROG
                                </p>
                            </div>
                        )}
                        <button
                            className={`mt-auto w-full text-[8px] text-white rounded py-0.5 font-bangers transition-colors ${
                                liquidityActive ? "bg-red-500/80 hover:bg-red-500 cursor-pointer" : "bg-gray-500/50 cursor-not-allowed opacity-50"
                            }`}
                            disabled={!liquidityActive}
                            onClick={(e) => { e.stopPropagation(); onBurn(kitty.tokenId) }}
                        >
                            <Flame className="w-2.5 h-2.5 inline mr-0.5" />{liquidityActive ? "Burn & Redeem" : "Redeem Inactive"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Token ID - outside flip area */}
            <p className="font-bangers text-sm text-theme-primary text-center mt-1">
                #{kitty.tokenId}
            </p>
        </div>
    )
}

export default function MyKittiesSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { kitties, isLoading, error, refetch: refetchKitties } = useOwnedKitties()
    const { unclaimedIds, refetch: refetchUnclaimed } = useUnclaimedKitties()
    const { items, isLoading: itemsLoading, refetch: refetchItems } = useOwnedItems()

    const [tab, setTab] = useState<'fregs' | 'items'>('fregs')
    const [selectedKittyId, setSelectedKittyId] = useState<number | null>(null)
    const [isClaiming, setIsClaiming] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string; itemType?: number; itemTokenId?: number; isBurn?: boolean }>({ success: false, message: "" })
    const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set())
    const [traitsConfig, setTraitsConfig] = useState<TraitsConfig | null>(null)
    const [redeemETH, setRedeemETH] = useState<string | null>(null)
    const [redeemCoin, setRedeemCoin] = useState<string | null>(null)
    const [liquidityActive, setLiquidityActive] = useState(false)
    const [burnConfirmTokenId, setBurnConfirmTokenId] = useState<number | null>(null)

    // Items tab state (separate selection from fregs tab)
    const [itemsSelectedKittyId, setItemsSelectedKittyId] = useState<number | null>(null)
    const [selectedItem, setSelectedItem] = useState<Item | null>(null)
    const [newColor, setNewColor] = useState<string>("#7CB342")
    const [hue, setHue] = useState<number>(120)
    const [isApplying, setIsApplying] = useState(false)
    const [showItemResultModal, setShowItemResultModal] = useState(false)
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const [itemModalData, setItemModalData] = useState<{ success: boolean; message: string }>({ success: false, message: "" })
    const [resultKitty, setResultKitty] = useState<Kitty | null>(null)

    const paletteColors = generatePalette(hue)
    const usableItems = items.filter(item => item.itemType !== ITEM_TYPES.TREASURE_CHEST)

    // Derive selectedKitty object from items tab's own selection
    const selectedKitty = useMemo(() => {
        if (itemsSelectedKittyId === null) return null
        return kitties.find(k => k.tokenId === itemsSelectedKittyId) || null
    }, [itemsSelectedKittyId, kitties])

    // Load traits config for name lookups
    useEffect(() => {
        fetch('/frogz/default/traits.json')
            .then(res => res.json())
            .then(data => setTraitsConfig(data))
            .catch(err => console.error('Failed to load traits config:', err))
    }, [])

    // Fetch redeem amounts and active state from liquidity contract
    useEffect(() => {
        if (!contracts?.liquidity) return
        contracts.liquidity.read.active().then((isActive: boolean) => {
            setLiquidityActive(isActive)
        }).catch(() => setLiquidityActive(false))
        contracts.liquidity.read.getRedeemAmount().then(([eth, coin]: [bigint, bigint]) => {
            setRedeemETH(parseFloat(formatEther(eth)).toFixed(6))
            setRedeemCoin(parseFloat(formatEther(coin)).toFixed(0))
        }).catch(() => {})
    }, [contracts, kitties])

    // Check if a kitty can claim an item
    const canClaim = (tokenId: number) => unclaimedIds.includes(tokenId)

    // Check if selected kitty can claim
    const selectedCanClaim = selectedKittyId !== null && canClaim(selectedKittyId)

    const parseItemClaimedEvent = (receipt: any) => {
        if (!contracts) return null
        const contract = contracts.items.read
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                if (parsed?.name === "ItemClaimed") {
                    // Event: ItemClaimed(uint256 indexed fregId, uint256 indexed itemTokenId, address indexed owner, uint256 itemType)
                    return {
                        fregId: Number(parsed.args.fregId ?? parsed.args[0]),
                        itemTokenId: Number(parsed.args.itemTokenId ?? parsed.args[1]),
                        itemType: Number(parsed.args.itemType ?? parsed.args[3])
                    }
                }
            } catch {
                // Not an ItemClaimed event, continue
            }
        }
        return null
    }

    const [isModalLoading, setIsModalLoading] = useState(false)

    const handleClaim = useCallback(async () => {
        if (!contracts || selectedKittyId === null || !selectedCanClaim) return

        // Use flushSync to ensure modal renders immediately before wallet popup
        flushSync(() => {
            setIsClaiming(true)
            setIsModalLoading(true)
            setModalData({ success: false, message: "" })
            setShowModal(true)
        })

        try {
            const contract = await contracts.items.write()
            // Manually specify gas to avoid MetaMask gas estimation issues on localhost
            const tx = await contract.claimItem(selectedKittyId, { gasLimit: 1000000n })
            const receipt = await tx.wait()

            const claimedItem = parseItemClaimedEvent(receipt)
            const itemName = claimedItem ? (ITEM_TYPE_NAMES[claimedItem.itemType] || "Item") : "Item"

            setModalData({
                success: true,
                message: `You got a ${itemName}!`,
                itemType: claimedItem?.itemType,
                itemTokenId: claimedItem?.itemTokenId
            })

            // Refresh all relevant data - await to ensure completion
            await Promise.all([
                refetchKitties(),
                refetchUnclaimed(),
                refetchItems()
            ])
            setSelectedKittyId(null)
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Claim failed" })
        } finally {
            setIsClaiming(false)
            setIsModalLoading(false)
        }
    }, [contracts, selectedKittyId, selectedCanClaim, refetchKitties, refetchUnclaimed, refetchItems])

    const handleKittyClick = (tokenId: number) => {
        const canClaimItem = canClaim(tokenId)

        if (canClaimItem) {
            // Unclaimed: select for claiming
            setSelectedKittyId(selectedKittyId === tokenId ? null : tokenId)
        } else {
            // Already claimed: flip the card to show metadata
            setFlippedCards(prev => {
                const newSet = new Set(prev)
                if (newSet.has(tokenId)) {
                    newSet.delete(tokenId)
                } else {
                    newSet.add(tokenId)
                }
                return newSet
            })
        }
    }

    const handleBurn = useCallback((tokenId: number) => {
        if (!contracts?.liquidity) return
        setBurnConfirmTokenId(tokenId)
    }, [contracts])

    const confirmBurn = useCallback(async () => {
        if (!contracts?.liquidity || burnConfirmTokenId === null) return
        const tokenId = burnConfirmTokenId
        setBurnConfirmTokenId(null)

        flushSync(() => {
            setIsModalLoading(true)
            setModalData({ success: false, message: "", isBurn: true })
            setShowModal(true)
        })

        try {
            const contract = await contracts.liquidity.write()
            const tx = await contract.burnAndClaim(tokenId, { gasLimit: 500000n })
            await tx.wait()

            setModalData({
                success: true,
                message: `Freg #${tokenId} burned! You received ${redeemETH} ETH + ${redeemCoin} FREGCOIN.`,
                isBurn: true,
            })

            await refetchKitties()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Burn failed", isBurn: true })
        } finally {
            setIsModalLoading(false)
        }
    }, [contracts, burnConfirmTokenId, redeemETH, redeemCoin, refetchKitties])

    // --- Items tab handlers ---

    const getConfirmMessage = () => {
        if (!selectedItem) return ""
        const config = getItemConfig(selectedItem.itemType)
        if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE) return "Are you sure you want to change the color of this Pepe?"
        if (selectedItem.itemType === ITEM_TYPES.HEAD_REROLL) return "Are you sure you want to re-roll the head trait? This will randomly change the head."
        if (selectedItem.itemType === ITEM_TYPES.SPECIAL_DICE) return "Are you sure you want to roll the Special Dice? This will randomly apply a special trait!"
        if (config?.category === 'skin') return `Are you sure you want to apply ${selectedItem.name}? This will apply a special body skin.`
        if (config?.category === 'head') return `Are you sure you want to apply ${selectedItem.name}? This will change your Freg's head.`
        return `Are you sure you want to use ${selectedItem.name}?`
    }

    const handleApplyClick = () => {
        if (!selectedKitty || !selectedItem) return
        if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE && !isValidHexColor(newColor)) return
        setShowConfirmModal(true)
    }

    const parseHeadRerolledEvent = (receipt: any): number | null => {
        const fregsContract = contracts!.fregs.read
        for (const log of receipt.logs) {
            try {
                const parsed = fregsContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
                if (parsed?.name === "TraitSet" && Number(parsed.args.traitType) === TRAIT_TYPES.HEAD) return Number(parsed.args.traitValue)
            } catch { /* Not a Fregs event */ }
        }
        return null
    }

    const parseTraitEvent = (receipt: any): { traitType: number; traitValue: number } | null => {
        const fregsContract = contracts!.fregs.read
        const itemsContract = contracts!.items.read
        for (const log of receipt.logs) {
            try {
                const parsed = fregsContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
                if (parsed?.name === "TraitSet") return { traitType: Number(parsed.args.traitType), traitValue: Number(parsed.args.traitValue) }
            } catch { /* Not this event */ }
            try {
                const parsed = itemsContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
                if (parsed?.name === "SpecialDiceUsed") return { traitType: Number(parsed.args.traitType), traitValue: Number(parsed.args.traitValue) }
            } catch { /* Not this event */ }
        }
        return null
    }

    const handleConfirmApply = useCallback(async () => {
        if (!contracts || !selectedKitty || !selectedItem) return

        flushSync(() => {
            setShowConfirmModal(false)
            setIsApplying(true)
            setItemModalData({ success: false, message: "" })
            setResultKitty(null)
            setShowItemResultModal(true)
        })

        try {
            const contract = await contracts.items.write()
            let tx

            const gasOpts = { gasLimit: 500000n }

            if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE) {
                if (!isValidHexColor(newColor)) throw new Error("Invalid hex color")
                tx = await contract.useColorChange(selectedItem.tokenId, selectedKitty.tokenId, newColor, gasOpts)
            } else if (selectedItem.itemType === ITEM_TYPES.HEAD_REROLL) {
                tx = await contract.useHeadReroll(selectedItem.tokenId, selectedKitty.tokenId, gasOpts)
            } else if (selectedItem.itemType === ITEM_TYPES.SPECIAL_DICE) {
                tx = await contract.useSpecialDice(selectedItem.tokenId, selectedKitty.tokenId, gasOpts)
            } else if (isSkinItem(selectedItem.itemType)) {
                tx = await contract.useSpecialSkinItem(selectedItem.tokenId, selectedKitty.tokenId, gasOpts)
            } else if (isHeadItem(selectedItem.itemType)) {
                tx = await contract.useHeadTraitItem(selectedItem.tokenId, selectedKitty.tokenId, gasOpts)
            } else if (isDynamicTraitItem(selectedItem)) {
                tx = await contract.useDynamicTraitItem(selectedItem.tokenId, selectedKitty.tokenId, gasOpts)
            } else {
                throw new Error(`Unknown item type: ${selectedItem.itemType}`)
            }

            const receipt = await tx.wait()
            let updatedKitty: Kitty = { ...selectedKitty }

            if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE) {
                updatedKitty.bodyColor = newColor
            } else if (selectedItem.itemType === ITEM_TYPES.HEAD_REROLL) {
                const newHead = parseHeadRerolledEvent(receipt)
                if (newHead !== null) updatedKitty.head = newHead
            } else if (
                selectedItem.itemType === ITEM_TYPES.SPECIAL_DICE ||
                isSkinItem(selectedItem.itemType) || isHeadItem(selectedItem.itemType) || isDynamicTraitItem(selectedItem)
            ) {
                const traitResult = parseTraitEvent(receipt)
                if (traitResult) {
                    if (traitResult.traitType === TRAIT_TYPES.BACKGROUND) updatedKitty.background = traitResult.traitValue
                    else if (traitResult.traitType === TRAIT_TYPES.BODY) updatedKitty.body = traitResult.traitValue
                    else if (traitResult.traitType === TRAIT_TYPES.HEAD) updatedKitty.head = traitResult.traitValue
                    else if (traitResult.traitType === TRAIT_TYPES.MOUTH) updatedKitty.mouth = traitResult.traitValue
                    else if (traitResult.traitType === TRAIT_TYPES.STOMACH) updatedKitty.stomach = traitResult.traitValue
                }
            }

            setResultKitty(updatedKitty)
            setItemModalData({ success: true, message: `${selectedItem.name} applied to Freg #${selectedKitty.tokenId}!` })
            setSelectedItem(null)

            await Promise.all([refetchKitties(), refetchItems()])
        } catch (err: any) {
            setResultKitty(null)
            setItemModalData({ success: false, message: err.message || "Failed to apply item" })
        } finally {
            setIsApplying(false)
        }
    }, [contracts, selectedKitty, selectedItem, newColor, refetchKitties, refetchItems])

    const incompatibility = useMemo(() => {
        if (!selectedKitty || !selectedItem) return { incompatible: false, reason: "" }
        const config = getItemConfig(selectedItem.itemType)
        if (!config) return { incompatible: false, reason: "" }
        return checkItemIncompatibility(config, selectedKitty.body, selectedKitty.head)
    }, [selectedKitty, selectedItem])

    const canApply = selectedKitty && selectedItem &&
        (selectedItem.itemType !== ITEM_TYPES.COLOR_CHANGE || isValidHexColor(newColor)) &&
        !incompatibility.incompatible

    // Count how many kitties can claim
    const claimableCount = kitties.filter(k => canClaim(k.tokenId)).length

    return (
        <Section id="my-kitties">
       
            {!isConnected ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-theme-muted">
                            Connect your wallet to see your Fregs
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading your Fregs..." />
                </div>
            ) : error ? (
                <Card className="bg-theme-card border-4 border-red-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-red-400">
                            Error loading Fregs: {error}
                        </p>
                    </CardContent>
                </Card>
            ) : kitties.length === 0 ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-theme-muted mb-4">No Fregs Yet!</p>
                        <p className="font-righteous text-lg text-theme-subtle">
                            Mint your first Freg above to start your collection
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Claim Item Banner */}
                    {claimableCount > 0 && (
                        <div className="mb-8 pb-6 border-b border-theme-muted/20">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-theme-primary/20">
                                        <Gift className="w-6 h-6 text-theme-primary" />
                                    </div>
                                    <p className="font-bangers text-xl text-theme-primary">
                                        {claimableCount} {claimableCount === 1 ? 'Freg' : 'Fregs'} can claim items
                                    </p>
                                </div>
                                <Button
                                    onClick={handleClaim}
                                    disabled={!selectedCanClaim || isClaiming}
                                    className={`px-6 py-3 rounded-xl font-bangers text-lg transition-all ${
                                        selectedCanClaim
                                            ? "btn-theme-primary"
                                            : "bg-theme-card text-theme-subtle cursor-not-allowed"
                                    }`}
                                >
                                    {isClaiming ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            <Gift className="w-5 h-5 mr-2" />
                                            {selectedCanClaim ? `Claim for #${selectedKittyId}` : "Select a Freg"}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Tab Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex bg-theme-card rounded-xl p-1 gap-1">
                            <button
                                onClick={() => setTab('fregs')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bangers text-lg transition-all ${
                                    tab === 'fregs'
                                        ? 'bg-theme-primary text-theme-button-text'
                                        : 'text-theme-muted hover:text-theme-primary'
                                }`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                                My Fregs
                            </button>
                            <button
                                onClick={() => setTab('items')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bangers text-lg transition-all ${
                                    tab === 'items'
                                        ? 'bg-theme-primary text-theme-button-text'
                                        : 'text-theme-muted hover:text-theme-primary'
                                }`}
                            >
                                <Backpack className="w-4 h-4" />
                                Use Items
                            </button>
                        </div>

                        {/* Grid/Carousel toggle - only in fregs tab */}
                        {tab === 'fregs' && (
                            <div className="flex bg-theme-card rounded-lg p-1 gap-1">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-md transition-all ${
                                        viewMode === 'grid'
                                            ? 'bg-theme-primary text-theme-button-text'
                                            : 'text-theme-muted hover:text-theme-primary'
                                    }`}
                                    title="Grid View"
                                >
                                    <LayoutGrid className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setViewMode('carousel')}
                                    className={`p-2 rounded-md transition-all ${
                                        viewMode === 'carousel'
                                            ? 'bg-theme-primary text-theme-button-text'
                                            : 'text-theme-muted hover:text-theme-primary'
                                    }`}
                                    title="Carousel View"
                                >
                                    <Rows className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* === FREGS TAB === */}
                    {tab === 'fregs' && <>
                    {/* Grid View */}
                    {viewMode === 'grid' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {kitties.map((kitty) => {
                                const hasClaimable = canClaim(kitty.tokenId)
                                const isSelected = selectedKittyId === kitty.tokenId
                                const isFlipped = flippedCards.has(kitty.tokenId)

                                return (
                                    <div
                                        key={kitty.tokenId}
                                        className={`cursor-pointer transition-transform ${
                                            isSelected ? "scale-105" : "hover:scale-102"
                                        }`}
                                        onClick={() => handleKittyClick(kitty.tokenId)}
                                    >
                                        {/* Flip container - only wraps the image area */}
                                        <div
                                            className="relative"
                                            style={{ perspective: '1000px' }}
                                        >
                                            <div
                                                className="relative transition-transform duration-500"
                                                style={{
                                                    transformStyle: 'preserve-3d',
                                                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                                                }}
                                            >
                                                {/* Front - Freg Image */}
                                                <div
                                                    className={`overflow-hidden rounded-xl bg-white ${
                                                        isSelected ? "ring-2 ring-theme" : ""
                                                    }`}
                                                    style={{
                                                        aspectRatio: '617.49 / 644.18',
                                                        backfaceVisibility: 'hidden'
                                                    }}
                                                >
                                                    <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                                    {/* Claimable indicator */}
                                                    {hasClaimable && (
                                                        <div className="absolute top-2 right-2 z-10">
                                                            <div className="bg-theme-primary rounded-full p-1.5 animate-pulse">
                                                                <Gift className="w-4 h-4 text-theme-button-text" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Back - Metadata */}
                                                <div
                                                    className="absolute inset-0 bg-theme-card border-2 border-theme rounded-xl p-3 flex flex-col"
                                                    style={{
                                                        backfaceVisibility: 'hidden',
                                                        transform: 'rotateY(180deg)'
                                                    }}
                                                >
                                                    <p className="font-bangers text-base text-theme-primary text-center mb-1">
                                                        #{kitty.tokenId}
                                                    </p>
                                                    <div className="flex-1 space-y-1 text-[11px] min-w-0 pr-1">
                                                        <div className="flex justify-between gap-2">
                                                            <span className="font-righteous text-theme-muted">Head:</span>
                                                            <span className="font-bangers text-theme-primary truncate pr-1">
                                                                {getTraitName(traitsConfig, 'head', kitty.head)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-2">
                                                            <span className="font-righteous text-theme-muted">Mouth:</span>
                                                            <span className="font-bangers text-theme-primary truncate pr-1">
                                                                {getTraitName(traitsConfig, 'mouth', kitty.mouth)}
                                                            </span>
                                                        </div>
                                                        {kitty.body === 0 && (
                                                            <div className="flex justify-between gap-2">
                                                                <span className="font-righteous text-theme-muted">Belly:</span>
                                                                <span className="font-bangers text-theme-primary truncate pr-1">
                                                                    {getTraitName(traitsConfig, 'stomach', kitty.stomach)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {kitty.body > 0 && (
                                                            <div className="flex justify-between gap-2">
                                                                <span className="font-righteous text-theme-muted">Skin:</span>
                                                                <span className="font-bangers text-theme-primary truncate pr-1">
                                                                    {getTraitName(traitsConfig, 'skin', kitty.body)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center gap-2">
                                                            <span className="font-righteous text-theme-muted">Color:</span>
                                                            <div className="flex items-center gap-1 min-w-0">
                                                                <div
                                                                    className="w-3 h-3 rounded border border-white/30 shrink-0"
                                                                    style={{ backgroundColor: kitty.bodyColor }}
                                                                />
                                                                <span className="font-mono text-theme-primary text-[9px] truncate">
                                                                    {kitty.bodyColor}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {redeemETH && (
                                                        <div className="border-t border-theme-muted/30 pt-1 mt-1">
                                                            <p className="text-[9px] text-theme-muted font-righteous text-center">Burn value:</p>
                                                            <p className="text-[10px] text-theme-primary font-bangers text-center truncate">
                                                                {redeemETH} ETH + {redeemCoin} FROG
                                                            </p>
                                                        </div>
                                                    )}
                                                    <button
                                                        className={`mt-auto w-full text-[10px] text-white rounded py-1 font-bangers transition-colors ${
                                                            liquidityActive ? "bg-red-500/80 hover:bg-red-500 cursor-pointer" : "bg-gray-500/50 cursor-not-allowed opacity-50"
                                                        }`}
                                                        disabled={!liquidityActive}
                                                        onClick={(e) => { e.stopPropagation(); handleBurn(kitty.tokenId) }}
                                                    >
                                                        <Flame className="w-3 h-3 inline mr-0.5" />{liquidityActive ? "Burn & Redeem" : "Redeem Inactive"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Token ID - outside flip area */}
                                        <p className="font-bangers text-lg text-theme-primary text-center mt-2">
                                            #{kitty.tokenId}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Carousel View */}
                    {viewMode === 'carousel' && (
                        <div className="overflow-hidden py-4">
                            {/* Row 1 - scrolls left to right */}
                            <div className="relative mb-6">
                                <div
                                    className="flex gap-4 animate-scroll-left"
                                    style={{
                                        width: 'max-content',
                                        animation: `scroll-left ${Math.max(20, kitties.length * 3)}s linear infinite`
                                    }}
                                >
                                    {/* Duplicate items for seamless loop */}
                                    {[...kitties, ...kitties].map((kitty, index) => (
                                        <CarouselCard
                                            key={`row1-${kitty.tokenId}-${index}`}
                                            kitty={kitty}
                                            isSelected={selectedKittyId === kitty.tokenId}
                                            isFlipped={flippedCards.has(kitty.tokenId)}
                                            hasClaimable={canClaim(kitty.tokenId)}
                                            onClick={() => handleKittyClick(kitty.tokenId)}
                                            traitsConfig={traitsConfig}
                                            redeemETH={redeemETH}
                                            redeemCoin={redeemCoin}
                                            liquidityActive={liquidityActive}
                                            onBurn={handleBurn}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Row 2 - scrolls right to left */}
                            <div className="relative">
                                <div
                                    className="flex gap-4 animate-scroll-right"
                                    style={{
                                        width: 'max-content',
                                        animation: `scroll-right ${Math.max(20, kitties.length * 3)}s linear infinite`
                                    }}
                                >
                                    {/* Duplicate items for seamless loop, reversed order */}
                                    {[...kitties].reverse().concat([...kitties].reverse()).map((kitty, index) => (
                                        <CarouselCard
                                            key={`row2-${kitty.tokenId}-${index}`}
                                            kitty={kitty}
                                            isSelected={selectedKittyId === kitty.tokenId}
                                            isFlipped={flippedCards.has(kitty.tokenId)}
                                            hasClaimable={canClaim(kitty.tokenId)}
                                            onClick={() => handleKittyClick(kitty.tokenId)}
                                            traitsConfig={traitsConfig}
                                            redeemETH={redeemETH}
                                            redeemCoin={redeemCoin}
                                            liquidityActive={liquidityActive}
                                            onBurn={handleBurn}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* CSS for carousel animations */}
                            <style>{`
                                @keyframes scroll-left {
                                    0% { transform: translateX(0); }
                                    100% { transform: translateX(-50%); }
                                }
                                @keyframes scroll-right {
                                    0% { transform: translateX(-50%); }
                                    100% { transform: translateX(0); }
                                }
                            `}</style>
                        </div>
                    )}
                    </>}

                    {/* === ITEMS TAB === */}
                    {tab === 'items' && (
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6">
                            {/* Freg Picker (items tab has its own selection) */}
                            <div className="min-w-0">
                                <p className="font-bangers text-xl text-theme-primary mb-4 text-center">Select a Freg</p>
                                <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-2">
                                    {kitties.map((kitty) => (
                                        <div
                                            key={kitty.tokenId}
                                            className={`cursor-pointer transition-all rounded-xl ${
                                                itemsSelectedKittyId === kitty.tokenId
                                                    ? "ring-2 ring-theme"
                                                    : "opacity-70 hover:opacity-100"
                                            }`}
                                            onClick={() => setItemsSelectedKittyId(
                                                itemsSelectedKittyId === kitty.tokenId ? null : kitty.tokenId
                                            )}
                                        >
                                            <div className="overflow-hidden rounded-xl bg-white" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                            </div>
                                            <p className="font-bangers text-sm text-theme-primary text-center mt-1">#{kitty.tokenId}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Vertical Divider */}
                            <div className="hidden md:block w-[2px] min-h-[200px] self-stretch" style={{ backgroundColor: 'var(--theme-border)', opacity: 0.3 }} />

                            {/* Items Panel */}
                            <div className="min-w-0">
                                <p className="font-bangers text-xl text-theme-primary mb-4 text-center">Select an Item</p>
                                {itemsLoading ? (
                                    <div className="flex justify-center py-8">
                                        <LoadingSpinner message="Loading items..." />
                                    </div>
                                ) : usableItems.length === 0 ? (
                                    <p className="text-theme-subtle text-center py-8 font-righteous">No items owned</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-2">
                                        {usableItems.map((item) => (
                                            <ItemCard
                                                key={item.tokenId}
                                                tokenId={item.tokenId}
                                                itemType={item.itemType}
                                                itemName={item.name}
                                                selected={selectedItem?.tokenId === item.tokenId}
                                                onClick={() => setSelectedItem(item)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Panel (items tab) */}
                    {tab === 'items' && selectedKitty && selectedItem && (
                        <Card className="bg-theme-card border-4 border-theme rounded-3xl mt-8 max-w-2xl mx-auto">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-center gap-8 mb-6">
                                    <div className="text-center">
                                        <div className="overflow-hidden rounded-xl w-40 bg-white" style={{ aspectRatio: '617.49 / 644.18' }}>
                                            <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                        </div>
                                        <p className="font-bangers text-theme-primary mt-2">#{selectedKitty.tokenId}</p>
                                    </div>
                                    <Wand2 className="w-12 h-12 text-yellow-400 animate-pulse" />
                                    <div className="text-center">
                                        <ItemCard tokenId={selectedItem.tokenId} itemType={selectedItem.itemType} itemName={selectedItem.name} />
                                    </div>
                                </div>

                                <p className="font-righteous text-theme-muted text-center mb-4">
                                    {getItemDescription(selectedItem)}
                                </p>

                                {/* Color Picker for Color Change item */}
                                {selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE && (
                                    <div className="bg-black/30 rounded-xl p-4 mb-4">
                                        <div className="flex items-center justify-center gap-4 mb-6">
                                            <div className="text-center">
                                                <p className="font-righteous text-white/50 text-xs mb-2">Current</p>
                                                <div className="overflow-hidden rounded-lg bg-white w-24" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                    <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                                </div>
                                            </div>
                                            <div className="text-2xl text-white/50">&rarr;</div>
                                            <div className="text-center">
                                                <p className="font-righteous text-pink-400 text-xs mb-2">New Color</p>
                                                <div className="overflow-hidden rounded-lg bg-white w-24" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                    <KittyRenderer {...selectedKitty} bodyColor={isValidHexColor(newColor) ? newColor : selectedKitty.bodyColor} size="sm" className="w-full h-full" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-center gap-2 mb-4">
                                            <Palette className="w-5 h-5 text-pink-400" />
                                            <p className="font-righteous text-white/70 text-lg">Select New Color</p>
                                        </div>
                                        <div className="mb-4">
                                            <input
                                                type="range" min="0" max="360" value={hue}
                                                onChange={(e) => setHue(Number(e.target.value))}
                                                className="w-full h-4 rounded-full appearance-none cursor-pointer"
                                                style={{
                                                    background: `linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))`,
                                                }}
                                            />
                                            <style>{`
                                                input[type="range"]::-webkit-slider-thumb { appearance: none; width: 24px; height: 24px; border-radius: 50%; background: white; border: 3px solid #000; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; }
                                                input[type="range"]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: white; border: 3px solid #000; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; }
                                            `}</style>
                                        </div>
                                        <div className="grid grid-cols-6 gap-2 mb-4">
                                            {paletteColors.map((hex, index) => (
                                                <button
                                                    key={`${hue}-${index}`}
                                                    onClick={() => setNewColor(hex)}
                                                    className={`w-full aspect-square rounded-lg transition-all duration-200 hover:scale-110 hover:z-10 relative ${
                                                        newColor === hex ? "ring-4 ring-white ring-offset-2 ring-offset-black/40 scale-110 z-10" : "ring-1 ring-white/20"
                                                    }`}
                                                    style={{ backgroundColor: hex }}
                                                    title={hex}
                                                />
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl border-4 border-white/30 shadow-lg flex-shrink-0" style={{ backgroundColor: isValidHexColor(newColor) ? newColor : "#000000" }} />
                                            <div className="flex-1">
                                                <label className="font-righteous text-white/50 text-xs block mb-1">Hex Color Value</label>
                                                <Input
                                                    type="text" value={newColor}
                                                    onChange={(e) => {
                                                        let color = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
                                                        color = color.replace(/[^#0-9A-Fa-f]/g, "")
                                                        if (color.length <= 7) setNewColor(color.toUpperCase())
                                                    }}
                                                    placeholder="#7CB342"
                                                    className={`font-mono text-lg bg-black/50 border-2 ${isValidHexColor(newColor) ? "border-lime-400/50 text-lime-400" : "border-red-400/50 text-red-400"}`}
                                                    maxLength={7}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Incompatibility Warning */}
                                {incompatibility.incompatible && (
                                    <div className="bg-red-900/50 border-2 border-red-500 rounded-xl p-4 mb-4">
                                        <p className="font-bangers text-red-400 text-center text-lg">{incompatibility.reason}</p>
                                    </div>
                                )}

                                <Button
                                    onClick={handleApplyClick}
                                    disabled={!canApply || isApplying}
                                    className="w-full py-4 rounded-xl font-bangers text-xl btn-theme-primary"
                                >
                                    {isApplying ? <LoadingSpinner size="sm" message="Applying..." /> : `Apply ${selectedItem.name}`}
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Burn Confirm Modal */}
            <Dialog open={burnConfirmTokenId !== null} onOpenChange={(open) => !open && setBurnConfirmTokenId(null)}>
                <DialogContent className="bg-theme-card border-2 border-red-500 rounded-2xl max-w-sm">
                    <DialogHeader className="text-center">
                        <div className="flex justify-center mb-3">
                            <AlertTriangle className="w-14 h-14 text-red-400" />
                        </div>
                        <DialogTitle className="font-bangers text-2xl text-red-400 text-center">
                            Burn Freg #{burnConfirmTokenId}?
                        </DialogTitle>
                        <DialogDescription className="font-righteous text-theme-muted text-sm mt-2 text-center">
                            This is irreversible! Your Freg will be permanently destroyed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-theme-card/50 border border-theme-muted/30 rounded-xl p-3 my-2">
                        <p className="font-righteous text-xs text-theme-muted text-center mb-1">You will receive:</p>
                        <p className="font-bangers text-lg text-theme-primary text-center">
                            {redeemETH} ETH + {redeemCoin} FREGCOIN
                        </p>
                    </div>
                    <DialogFooter className="flex gap-3 sm:justify-center">
                        <Button
                            onClick={() => setBurnConfirmTokenId(null)}
                            className="flex-1 font-bangers text-lg px-6 py-3 rounded-xl bg-theme-card border border-theme-muted/30 text-theme-muted hover:text-theme-primary"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmBurn}
                            className="flex-1 font-bangers text-lg px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white cursor-pointer"
                        >
                            <Flame className="w-5 h-5 mr-1" />
                            Burn
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Claim Result Modal */}
            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={isModalLoading ? (modalData.isBurn ? "Burning..." : "Claiming...") : modalData.success ? (modalData.isBurn ? "Burned!" : "Item Claimed!") : "Error"}
                description={isModalLoading ? (modalData.isBurn ? "Please wait while your Freg is being burned" : "Please wait while your item is being claimed") : modalData.message}
                success={modalData.success}
                loading={isModalLoading}
            >
                {!isModalLoading && modalData.success && modalData.itemType !== undefined && modalData.itemTokenId !== undefined && (
                    <div className="flex flex-col items-center gap-2">
                        <ItemCard
                            tokenId={modalData.itemTokenId}
                            itemType={modalData.itemType}
                            size="lg"
                        />
                    </div>
                )}
            </ResultModal>

            {/* Item Confirmation Modal */}
            {showConfirmModal && selectedKitty && selectedItem && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <Card className="bg-black/95 border-2 border-yellow-400 rounded-2xl max-w-lg w-full">
                        <CardContent className="p-6">
                            <p className="font-bangers text-2xl text-yellow-400 text-center mb-4">Confirm Action</p>
                            {selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE ? (
                                <>
                                    <p className="font-righteous text-white/70 text-center mb-6">{getConfirmMessage()}</p>
                                    <div className="flex items-center justify-center gap-6 mb-6">
                                        <div className="text-center">
                                            <p className="font-righteous text-white/50 text-sm mb-2">Before</p>
                                            <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                            </div>
                                        </div>
                                        <div className="text-3xl text-yellow-400">&rarr;</div>
                                        <div className="text-center">
                                            <p className="font-righteous text-lime-400 text-sm mb-2">After</p>
                                            <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...selectedKitty} bodyColor={newColor} size="sm" className="w-full h-full" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-center mb-4">
                                        <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                            <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                        </div>
                                    </div>
                                    <p className="font-righteous text-white/70 text-center mb-6">{getConfirmMessage()}</p>
                                </>
                            )}
                            <div className="flex gap-4">
                                <Button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 rounded-xl font-bangers text-lg bg-gray-600 hover:bg-gray-500 text-white">Cancel</Button>
                                <Button onClick={handleConfirmApply} className="flex-1 py-3 rounded-xl font-bangers text-lg btn-theme-primary">Confirm</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Item Apply Result Modal */}
            <ResultModal
                isOpen={showItemResultModal}
                onClose={() => { setShowItemResultModal(false); setResultKitty(null) }}
                title={isApplying ? "Applying..." : itemModalData.success ? "Item Applied!" : "Error"}
                description={isApplying ? "Please wait while your item is being applied" : itemModalData.success ? undefined : itemModalData.message}
                success={itemModalData.success}
                loading={isApplying}
            >
                {!isApplying && itemModalData.success && resultKitty && (
                    <div className="flex justify-center">
                        <div className="overflow-hidden rounded-xl bg-white" style={{ aspectRatio: '617.49 / 644.18', width: '256px' }}>
                            <KittyRenderer
                                bodyColor={resultKitty.bodyColor}
                                background={resultKitty.background}
                                body={resultKitty.body}
                                head={resultKitty.head}
                                mouth={resultKitty.mouth}
                                stomach={resultKitty.stomach}
                                size="sm"
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                )}
            </ResultModal>
        </Section>
    )
}
