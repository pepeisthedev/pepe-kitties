import React, { useState } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useUnclaimedKitties, useContractData, useContracts, useOwnedItems, useOwnedKitties } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES, ITEM_TYPES } from "../config/contracts"
import { Gift } from "lucide-react"

export default function ClaimItemsSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { data: contractData } = useContractData()
    const { unclaimedIds, isLoading, error, refetch } = useUnclaimedKitties()
    const { refetch: refetchItems } = useOwnedItems()
    const { refetch: refetchKitties } = useOwnedKitties()

    const [claimingId, setClaimingId] = useState<number | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string; itemType?: number; itemTokenId?: number }>({ success: false, message: "" })

    const parseItemClaimedEvent = (receipt: any) => {
        const contract = contracts!.items.read
        let itemClaimedResult = null
        let treasureChestResult = null

        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })

                if (parsed?.name === "ItemClaimed") {
                    itemClaimedResult = {
                        fregId: Number(parsed.args.fregId ?? parsed.args[0]),
                        itemTokenId: Number(parsed.args.itemTokenId ?? parsed.args[1]),
                        itemType: Number(parsed.args.itemType ?? parsed.args[3])
                    }
                }
                if (parsed?.name === "TreasureChestMinted") {
                    treasureChestResult = {
                        itemTokenId: Number(parsed.args.itemTokenId ?? parsed.args[0]),
                        itemType: ITEM_TYPES.TREASURE_CHEST
                    }
                }
            } catch {
                // Not a recognized event, continue
            }
        }

        return itemClaimedResult || treasureChestResult || null
    }

    const handleClaim = async (kittyId: number) => {
        if (!contracts) return

        setClaimingId(kittyId)
        try {
            const contract = await contracts.items.write()
            // Manually specify gas to avoid MetaMask gas estimation issues on localhost
            const tx = await contract.claimItem(kittyId, { gasLimit: 1000000n })
            const receipt = await tx.wait()

            const claimedItem = parseItemClaimedEvent(receipt)

            const isBeadPunk = claimedItem?.itemType === ITEM_TYPES.BEAD_PUNK
            const itemName = claimedItem ? ITEM_TYPE_NAMES[claimedItem.itemType] : "Item"

            const newModalData = {
                success: true,
                message: isBeadPunk ? "Congratz, you got a Beadpunk!" : `You got a ${itemName}!`,
                itemType: claimedItem?.itemType,
                itemTokenId: claimedItem?.itemTokenId
            }
            console.log("Setting modal data:", newModalData)
            setModalData(newModalData)

            // Refresh all relevant data
            refetch()
            refetchItems()
            refetchKitties()
        } catch (err: any) {
            setModalData({ success: false, message: err.shortMessage || err.message || "Claim failed" })
        } finally {
            setClaimingId(null)
            setShowModal(true)
        }
    }

    // Calculate percentages from weights
    const totalWeight = 10000
    const getRarityPercent = (weight: number) => ((weight / totalWeight) * 100).toFixed(0)

    return (
        <Section id="claim-items" variant="dark">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-purple-400  mb-4">
                    CLAIM ITEMS
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Each Freg can claim one random item!
                </p>
            </div>

            {/* Rarity Info */}
            {contractData && (
                <Card className="bg-black/40 border-2 border-purple-400/50 rounded-2xl mb-8 max-w-2xl mx-auto">
                    <CardContent className="p-6">
                        <p className="font-bangers text-xl text-purple-400 text-center mb-4">Item Rarities</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                            <div className="bg-pink-400/20 rounded-lg p-2">
                                <p className="font-righteous text-xs text-pink-400">Color Change</p>
                                <p className="font-bangers text-lg text-white">{getRarityPercent(contractData.colorChangeWeight)}%</p>
                            </div>
                            <div className="bg-purple-400/20 rounded-lg p-2">
                                <p className="font-righteous text-xs text-purple-400">Head Reroll</p>
                                <p className="font-bangers text-lg text-white">{getRarityPercent(contractData.headRerollWeight)}%</p>
                            </div>
                            <div className="bg-amber-600/20 rounded-lg p-2">
                                <p className="font-righteous text-xs text-amber-500">Bronze Skin</p>
                                <p className="font-bangers text-lg text-white">{getRarityPercent(contractData.bronzeSkinWeight)}%</p>
                            </div>
                            <div className="bg-gray-300/20 rounded-lg p-2">
                                <p className="font-righteous text-xs text-gray-300">Silver Skin</p>
                                <p className="font-bangers text-lg text-white">{getRarityPercent(contractData.silverSkinWeight)}%</p>
                            </div>
                            <div className="bg-yellow-400/20 rounded-lg p-2">
                                <p className="font-righteous text-xs text-yellow-400">Gold Skin</p>
                                <p className="font-bangers text-lg text-white">{getRarityPercent(contractData.goldSkinWeight)}%</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!isConnected ? (
                <Card className="bg-black/40 border-4 border-purple-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-white/70">
                            Connect your wallet to claim items
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading unclaimed kitties..." />
                </div>
            ) : error ? (
                <Card className="bg-black/40 border-4 border-red-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-red-400">Error: {error}</p>
                    </CardContent>
                </Card>
            ) : unclaimedIds.length === 0 ? (
                <Card className="bg-black/40 border-4 border-purple-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-white/70 mb-4">All Items Claimed!</p>
                        <p className="font-righteous text-lg text-white/50">
                            All your kitties have already claimed their items
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {unclaimedIds.map((kittyId) => (
                        <Card
                            key={kittyId}
                            className="bg-black/40 border-2 border-purple-400/50 rounded-2xl"
                        >
                            <CardContent className="p-4 text-center">
                                <p className="font-bangers text-lg text-purple-400 mb-3">
                                    Freg #{kittyId}
                                </p>
                                <Button
                                    onClick={() => handleClaim(kittyId)}
                                    disabled={claimingId !== null}
                                    className="w-full py-2 rounded-xl font-bangers bg-purple-500 hover:bg-purple-400 text-white"
                                >
                                    {claimingId === kittyId ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            <Gift className="w-4 h-4 mr-2" />
                                            Claim
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalData.success ? (modalData.itemType === ITEM_TYPES.BEAD_PUNK ? "Rare Drop!" : "Item Claimed!") : "Error"}
                description={modalData.success ? `You got a ${ITEM_TYPE_NAMES[modalData.itemType!] || "Item"}!` : modalData.message}
                success={modalData.success}
            >
                {modalData.success && modalData.itemType !== undefined && modalData.itemTokenId !== undefined && (
                    <div className="flex justify-center">
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
