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

    const navTextColor = isLanding ? 'text-white hover:text-white/70' : 'text-white hover:text-lime-400'

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerBg} ${
                isLanding && !isVisible ? '-translate-y-full' : 'translate-y-0'
            }`}
        >
            <div className={`py-3 flex items-center justify-between ${
                isLanding ? 'w-full px-6 md:px-16 lg:px-24' : 'max-w-7xl mx-auto px-4 w-full'
            }`}>
                {/* Logo - click to go back to landing */}
                <button
                    onClick={() => onSectionChange("landing")}
                    className="flex items-center hover:opacity-80 transition-opacity"
                >
                    <img
                        src="/fregs.svg"
                        alt="Fregs"
                        className={`rounded-full shadow-lg hover:animate-pulse-rainbow ${
                            isLanding ? 'w-20 h-20 md:w-24 md:h-24' : 'w-12 h-12 border-3 border-lime-400'
                        }`}
                    />
                </button>

                {/* Desktop Navigation */}
                <nav className={`hidden md:flex items-center ${isLanding ? 'gap-10' : 'gap-8'}`}>
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onSectionChange(item.id)}
                            className={`font-righteous transition-colors cursor-pointer ${
                                isLanding ? 'text-xl' : 'text-lg'
                            } ${
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
                    {/* Wallet Button - hidden on landing, hidden on mobile (shown in menu instead) */}
                    {!isLanding && (
                        <Button
                            onClick={handleWalletClick}
                            className="hidden md:flex font-bangers text-sm md:text-lg px-3 md:px-6 py-2 rounded-full
                                transition-all duration-300 transform hover:scale-105
                                bg-lime-500 hover:bg-lime-400 text-black border-2 border-lime-300
                                shadow-lg hover:shadow-xl"
                        >
                            <Wallet className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
                            {isConnected ? formatAddress(address) : "Connect"}
                        </Button>
                    )}

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

            {/* Mobile Menu Dropdown with Animation */}
            <div
                className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
                    mobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                } ${
                    isLanding ? 'bg-white/10 backdrop-blur-md' : 'bg-black/90 border-t border-lime-400/30'
                }`}
            >
                <nav>
                    {navItems.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            style={{
                                animationDelay: mobileMenuOpen ? `${index * 75}ms` : '0ms',
                            }}
                            className={`w-full text-left px-6 py-4 font-righteous text-xl transition-colors border-b ${
                                mobileMenuOpen ? 'animate-menu-item-bounce' : 'opacity-0 translate-x-[-30px]'
                            } ${
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
                    {/* Wallet Button in Mobile Menu - hidden on landing */}
                    {!isLanding && (
                        <button
                            onClick={() => {
                                handleWalletClick()
                                setMobileMenuOpen(false)
                            }}
                            style={{
                                animationDelay: mobileMenuOpen ? `${navItems.length * 75}ms` : '0ms',
                            }}
                            className={`w-full text-left px-6 py-4 font-righteous text-lg transition-colors flex items-center gap-3 ${
                                mobileMenuOpen ? 'animate-menu-item-bounce' : 'opacity-0 translate-x-[-30px]'
                            } ${
                                isConnected
                                    ? "text-lime-400 bg-lime-400/10"
                                    : "text-white hover:text-lime-400 hover:bg-lime-400/5"
                            }`}
                        >
                            <Wallet className="w-5 h-5" />
                            {isConnected ? formatAddress(address) : "Connect Wallet"}
                        </button>
                    )}
                </nav>
            </div>
        </header>
    )
}
