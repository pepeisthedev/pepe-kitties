import React, { useState, useEffect } from "react"
import { formatEther } from "ethers"
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
    const [redeemETH, setRedeemETH] = useState<string | null>(null)
    const [redeemCoin, setRedeemCoin] = useState<string | null>(null)

    // Fetch redeem amounts from liquidity contract
    useEffect(() => {
        if (!contracts?.liquidity) return
        contracts.liquidity.read.getRedeemAmount().then(([eth, coin]: [bigint, bigint]) => {
            setRedeemETH(parseFloat(formatEther(eth)).toFixed(6))
            setRedeemCoin(parseFloat(formatEther(coin)).toFixed(0))
        }).catch(() => {})
    }, [contracts])

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
                message: `You received ${contractData.chestCoinReward} FregCoin!`
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
            {/* $FREG Token Info */}
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-theme-primary mb-4">
                    $FREG
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-theme-muted max-w-2xl mx-auto mb-8">
                    The official token of the Fregs ecosystem
                </p>

                {/* External Links */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
                    <Button
                        onClick={() => window.open("https://dexscreener.com/base/0x3735e0fad9DcD3BB9a0e4a2E86bD24f8a86AeF17", "_blank")}
                        className="inline-flex items-center justify-center gap-3 px-6 py-3 rounded-2xl font-bangers text-lg
                            btn-theme-primary
                            hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                        <img src="/dexscreener-logo.svg" alt="DexScreener" className="w-6 h-6 brightness-0 invert" />
                        DexScreener
                    </Button>
                    <Button
                        onClick={() => window.open("https://app.uniswap.org/swap?outputCurrency=0x3735e0fad9DcD3BB9a0e4a2E86bD24f8a86AeF17&chain=base", "_blank")}
                        className="inline-flex items-center justify-center gap-3 px-6 py-3 rounded-2xl font-bangers text-lg
                            btn-theme-primary
                            hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                        <img src="/uniswap-logo.svg" alt="Uniswap" className="w-6 h-6" />
                        Buy on Uniswap
                    </Button>
                </div>

                
            </div>

            {/* Treasure Chests Separator */}
            <div className="border-t-2 border-theme my-12" />

            <div className="text-center mb-12">
                <h3 className="font-bangers text-4xl md:text-5xl text-theme-primary mb-4">
                    TREASURE CHESTS
                </h3>
                <p className="font-righteous text-xl md:text-2xl text-theme-muted max-w-2xl mx-auto mb-2">
                    Burn your treasure chest to claim FregCoin!
                </p>
                {contractData && (
                    <p className="font-righteous text-sm text-theme-subtle">
                        {contractData.remainingClaimChests > 0 ? (
                            <><span className="text-theme-primary font-bold">{contractData.remainingClaimChests}</span> chests still to be found</>
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
                                    src="/items/chest.svg"
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
                title={modalData.success ? "FregCoin Claimed!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            />
        </Section>
    )
}
