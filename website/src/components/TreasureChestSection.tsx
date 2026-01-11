import React, { useState } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useOwnedItems, useContractData, useContracts } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import { ITEM_TYPES } from "../config/contracts"
import { Flame, Coins } from "lucide-react"

export default function TreasureChestSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { data: contractData } = useContractData()
    const { items, isLoading, refetch } = useOwnedItems()

    const [burningId, setBurningId] = useState<number | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string }>({ success: false, message: "" })

    // Filter to only treasure chests
    const chests = items.filter(item => item.itemType === ITEM_TYPES.TREASURE_CHEST)

    const handleBurn = async (chestId: number) => {
        if (!contracts || !contractData) return

        setBurningId(chestId)
        try {
            const contract = await contracts.items.write()
            const tx = await contract.burnChest(chestId)
            await tx.wait()

            setModalData({
                success: true,
                message: `You received ${contractData.chestETHAmount} ETH!`
            })
            refetch()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Burn failed" })
        } finally {
            setBurningId(null)
            setShowModal(true)
        }
    }

    return (
        <Section id="treasure-chests" variant="alternate">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-yellow-400 text-comic-shadow-lg mb-4">
                    TREASURE CHESTS
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Burn your treasure chests to claim ETH rewards!
                </p>
            </div>

            {/* Reward Info */}
            {contractData && (
                <Card className="bg-black/40 border-2 border-yellow-400/50 rounded-2xl mb-8 max-w-md mx-auto">
                    <CardContent className="p-6 text-center">
                        <Coins className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                        <p className="font-righteous text-white/70 mb-2">Reward per Chest</p>
                        <p className="font-bangers text-4xl text-yellow-400">
                            {contractData.chestETHAmount} ETH
                        </p>
                        <p className="font-righteous text-xs text-white/50 mt-3">
                            {contractData.treasureChestCount} / {contractData.maxTreasureChests} chests in circulation
                        </p>
                    </CardContent>
                </Card>
            )}

            {!isConnected ? (
                <Card className="bg-black/40 border-4 border-yellow-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-white/70">
                            Connect your wallet to view your treasure chests
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading chests..." />
                </div>
            ) : chests.length === 0 ? (
                <Card className="bg-black/40 border-4 border-yellow-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-white/70 mb-4">No Treasure Chests</p>
                        <p className="font-righteous text-lg text-white/50">
                            Apply a Gold Skin to your kitty to receive a treasure chest!
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
                    {chests.map((chest) => (
                        <Card
                            key={chest.tokenId}
                            className="bg-gradient-to-br from-amber-900/50 to-yellow-900/50 border-2 border-yellow-400 rounded-2xl"
                        >
                            <CardContent className="p-6 text-center">
                                <div className="w-24 h-24 mx-auto mb-4">
                                    <img
                                        src="/items/6.svg"
                                        alt="Treasure Chest"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <p className="font-bangers text-xl text-yellow-400 mb-2">
                                    Chest #{chest.tokenId}
                                </p>
                                <p className="font-righteous text-sm text-white/70 mb-4">
                                    Contains {contractData?.chestETHAmount || "?"} ETH
                                </p>
                                <Button
                                    onClick={() => handleBurn(chest.tokenId)}
                                    disabled={burningId !== null}
                                    className="w-full py-3 rounded-xl font-bangers text-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white"
                                >
                                    {burningId === chest.tokenId ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            <Flame className="w-5 h-5 mr-2" />
                                            Burn & Claim
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
                title={modalData.success ? "ETH Claimed!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            />
        </Section>
    )
}
