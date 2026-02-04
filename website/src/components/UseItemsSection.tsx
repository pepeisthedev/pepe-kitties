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
import { ITEM_TYPES, ITEM_TYPE_DESCRIPTIONS, TRAIT_TYPES } from "../config/contracts"
import { Wand2, Palette } from "lucide-react"

// Convert HSL to Hex
const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100
    l /= 100
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
        return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}

// Generate palette variations for a given hue
const generatePalette = (hue: number): string[] => {
    const variations = [
        { s: 90, l: 85 },
        { s: 80, l: 70 },
        { s: 90, l: 60 },
        { s: 100, l: 50 },
        { s: 80, l: 45 },
        { s: 70, l: 40 },
        { s: 60, l: 35 },
        { s: 50, l: 30 },
        { s: 40, l: 25 },
        { s: 30, l: 80 },
        { s: 40, l: 60 },
        { s: 25, l: 45 },
    ]
    return variations.map(v => hslToHex(hue, v.s, v.l))
}

// Check if item is a dynamic special trait item (not one of the built-in types)
const isDynamicTraitItem = (item: Item): boolean => {
    const builtInTypes = [
        ITEM_TYPES.COLOR_CHANGE,
        ITEM_TYPES.HEAD_REROLL,
        ITEM_TYPES.TREASURE_CHEST,
        ITEM_TYPES.BEAD_PUNK,
        ITEM_TYPES.SPECIAL_DICE,
    ]
    return !builtInTypes.includes(item.itemType) && item.targetTraitType !== undefined
}

// Get description for an item (dynamic or static)
const getItemDescription = (item: Item): string => {
    if (ITEM_TYPE_DESCRIPTIONS[item.itemType]) {
        return ITEM_TYPE_DESCRIPTIONS[item.itemType]
    }
    // For dynamic items, generate description based on trait type
    if (item.targetTraitType === TRAIT_TYPES.HEAD) {
        return `Apply a special head accessory to your Freg`
    }
    if (item.targetTraitType === TRAIT_TYPES.BODY) {
        return `Apply a special body skin to your Freg`
    }
    return `Apply ${item.name} to your Freg`
}

export default function UseItemsSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const contracts = useContracts()
    const { kitties, isLoading: kittiesLoading, refetch: refetchKitties } = useOwnedKitties()
    const { items, isLoading: itemsLoading, refetch: refetchItems } = useOwnedItems()

    const [selectedKitty, setSelectedKitty] = useState<Kitty | null>(null)
    const [selectedItem, setSelectedItem] = useState<Item | null>(null)
    const [newColor, setNewColor] = useState<string>("#7CB342")
    const [hue, setHue] = useState<number>(120)
    const [isApplying, setIsApplying] = useState(false)
    const [showResultModal, setShowResultModal] = useState(false)
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string }>({ success: false, message: "" })
    const [resultKitty, setResultKitty] = useState<Kitty | null>(null)

    const paletteColors = generatePalette(hue)

    // Filter out treasure chests - they have their own section
    const usableItems = items.filter(item => item.itemType !== ITEM_TYPES.TREASURE_CHEST)

    const isValidHexColor = (color: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(color)

    // Get confirmation message based on item type
    const getConfirmMessage = () => {
        if (!selectedItem) return ""
        switch (selectedItem.itemType) {
            case ITEM_TYPES.COLOR_CHANGE:
                return "Are you sure you want to change the color of this Pepe?"
            case ITEM_TYPES.HEAD_REROLL:
                return "Are you sure you want to re-roll the head trait? This will randomly change the head."
            case ITEM_TYPES.SPECIAL_DICE:
                return "Are you sure you want to roll the Special Dice? This will randomly apply a special trait!"
            default:
                // Dynamic trait items (skins, heads, etc.)
                if (isDynamicTraitItem(selectedItem)) {
                    if (selectedItem.targetTraitType === TRAIT_TYPES.HEAD) {
                        return `Are you sure you want to apply ${selectedItem.name}? This will change the head.`
                    }
                    if (selectedItem.targetTraitType === TRAIT_TYPES.BODY) {
                        return `Are you sure you want to apply ${selectedItem.name}? This will apply a special body skin.`
                    }
                }
                return `Are you sure you want to use ${selectedItem.name}?`
        }
    }

    const handleApplyClick = () => {
        if (!selectedKitty || !selectedItem) return
        if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE && !isValidHexColor(newColor)) return
        setShowConfirmModal(true)
    }

    const parseHeadRerolledEvent = (receipt: any): number | null => {
        const fregsContract = contracts!.fregs.read
        for (const log of receipt.logs) {
            try {
                const parsed = fregsContract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                // Check for TraitSet event with HEAD type
                if (parsed?.name === "TraitSet" && Number(parsed.args.traitType) === TRAIT_TYPES.HEAD) {
                    return Number(parsed.args.traitValue)
                }
            } catch {
                // Not a Fregs event, continue
            }
        }
        return null
    }

    // Parse TraitSet or SpecialDiceUsed events to get the applied trait
    const parseTraitEvent = (receipt: any): { traitType: number; traitValue: number } | null => {
        const fregsContract = contracts!.fregs.read
        const itemsContract = contracts!.items.read

        for (const log of receipt.logs) {
            // Try parsing as TraitSet from Fregs contract
            try {
                const parsed = fregsContract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                if (parsed?.name === "TraitSet") {
                    return {
                        traitType: Number(parsed.args.traitType),
                        traitValue: Number(parsed.args.traitValue)
                    }
                }
            } catch {
                // Not this event, continue
            }

            // Try parsing as SpecialDiceUsed from Items contract
            try {
                const parsed = itemsContract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                if (parsed?.name === "SpecialDiceUsed") {
                    return {
                        traitType: Number(parsed.args.traitType),
                        traitValue: Number(parsed.args.traitValue)
                    }
                }
            } catch {
                // Not this event, continue
            }
        }
        return null
    }

    const handleConfirmApply = async () => {
        if (!contracts || !selectedKitty || !selectedItem) return

        setShowConfirmModal(false)
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
            } else if (selectedItem.itemType === ITEM_TYPES.SPECIAL_DICE) {
                tx = await contract.useSpecialDice(selectedItem.tokenId, selectedKitty.tokenId)
            } else if (
                selectedItem.itemType === ITEM_TYPES.BRONZE_SKIN ||
                selectedItem.itemType === ITEM_TYPES.METAL_SKIN ||
                selectedItem.itemType === ITEM_TYPES.GOLD_SKIN ||
                selectedItem.itemType === ITEM_TYPES.DIAMOND_SKIN
            ) {
                // Skin items
                tx = await contract.useSpecialSkinItem(selectedItem.tokenId, selectedKitty.tokenId)
            } else if (isDynamicTraitItem(selectedItem)) {
                // Dynamic trait items (skins, heads, etc.)
                tx = await contract.useDynamicTraitItem(selectedItem.tokenId, selectedKitty.tokenId)
            } else {
                throw new Error(`Unknown item type: ${selectedItem.itemType}`)
            }

            const receipt = await tx.wait()

            // Build the resulting kitty state
            let updatedKitty: Kitty = { ...selectedKitty }

            if (selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE) {
                updatedKitty.bodyColor = newColor
            } else if (selectedItem.itemType === ITEM_TYPES.HEAD_REROLL) {
                const newHead = parseHeadRerolledEvent(receipt)
                if (newHead !== null) {
                    updatedKitty.head = newHead
                }
            } else if (
                selectedItem.itemType === ITEM_TYPES.SPECIAL_DICE ||
                selectedItem.itemType === ITEM_TYPES.BRONZE_SKIN ||
                selectedItem.itemType === ITEM_TYPES.METAL_SKIN ||
                selectedItem.itemType === ITEM_TYPES.GOLD_SKIN ||
                selectedItem.itemType === ITEM_TYPES.DIAMOND_SKIN ||
                isDynamicTraitItem(selectedItem)
            ) {
                // Parse the trait event to update the correct trait
                const traitResult = parseTraitEvent(receipt)
                if (traitResult) {
                    if (traitResult.traitType === TRAIT_TYPES.BACKGROUND) {
                        updatedKitty.background = traitResult.traitValue
                    } else if (traitResult.traitType === TRAIT_TYPES.BODY) {
                        updatedKitty.body = traitResult.traitValue
                    } else if (traitResult.traitType === TRAIT_TYPES.HEAD) {
                        updatedKitty.head = traitResult.traitValue
                    } else if (traitResult.traitType === TRAIT_TYPES.MOUTH) {
                        updatedKitty.mouth = traitResult.traitValue
                    } else if (traitResult.traitType === TRAIT_TYPES.STOMACH) {
                        updatedKitty.stomach = traitResult.traitValue
                    }
                }
            }

            setResultKitty(updatedKitty)
            setModalData({ success: true, message: `${selectedItem.name} applied to Freg #${selectedKitty.tokenId}!` })
            setSelectedKitty(null)
            setSelectedItem(null)
            refetchKitties()
            refetchItems()
        } catch (err: any) {
            setResultKitty(null)
            setModalData({ success: false, message: err.message || "Failed to apply item" })
        } finally {
            setIsApplying(false)
            setShowResultModal(true)
        }
    }

    const canApply = selectedKitty && selectedItem &&
        (selectedItem.itemType !== ITEM_TYPES.COLOR_CHANGE || isValidHexColor(newColor))

    return (
        <Section id="use-items">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-lime-400  mb-4">
                    USE ITEMS
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Select a Freg and an item to combine them!
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
                                Select a Freg
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
                                <div className="grid grid-cols-4 gap-3 overflow-hidden">
                                    {kitties.map((kitty) => (
                                        <button
                                            key={kitty.tokenId}
                                            onClick={() => setSelectedKitty(kitty)}
                                            className={`p-2 rounded-xl border-2 transition-all ${
                                                selectedKitty?.tokenId === kitty.tokenId
                                                    ? "border-lime-400 ring-2 ring-lime-400"
                                                    : "border-lime-400/50 hover:border-lime-400"
                                            }`}
                                        >
                                            <div className="overflow-hidden rounded-lg bg-white" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...kitty} size="sm" className="w-full h-full" />
                                            </div>
                                            <p className="font-bangers text-xs text-white mt-1">#{kitty.tokenId}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Items Panel */}
                    <Card className="bg-black/40 border-2 border-lime-400 rounded-2xl">
                        <CardContent className="p-4">
                            <p className="font-bangers text-xl text-lime-400 mb-4 text-center">
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
                                <div className="grid grid-cols-4 gap-3 overflow-hidden">
                                    {usableItems.map((item) => (
                                        <ItemCard
                                            key={item.tokenId}
                                            tokenId={item.tokenId}
                                            itemType={item.itemType}
                                            itemName={item.name}
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
                                <div className="overflow-hidden rounded-xl bg-white w-40 h-40" style={{ aspectRatio: '617.49 / 644.18' }}>
                                    <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                </div>
                                <p className="font-bangers text-lime-400 mt-2">#{selectedKitty.tokenId}</p>
                            </div>
                            <Wand2 className="w-12 h-12 text-yellow-400 animate-pulse" />
                            <div className="text-center">
                                <ItemCard tokenId={selectedItem.tokenId} itemType={selectedItem.itemType} itemName={selectedItem.name} />
                            </div>
                        </div>

                        <p className="font-righteous text-white/70 text-center mb-4">
                            {getItemDescription(selectedItem)}
                        </p>

                        {/* Color Picker for Color Change item */}
                        {selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE && (
                            <div className="bg-black/30 rounded-xl p-4 mb-4">
                                {/* Before/After Preview */}
                                <div className="flex items-center justify-center gap-4 mb-6">
                                    <div className="text-center">
                                        <p className="font-righteous text-white/50 text-xs mb-2">Current</p>
                                        <div className="overflow-hidden rounded-lg bg-white w-24" style={{ aspectRatio: '617.49 / 644.18' }}>
                                            <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                        </div>
                                    </div>
                                    <div className="text-2xl text-white/50">→</div>
                                    <div className="text-center">
                                        <p className="font-righteous text-pink-400 text-xs mb-2">New Color</p>
                                        <div className="overflow-hidden rounded-lg bg-white w-24" style={{ aspectRatio: '617.49 / 644.18' }}>
                                            <KittyRenderer
                                                {...selectedKitty}
                                                bodyColor={isValidHexColor(newColor) ? newColor : selectedKitty.bodyColor}
                                                size="sm"
                                                className="w-full h-full"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Palette className="w-5 h-5 text-pink-400" />
                                    <p className="font-righteous text-white/70 text-lg">Select New Color</p>
                                </div>

                                {/* Hue Slider */}
                                <div className="mb-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={hue}
                                        onChange={(e) => setHue(Number(e.target.value))}
                                        className="w-full h-4 rounded-full appearance-none cursor-pointer"
                                        style={{
                                            background: `linear-gradient(to right,
                                                hsl(0, 100%, 50%),
                                                hsl(60, 100%, 50%),
                                                hsl(120, 100%, 50%),
                                                hsl(180, 100%, 50%),
                                                hsl(240, 100%, 50%),
                                                hsl(300, 100%, 50%),
                                                hsl(360, 100%, 50%)
                                            )`,
                                        }}
                                    />
                                    <style>{`
                                        input[type="range"]::-webkit-slider-thumb {
                                            appearance: none;
                                            width: 24px;
                                            height: 24px;
                                            border-radius: 50%;
                                            background: white;
                                            border: 3px solid #000;
                                            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                                            cursor: pointer;
                                        }
                                        input[type="range"]::-moz-range-thumb {
                                            width: 24px;
                                            height: 24px;
                                            border-radius: 50%;
                                            background: white;
                                            border: 3px solid #000;
                                            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                                            cursor: pointer;
                                        }
                                    `}</style>
                                </div>

                                {/* Color Palette */}
                                <div className="grid grid-cols-6 gap-2 mb-4">
                                    {paletteColors.map((hex, index) => (
                                        <button
                                            key={`${hue}-${index}`}
                                            onClick={() => setNewColor(hex)}
                                            className={`
                                                w-full aspect-square rounded-lg transition-all duration-200
                                                hover:scale-110 hover:z-10 relative
                                                ${newColor === hex
                                                    ? "ring-4 ring-white ring-offset-2 ring-offset-black/40 scale-110 z-10"
                                                    : "ring-1 ring-white/20"
                                                }
                                            `}
                                            style={{ backgroundColor: hex }}
                                            title={hex}
                                        />
                                    ))}
                                </div>

                                {/* Color Preview & Input */}
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-xl border-4 border-white/30 shadow-lg flex-shrink-0"
                                        style={{ backgroundColor: isValidHexColor(newColor) ? newColor : "#000000" }}
                                    />
                                    <div className="flex-1">
                                        <label className="font-righteous text-white/50 text-xs block mb-1">
                                            Hex Color Value
                                        </label>
                                        <Input
                                            type="text"
                                            value={newColor}
                                            onChange={(e) => {
                                                let color = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
                                                color = color.replace(/[^#0-9A-Fa-f]/g, "")
                                                if (color.length <= 7) setNewColor(color.toUpperCase())
                                            }}
                                            placeholder="#7CB342"
                                            className={`font-mono text-lg bg-black/50 border-2 ${
                                                isValidHexColor(newColor)
                                                    ? "border-lime-400/50 text-lime-400"
                                                    : "border-red-400/50 text-red-400"
                                            }`}
                                            maxLength={7}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <Button
                            onClick={handleApplyClick}
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

            {/* Confirmation Modal */}
            {showConfirmModal && selectedKitty && selectedItem && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <Card className="bg-black/95 border-2 border-yellow-400 rounded-2xl max-w-lg w-full">
                        <CardContent className="p-6">
                            <p className="font-bangers text-2xl text-yellow-400 text-center mb-4">
                                Confirm Action
                            </p>

                            {selectedItem.itemType === ITEM_TYPES.COLOR_CHANGE ? (
                                <>
                                    <p className="font-righteous text-white/70 text-center mb-6">
                                        {getConfirmMessage()}
                                    </p>
                                    <div className="flex items-center justify-center gap-6 mb-6">
                                        <div className="text-center">
                                            <p className="font-righteous text-white/50 text-sm mb-2">Before</p>
                                            <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                            </div>
                                        </div>
                                        <div className="text-3xl text-yellow-400">→</div>
                                        <div className="text-center">
                                            <p className="font-righteous text-lime-400 text-sm mb-2">After</p>
                                            <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                                <KittyRenderer
                                                    {...selectedKitty}
                                                    bodyColor={newColor}
                                                    size="sm"
                                                    className="w-full h-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-center mb-4">
                                        <div className="overflow-hidden rounded-lg bg-white w-32" style={{ aspectRatio: '617.49 / 644.18' }}>
                                            <KittyRenderer {...selectedKitty} size="sm" className="w-full h-full" />
                                        </div>
                                    </div>
                                    <p className="font-righteous text-white/70 text-center mb-6">
                                        {getConfirmMessage()}
                                    </p>
                                </>
                            )}

                            <div className="flex gap-4">
                                <Button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 py-3 rounded-xl font-bangers text-lg bg-gray-600 hover:bg-gray-500 text-white"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleConfirmApply}
                                    className="flex-1 py-3 rounded-xl font-bangers text-lg bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-black"
                                >
                                    Confirm
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Result Modal */}
            <ResultModal
                isOpen={showResultModal}
                onClose={() => {
                    setShowResultModal(false)
                    setResultKitty(null)
                }}
                title={modalData.success ? "Item Applied!" : "Error"}
                description={modalData.success ? undefined : modalData.message}
                success={modalData.success}
            >
                {modalData.success && resultKitty && (
                    <div className="flex justify-center">
                        <div className="overflow-hidden rounded-xl bg-white" style={{ aspectRatio: '617.49 / 644.18', width: '256px' }}>
                            <KittyRenderer
                                bodyColor={resultKitty.bodyColor}
                                background={resultKitty.background}
                                body={resultKitty.body}
                                head={resultKitty.head}
                                mouth={resultKitty.mouth}
                                stomach={resultKitty.stomach}
                                size="sm"
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                )}
            </ResultModal>
        </Section>
    )
}
