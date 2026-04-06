import React, { useState } from "react"
import { formatEther, Signature } from "ethers"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog"
import { useContracts, useShopItems, useFregCoinBalance } from "../hooks"
import { ITEMS } from "../config/contracts"
import LoadingSpinner from "./LoadingSpinner"
import { ShoppingCart, CheckCircle, Info, XCircle } from "lucide-react"

type BuyStatus = "idle" | "pending" | "confirming" | "success" | "error"

interface ConfirmItem {
    itemTypeId: number
    name: string
    price: bigint
    svgFile: string | null
    categoryLabel: string
    note: string
}

export default function ShopSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { items: shopItems, isLoading: shopLoading, refetch: refetchShop } = useShopItems()
    const { balance: fregBalance, isLoading: balanceLoading, refetch: refetchBalance } = useFregCoinBalance()

    const [buyingItemId, setBuyingItemId] = useState<number | null>(null)
    const [buyStatus, setBuyStatus] = useState<BuyStatus>("idle")
    const [statusMessage, setStatusMessage] = useState("")
    const [confirmItem, setConfirmItem] = useState<ConfirmItem | null>(null)
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set())

    const activeItems = shopItems.filter(item => item.isActive)

    const toggleFlip = (itemTypeId: number) => {
        setFlippedCards(prev => {
            const next = new Set(prev)
            if (next.has(itemTypeId)) next.delete(itemTypeId)
            else next.add(itemTypeId)
            return next
        })
    }

    const handleBuy = async (itemTypeId: number) => {
        if (!contracts?.fregShop || !contracts?.fregCoin) return

        setConfirmItem(null)
        setBuyingItemId(itemTypeId)
        setBuyStatus("pending")
        setStatusMessage("Sign the permit in your wallet...")

        try {
            const signer = await contracts.getSigner()
            const signerAddress = await signer.getAddress()

            // Get price from shop
            const price = await contracts.fregShop.read.getPrice(itemTypeId)

            // Build permit signature
            const fregCoinRead = contracts.fregCoin.read
            const [eip712Domain, nonce, block, fregCoinAddress, fregShopAddress] = await Promise.all([
                fregCoinRead.eip712Domain(),
                fregCoinRead.nonces(signerAddress),
                contracts.provider.getBlock("latest"),
                fregCoinRead.getAddress(),
                contracts.fregShop.read.getAddress(),
            ])

            // Use whichever is later — block.timestamp can be ahead of wall clock on localhost.
            // Use a 1 hour buffer to avoid tight races between signing and the tx being mined.
            const nowOnChain = Number(block!.timestamp)
            const nowWallClock = Math.floor(Date.now() / 1000)
            const deadline = Math.max(nowOnChain, nowWallClock) + 3600

            const domain = {
                name: eip712Domain.name,
                version: eip712Domain.version,
                chainId: eip712Domain.chainId,
                verifyingContract: fregCoinAddress,
            }
            const types = {
                Permit: [
                    { name: "owner",   type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value",   type: "uint256" },
                    { name: "nonce",   type: "uint256" },
                    { name: "deadline",type: "uint256" },
                ],
            }
            const value = {
                owner:   signerAddress,
                spender: fregShopAddress,
                value:   price,
                nonce,
                deadline,
            }

            const rawSig = await signer.signTypedData(domain, types, value)
            const { v, r, s } = Signature.from(rawSig)

            // Call buyItem on the shop with permit params
            const fregShopWrite = await contracts.fregShop.write()
            setBuyStatus("confirming")
            setStatusMessage("Confirming transaction...")
            const tx = await fregShopWrite.buyItem(itemTypeId, deadline, v, r, s)
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

    const getItemConfig = (itemTypeId: number) => {
        return ITEMS.find(item => item.id === itemTypeId)
    }

    const getCategoryLabel = (itemTypeId: number): string => {
        const itemConfig = getItemConfig(itemTypeId)
        if (!itemConfig?.category) return ""
        const cat = itemConfig.category
        return cat.charAt(0).toUpperCase() + cat.slice(1) + " Trait"
    }

    const getItemNote = (itemTypeId: number): string => {
        const itemConfig = getItemConfig(itemTypeId)
        if (itemConfig?.category === "stomach") {
            return "Stomach traits cannot be applied to a Freg wearing a special skin (Like Robot or Gold)."
        }
        return ""
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

            {isConnected && (
                <div className="flex justify-center mb-8">
                    <Card className="bg-theme-card border-theme-border">
                        <CardContent className="py-4 px-6">
                            <p className="font-bangers text-2xl text-theme-primary text-center mb-3">
                                Your $FREG Balance
                            </p>
                            <div className="flex items-center justify-center gap-3">
                                <img src="/coin.svg" alt="$FREG" className="w-15 h-15" />
                                <p className="font-bangers text-3xl text-theme-primary">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {activeItems.map((item) => {
                        const itemConfig = getItemConfig(item.itemTypeId)
                        const svgFile = itemConfig?.svgFile ?? null
                        const categoryLabel = getCategoryLabel(item.itemTypeId)
                        const itemNote = getItemNote(item.itemTypeId)
                        const frontCategoryLabel = categoryLabel.replace(/\s+trait$/i, "")
                        const isBuying = buyingItemId === item.itemTypeId
                        const canAfford = fregBalance >= item.price
                        const soldOut = item.maxSupply > 0 && item.mintCount >= item.maxSupply
                        const isFlipped = flippedCards.has(item.itemTypeId)

                        return (
                            <div
                                key={item.itemTypeId}
                                className="[perspective:800px]"
                            >
                                <div
                                    className={`relative w-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
                                >
                                    {/* Front */}
                                    <Card className="bg-theme-card border-2 border-amber-700/60 rounded-xl overflow-hidden shadow-lg [backface-visibility:hidden]">
                                        <CardContent className="p-4 md:p-5 flex flex-col items-center">
                                            <div
                                                className="relative w-full cursor-pointer"
                                                onClick={() => toggleFlip(item.itemTypeId)}
                                            >
                                                <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center border-b border-amber-700/40 pb-3">
                                                    <div className="h-5 w-5 justify-self-start opacity-0" aria-hidden="true" />
                                                    <div className="flex flex-col items-center gap-1 text-center">
                                                        <h3 className="font-bangers text-xl leading-none text-theme-primary md:text-2xl">
                                                            {item.name}
                                                        </h3>
                                                    </div>
                                                    <div className="inline-flex items-center justify-center justify-self-end p-2 text-amber-300">
                                                        <Info className="h-5 w-5" />
                                                    </div>
                                                </div>
                                                {svgFile && (
                                                    <div className="flex justify-center my-4 md:my-5">
                                                        <img
                                                            src={`/items/${svgFile}`}
                                                            alt={item.name}
                                                            className="w-28 h-28 md:w-36 md:h-36 object-contain drop-shadow-lg"
                                                        />
                                                    </div>
                                                )}
                                                <div className="mb-4 w-full max-w-[240px] rounded-xl px-4 py-3">
                                                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
                                                        {categoryLabel && (
                                                            <>
                                                                <span className="justify-self-start text-left font-righteous text-[11px] uppercase tracking-[0.18em] text-theme-subtle">
                                                                    Trait Type
                                                                </span>
                                                                <span className="justify-self-end text-right font-bangers text-lg leading-none text-theme-primary">
                                                                    {frontCategoryLabel}
                                                                </span>
                                                            </>
                                                        )}
                                                        <span className="justify-self-start text-left font-righteous text-[11px] uppercase tracking-[0.18em] text-theme-subtle">
                                                            Price
                                                        </span>
                                                        <div className="inline-flex items-center justify-self-end gap-2">
                                                            <img src="/coin.svg" alt="$FREG" className="h-6 w-6" />
                                                            <span className="font-bangers text-xl leading-none text-theme-primary">
                                                                {formatPrice(item.price)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {isBuying && buyStatus !== "idle" ? (
                                                <div className="w-full text-center py-2">
                                                    {buyStatus === "success" ? (
                                                        <div className="flex items-center justify-center gap-2 text-green-500">
                                                            <CheckCircle className="w-5 h-5" />
                                                            <span className="font-righteous text-sm">{statusMessage}</span>
                                                        </div>
                                                    ) : buyStatus === "error" ? (
                                                        <div className="flex items-center justify-center gap-2 text-red-500">
                                                            <XCircle className="w-5 h-5" />
                                                            <span className="font-righteous text-xs">{statusMessage}</span>
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
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmItem({ itemTypeId: item.itemTypeId, name: item.name, price: item.price, svgFile, categoryLabel, note: itemNote })
                                                    }}
                                                    disabled={!canAfford || soldOut || buyStatus !== "idle"}
                                                    className="w-full font-bangers text-lg rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
                                                >
                                                    {soldOut
                                                        ? "Sold Out"
                                                        : !canAfford
                                                            ? "Can't Afford"
                                                            : "Buy"}
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {/* Back */}
                                    <Card
                                        className="absolute inset-0 bg-theme-card border-2 border-amber-700/60 rounded-xl overflow-hidden shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)] cursor-pointer"
                                        onClick={() => toggleFlip(item.itemTypeId)}
                                    >
                                        <CardContent className="p-4 md:p-5 flex flex-col items-center justify-center h-full gap-3">
                                            <h3 className="font-bangers text-xl md:text-2xl text-theme-primary text-center border-b border-amber-700/40 pb-2 w-full">
                                                {item.name}
                                            </h3>
                                            {item.description && (
                                                <p className="font-righteous text-sm text-theme-muted text-center">
                                                    {item.description}
                                                </p>
                                            )}
                                            {categoryLabel && (
                                                <div className="bg-amber-700/20 rounded-lg px-3 py-1">
                                                    <span className="font-righteous text-sm text-amber-400">
                                                        {categoryLabel}
                                                    </span>
                                                </div>
                                            )}
                                            {itemNote && (
                                                <div className="w-full rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2 text-left">
                                                    <p className="font-righteous text-[11px] uppercase tracking-[0.18em] text-amber-300">
                                                        Note
                                                    </p>
                                                    <p className="mt-1 font-righteous text-xs leading-relaxed text-theme-muted">
                                                        {itemNote}
                                                    </p>
                                                </div>
                                            )}
                                            {item.maxSupply > 0 && (
                                                <div className="text-center">
                                                    <p className="font-righteous text-xs text-theme-subtle">Supply</p>
                                                    <p className="font-bangers text-lg text-theme-primary">
                                                        {item.maxSupply - item.mintCount} / {item.maxSupply}
                                                    </p>
                                                </div>
                                            )}
                                            <div className="text-center">
                                                <p className="font-righteous text-xs text-theme-subtle">Price</p>
                                                <div className="flex items-center gap-2">
                                                    <img src="/coin.svg" alt="$FREG" className="w-5 h-5" />
                                                    <span className="font-bangers text-lg text-theme-primary">
                                                        {formatPrice(item.price)}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="font-righteous text-xs text-theme-subtle mt-auto">
                                                Tap to flip back
                                            </p>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <Dialog open={confirmItem !== null} onOpenChange={(open) => { if (!open) setConfirmItem(null) }}>
                <DialogContent className="bg-theme-card border-theme-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-bangers text-3xl text-theme-primary text-center">
                            Confirm Purchase
                        </DialogTitle>
                    </DialogHeader>
                    {confirmItem?.svgFile && (
                        <div className="flex justify-center">
                            <div className="bg-theme-secondary/10 rounded-2xl p-6">
                                <img
                                    src={`/items/${confirmItem.svgFile}`}
                                    alt={confirmItem.name}
                                    className="w-32 h-32 object-contain"
                                />
                            </div>
                        </div>
                    )}
                    <DialogDescription className="font-righteous text-lg text-theme-muted text-center">
                        Are you sure you want to buy the{" "}
                        {confirmItem?.categoryLabel && (
                            <>{confirmItem.categoryLabel.toLowerCase()} </>
                        )}
                        <span className="text-theme-primary font-bold">{confirmItem?.name}</span>{" "}
                        for{" "}
                        <span className="text-theme-primary font-bold">
                            {confirmItem ? formatPrice(confirmItem.price) : ""} $FREG
                        </span>?
                    </DialogDescription>
                    {confirmItem?.note && (
                        <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 px-4 py-3 text-left">
                            <p className="font-righteous text-[11px] uppercase tracking-[0.18em] text-amber-300">
                                Note
                            </p>
                            <p className="mt-1 font-righteous text-sm leading-relaxed text-theme-muted">
                                {confirmItem.note}
                            </p>
                        </div>
                    )}
                    <DialogFooter className="grid grid-cols-2 gap-3 sm:gap-3">
                        <Button
                            onClick={() => setConfirmItem(null)}
                            className="font-bangers text-lg py-5 rounded-xl bg-gray-600 hover:bg-gray-500 text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => confirmItem && handleBuy(confirmItem.itemTypeId)}
                            className="font-bangers text-lg py-5 rounded-xl btn-theme-primary"
                        >
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Section>
    )
}
