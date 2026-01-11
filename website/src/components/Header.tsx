import React from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { Button } from "./ui/button"
import { Wallet } from "lucide-react"

export default function Header(): React.JSX.Element {
    const { address, isConnected } = useAppKitAccount()
    const { open } = useAppKit()

    const handleWalletClick = () => {
        if (!isConnected) {
            open()
        } else {
            open({ view: "Account" })
        }
    }

    const formatAddress = (addr: string | undefined): string => {
        if (!addr) return ""
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-b-4 border-lime-400">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <img
                        src="/favicon.ico"
                        alt="Pepe Kitty"
                        className="w-12 h-12 rounded-full border-3 border-lime-400 shadow-lg hover:animate-pulse-rainbow"
                    />
                    <h1 className="font-bangers text-3xl md:text-4xl text-lime-400 text-comic-shadow tracking-wider">
                        PEPE KITTIES
                    </h1>
                </div>

                {/* Navigation */}
                <nav className="hidden md:flex items-center gap-4">
                    <a href="#mint" className="font-righteous text-white hover:text-lime-400 transition-colors text-sm">
                        Mint
                    </a>
                    <a href="#my-kitties" className="font-righteous text-white hover:text-lime-400 transition-colors text-sm">
                        My Kitties
                    </a>
                    <a href="#claim-items" className="font-righteous text-white hover:text-lime-400 transition-colors text-sm">
                        Claim
                    </a>
                    <a href="#use-items" className="font-righteous text-white hover:text-lime-400 transition-colors text-sm">
                        Use Items
                    </a>
                    <a href="#treasure-chests" className="font-righteous text-white hover:text-lime-400 transition-colors text-sm">
                        Chests
                    </a>
                </nav>

                {/* Wallet Button */}
                <Button
                    onClick={handleWalletClick}
                    className={`
                        font-bangers text-lg px-6 py-2 rounded-full
                        transition-all duration-300 transform hover:scale-105
                        ${isConnected
                            ? "bg-lime-500 hover:bg-lime-400 text-black border-2 border-lime-300"
                            : "bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-400 hover:to-orange-400 text-white border-2 border-white/30"
                        }
                        shadow-lg hover:shadow-xl
                    `}
                >
                    <Wallet className="w-5 h-5 mr-2" />
                    {isConnected ? formatAddress(address) : "Connect Wallet"}
                </Button>
            </div>
        </header>
    )
}
