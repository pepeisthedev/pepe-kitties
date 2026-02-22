import React, { useState } from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { parseEther } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Sparkles, Palette, CheckCircle, XCircle, Gift } from "lucide-react"
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
        const NONE_TRAIT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
        const toTrait = (val: bigint): number => val === NONE_TRAIT ? 0 : Number(val)
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
                        head: toTrait(parsed.args.head),
                        mouth: toTrait(parsed.args.mouth),
                        stomach: toTrait(parsed.args.belly) // Contract uses 'belly', we use 'stomach'
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
                tx = await contract.mintFreg(skinColor, { gasLimit: 500000n })
            } else {
                // Paid mint
                const contract = await contracts.fregs.write()
                tx = await contract.mint(skinColor, { value: parseEther(contractData.mintPrice), gasLimit: 500000n })
            }

            setMintStatus('confirming')
            const receipt = await tx.wait()
            const kitty = parseFregMintedEvent(receipt)
            setMintedKitty(kitty)
            setMintStatus('success')
            // Refresh all relevant data - await to ensure completion
            await Promise.all([
                refetch(),
                refetchKitties(),
                refetchUnclaimed()
            ])
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
        <Section id="mint" wide>
       
            <div className="grid md:grid-cols-2 gap-4 xl:gap-8 items-center">
                {/* NFT Preview */}
                <div className="flex items-center justify-center">
                    <div className="w-full max-w-xs md:max-w-[380px] xl:max-w-lg relative rounded-3xl overflow-hidden" style={{ aspectRatio: '617.49 / 644.18' }}>
                        <KittyRenderer
                            bodyColor={skinColor}
                            hideTraits
                            size="sm"
                            className="w-full h-full"
                        />
                    </div>
                </div>

                {/* Mint Controls */}
                <div className="space-y-2 xl:space-y-6 flex flex-col justify-center">
                    {/* Price Display */}
                    <div className="text-center">
                        <p className="font-righteous text-theme-muted text-xs xl:text-lg mb-0.5">Price</p>
                        <div className="font-bangers text-2xl xl:text-5xl text-theme-primary">
                            {dataLoading ? (
                                <LoadingSpinner size="sm" />
                            ) : hasMintPass ? (
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <Gift className="w-5 h-5 xl:w-8 xl:h-8" />
                                        <span>FREE</span>
                                    </div>
                                    <span className="text-xs xl:text-base text-theme-subtle font-righteous">
                                        with Mint Pass ({mintPassCount} remaining)
                                    </span>
                                </div>
                            ) : (
                                <span className="animate-count-up">{contractData?.mintPrice || "0"} ETH</span>
                            )}
                        </div>
                    </div>

                    {/* Skin Color Selector */}
                    <div>
                        <div className="flex items-center justify-center gap-2 mb-1 xl:mb-4">
                            <Palette className="w-4 h-4 xl:w-5 xl:h-5 text-theme-primary" />
                            <p className="font-righteous text-theme-muted text-xs xl:text-lg">Select Skin Color</p>
                        </div>

                        {/* Hue Slider */}
                        <div className="mb-1 xl:mb-4">
                            <input
                                type="range"
                                min="0"
                                max="360"
                                value={hue}
                                onChange={(e) => setHue(Number(e.target.value))}
                                className="w-full h-2.5 xl:h-4 rounded-full appearance-none cursor-pointer"
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
                                    width: 18px;
                                    height: 18px;
                                    border-radius: 50%;
                                    background: white;
                                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                                    cursor: pointer;
                                }
                                input[type="range"]::-moz-range-thumb {
                                    width: 18px;
                                    height: 18px;
                                    border-radius: 50%;
                                    background: white;
                                    border: none;
                                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                                    cursor: pointer;
                                }
                                @media (min-width: 1280px) {
                                    input[type="range"]::-webkit-slider-thumb {
                                        width: 24px;
                                        height: 24px;
                                    }
                                    input[type="range"]::-moz-range-thumb {
                                        width: 24px;
                                        height: 24px;
                                    }
                                }
                            `}</style>
                        </div>

                        {/* Color Palette */}
                        <div className="grid grid-cols-6 gap-1.5 xl:gap-3 mb-2 xl:mb-6">
                            {paletteColors.map((hex, index) => (
                                <button
                                    key={`${hue}-${index}`}
                                    onClick={() => setSkinColor(hex)}
                                    className={`
                                        aspect-square rounded-md xl:rounded-lg transition-all duration-200 min-h-[32px] xl:min-h-[48px]
                                        hover:scale-110 hover:z-10 relative
                                        ${skinColor === hex
                                            ? "ring-2 ring-white scale-110 z-10"
                                            : "opacity-90 hover:opacity-100"
                                        }
                                    `}
                                    style={{ backgroundColor: hex }}
                                    title={hex}
                                />
                            ))}
                        </div>

                        {/* Hex Input */}
                        <div className="flex items-center gap-2 xl:gap-4">
                            <div
                                className="w-10 h-10 xl:w-16 xl:h-16 rounded-lg xl:rounded-xl flex-shrink-0"
                                style={{ backgroundColor: isValidHexColor(skinColor) ? skinColor : "#000000" }}
                            />
                            <Input
                                type="text"
                                value={skinColor}
                                onChange={(e) => handleColorInput(e.target.value)}
                                placeholder="#7CB342"
                                className={`
                                    font-mono text-lg xl:text-2xl bg-transparent border-0 border-b-2 rounded-none px-0
                                    focus-visible:ring-0 focus-visible:ring-offset-0
                                    ${isValidHexColor(skinColor)
                                        ? "border-theme-primary text-theme-primary"
                                        : "border-red-400/50 text-red-400"
                                    }
                                `}
                                maxLength={7}
                            />
                        </div>
                        {!isValidHexColor(skinColor) && skinColor.length > 0 && (
                            <p className="text-red-400 text-xs mt-1 font-righteous">
                                Enter valid hex color (e.g., #7CB342)
                            </p>
                        )}
                    </div>

                    {/* Mint Button */}
                    <Button
                        onClick={handleMint}
                        disabled={(isConnected && !isValidHexColor(skinColor)) || mintStatus !== 'idle'}
                        className="w-full py-3 xl:py-7 rounded-xl xl:rounded-2xl font-bangers text-lg xl:text-2xl
                            btn-theme-primary
                            transform hover:scale-105 transition-all duration-300
                            shadow-lg
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        {hasMintPass ? (
                            <>
                                <Gift className="w-5 h-5 xl:w-6 xl:h-6 mr-2" />
                                {isConnected ? "MINT FREE!" : "CONNECT TO MINT"}
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 xl:w-6 xl:h-6 mr-2" />
                                {isConnected ? `MINT (${contractData?.mintPrice || "0"} ETH)` : "CONNECT TO MINT"}
                            </>
                        )}
                    </Button>

                    {/* Stats - inline */}
                    <div className="flex justify-center gap-6 xl:gap-12 text-center pt-1 xl:pt-6">
                        {dataLoading ? (
                            <LoadingSpinner size="sm" />
                        ) : (
                            <>
                                <div>
                                    <p className="font-bangers text-xl xl:text-4xl text-theme-primary">{contractData?.totalMinted?.toLocaleString() || "0"}</p>
                                    <p className="font-righteous text-theme-subtle text-xs xl:text-base">Minted</p>
                                </div>
                                <div className="text-theme-subtle text-xl xl:text-3xl self-center">/</div>
                                <div>
                                    <p className="font-bangers text-xl xl:text-4xl text-theme-muted">{contractData?.supply?.toLocaleString() || "0"}</p>
                                    <p className="font-righteous text-theme-subtle text-xs xl:text-base">Supply</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Mint Modal */}
            <Dialog open={mintStatus !== 'idle'} onOpenChange={(open) => !open && (mintStatus === 'success' || mintStatus === 'error') && closeModal()}>
                <DialogContent className="bg-theme-card border-2 border-theme rounded-2xl max-w-md">
                    <DialogHeader className="text-center">
                        {/* Pending State - Waiting for wallet */}
                        {mintStatus === 'pending' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <LoadingSpinner size="lg" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-theme-primary">
                                    Confirm Transaction
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-theme-muted text-base mt-2">
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
                                <DialogTitle className="font-bangers text-3xl text-theme-primary">
                                    Minting...
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-theme-muted text-base mt-2">
                                    Your Freg is being minted. Please wait...
                                </DialogDescription>
                            </>
                        )}

                        {/* Success State */}
                        {mintStatus === 'success' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <CheckCircle className="w-16 h-16 text-theme-primary" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-theme-primary text-center">
                                    Success!
                                </DialogTitle>
                                <DialogDescription className="font-righteous text-theme-muted text-base mt-2 text-center">
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
                                <DialogDescription className="font-righteous text-theme-muted text-base mt-2">
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
                                        ? "btn-theme-primary"
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
