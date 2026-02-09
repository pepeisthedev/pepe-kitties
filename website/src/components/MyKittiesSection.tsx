import React, { useState, useCallback } from "react"
import { flushSync } from "react-dom"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useOwnedKitties, useUnclaimedKitties, useOwnedItems, useContracts } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import ResultModal from "./ResultModal"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES } from "../config/contracts"
import { Gift, LayoutGrid, Rows } from "lucide-react"

export default function MyKittiesSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { kitties, isLoading, error, refetch: refetchKitties } = useOwnedKitties()
    const { unclaimedIds, refetch: refetchUnclaimed } = useUnclaimedKitties()
    const { refetch: refetchItems } = useOwnedItems()

    const [selectedKittyId, setSelectedKittyId] = useState<number | null>(null)
    const [isClaiming, setIsClaiming] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string; itemType?: number; itemTokenId?: number }>({ success: false, message: "" })
    const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')

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
        setSelectedKittyId(selectedKittyId === tokenId ? null : tokenId)
    }

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

                                return (
                                    <Card
                                        key={kitty.tokenId}
                                        onClick={() => handleKittyClick(kitty.tokenId)}
                                        className={`bg-transparent rounded-2xl transition-all cursor-pointer ${
                                            isSelected
                                                ? "border-2 border-theme ring-2 ring-theme scale-105"
                                                : "border-0 hover:scale-102"
                                        }`}
                                    >
                                        <CardContent className="p-4 relative">
                                            {/* Claimable indicator */}
                                            {hasClaimable && (
                                                <div className="absolute top-2 right-2 z-10">
                                                    <div className="bg-theme-primary rounded-full p-1.5 animate-pulse">
                                                        <Gift className="w-4 h-4 text-theme-button-text" />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="overflow-hidden rounded-lg bg-white mb-3" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                            </div>
                                            <p className="font-bangers text-lg text-theme-primary text-center">
                                                #{kitty.tokenId}
                                            </p>
                                        </CardContent>
                                    </Card>
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
                                    {[...kitties, ...kitties].map((kitty, index) => {
                                        const hasClaimable = canClaim(kitty.tokenId)
                                        const isSelected = selectedKittyId === kitty.tokenId

                                        return (
                                            <Card
                                                key={`row1-${kitty.tokenId}-${index}`}
                                                onClick={() => handleKittyClick(kitty.tokenId)}
                                                className={`bg-transparent rounded-2xl transition-all cursor-pointer flex-shrink-0 w-40 ${
                                                    isSelected
                                                        ? "border-2 border-theme ring-2 ring-theme scale-105"
                                                        : "border-0 hover:scale-105"
                                                }`}
                                            >
                                                <CardContent className="p-3 relative">
                                                    {hasClaimable && (
                                                        <div className="absolute top-1 right-1 z-10">
                                                            <div className="bg-theme-primary rounded-full p-1 animate-pulse">
                                                                <Gift className="w-3 h-3 text-theme-button-text" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="overflow-hidden rounded-lg bg-white mb-2" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                        <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                                    </div>
                                                    <p className="font-bangers text-sm text-theme-primary text-center">
                                                        #{kitty.tokenId}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )
                                    })}
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
                                    {[...kitties].reverse().concat([...kitties].reverse()).map((kitty, index) => {
                                        const hasClaimable = canClaim(kitty.tokenId)
                                        const isSelected = selectedKittyId === kitty.tokenId

                                        return (
                                            <Card
                                                key={`row2-${kitty.tokenId}-${index}`}
                                                onClick={() => handleKittyClick(kitty.tokenId)}
                                                className={`bg-transparent rounded-2xl transition-all cursor-pointer flex-shrink-0 w-40 ${
                                                    isSelected
                                                        ? "border-2 border-theme ring-2 ring-theme scale-105"
                                                        : "border-0 hover:scale-105"
                                                }`}
                                            >
                                                <CardContent className="p-3 relative">
                                                    {hasClaimable && (
                                                        <div className="absolute top-1 right-1 z-10">
                                                            <div className="bg-theme-primary rounded-full p-1 animate-pulse">
                                                                <Gift className="w-3 h-3 text-theme-button-text" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="overflow-hidden rounded-lg bg-white mb-2" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                        <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                                    </div>
                                                    <p className="font-bangers text-sm text-theme-primary text-center">
                                                        #{kitty.tokenId}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )
                                    })}
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

            {/* Result Modal */}
            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={isModalLoading ? "Claiming..." : modalData.success ? "Item Claimed!" : "Error"}
                description={isModalLoading ? "Please wait while your item is being claimed" : modalData.message}
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
