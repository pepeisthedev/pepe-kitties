import React, { useState } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useOwnedKitties, useOwnedItems, useContracts, Kitty, Item } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import KittyRenderer from "./KittyRenderer"
import ItemCard from "./ItemCard"
import { ITEM_TYPES, ITEM_TYPE_NAMES, ITEM_TYPE_DESCRIPTIONS } from "../config/contracts"
import { Wand2, Palette } from "lucide-react"

export default function UseItemsSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { kitties, isLoading: kittiesLoading, refetch: refetchKitties } = useOwnedKitties()
    const { items, isLoading: itemsLoading, refetch: refetchItems } = useOwnedItems()

    const [selectedKitty, setSelectedKitty] = useState<Kitty | null>(null)
    const [selectedItem, setSelectedItem] = useState<Item | null>(null)
    const [newColor, setNewColor] = useState<string>("#7CB342")
    const [isApplying, setIsApplying] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string }>({ success: false, message: "" })

    // Filter out treasure chests - they have their own section
    const usableItems = items.filter(item => item.itemType !== ITEM_TYPES.TREASURE_CHEST)

    const isValidHexColor = (color: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(color)

    const handleApplyItem = async () => {
        if (!contracts || !selectedKitty || !selectedItem) return

        setIsApplying(true)
        try {
            const contract = await contracts.items.write()
            let tx

            if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE) {
                if (!isValidHexColor(newColor)) {
                    throw new Error("Invalid hex color")
                }
                tx = await contract.useColorChange(selectedItem.tokenId, selectedKitty.tokenId, newColor)
            } else if (selectedItem.itemType === ITEM_TYPES.HEAD_REROLL) {
                tx = await contract.useHeadReroll(selectedItem.tokenId, selectedKitty.tokenId)
            } else {
                // Bronze, Silver, Gold skins
                tx = await contract.useSpecialSkinItem(selectedItem.tokenId, selectedKitty.tokenId)
            }

            await tx.wait()

            let message = `${selectedItem.name} applied to Kitty #${selectedKitty.tokenId}!`
            if (selectedItem.itemType === ITEM_TYPES.GOLD_SKIN) {
                message += " You also received a Treasure Chest!"
            }

            setModalData({ success: true, message })
            setSelectedKitty(null)
            setSelectedItem(null)
            refetchKitties()
            refetchItems()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Failed to apply item" })
        } finally {
            setIsApplying(false)
            setShowModal(true)
        }
    }

    const canApply = selectedKitty && selectedItem &&
        (selectedItem.itemType !== ITEM_TYPES.COLOR_CHANGE || isValidHexColor(newColor))

    return (
        <Section id="use-items" variant="default">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-lime-400 text-comic-shadow-lg mb-4">
                    USE ITEMS
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Select a kitty and an item to combine them!
                </p>
            </div>

            {!isConnected ? (
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-white/70">
                            Connect your wallet to use items
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Kitties Panel */}
                    <Card className="bg-black/40 border-2 border-lime-400 rounded-2xl">
                        <CardContent className="p-4">
                            <p className="font-bangers text-xl text-lime-400 mb-4 text-center">
                                Select a Kitty
                            </p>
                            {kittiesLoading ? (
                                <div className="flex justify-center py-8">
                                    <LoadingSpinner message="Loading kitties..." />
                                </div>
                            ) : kitties.length === 0 ? (
                                <p className="text-white/50 text-center py-8 font-righteous">
                                    No kitties owned
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                                    {kitties.map((kitty) => (
                                        <button
                                            key={kitty.tokenId}
                                            onClick={() => setSelectedKitty(kitty)}
                                            className={`p-2 rounded-xl border-2 transition-all ${
                                                selectedKitty?.tokenId === kitty.tokenId
                                                    ? "border-lime-400 ring-2 ring-lime-400 scale-105"
                                                    : "border-white/20 hover:border-lime-400/50"
                                            }`}
                                        >
                                            <KittyRenderer {...kitty} size="sm" />
                                            <p className="font-bangers text-xs text-white mt-1">#{kitty.tokenId}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Items Panel */}
                    <Card className="bg-black/40 border-2 border-orange-400 rounded-2xl">
                        <CardContent className="p-4">
                            <p className="font-bangers text-xl text-orange-400 mb-4 text-center">
                                Select an Item
                            </p>
                            {itemsLoading ? (
                                <div className="flex justify-center py-8">
                                    <LoadingSpinner message="Loading items..." />
                                </div>
                            ) : usableItems.length === 0 ? (
                                <p className="text-white/50 text-center py-8 font-righteous">
                                    No items available
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                                    {usableItems.map((item) => (
                                        <ItemCard
                                            key={item.tokenId}
                                            tokenId={item.tokenId}
                                            itemType={item.itemType}
                                            selected={selectedItem?.tokenId === item.tokenId}
                                            onClick={() => setSelectedItem(item)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Action Panel */}
            {selectedKitty && selectedItem && (
                <Card className="bg-black/60 border-4 border-lime-400 rounded-3xl mt-8 max-w-2xl mx-auto">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-center gap-8 mb-6">
                            <div className="text-center">
                                <KittyRenderer {...selectedKitty} size="md" />
                                <p className="font-bangers text-lime-400 mt-2">#{selectedKitty.tokenId}</p>
                            </div>
                            <Wand2 className="w-12 h-12 text-yellow-400 animate-pulse" />
                            <div className="text-center">
                                <ItemCard tokenId={selectedItem.tokenId} itemType={selectedItem.itemType} />
                            </div>
                        </div>

                        <p className="font-righteous text-white/70 text-center mb-4">
                            {ITEM_TYPE_DESCRIPTIONS[selectedItem.itemType]}
                        </p>

                        {/* Color Picker for Color Change item */}
                        {selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE && (
                            <div className="flex items-center gap-4 bg-black/30 rounded-xl p-4 mb-4">
                                <Palette className="w-6 h-6 text-pink-400" />
                                <Input
                                    type="text"
                                    value={newColor}
                                    onChange={(e) => setNewColor(e.target.value.toUpperCase())}
                                    placeholder="#7CB342"
                                    className={`font-mono text-lg bg-black/50 border-2 ${
                                        isValidHexColor(newColor)
                                            ? "border-lime-400/50 text-lime-400"
                                            : "border-red-400/50 text-red-400"
                                    }`}
                                    maxLength={7}
                                />
                                <div
                                    className="w-12 h-12 rounded-lg border-2 border-white/30"
                                    style={{ backgroundColor: isValidHexColor(newColor) ? newColor : "#000" }}
                                />
                            </div>
                        )}

                        <Button
                            onClick={handleApplyItem}
                            disabled={!canApply || isApplying}
                            className="w-full py-4 rounded-xl font-bangers text-xl bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-black"
                        >
                            {isApplying ? (
                                <LoadingSpinner size="sm" message="Applying..." />
                            ) : (
                                `Apply ${selectedItem.name}`
                            )}
                        </Button>
                    </CardContent>
                </Card>
            )}

            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalData.success ? "Item Applied!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            />
        </Section>
    )
}
