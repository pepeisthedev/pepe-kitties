import React, { useState } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useOwnedItems, useContractData, useContracts } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import { ITEM_TYPES } from "../config/contracts"
import { Flame } from "lucide-react"

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
        <Section id="treasure-chests">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-theme-primary mb-4">
                    TREASURE CHESTS
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-theme-muted max-w-2xl mx-auto mb-2">
                    Burn your treasure chest to claim ETH!
                </p>
                {contractData && (
                    <p className="font-righteous text-sm text-theme-subtle">
                        {contractData.remainingChests > 0 ? (
                            <><span className="text-theme-primary font-bold">{contractData.remainingChests}</span> chests still to be found</>
                        ) : (
                            <span className="text-orange-400">All chests have been found!</span>
                        )}
                    </p>
                )}
            </div>

            {!isConnected ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-theme-muted">
                            Connect your wallet to view your treasure chests
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading chests..." />
                </div>
            ) : chests.length === 0 ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-theme-muted mb-4">No Treasure Chests</p>
                        <p className="font-righteous text-lg text-theme-subtle">
                            Treasure chests are ultra-rare drops when claiming items from your Fregs!
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                    {chests.map((chest) => (
                        <div key={chest.tokenId} className="flex flex-col items-center">
                            <div className="w-48 h-48 mb-4">
                                <img
                                    src="/items/6.svg"
                                    alt="Treasure Chest"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <p className="font-bangers text-2xl text-theme-primary mb-3">
                                Chest #{chest.tokenId}
                            </p>
                            <Button
                                onClick={() => handleBurn(chest.tokenId)}
                                disabled={burningId !== null}
                                className="px-8 py-3 rounded-xl font-bangers text-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white"
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
                        </div>
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
