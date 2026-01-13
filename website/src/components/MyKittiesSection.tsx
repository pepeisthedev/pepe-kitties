import React from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { useOwnedKitties } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import KittyRenderer from "./KittyRenderer"

export default function MyKittiesSection(): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const { kitties, isLoading, error } = useOwnedKitties()

    return (
        <Section id="my-kitties" variant="alternate">
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-pink-400 text-comic-shadow-lg mb-4">
                    MY KITTIES
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Your collection of adorable Pepe Kitties
                </p>
            </div>

            {!isConnected ? (
                <Card className="bg-black/40 border-4 border-pink-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-white/70">
                            Connect your wallet to see your Pepe Kitties
                        </p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading your kitties..." />
                </div>
            ) : error ? (
                <Card className="bg-black/40 border-4 border-red-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-righteous text-xl text-red-400">
                            Error loading kitties: {error}
                        </p>
                    </CardContent>
                </Card>
            ) : kitties.length === 0 ? (
                <Card className="bg-black/40 border-4 border-pink-400 rounded-3xl">
                    <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-white/70 mb-4">No Kitties Yet!</p>
                        <p className="font-righteous text-lg text-white/50">
                            Mint your first Pepe Kitty above to start your collection
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {kitties.map((kitty) => (
                        <Card
                            key={kitty.tokenId}
                            className="bg-black/40 border-2 border-pink-400/50 rounded-2xl hover:border-pink-400 transition-all hover:scale-105"
                        >
                            <CardContent className="p-4">
                                <div className="aspect-square mb-3">
                                    <KittyRenderer {...kitty} size="sm" />
                                </div>
                                <p className="font-bangers text-lg text-pink-400 text-center">
                                    #{kitty.tokenId}
                                </p>
                                {kitty.specialSkin > 0 && (
                                    <p className="font-righteous text-xs text-yellow-400 text-center">
                                        {kitty.specialSkin === 1 ? "Bronze" : kitty.specialSkin === 2 ? "Silver" : "Gold"} Skin
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </Section>
    )
}
