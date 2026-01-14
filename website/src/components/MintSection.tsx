import React, { useState } from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { parseEther } from "ethers"
import Section from "./Section"
import PepeSvg from "./PepeSvg"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Sparkles, Zap, Palette } from "lucide-react"
import { useContractData, useContracts, useOwnedKitties, useUnclaimedKitties } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import KittyRenderer from "./KittyRenderer"

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
    // 12 variations: different saturation and lightness combinations
    const variations = [
        { s: 90, l: 85 },  // Very light, vivid
        { s: 80, l: 70 },  // Light
        { s: 90, l: 60 },  // Medium light, vivid
        { s: 100, l: 50 }, // Pure, saturated
        { s: 80, l: 45 },  // Medium
        { s: 70, l: 40 },  // Medium dark
        { s: 60, l: 35 },  // Darker
        { s: 50, l: 30 },  // Dark
        { s: 40, l: 25 },  // Very dark
        { s: 30, l: 80 },  // Pastel/muted light
        { s: 40, l: 60 },  // Muted medium
        { s: 25, l: 45 },  // Desaturated
    ]
    return variations.map(v => hslToHex(hue, v.s, v.l))
}

export default function MintSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const { open } = useAppKit()
    const contracts = useContracts()
    const { data: contractData, isLoading: dataLoading, refetch } = useContractData()
    const { refetch: refetchKitties } = useOwnedKitties()
    const { refetch: refetchUnclaimed } = useUnclaimedKitties()

    const [skinColor, setSkinColor] = useState<string>("#7CB342")
    const [hue, setHue] = useState<number>(120)
    const [mintType, setMintType] = useState<"paid" | "free">("paid")
    const [isMinting, setIsMinting] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState("")
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{
        success: boolean
        message: string
        mintedKitty?: {
            tokenId: number
            bodyColor: string
            head: number
            mouth: number
            belly: number
            background: number
        }
    }>({ success: false, message: "" })

    const paletteColors = generatePalette(hue)

    const parseKittyMintedEvent = (receipt: any) => {
        const contract = contracts!.pepeKitties.read
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                if (parsed?.name === "KittyMinted") {
                    return {
                        tokenId: Number(parsed.args.tokenId),
                        bodyColor: parsed.args.bodyColor,
                        head: Number(parsed.args.head),
                        mouth: Number(parsed.args.mouth),
                        belly: Number(parsed.args.belly),
                        background: Number(parsed.args.background)
                    }
                }
            } catch {
                // Not a KittyMinted event, continue
            }
        }
        return null
    }

    const handlePaidMint = async () => {
        if (!isConnected) { open(); return }
        if (!contracts || !contractData) return

        setIsMinting(true)
        try {
            setLoadingMessage("Waiting for wallet approval...")
            const contract = await contracts.pepeKitties.write()
            const tx = await contract.mint(skinColor, { value: parseEther(contractData.mintPrice) })
            setLoadingMessage("Confirming transaction...")
            const receipt = await tx.wait()
            const mintedKitty = parseKittyMintedEvent(receipt)
            setModalData({
                success: true,
                message: `Pepe Kitty #${mintedKitty?.tokenId ?? '?'} has been minted!`,
                mintedKitty: mintedKitty ?? undefined
            })
            // Refresh all relevant data
            refetch()
            refetchKitties()
            refetchUnclaimed()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Minting failed" })
        } finally {
            setIsMinting(false)
            setShowModal(true)
        }
    }

    const handleFreeMint = async () => {
        if (!isConnected) { open(); return }
        if (!contracts || !contractData || contractData.userMintPassBalance < 1) return

        setIsMinting(true)
        try {
            setLoadingMessage("Waiting for wallet approval...")
            const contract = await contracts.mintPass.write()
            const tx = await contract.mintPepeKitty(skinColor)
            setLoadingMessage("Confirming transaction...")
            const receipt = await tx.wait()
            const mintedKitty = parseKittyMintedEvent(receipt)
            setModalData({
                success: true,
                message: `Pepe Kitty #${mintedKitty?.tokenId ?? '?'} minted with Mint Pass!`,
                mintedKitty: mintedKitty ?? undefined
            })
            // Refresh all relevant data
            refetch()
            refetchKitties()
            refetchUnclaimed()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Minting failed" })
        } finally {
            setIsMinting(false)
            setShowModal(true)
        }
    }

    const handleMint = () => {
        if (mintType === "free") handleFreeMint()
        else handlePaidMint()
    }

    const handleColorInput = (value: string) => {
        // Allow typing with or without #
        let color = value.startsWith("#") ? value : `#${value}`
        // Only allow valid hex characters
        color = color.replace(/[^#0-9A-Fa-f]/g, "")
        // Limit to 7 characters (#RRGGBB)
        if (color.length <= 7) {
            setSkinColor(color.toUpperCase())
        }
    }

    const isValidHexColor = (color: string): boolean => {
        return /^#[0-9A-Fa-f]{6}$/.test(color)
    }

    return (
        <Section id="mint">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-lime-400  mb-4">
                    MINT YOUR PEPE KITTY
                </h2>
       
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-stretch">
                {/* NFT Preview Card */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl overflow-hidden backdrop-blur-sm hover:border-lime-300 transition-colors duration-300 h-full flex flex-col">
                    <CardContent className="p-8 flex-1 flex flex-col justify-center">
                        <div className="relative aspect-square rounded-2xl overflow-hidden bg-black/30 border-4 border-dashed border-lime-400/30 flex items-center justify-center">
                            <PepeSvg
                                color={skinColor}
                                className="w-full h-full object-contain hover:animate-jackpot transition-transform"
                            />
                        
                        </div>

                
                    </CardContent>
                </Card>

                {/* Mint Controls */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl backdrop-blur-sm h-full flex flex-col">
                    <CardContent className="p-8 space-y-6 flex-1">
                            {/* Mint Type Toggle */}
                            {contractData && contractData.userMintPassBalance > 0 && (
                                <div className="flex justify-center gap-2 mb-4">
                                    <Button
                                        onClick={() => setMintType("paid")}
                                        className={`px-4 py-2 rounded-xl font-bangers ${mintType === "paid" ? "bg-lime-500 text-black" : "bg-white/10 text-white"}`}
                                    >
                                        Paid Mint
                                    </Button>
                                    <Button
                                        onClick={() => setMintType("free")}
                                        className={`px-4 py-2 rounded-xl font-bangers ${mintType === "free" ? "bg-lime-500 text-black" : "bg-white/10 text-white"}`}
                                    >
                                        Free Mint ({contractData.userMintPassBalance} passes)
                                    </Button>
                                </div>
                            )}

                            {/* Price Display */}
                            <div className="text-center">
                                <p className="font-righteous text-white/70 text-lg mb-2">
                                    {mintType === "free" ? "Free with Mint Pass" : "Price"}
                                </p>
                                <div className="font-bangers text-4xl text-lime-400">
                                    {dataLoading ? (
                                        <LoadingSpinner size="sm" />
                                    ) : mintType === "free" ? (
                                        <span>FREE</span>
                                    ) : (
                                        <span className="animate-count-up">{contractData?.mintPrice || "0"} ETH</span>
                                    )}
                                </div>
                            </div>

                            {/* Skin Color Selector */}
                            <div className="border-t border-white/20 pt-6">
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Palette className="w-5 h-5 text-lime-400" />
                                    <p className="font-righteous text-white/70 text-lg">Select Skin Color</p>
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
                                            onClick={() => setSkinColor(hex)}
                                            className={`
                                                w-full aspect-square rounded-lg transition-all duration-200
                                                hover:scale-110 hover:z-10 relative
                                                ${skinColor === hex
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
                                <div className="flex items-center gap-4 bg-black/30 rounded-xl p-4">
                                    {/* Color Preview */}
                                    <div
                                        className="w-16 h-16 rounded-xl border-4 border-white/30 shadow-lg flex-shrink-0"
                                        style={{ backgroundColor: isValidHexColor(skinColor) ? skinColor : "#000000" }}
                                    />

                                    {/* Hex Input */}
                                    <div className="flex-1">
                                        <label className="font-righteous text-white/50 text-xs block mb-1">
                                            Hex Color Value
                                        </label>
                                        <Input
                                            type="text"
                                            value={skinColor}
                                            onChange={(e) => handleColorInput(e.target.value)}
                                            placeholder="#7CB342"
                                            className={`
                                                font-mono text-lg bg-black/50 border-2
                                                ${isValidHexColor(skinColor)
                                                    ? "border-lime-400/50 text-lime-400"
                                                    : "border-red-400/50 text-red-400"
                                                }
                                            `}
                                            maxLength={7}
                                        />
                                        {!isValidHexColor(skinColor) && skinColor.length > 0 && (
                                            <p className="text-red-400 text-xs mt-1 font-righteous">
                                                Enter valid hex color (e.g., #7CB342)
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Mint Button */}
                            <Button
                                onClick={handleMint}
                                disabled={(isConnected && !isValidHexColor(skinColor)) || isMinting}
                                className="w-full py-6 rounded-2xl font-bangers text-2xl
                                    bg-lime-500 hover:bg-lime-400
                                    text-black border-4 border-lime-300
                                    transform hover:scale-105 transition-all duration-300
                                    shadow-lg hover:shadow-lime-400/50
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {isMinting ? (
                                    <LoadingSpinner size="sm" message={loadingMessage} />
                                ) : (
                                    <>
                                        <Sparkles className="w-6 h-6 mr-2" />
                                        {isConnected ? (mintType === "free" ? "MINT FREE!" : `MINT (${contractData?.mintPrice || "0"} ETH)`) : "CONNECT TO MINT"}
                                        <Zap className="w-6 h-6 ml-2" />
                                    </>
                                )}
                            </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-8 max-w-md mx-auto md:max-w-none md:grid-cols-6">
                {dataLoading ? (
                    <div className="col-span-3 md:col-span-6 flex justify-center">
                        <LoadingSpinner message="Loading stats..." />
                    </div>
                ) : (
                    [
                        { label: "Total Supply", value: contractData?.supply?.toLocaleString() || "0" },
                        { label: "Minted", value: contractData?.totalMinted?.toLocaleString() || "0" },
                        { label: "Remaining", value: ((contractData?.supply || 0) - (contractData?.totalMinted || 0)).toLocaleString() },
                    ].map((stat, i) => (
                        <Card key={i} className="bg-black/30 border-2 border-lime-400 rounded-xl backdrop-blur-sm md:col-span-2">
                            <CardContent className="p-4 text-center">
                                <p className="font-righteous text-white/60 text-xs">{stat.label}</p>
                                <p className="font-bangers text-xl text-lime-400">{stat.value}</p>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Result Modal */}
            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalData.success ? "Success!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            >
                {modalData.success && modalData.mintedKitty && (
                    <div className="flex flex-col items-center gap-4">
                        <KittyRenderer
                            bodyColor={modalData.mintedKitty.bodyColor}
                            head={modalData.mintedKitty.head}
                            mouth={modalData.mintedKitty.mouth}
                            belly={modalData.mintedKitty.belly}
                            background={modalData.mintedKitty.background}
                            specialSkin={0}
                            size="lg"
                        />
                        <div className="text-center text-white/70 font-righteous text-sm">
                            <p>Head: #{modalData.mintedKitty.head} | Mouth: #{modalData.mintedKitty.mouth}</p>
                            <p>Belly: #{modalData.mintedKitty.belly} | Background: #{modalData.mintedKitty.background}</p>
                        </div>
                    </div>
                )}
            </ResultModal>
        </Section>
    )
}
