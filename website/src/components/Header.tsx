import React, { useState, useEffect } from "react"
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
    const [isVisible, setIsVisible] = useState(true)
    const [lastScrollY, setLastScrollY] = useState(0)
    const [isAtTop, setIsAtTop] = useState(true)

    const isLanding = activeSection === "landing"

    // Scroll behavior for landing page
    useEffect(() => {
        if (!isLanding) {
            setIsVisible(true)
            return
        }

        const handleScroll = () => {
            const currentScrollY = window.scrollY
            setIsAtTop(currentScrollY < 10)

            if (currentScrollY < lastScrollY) {
                setIsVisible(true)
            } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
                setIsVisible(false)
            }

            setLastScrollY(currentScrollY)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [isLanding, lastScrollY])

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

    // Dynamic styles based on landing state
    const headerBg = isLanding
        ? (isAtTop ? 'bg-transparent' : 'bg-white/10 backdrop-blur-md')
        : 'backdrop-blur-md bg-black/30 border-b-4 border-lime-400'

    const textColor = isLanding ? 'text-white' : 'text-lime-400'
    const navTextColor = isLanding ? 'text-white hover:text-white/70' : 'text-white hover:text-lime-400'

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerBg} ${
                isLanding && !isVisible ? '-translate-y-full' : 'translate-y-0'
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                {/* Logo - click to go back to landing */}
                <button
                    onClick={() => onSectionChange("landing")}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <img
                        src="/fregs.svg"
                        alt="Fregs"
                        className={`w-12 h-12 rounded-full shadow-lg hover:animate-pulse-rainbow ${
                            isLanding ? '' : 'border-3 border-lime-400'
                        }`}
                    />
                    <h1 className={`font-bangers text-xl md:text-4xl tracking-wider ${textColor} ${
                        isLanding ? '' : 'text-comic-shadow'
                    }`}>
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
                                    ? (isLanding ? "text-white font-bold" : "text-lime-400")
                                    : navTextColor
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
                            ${isLanding
                                ? "bg-white/20 hover:bg-white/30 text-white border-2 border-white/50"
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
                        className={`md:hidden p-2 rounded-lg transition-colors ${
                            isLanding
                                ? "text-white hover:bg-white/20"
                                : "text-lime-400 hover:bg-lime-400/20"
                        }`}
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <nav className={`md:hidden ${
                    isLanding ? 'bg-black/80 backdrop-blur-md' : 'bg-black/90 border-t border-lime-400/30'
                }`}>
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`w-full text-left px-6 py-4 font-righteous text-lg transition-colors border-b ${
                                isLanding ? 'border-white/20' : 'border-lime-400/20'
                            } ${
                                activeSection === item.id
                                    ? (isLanding ? "text-white bg-white/10" : "text-lime-400 bg-lime-400/10")
                                    : (isLanding ? "text-white hover:text-white/70 hover:bg-white/5" : "text-white hover:text-lime-400 hover:bg-lime-400/5")
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
