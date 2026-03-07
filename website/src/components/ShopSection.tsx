import React, { useState } from "react"
import { formatEther } from "ethers"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useContracts, useShopItems, useFregCoinBalance } from "../hooks"
import { ITEMS } from "../config/contracts"
import LoadingSpinner from "./LoadingSpinner"
import { ShoppingCart, Coins, CheckCircle, XCircle } from "lucide-react"

type BuyStatus = "idle" | "pending" | "confirming" | "success" | "error"

export default function ShopSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { items: shopItems, isLoading: shopLoading, refetch: refetchShop } = useShopItems()
    const { balance: fregBalance, isLoading: balanceLoading, refetch: refetchBalance } = useFregCoinBalance()

    const [buyingItemId, setBuyingItemId] = useState<number | null>(null)
    const [buyStatus, setBuyStatus] = useState<BuyStatus>("idle")
    const [statusMessage, setStatusMessage] = useState("")

    const activeItems = shopItems.filter(item => item.isActive)

    const handleBuy = async (itemTypeId: number) => {
        if (!contracts?.fregCoin) return

        setBuyingItemId(itemTypeId)
        setBuyStatus("pending")
        setStatusMessage("Waiting for wallet confirmation...")

        try {
            const fregCoinWrite = await contracts.fregCoin.write()
            const tx = await fregCoinWrite.buyItem(itemTypeId)
            setBuyStatus("confirming")
            setStatusMessage("Confirming transaction...")
            await tx.wait()

            setBuyStatus("success")
            setStatusMessage("Item purchased!")
            refetchShop()
            refetchBalance()

            setTimeout(() => {
                setBuyStatus("idle")
                setStatusMessage("")
                setBuyingItemId(null)
            }, 3000)
        } catch (err: any) {
            setBuyStatus("error")
            const reason = err?.reason || err?.message || "Purchase failed"
            setStatusMessage(reason.length > 100 ? reason.slice(0, 100) + "..." : reason)
            setTimeout(() => {
                setBuyStatus("idle")
                setStatusMessage("")
                setBuyingItemId(null)
            }, 5000)
        }
    }

    const getItemSvg = (itemTypeId: number): string | null => {
        const itemConfig = ITEMS.find(item => item.id === itemTypeId)
        return itemConfig?.svgFile ?? null
    }

    const formatPrice = (price: bigint): string => {
        const formatted = parseFloat(formatEther(price))
        if (formatted >= 1_000_000) return (formatted / 1_000_000).toFixed(1) + "M"
        if (formatted >= 1_000) return (formatted / 1_000).toFixed(1) + "K"
        return formatted.toFixed(0)
    }

    const formatBalance = (bal: bigint): string => {
        const formatted = parseFloat(formatEther(bal))
        if (formatted >= 1_000_000_000) return (formatted / 1_000_000_000).toFixed(2) + "B"
        if (formatted >= 1_000_000) return (formatted / 1_000_000).toFixed(2) + "M"
        if (formatted >= 1_000) return (formatted / 1_000).toFixed(1) + "K"
        return formatted.toFixed(0)
    }

    return (
        <Section id="shop">
            <div className="text-center mb-8">
                <h2 className="font-bangers text-5xl md:text-7xl text-theme-primary mb-4">
                    Freg Shop
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-theme-muted max-w-2xl mx-auto">
                    Buy items with your $FREG tokens
                </p>
            </div>

            {isConnected && (
                <div className="flex justify-center mb-8">
                    <Card className="bg-theme-card border-theme-border">
                        <CardContent className="flex items-center gap-3 py-4 px-6">
                            <Coins className="w-6 h-6 text-yellow-500" />
                            <div>
                                <p className="font-righteous text-sm text-theme-muted">Your $FREG Balance</p>
                                <p className="font-bangers text-2xl text-theme-primary">
                                    {balanceLoading ? "..." : formatBalance(fregBalance)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {!isConnected ? (
                <div className="text-center py-16">
                    <p className="font-righteous text-xl text-theme-muted">Connect your wallet to browse the shop</p>
                </div>
            ) : !contracts?.fregShop ? (
                <div className="text-center py-16">
                    <p className="font-righteous text-xl text-theme-muted">Shop is not available yet</p>
                </div>
            ) : shopLoading ? (
                <div className="flex justify-center py-16">
                    <LoadingSpinner />
                </div>
            ) : activeItems.length === 0 ? (
                <div className="text-center py-16">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-theme-secondary opacity-50" />
                    <p className="font-bangers text-3xl text-theme-muted">No items for sale right now</p>
                    <p className="font-righteous text-lg text-theme-subtle mt-2">Check back later!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeItems.map((item) => {
                        const svgFile = getItemSvg(item.itemTypeId)
                        const isBuying = buyingItemId === item.itemTypeId
                        const canAfford = fregBalance >= item.price
                        const soldOut = item.maxSupply > 0 && item.mintCount >= item.maxSupply

                        return (
                            <Card
                                key={item.itemTypeId}
                                className="bg-theme-card border-theme-border overflow-hidden"
                            >
                                <CardContent className="p-6">
                                    {svgFile && (
                                        <div className="flex justify-center mb-4">
                                            <img
                                                src={`/items/${svgFile}`}
                                                alt={item.name}
                                                className="w-24 h-24 object-contain"
                                            />
                                        </div>
                                    )}
                                    <h3 className="font-bangers text-2xl text-theme-primary text-center mb-2">
                                        {item.name}
                                    </h3>
                                    {item.description && (
                                        <p className="font-righteous text-sm text-theme-muted text-center mb-4">
                                            {item.description}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <Coins className="w-4 h-4 text-yellow-500" />
                                        <span className="font-bangers text-lg text-theme-primary">
                                            {formatPrice(item.price)} $FREG
                                        </span>
                                    </div>
                                    {item.maxSupply > 0 && (
                                        <p className="font-righteous text-sm text-theme-muted text-center mb-4">
                                            {item.maxSupply - item.mintCount} / {item.maxSupply} remaining
                                        </p>
                                    )}

                                    {isBuying && buyStatus !== "idle" ? (
                                        <div className="text-center">
                                            {buyStatus === "success" ? (
                                                <div className="flex items-center justify-center gap-2 text-green-500">
                                                    <CheckCircle className="w-5 h-5" />
                                                    <span className="font-righteous">{statusMessage}</span>
                                                </div>
                                            ) : buyStatus === "error" ? (
                                                <div className="flex items-center justify-center gap-2 text-red-500">
                                                    <XCircle className="w-5 h-5" />
                                                    <span className="font-righteous text-sm">{statusMessage}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2 text-theme-muted">
                                                    <LoadingSpinner />
                                                    <span className="font-righteous text-sm">{statusMessage}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <Button
                                            onClick={() => handleBuy(item.itemTypeId)}
                                            disabled={!canAfford || soldOut || buyStatus !== "idle"}
                                            className="w-full font-bangers text-lg"
                                        >
                                            {soldOut
                                                ? "Sold Out"
                                                : !canAfford
                                                    ? "Insufficient $FREG"
                                                    : "Buy"}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </Section>
    )
}
