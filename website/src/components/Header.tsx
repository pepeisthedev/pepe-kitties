import React, { useState } from "react"
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"
import { Button } from "./ui/button"
import { Wallet, Menu, X } from "lucide-react"
import type { SectionId } from "./MainPage"

interface HeaderProps {
    activeSection: SectionId
    onSectionChange: (section: SectionId) => void
}

const navItems: { id: SectionId; label: string }[] = [
    { id: "mint", label: "Mint" },
    { id: "my-kitties", label: "My Fregs" },
    { id: "use-items", label: "Use Items" },
    { id: "treasure-chests", label: "Chests" },
    { id: "about", label: "About" },
]

export default function Header({ activeSection, onSectionChange }: HeaderProps): React.JSX.Element {
    const { address, isConnected } = useAppKitAccount()
    const { open } = useAppKit()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const handleWalletClick = () => {
        if (!isConnected) {
            open()
        } else {
            open({ view: "Account" })
        }
    }

    const handleNavClick = (sectionId: SectionId) => {
        onSectionChange(sectionId)
        setMobileMenuOpen(false)
    }

    const formatAddress = (addr: string | undefined): string => {
        if (!addr) return ""
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-b-4 border-lime-400">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                {/* Logo - click to go back to landing */}
                <button
                    onClick={() => onSectionChange("landing")}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <img
                        src="/fregs.svg"
                        alt="Fregs"
                        className="w-12 h-12 rounded-full border-3 border-lime-400 shadow-lg hover:animate-pulse-rainbow"
                    />
                    <h1 className="font-bangers text-xl md:text-4xl text-lime-400 text-comic-shadow tracking-wider">
                        FREGS
                    </h1>
                </button>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-4">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onSectionChange(item.id)}
                            className={`font-righteous transition-colors text-sm ${
                                activeSection === item.id
                                    ? "text-lime-400"
                                    : "text-white hover:text-lime-400"
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* Mobile Menu Button + Wallet */}
                <div className="flex items-center gap-2">
                    {/* Wallet Button */}
                    <Button
                        onClick={handleWalletClick}
                        className={`
                            font-bangers text-sm md:text-lg px-3 md:px-6 py-2 rounded-full
                            transition-all duration-300 transform hover:scale-105
                            ${isConnected
                                ? "bg-lime-500 hover:bg-lime-400 text-black border-2 border-lime-300"
                                : "bg-lime-500 hover:bg-lime-400 text-black border-2 border-lime-300"
                            }
                            shadow-lg hover:shadow-xl
                        `}
                    >
                        <Wallet className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
                        {isConnected ? formatAddress(address) : "Connect"}
                    </Button>

                    {/* Hamburger Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 text-lime-400 hover:bg-lime-400/20 rounded-lg transition-colors"
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <nav className="md:hidden bg-black/90 border-t border-lime-400/30">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`w-full text-left px-6 py-4 font-righteous text-lg transition-colors border-b border-lime-400/20 ${
                                activeSection === item.id
                                    ? "text-lime-400 bg-lime-400/10"
                                    : "text-white hover:text-lime-400 hover:bg-lime-400/5"
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
            )}
        </header>
    )
}
