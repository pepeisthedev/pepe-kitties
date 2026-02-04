import React, { useState } from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { parseEther } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Sparkles, Zap, Palette, CheckCircle, XCircle, Gift } from "lucide-react"
import { useContractData, useContracts, useOwnedKitties, useUnclaimedKitties } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog"

type MintStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

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
    const [mintStatus, setMintStatus] = useState<MintStatus>('idle')
    const [errorMessage, setErrorMessage] = useState("")
    const [mintedKitty, setMintedKitty] = useState<{
        tokenId: number
        bodyColor: string
        head: number
        mouth: number
        stomach: number
    } | null>(null)

    const paletteColors = generatePalette(hue)

    // Check if user has mint passes for free mint
    const hasMintPass = contractData && contractData.userMintPassBalance > 0
    const mintPassCount = contractData?.userMintPassBalance || 0

    const parseFregMintedEvent = (receipt: any) => {
        const contract = contracts!.fregs.read
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data
                })
                if (parsed?.name === "FregMinted") {
                    return {
                        tokenId: Number(parsed.args.tokenId),
                        bodyColor: parsed.args.bodyColor,
                        head: Number(parsed.args.head),
                        mouth: Number(parsed.args.mouth),
                        stomach: Number(parsed.args.belly) // Contract uses 'belly', we use 'stomach'
                    }
                }
            } catch {
                // Not a FregMinted event, continue
            }
        }
        return null
    }

    const handleMint = async () => {
        if (!isConnected) { open(); return }
        if (!contracts || !contractData) return

        setMintStatus('pending')
        setMintedKitty(null)
        setErrorMessage("")

        try {
            let tx
            if (hasMintPass) {
                // Free mint using mint pass
                const contract = await contracts.mintPass.write()
                tx = await contract.mintFreg(skinColor)
            } else {
                // Paid mint
                const contract = await contracts.fregs.write()
                tx = await contract.mint(skinColor, { value: parseEther(contractData.mintPrice) })
            }

            setMintStatus('confirming')
            const receipt = await tx.wait()
            const kitty = parseFregMintedEvent(receipt)
            setMintedKitty(kitty)
            setMintStatus('success')
            // Refresh all relevant data
            refetch()
            refetchKitties()
            refetchUnclaimed()
        } catch (err: any) {
            setErrorMessage(err.message || "Minting failed")
            setMintStatus('error')
        }
    }

    const closeModal = () => {
        setMintStatus('idle')
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
                    MINT YOUR FREG
                </h2>

            </div>

            <div className="grid md:grid-cols-2 gap-8 items-stretch">
                {/* NFT Preview Card */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl overflow-hidden backdrop-blur-sm hover:border-lime-300 transition-colors duration-300 h-full flex flex-col">
                    <CardContent className="p-8 flex-1 flex flex-col justify-center">
                        <div className="relative rounded-2xl overflow-hidden bg-white border-0 border-dashed border-lime-400/30 flex items-center justify-center" style={{ aspectRatio: '617.49 / 644.18' }}>
                            <KittyRenderer
                                bodyColor={skinColor}
                                hideTraits
                                size="sm"
                                className="w-full h-full"
                            />
                        </div>


                    </CardContent>
                </Card>

                {/* Mint Controls */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl backdrop-blur-sm h-full flex flex-col">
                    <CardContent className="p-8 space-y-6 flex-1">
                            {/* Price Display */}
                            <div className="text-center">
                                <p className="font-righteous text-white/70 text-lg mb-2">
                                    Price
                                </p>
                                <div className="font-bangers text-4xl text-lime-400">
                                    {dataLoading ? (
                                        <LoadingSpinner size="sm" />
                                    ) : hasMintPass ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex items-center gap-2">
                                                <Gift className="w-8 h-8" />
                                                <span>FREE</span>
                                            </div>
                                            <span className="text-base text-white/60 font-righteous">
                                                with Mint Pass ({mintPassCount} remaining)
                                            </span>
                                        </div>
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
                                disabled={(isConnected && !isValidHexColor(skinColor)) || mintStatus !== 'idle'}
                                className="w-full py-6 rounded-2xl font-bangers text-2xl
                                    bg-lime-500 hover:bg-lime-400
                                    text-black border-4 border-lime-300
                                    transform hover:scale-105 transition-all duration-300
                                    shadow-lg hover:shadow-lime-400/50
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {hasMintPass ? (
                                    <>
                                        <Gift className="w-6 h-6 mr-2" />
                                        {isConnected ? "MINT FREE!" : "CONNECT TO MINT"}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-6 h-6 mr-2" />
                                        {isConnected ? `MINT (${contractData?.mintPrice || "0"} ETH)` : "CONNECT TO MINT"}
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

            {/* Mint Modal */}
            <Dialog open={mintStatus !== 'idle'} onOpenChange={(open) => !open && (mintStatus === 'success' || mintStatus === 'error') && closeModal()}>
                <DialogContent className="bg-black/95 border-2 border-lime-400 rounded-2xl max-w-md">
                    <DialogHeader className="text-center">
                        {/* Pending State - Waiting for wallet */}
                        {mintStatus === 'pending' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <LoadingSpinner size="lg" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-lime-400">
                                    Confirm Transaction
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                                    Confirm the transaction in your wallet to mint your Freg
                                </DialogDescription>
                            </>
                        )}

                        {/* Confirming State - Transaction submitted */}
                        {mintStatus === 'confirming' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <LoadingSpinner size="lg" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-lime-400">
                                    Minting...
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                                    Your Freg is being minted. Please wait...
                                </DialogDescription>
                            </>
                        )}

                        {/* Success State */}
                        {mintStatus === 'success' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <CheckCircle className="w-16 h-16 text-lime-400" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-lime-400 text-center">
                                    Success!
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-white/70 text-base mt-2 text-center">
                                    Freg #{mintedKitty?.tokenId ?? '?'} has been minted!
                                </DialogDescription>
                            </>
                        )}

                        {/* Error State */}
                        {mintStatus === 'error' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <XCircle className="w-16 h-16 text-red-400" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-red-400">
                                    Error
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                                    {errorMessage}
                                </DialogDescription>
                            </>
                        )}
                    </DialogHeader>

                    {/* Show minted kitty on success */}
                    {mintStatus === 'success' && mintedKitty && (
                        <div className="py-4 flex justify-center">
                            <div className="rounded-2xl overflow-hidden bg-white" style={{ aspectRatio: '617.49 / 644.18', width: '256px' }}>
                                <KittyRenderer
                                    bodyColor={mintedKitty.bodyColor}
                                    body={0}
                                    head={mintedKitty.head}
                                    mouth={mintedKitty.mouth}
                                    stomach={mintedKitty.stomach}
                                    size="sm"
                                    className="w-full h-full"
                                />
                            </div>
                        </div>
                    )}

                    {/* Footer buttons only for success/error states */}
                    {(mintStatus === 'success' || mintStatus === 'error') && (
                        <DialogFooter className="sm:justify-center">
                            <Button
                                onClick={closeModal}
                                className={`font-bangers text-xl px-8 py-3 rounded-xl ${
                                    mintStatus === 'success'
                                        ? "bg-lime-500 hover:bg-lime-400 text-black"
                                        : "bg-red-500 hover:bg-red-400 text-white"
                                }`}
                            >
                                {mintStatus === 'success' ? "Awesome!" : "Close"}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </Section>
    )
}
