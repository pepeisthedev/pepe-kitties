import React, { useState, useEffect } from "react"
import { useAppKitAccount, useAppKitProvider, useAppKit } from "@reown/appkit/react"
import { BrowserProvider, Contract, formatEther } from "ethers"
import Abi from "../assets/abis/example.json"
import Section from "./Section"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Sparkles, Zap, Palette } from "lucide-react"

const MEMELOOT_CONTRACT_ADDRESS = import.meta.env.KITTEN_CONTRACT_ADDRESS

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
    const { address, isConnected } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")
    const { open } = useAppKit()

    const [mintPrice, setMintPrice] = useState<string>("0")
    const [loading, setLoading] = useState<boolean>(false)
    const [mintAmount, setMintAmount] = useState<number>(1)
    const [skinColor, setSkinColor] = useState<string>("#7CB342")
    const [hue, setHue] = useState<number>(120) // Start with green (Pepe!)

    // Generate palette colors based on current hue
    const paletteColors = generatePalette(hue)

    useEffect(() => {
        if (isConnected && address && walletProvider) {
            fetchMintPrice()
        } else {
            setMintPrice("0")
        }
    }, [isConnected, address, walletProvider])

    useEffect(() => {
        if (!isConnected || !address || !walletProvider) return

        const pollInterval = setInterval(() => {
            fetchMintPrice()
        }, 300000)

        return () => clearInterval(pollInterval)
    }, [isConnected, address, walletProvider])

    const fetchMintPrice = async () => {
        try {
            setLoading(true)
            const provider = new BrowserProvider(walletProvider as any)
            const contract = new Contract(MEMELOOT_CONTRACT_ADDRESS, Abi, provider)

            const [fetchedPrice] = await contract.getMintPrice(address)
            const priceFormatted = formatEther(fetchedPrice)
            setMintPrice(parseFloat(priceFormatted).toFixed(6))
        } catch (error) {
            console.error("Error fetching mint price:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleMint = async () => {
        if (!isConnected) {
            open()
            return
        }
        // Mint logic would go here - skinColor is the hex value for the contract
        console.log(`Minting ${mintAmount} Pepe Kitties with skin color: ${skinColor}`)
    }

    const incrementAmount = () => setMintAmount(prev => Math.min(prev + 1, 10))
    const decrementAmount = () => setMintAmount(prev => Math.max(prev - 1, 1))

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
        <Section id="mint" variant="default">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-lime-400 text-comic-shadow-lg mb-4 animate-pulse-rainbow">
                    🐸 MINT YOUR KITTY 🐱
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    The rarest fusion of meme culture! Part Pepe, part Kitty, 100% adorable chaos.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-stretch">
                {/* NFT Preview Card */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl overflow-hidden backdrop-blur-sm hover:border-pink-400 transition-colors duration-300 h-full flex flex-col">
                    <CardContent className="p-8 flex-1 flex flex-col justify-center">
                        <div className="relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-lime-400/20 to-pink-400/20 border-4 border-dashed border-white/30 flex items-center justify-center">
                            <img
                                src="/favicon.ico"
                                alt="Pepe Kitty NFT"
                                className="w-48 h-48 object-contain hover:animate-jackpot transition-transform"
                            />
                            <div className="absolute top-4 right-4">
                                <span className="font-bangers text-sm bg-pink-500 text-white px-3 py-1 rounded-full">
                                    RARE
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-center gap-4">
                            {["😺", "🐸", "✨", "🔥"].map((emoji, i) => (
                                <span
                                    key={i}
                                    className="text-3xl hover:scale-125 transition-transform cursor-pointer"
                                    style={{ animationDelay: `${i * 0.1}s` }}
                                >
                                    {emoji}
                                </span>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Mint Controls */}
                <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl backdrop-blur-sm h-full flex flex-col">
                    <CardContent className="p-8 space-y-6 flex-1">
                            {/* Price Display */}
                            <div className="text-center">
                                <p className="font-righteous text-white/70 text-lg mb-2">Current Price</p>
                                <div className="font-bangers text-4xl text-lime-400">
                                    {loading ? (
                                        <span className="animate-pulse">Loading...</span>
                                    ) : (
                                        <span className="animate-count-up">{mintPrice} ETH</span>
                                    )}
                                </div>
                            </div>

                            {/* Amount Selector */}
                            <div className="flex items-center justify-center gap-4">
                                <Button
                                    onClick={decrementAmount}
                                    className="w-14 h-14 rounded-full bg-pink-500 hover:bg-pink-400 text-white font-bangers text-2xl border-2 border-white/30"
                                >
                                    -
                                </Button>
                                <span className="font-bangers text-5xl text-white w-20 text-center">
                                    {mintAmount}
                                </span>
                                <Button
                                    onClick={incrementAmount}
                                    className="w-14 h-14 rounded-full bg-lime-500 hover:bg-lime-400 text-black font-bangers text-2xl border-2 border-white/30"
                                >
                                    +
                                </Button>
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

                            {/* Total */}
                            <div className="text-center border-t border-white/20 pt-4">
                                <p className="font-righteous text-white/70 text-sm">Total</p>
                                <p className="font-bangers text-2xl text-orange-400">
                                    {(parseFloat(mintPrice) * mintAmount).toFixed(6)} ETH
                                </p>
                            </div>

                            {/* Mint Button */}
                            <Button
                                onClick={handleMint}
                                disabled={isConnected && !isValidHexColor(skinColor)}
                                className="w-full py-6 rounded-2xl font-bangers text-2xl
                                    bg-gradient-to-r from-lime-500 via-green-500 to-emerald-500
                                    hover:from-lime-400 hover:via-green-400 hover:to-emerald-400
                                    text-black border-4 border-lime-300
                                    transform hover:scale-105 transition-all duration-300
                                    shadow-lg hover:shadow-lime-400/50
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                <Sparkles className="w-6 h-6 mr-2" />
                                {isConnected ? "MINT NOW!" : "CONNECT TO MINT"}
                                <Zap className="w-6 h-6 ml-2" />
                            </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-8 max-w-md mx-auto md:max-w-none md:grid-cols-6">
                {[
                    { label: "Total Supply", value: "10,000" },
                    { label: "Minted", value: "4,269" },
                    { label: "Remaining", value: "5,731" },
                ].map((stat, i) => (
                    <Card key={i} className="bg-black/30 border-2 border-white/20 rounded-xl backdrop-blur-sm md:col-span-2">
                        <CardContent className="p-4 text-center">
                            <p className="font-righteous text-white/60 text-xs">{stat.label}</p>
                            <p className="font-bangers text-xl text-lime-400">{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </Section>
    )
}
