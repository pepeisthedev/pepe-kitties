import React, { useState } from "react"
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
import { Gift } from "lucide-react"

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
                    return {
                        kittyId: Number(parsed.args.kittyId),
                        itemTokenId: Number(parsed.args.itemTokenId),
                        itemType: Number(parsed.args.itemType)
                    }
                }
            } catch {
                // Not an ItemClaimed event, continue
            }
        }
        return null
    }

    const handleClaim = async () => {
        if (!contracts || selectedKittyId === null || !selectedCanClaim) return

        setIsClaiming(true)
        try {
            const contract = await contracts.items.write()
            const tx = await contract.claimItem(selectedKittyId)
            const receipt = await tx.wait()

            const claimedItem = parseItemClaimedEvent(receipt)
            const itemName = claimedItem ? ITEM_TYPE_NAMES[claimedItem.itemType] : "Item"

            setModalData({
                success: true,
                message: `You got a ${itemName}!`,
                itemType: claimedItem?.itemType,
                itemTokenId: claimedItem?.itemTokenId
            })

            // Refresh all relevant data
            refetchKitties()
            refetchUnclaimed()
            refetchItems()
            setSelectedKittyId(null)
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Claim failed" })
        } finally {
            setIsClaiming(false)
            setShowModal(true)
        }
    }

    const handleKittyClick = (tokenId: number) => {
        setSelectedKittyId(selectedKittyId === tokenId ? null : tokenId)
    }

    // Count how many kitties can claim
    const claimableCount = kitties.filter(k => canClaim(k.tokenId)).length

    return (
        <Section id="my-kitties" variant="alternate">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-pink-400 text-comic-shadow-lg mb-4">
                    MY KITTIES
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Your collection of adorable Pepe Kitties
                </p>
            </div>

            {!isConnected ? (
                <Card className="bg-black/40 border-4 border-pink-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-white/70">
                            Connect your wallet to see your Pepe Kitties
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading your kitties..." />
                </div>
            ) : error ? (
                <Card className="bg-black/40 border-4 border-red-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-red-400">
                            Error loading kitties: {error}
                        </p>
                    </CardContent>
                </Card>
            ) : kitties.length === 0 ? (
                <Card className="bg-black/40 border-4 border-pink-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-white/70 mb-4">No Kitties Yet!</p>
                        <p className="font-righteous text-lg text-white/50">
                            Mint your first Pepe Kitty above to start your collection
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Claim Item Banner */}
                    {claimableCount > 0 && (
                        <Card className="bg-purple-900/40 border-2 border-purple-400 rounded-2xl mb-6">
                            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Gift className="w-8 h-8 text-purple-400" />
                                    <div>
                                        <p className="font-bangers text-xl text-purple-400">
                                            {claimableCount} {claimableCount === 1 ? 'Kitty' : 'Kitties'} can claim items!
                                        </p>
                                        <p className="font-righteous text-sm text-white/60">
                                            Select a kitty with the gift icon to claim
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    onClick={handleClaim}
                                    disabled={!selectedCanClaim || isClaiming}
                                    className={`px-6 py-3 rounded-xl font-bangers text-lg transition-all ${
                                        selectedCanClaim
                                            ? "bg-purple-500 hover:bg-purple-400 text-white"
                                            : "bg-gray-600 text-gray-400 cursor-not-allowed"
                                    }`}
                                >
                                    {isClaiming ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            <Gift className="w-5 h-5 mr-2" />
                                            {selectedCanClaim ? `Claim for #${selectedKittyId}` : "Select a Kitty"}
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Kitties Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {kitties.map((kitty) => {
                            const hasClaimable = canClaim(kitty.tokenId)
                            const isSelected = selectedKittyId === kitty.tokenId

                            return (
                                <Card
                                    key={kitty.tokenId}
                                    onClick={() => handleKittyClick(kitty.tokenId)}
                                    className={`bg-black/40 border-2 rounded-2xl transition-all cursor-pointer ${
                                        isSelected
                                            ? "border-pink-400 ring-2 ring-pink-400 scale-105"
                                            : hasClaimable
                                            ? "border-purple-400/70 hover:border-purple-400"
                                            : "border-pink-400/50 hover:border-pink-400"
                                    }`}
                                >
                                    <CardContent className="p-4 relative">
                                        {/* Claimable indicator */}
                                        {hasClaimable && (
                                            <div className="absolute top-2 right-2 z-10">
                                                <div className="bg-purple-500 rounded-full p-1.5 animate-pulse">
                                                    <Gift className="w-4 h-4 text-white" />
                                                </div>
                                            </div>
                                        )}

                                        <div className="aspect-square mb-3">
                                            <KittyRenderer {...kitty} size="sm" />
                                        </div>
                                        <p className="font-bangers text-lg text-pink-400 text-center">
                                            #{kitty.tokenId}
                                        </p>
                                        {kitty.specialSkin > 0 && (
                                            <p className="font-righteous text-xs text-yellow-400 text-center">
                                                {kitty.specialSkin === 1 ? "Bronze" : kitty.specialSkin === 2 ? "Silver" : "Gold"} Skin
                                            </p>
                                        )}
                                        {hasClaimable && (
                                            <p className="font-righteous text-xs text-purple-400 text-center mt-1">
                                                Can claim item!
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </>
            )}

            {/* Result Modal */}
            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalData.success ? "Item Claimed!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            >
                {modalData.success && modalData.itemType && modalData.itemTokenId && (
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
