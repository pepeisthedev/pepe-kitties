import React from "react"
import Header from "./Header"
import MintSection from "./MintSection"
import MyKittiesSection from "./MyKittiesSection"
import ClaimItemsSection from "./ClaimItemsSection"
import UseItemsSection from "./UseItemsSection"
import TreasureChestSection from "./TreasureChestSection"
import AboutSection from "./AboutSection"

export default function MainPage(): React.JSX.Element {
    return (
        <div className="min-h-screen">
            <Header />

            {/* Hero spacer for fixed header */}
            <div className="h-20" />

            <main>
                <MintSection />
                <MyKittiesSection />
                <ClaimItemsSection />
                <UseItemsSection />
                <TreasureChestSection />
                <AboutSection />
            </main>

            {/* Footer */}
            <footer className="bg-black/50 backdrop-blur-sm border-t-4 border-lime-400/50 py-8">
                <div className="max-w-6xl mx-auto px-4 text-center">
                    <div className="flex justify-center items-center gap-3 mb-4">
                        <img
                            src="/favicon.ico"
                            alt="Pepe Kitty"
                            className="w-8 h-8 rounded-full"
                        />
                        <span className="font-bangers text-2xl text-lime-400">PEPE KITTIES</span>
                    </div>
                    <p className="font-righteous text-white/60 mb-4">
                        The most memeable NFT collection on Base 🐸🐱
                    </p>
                    <div className="flex justify-center gap-6 mb-4">
                        {["Twitter", "Discord", "OpenSea"].map((link) => (
                            <a
                                key={link}
                                href="#"
                                className="font-righteous text-white/50 hover:text-lime-400 transition-colors"
                            >
                                {link}
                            </a>
                        ))}
                    </div>
                    <p className="font-righteous text-white/40 text-sm">
                        © 2024 Pepe Kitties. All rights reserved. WAGMI! 🚀
                    </p>
                </div>
            </footer>
        </div>
    )
}
