import React, { useState, useCallback, useEffect } from "react"
import { formatEther } from "ethers"
import { flushSync } from "react-dom"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useOwnedKitties, useUnclaimedKitties, useOwnedItems, useContracts, Kitty } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import ResultModal from "./ResultModal"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES, getItemConfig, ITEMS } from "../config/contracts"
import { Gift, LayoutGrid, Rows, Flame, AlertTriangle } from "lucide-react"
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
    onBurn: (tokenId: number) => void
}

function CarouselCard({ kitty, isSelected, isFlipped, hasClaimable, onClick, traitsConfig, redeemETH, redeemCoin, onBurn }: CarouselCardProps) {
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
                            className="mt-auto w-full text-[8px] bg-red-500/80 hover:bg-red-500 text-white rounded py-0.5 font-bangers transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onBurn(kitty.tokenId) }}
                        >
                            <Flame className="w-2.5 h-2.5 inline mr-0.5" />Burn & Redeem
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
    const { refetch: refetchItems } = useOwnedItems()

    const [selectedKittyId, setSelectedKittyId] = useState<number | null>(null)
    const [isClaiming, setIsClaiming] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string; itemType?: number; itemTokenId?: number; isBurn?: boolean }>({ success: false, message: "" })
    const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set())
    const [traitsConfig, setTraitsConfig] = useState<TraitsConfig | null>(null)
    const [redeemETH, setRedeemETH] = useState<string | null>(null)
    const [redeemCoin, setRedeemCoin] = useState<string | null>(null)
    const [burnConfirmTokenId, setBurnConfirmTokenId] = useState<number | null>(null)

    // Load traits config for name lookups
    useEffect(() => {
        fetch('/frogz/default/traits.json')
            .then(res => res.json())
            .then(data => setTraitsConfig(data))
            .catch(err => console.error('Failed to load traits config:', err))
    }, [])

    // Fetch redeem amounts from liquidity contract
    useEffect(() => {
        if (!contracts?.liquidity) return
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

                    {/* View Toggle */}
                    <div className="flex justify-end mb-4">
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
                    </div>

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
                                                        className="mt-auto w-full text-[10px] bg-red-500/80 hover:bg-red-500 text-white rounded py-1 font-bangers transition-colors cursor-pointer"
                                                        onClick={(e) => { e.stopPropagation(); handleBurn(kitty.tokenId) }}
                                                    >
                                                        <Flame className="w-3 h-3 inline mr-0.5" />Burn & Redeem
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

            {/* Result Modal */}
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
        </Section>
    )
}
