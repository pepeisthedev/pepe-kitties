import React, { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { parseEther } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Sparkles, Palette, CheckCircle, XCircle, Gift } from "lucide-react"
import { useContractData, useContracts, useOwnedKitties, useUnclaimedKitties } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"
import { waitForEvent } from "../lib/waitForEvent"
import { readBufferedGasAwareVrfFee } from "../lib/vrfFee"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog"

type MintStatus = 'idle' | 'pending' | 'confirming' | 'awaitingRandomness' | 'success' | 'error'
type RevealPhase = 'hidden' | 'exploding' | 'revealed'

const AWAITING_RANDOMNESS_MESSAGES = [
    {
        title: "A Freg Is Spotted..."
    },
    {
        title: "The Freg Is Coming Closer..."
    },
    {
        title: "Almost Here..."
    },
     {
        title: "Almoooooost..."
    },
]

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

const parseHexColor = (color: string): { r: number; g: number; b: number } | null => {
    const match = color.match(/^#([0-9A-Fa-f]{6})$/)
    if (!match) return null

    const hex = match[1]
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    }
}

const getGreyscaleValue = (color: string): number | null => {
    const rgb = parseHexColor(color)
    if (!rgb || rgb.r !== rgb.g || rgb.g !== rgb.b) return null
    return Math.round((rgb.r / 255) * 100)
}

export default function MintSection(): React.JSX.Element {
    const { address, isConnected } = useAppKitAccount()
    const { open } = useAppKit()
    const contracts = useContracts()
    const { data: contractData, isLoading: dataLoading, refetch } = useContractData()
    const { kitties, refetch: refetchKitties } = useOwnedKitties()
    const { refetch: refetchUnclaimed } = useUnclaimedKitties()

    const [skinColor, setSkinColor] = useState<string>("#7CB342")
    const [hue, setHue] = useState<number>(120)
    const [greyscale, setGreyscale] = useState<number>(50)
    const [mintStatus, setMintStatus] = useState<MintStatus>('idle')
    const [errorMessage, setErrorMessage] = useState("")
    const [mintedKitty, setMintedKitty] = useState<{
        tokenId: number
        bodyColor: string
        head: number
        mouth: number
        stomach: number
    } | null>(null)
    const [awaitingMessageIndex, setAwaitingMessageIndex] = useState(0)

    const [revealPhase, setRevealPhase] = useState<RevealPhase>('hidden')
    const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; angle: number; delay: number; size: number; color: string }>>([])

    // Reset reveal when modal closes or new mint starts
    useEffect(() => {
        if (mintStatus === 'pending') {
            setRevealPhase('hidden')
            setParticles([])
        }
    }, [mintStatus])

    useEffect(() => {
        if (mintStatus !== 'awaitingRandomness') {
            setAwaitingMessageIndex(0)
            return
        }

        const interval = window.setInterval(() => {
            setAwaitingMessageIndex((current) => (current + 1) % AWAITING_RANDOMNESS_MESSAGES.length)
        }, 4000)

        return () => window.clearInterval(interval)
    }, [mintStatus])

    useEffect(() => {
        const greyscaleValue = getGreyscaleValue(skinColor)
        if (greyscaleValue !== null && greyscaleValue !== greyscale) {
            setGreyscale(greyscaleValue)
        }
    }, [greyscale, skinColor])

    const handleReveal = useCallback(() => {
        if (revealPhase !== 'hidden') return
        // Generate explosion particles
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A3E635', '#FF9F1C', '#E040FB', '#00E5FF', '#FFEB3B']
        const newParticles = Array.from({ length: 24 }, (_, i) => {
            const angle = ((i * 15) + Math.random() * 10) * (Math.PI / 180)
            const distance = 80 + Math.random() * 60
            return {
                id: i,
                x: 50 + (Math.random() - 0.5) * 20,
                y: 50 + (Math.random() - 0.5) * 20,
                tx: Math.cos(angle) * distance,
                ty: Math.sin(angle) * distance,
                angle: 0,
                delay: Math.random() * 0.15,
                size: 4 + Math.random() * 8,
                color: colors[Math.floor(Math.random() * colors.length)],
            }
        })
        setParticles(newParticles)
        setRevealPhase('exploding')
        // After explosion, reveal the freg
        setTimeout(() => setRevealPhase('revealed'), 600)
    }, [revealPhase])

    const paletteColors = generatePalette(hue)

    // Mint phase and free mint status
    const mintPhase = contractData?.mintPhase ?? 0
    const userFreeMints = contractData?.freeMints ?? 0
    const hasMintPass = contractData && contractData.userMintPassBalance > 0
    const hasFreeMint = userFreeMints > 0

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
        if (!isConnected || !address) { open(); return }
        if (!contracts || !contractData) return

        setMintStatus('pending')
        setMintedKitty(null)
        setErrorMessage("")

        try {
            const contract = await contracts.fregs.write()
            const existingTokenIds = new Set(kitties.map(kitty => kitty.tokenId))
            const bufferedVrfFee = await readBufferedGasAwareVrfFee(
                contracts.fregs.read,
                contracts.provider,
                "quoteMintFee"
            )
            // Only free mint wallets skip ETH payment — everyone else pays
            const needsPayment = !hasFreeMint
            const totalValue = needsPayment ? parseEther(contractData.mintPrice) + bufferedVrfFee : bufferedVrfFee
            const tx = await contract.mint(skinColor, {
                value: totalValue,
                gasLimit: 500000n,
            })

            setMintStatus('confirming')
            const receipt = await tx.wait()
            let kitty = parseFregMintedEvent(receipt)

            if (!kitty) {
                setMintStatus('awaitingRandomness')
                const mintEvent = await waitForEvent({
                    contract: contracts.fregs.read,
                    filter: contracts.fregs.read.filters.FregMinted(null, address),
                    fromBlock: receipt.blockNumber,
                    match: (log) => !existingTokenIds.has(Number(log.args.tokenId)),
                })

                kitty = {
                    tokenId: Number(mintEvent.args.tokenId),
                    bodyColor: String(mintEvent.args.bodyColor),
                    head: Number(mintEvent.args.head),
                    mouth: Number(mintEvent.args.mouth === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") ? 0 : mintEvent.args.mouth),
                    stomach: Number(mintEvent.args.belly === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") ? 0 : mintEvent.args.belly),
                }
            }

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

    const handleGreyscaleChange = (value: number) => {
        setGreyscale(value)
        setSkinColor(hslToHex(0, 0, value))
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
                            ) : hasFreeMint ? (
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <Gift className="w-5 h-5 xl:w-8 xl:h-8" />
                                        <span>FREE</span>
                                    </div>
                                    <span className="text-xs xl:text-base text-theme-subtle font-righteous">
                                        Free Mint ({userFreeMints} left)
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

                        <div className="mb-2 xl:mb-4">
                     
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={greyscale}
                                onChange={(e) => handleGreyscaleChange(Number(e.target.value))}
                                className="w-full h-2.5 xl:h-4 rounded-full appearance-none cursor-pointer"
                                style={{
                                    background: "linear-gradient(to right, #000000, #FFFFFF)",
                                }}
                                aria-label="Greyscale slider"
                            />
                        </div>

                        {/* Color Palette */}
                        <div className="grid grid-cols-6 gap-1.5 xl:gap-3 mb-2 xl:mb-6">
                            {paletteColors.map((hex, index) => (
                                <button
                                    key={`${hue}-${index}`}
                                    onClick={() => setSkinColor(hex)}
                                    className={`
                                        aspect-square rounded-md xl:rounded-lg transition-all duration-200 min-h-[32px] xl:min-h-[48px] cursor-pointer
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
                        disabled={
                            (isConnected && !isValidHexColor(skinColor)) ||
                            mintStatus !== 'idle' ||
                            (isConnected && mintPhase === 0) ||
                            (isConnected && mintPhase === 1 && !hasFreeMint && !hasMintPass)
                        }
                        className="w-full py-3 xl:py-7 rounded-xl xl:rounded-2xl font-bangers text-lg xl:text-2xl
                            btn-theme-primary
                            transform hover:scale-105 transition-all duration-300
                            shadow-lg
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        {!isConnected ? (
                            <>
                                <Sparkles className="w-5 h-5 xl:w-6 xl:h-6 mr-2" />
                                CONNECT TO MINT
                            </>
                        ) : mintPhase === 0 ? (
                            "MINTING PAUSED"
                        ) : mintPhase === 1 && !hasFreeMint && !hasMintPass ? (
                            "WHITELIST ONLY"
                        ) : hasFreeMint ? (
                            <>
                                <Gift className="w-5 h-5 xl:w-6 xl:h-6 mr-2" />
                                MINT FREE!
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 xl:w-6 xl:h-6 mr-2" />
                                MINT ({contractData?.mintPrice || "0"} ETH)
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
            <Dialog open={mintStatus !== 'idle'} onOpenChange={(open) => !open && ((mintStatus === 'success' && revealPhase === 'revealed') || mintStatus === 'error') && closeModal()}>
                <DialogContent className="bg-theme-mint-modal border-2 border-theme rounded-2xl max-w-md">
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

                        {mintStatus === 'awaitingRandomness' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <LoadingSpinner size="lg" />
                                </div>
                                <DialogTitle className="font-bangers text-3xl text-theme-primary">
                                    {AWAITING_RANDOMNESS_MESSAGES[awaitingMessageIndex].title}
                                </DialogTitle>
                            
                            </>
                        )}

                        {/* Success State */}
                        {mintStatus === 'success' && revealPhase === 'hidden' && (
                            <>
                                <DialogTitle className="font-bangers text-3xl text-theme-primary text-center">
                                    Freg #{mintedKitty?.tokenId ?? '?'} Minted!
                                </DialogTitle>
                                <DialogDescription className="sr-only">Click the egg to reveal your Freg</DialogDescription>
                            </>
                        )}
                        {mintStatus === 'success' && revealPhase === 'revealed' && (
                            <>
                                <DialogTitle className="font-bangers text-3xl text-theme-primary text-center animate-reveal-title">
                                    Freg #{mintedKitty?.tokenId ?? '?'}
                                </DialogTitle>
                                <DialogDescription className="sr-only">Your revealed Freg</DialogDescription>
                            </>
                        )}
                        {mintStatus === 'success' && revealPhase === 'exploding' && (
                            <>
                                <DialogTitle className="sr-only">Revealing...</DialogTitle>
                                <DialogDescription className="sr-only">Revealing your Freg</DialogDescription>
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

                    {/* Reveal mechanic on success */}
                    {mintStatus === 'success' && mintedKitty && (
                        <div className="py-4 flex justify-center">
                            <div className="relative" style={{ width: '256px', height: '267px' }}>
                                {/* Explosion particles */}
                                {revealPhase === 'exploding' && particles.map(p => (
                                    <div
                                        key={p.id}
                                        className="absolute rounded-full animate-particle-burst"
                                        style={{
                                            left: `${p.x}%`,
                                            top: `${p.y}%`,
                                            width: p.size,
                                            height: p.size,
                                            backgroundColor: p.color,
                                            animationDelay: `${p.delay}s`,
                                            '--particle-tx': `${p.tx}px`,
                                            '--particle-ty': `${p.ty}px`,
                                        } as React.CSSProperties}
                                    />
                                ))}

                                {/* Card back - click to reveal */}
                                {revealPhase === 'hidden' && (
                                    <button
                                        onClick={handleReveal}
                                        className="w-full h-full cursor-pointer group"
                                    >
                                        <div className="w-full h-full rounded-2xl overflow-hidden
                                            border-2 transition-all duration-300 group-hover:scale-[1.02]
                                            flex flex-col items-center justify-center gap-3 relative"
                                            style={{
                                                background: `linear-gradient(to bottom right, ${skinColor}22, ${skinColor}88, ${skinColor}22)`,
                                                borderColor: `${skinColor}80`,
                                                boxShadow: `0 0 20px ${skinColor}50`,
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = skinColor
                                                e.currentTarget.style.boxShadow = `0 0 40px ${skinColor}99`
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = `${skinColor}80`
                                                e.currentTarget.style.boxShadow = `0 0 20px ${skinColor}50`
                                            }}
                                        >
                                            {/* Pattern overlay */}
                                            <div className="absolute inset-0 opacity-10"
                                                style={{
                                                    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, ${skinColor}4D 10px, ${skinColor}4D 11px)`,
                                                }}
                                            />
                                            {/* Shimmer */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer overflow-hidden rounded-2xl" />
                                            {/* Content */}
                                            <span className="text-6xl select-none relative">?</span>
                                            <span className="font-bangers text-xl relative animate-pulse" style={{ color: skinColor }}>
                                                TAP TO REVEAL
                                            </span>
                                        </div>
                                    </button>
                                )}

                                {/* Exploding state - brief flash */}
                                {revealPhase === 'exploding' && (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-32 h-32 rounded-full animate-reveal-flash" style={{ backgroundColor: skinColor, '--flash-color': skinColor } as React.CSSProperties} />
                                    </div>
                                )}

                                {/* Revealed freg */}
                                {revealPhase === 'revealed' && (
                                    <div className="animate-reveal-freg">
                                        <div className="rounded-2xl overflow-hidden bg-white animate-reveal-glow" style={{ aspectRatio: '617.49 / 644.18', width: '256px', '--glow-color': skinColor } as React.CSSProperties}>
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
                            </div>
                        </div>
                    )}

                    {/* Footer buttons only for revealed success/error states */}
                    {((mintStatus === 'success' && revealPhase === 'revealed') || mintStatus === 'error') && (
                        <DialogFooter className="sm:justify-center">
                            <Button
                                onClick={closeModal}
                                className={`font-bangers text-xl px-8 py-3 rounded-xl ${
                                    mintStatus === 'success'
                                        ? "btn-theme-primary"
                                        : "bg-red-500 hover:bg-red-400 text-white"
                                }`}
                            >
                                {mintStatus === 'success' ? "Ribbit!" : "Close"}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </Section>
    )
}
