import React, { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "./ui/button"

interface LandingSectionProps {
    onEnter: () => void
}

// Social link URLs - update these with actual links
const SOCIAL_LINKS = {
    x: "https://x.com/fregsNFT",
    opensea: "https://opensea.io/collection/fregs",
    etherscan: "https://basescan.org/address/0x...",
}

const VIDEO_BASE_URL = "https://pub-59fac2662d16414c8202fc478b0c90b7.r2.dev/landing"

// Background videos that loop sequentially
const BACKGROUND_VIDEOS = [
    `${VIDEO_BASE_URL}/background-landing4.mp4`
]

// X (Twitter) Logo
function XLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    )
}

// OpenSea Logo
function OpenSeaLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 90 90" className={className} fill="currentColor">
            <path d="M45 0C20.151 0 0 20.151 0 45C0 69.849 20.151 90 45 90C69.849 90 90 69.849 90 45C90 20.151 69.858 0 45 0ZM22.203 46.512L22.392 46.206L34.101 27.891C34.272 27.63 34.677 27.657 34.803 27.945C36.756 32.328 38.448 37.782 37.656 41.175C37.323 42.57 36.396 44.46 35.352 46.206C35.217 46.458 35.073 46.701 34.911 46.935C34.839 47.043 34.713 47.106 34.578 47.106H22.545C22.221 47.106 22.032 46.756 22.203 46.512ZM74.376 52.812C74.376 52.983 74.277 53.127 74.133 53.19C73.224 53.577 70.119 55.008 68.832 56.799C65.538 61.38 63.027 67.932 57.402 67.932H33.948C25.632 67.932 18.9 61.173 18.9 52.83V52.56C18.9 52.344 19.08 52.164 19.305 52.164H32.373C32.634 52.164 32.823 52.398 32.805 52.659C32.706 53.505 32.868 54.378 33.273 55.17C34.047 56.745 35.658 57.726 37.395 57.726H43.866V52.677H37.467C37.143 52.677 36.945 52.3 37.134 52.029C37.206 51.921 37.278 51.813 37.368 51.687C37.971 50.823 38.835 49.491 39.699 47.97C40.284 46.944 40.851 45.846 41.31 44.748C41.4 44.55 41.472 44.343 41.553 44.145C41.679 43.794 41.805 43.47 41.895 43.146C41.985 42.858 42.066 42.561 42.138 42.282C42.354 41.295 42.444 40.254 42.444 39.177C42.444 38.736 42.426 38.277 42.39 37.836C42.372 37.359 42.318 36.882 42.264 36.405C42.228 36 42.156 35.604 42.084 35.19C41.985 34.632 41.859 34.083 41.715 33.534L41.67 33.345C41.562 32.949 41.472 32.571 41.355 32.175C41.013 30.987 40.626 29.826 40.212 28.728C40.068 28.305 39.906 27.9 39.744 27.495C39.495 26.838 39.237 26.235 39.006 25.659C38.892 25.416 38.796 25.191 38.691 24.957C38.565 24.678 38.439 24.399 38.313 24.138C38.223 23.94 38.115 23.751 38.043 23.562L37.26 22.095C37.152 21.888 37.341 21.645 37.566 21.708L42.21 22.95H42.228C42.237 22.95 42.237 22.95 42.246 22.95L42.849 23.121L43.515 23.31L43.866 23.409V20.367C43.866 18.792 45.117 17.514 46.665 17.514C47.439 17.514 48.141 17.829 48.645 18.351C49.149 18.873 49.464 19.575 49.464 20.367V24.615L49.968 24.759C50.013 24.777 50.058 24.795 50.103 24.822C50.247 24.912 50.454 25.047 50.706 25.227C50.913 25.38 51.138 25.569 51.417 25.776C51.966 26.199 52.632 26.739 53.343 27.369C53.559 27.558 53.766 27.747 53.955 27.945C54.873 28.809 55.89 29.817 56.844 30.96C57.105 31.275 57.366 31.599 57.627 31.941C57.888 32.292 58.167 32.634 58.401 32.976C58.716 33.426 59.067 33.894 59.355 34.38C59.49 34.596 59.643 34.821 59.769 35.037C60.147 35.667 60.462 36.315 60.768 36.963C60.894 37.242 61.02 37.548 61.119 37.845C61.416 38.619 61.641 39.402 61.776 40.185C61.821 40.356 61.848 40.545 61.866 40.716V40.761C61.92 40.995 61.938 41.247 61.956 41.508C62.028 42.327 61.992 43.146 61.839 43.974C61.776 44.298 61.695 44.604 61.605 44.928C61.515 45.243 61.416 45.576 61.29 45.891C61.038 46.539 60.741 47.187 60.381 47.799C60.264 48.024 60.12 48.267 59.976 48.492C59.814 48.735 59.652 48.969 59.508 49.185C59.31 49.464 59.094 49.761 58.878 50.022C58.689 50.301 58.482 50.58 58.257 50.832C57.945 51.219 57.651 51.579 57.339 51.921C57.168 52.128 56.979 52.344 56.781 52.533C56.592 52.758 56.385 52.956 56.205 53.145C55.911 53.451 55.671 53.694 55.449 53.91L55.017 54.315C54.936 54.387 54.828 54.432 54.72 54.432H49.464V57.726H54.243C55.314 57.726 56.331 57.339 57.132 56.628C57.402 56.385 58.653 55.269 60.12 53.577C60.174 53.514 60.246 53.469 60.327 53.451L73.965 49.599C74.214 49.527 74.376 49.752 74.376 49.995V52.812Z" />
        </svg>
    )
}

// Etherscan Logo
function EtherscanLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 293.775 293.671" className={className} fill="currentColor">
            <g>
                <path d="M61.213,139.332a10.527,10.527,0,0,1,10.472-10.47l21.2.007a10.47,10.47,0,0,1,10.467,10.467v79.509c.593-.122,1.308-.262,2.122-.418a8.728,8.728,0,0,0,7.084-8.564V112.247a10.471,10.471,0,0,1,10.469-10.471h21.2a10.469,10.469,0,0,1,10.467,10.467v90.775s1.281-.52,2.537-1.04a8.735,8.735,0,0,0,5.336-8.047V85.173a10.465,10.465,0,0,1,10.465-10.465h21.2a10.468,10.468,0,0,1,10.469,10.465v91.979a137.629,137.629,0,0,0,23.391-21.1,8.736,8.736,0,0,0,1.873-8.7,146.6,146.6,0,1,0-262.5,93.349,8.741,8.741,0,0,0,11.6,2.744c7.544-4.343,16.924-9.949,27.907-17.145a8.734,8.734,0,0,0,4.1-7.408Z" />
                <path d="M60.833,241.873a146.81,146.81,0,0,0,185.472,24.4,8.732,8.732,0,0,0,3.451-9.817c-8.757-27.984-24.588-77.389-28.162-87.633a4.367,4.367,0,0,0-7.573-1.1A168.265,168.265,0,0,1,60.833,241.873Z" />
            </g>
        </svg>
    )
}

// Scroll Down Arrow
function ScrollArrow({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
    )
}

// Card component for social links - taller on desktop for organic look
function LinkCard({
    href,
    icon: Icon,
    label,
    bgColor,
    className = ""
}: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    bgColor: string
    className?: string
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${bgColor} rounded-3xl p-6 flex flex-col items-center justify-center
                w-full h-full
                hover:scale-105 transition-transform duration-300 cursor-pointer ${className}`}
        >
            <Icon className="w-10 h-10 md:w-14 md:h-14 text-black mb-3" />
            <span className="text-black font-bold text-lg md:text-2xl text-center">{label}</span>
        </a>
    )
}

// Video card component
function VideoCard({ src, href, className = "", clickable = true }: { src: string; href?: string; className?: string; clickable?: boolean }) {
    const content = (
        <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
        >
            <source src={src} type="video/mp4" />
        </video>
    )

    if (clickable && href) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-3xl overflow-hidden aspect-square hover:scale-105 transition-transform duration-300 cursor-pointer ${className}`}
            >
                {content}
            </a>
        )
    }

    return (
        <div className={`rounded-3xl overflow-hidden aspect-square ${className}`}>
            {content}
        </div>
    )
}

// Image card component
function ImageCard({ src, href, className = "", clickable = true }: { src: string; href?: string; className?: string; clickable?: boolean }) {
    const content = <img src={src} alt="Freg" className="w-full h-full object-cover" />

    if (clickable && href) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-3xl overflow-hidden aspect-square hover:scale-105 transition-transform duration-300 cursor-pointer ${className}`}
            >
                {content}
            </a>
        )
    }

    return (
        <div className={`rounded-3xl overflow-hidden aspect-square ${className}`}>
            {content}
        </div>
    )
}

export default function LandingSection({ onEnter }: LandingSectionProps): React.JSX.Element {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
    const videoRef = useRef<HTMLVideoElement>(null)
    const isSingleVideo = BACKGROUND_VIDEOS.length === 1

    const handleVideoEnded = useCallback(() => {
        if (isSingleVideo) {
            // For single video, restart it manually
            if (videoRef.current) {
                videoRef.current.currentTime = 0
                videoRef.current.play().catch(() => {
                    // Ignore play errors
                })
            }
        } else {
            // Switch to next video in sequence
            setCurrentVideoIndex((prev) => (prev + 1) % BACKGROUND_VIDEOS.length)
        }
    }, [isSingleVideo])

    // When video index changes, play the new video (only for multiple videos)
    useEffect(() => {
        if (!isSingleVideo && videoRef.current) {
            videoRef.current.load()
            videoRef.current.play().catch(() => {
                // Ignore play errors
            })
        }
    }, [currentVideoIndex, isSingleVideo])

    const scrollToCards = () => {
        document.getElementById('cards-section')?.scrollIntoView({ behavior: 'smooth' })
    }

    return (
        <div className="relative w-full bg-black">
            {/* Hero Section - shorter on mobile to show more of wide video */}
            <div className="relative h-[100vh] md:h-screen w-full overflow-hidden">
                {/* Background Video */}
                <video
                    ref={videoRef}
                    autoPlay
                    loop={isSingleVideo}
                    muted
                    playsInline
                    onEnded={!isSingleVideo ? handleVideoEnded : undefined}
                    className="absolute inset-0 w-full h-full object-cover"
                >
                    <source src={BACKGROUND_VIDEOS[currentVideoIndex]} type="video/mp4" />
                </video>


                {/* Content */}
                <div className="relative z-10 h-full flex items-end pb-24 md:pb-32">
                    <div className="max-w-[348px] md:max-w-[600px] mx-6 md:mx-16 lg:mx-24 text-left">
                        {/* Title */}
                        <h1 className="text-white text-3xl md:text-[44px] font-bold tracking-tight mb-4 md:mb-8">
                            Fregs
                        </h1>

                        {/* Description */}
                        <p className="text-white/90 text-xl md:text-2xl font-medium tracking-tight mb-6 md:mb-16">
                            Born from forgotten swamps and half-remembered dreams, Freg wanders the blockchain in search of meaning. No one knows what he's seen, but he's definitely judging you.
                        </p>

                        {/* CTA Button */}
                        <Button
                            onClick={onEnter}
                            className="px-8 py-4 md:px-12 md:py-6 rounded-full font-bangers text-xl md:text-2xl
                                text-white
                                transition duration-200 hover:opacity-90"
                            style={{ backgroundColor: '#7CB342' }}
                        >
                            ENTER
                        </Button>
                    </div>
                </div>

                {/* Scroll Down Arrow */}
                <button
                    onClick={scrollToCards}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 animate-bounce"
                    aria-label="Scroll down"
                >
                    <ScrollArrow className="w-10 h-10 text-white/80 hover:text-black transition-colors cursor-pointer" />
                </button>
            </div>

            {/* Cards Section */}
            <div
                id="cards-section"
                className="w-full py-16 md:py-24 px-6 md:px-16 lg:px-24"
                style={{ background: 'linear-gradient(135deg, #134e4a 0%, #064e3b 25%, #14532d 50%, #1a2e05 100%)' }}
            >
                <div className="max-w-6xl mx-auto">
                    {/* Mobile Layout: 2 columns staggered masonry */}
                    <div
                        className="grid grid-cols-2 gap-4 md:hidden"
                        style={{
                            gridTemplateRows: 'repeat(8, 80px)'
                        }}
                    >
                        {/* Left column: DoodleFreg tall (rows 1-3), OpenSea square (rows 4-5), HoodieFreg tall (rows 6-8) */}
                        <div style={{ gridColumn: 1, gridRow: '1 / 4' }}>
                            <VideoCard
                                src={`${VIDEO_BASE_URL}/DoodleFreg.MOV`}
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>
                        <div style={{ gridColumn: 1, gridRow: '4 / 6' }}>
                            <LinkCard
                                href={SOCIAL_LINKS.opensea}
                                icon={OpenSeaLogo}
                                label="OpenSea"
                                bgColor="bg-emerald-400"
                            />
                        </div>
                        <div style={{ gridColumn: 1, gridRow: '6 / 9' }}>
                            <VideoCard
                                src={`${VIDEO_BASE_URL}/HoodieFreg.MOV`}
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>

                        {/* Right column: X square (rows 1-2), freg1 tall (rows 3-5), Etherscan square (rows 6-7) */}
                        <div style={{ gridColumn: 2, gridRow: '1 / 3' }}>
                            <LinkCard
                                href={SOCIAL_LINKS.x}
                                icon={XLogo}
                                label="Follow on X"
                                bgColor="bg-lime-400"
                            />
                        </div>
                        <div style={{ gridColumn: 2, gridRow: '3 / 6' }}>
                            <ImageCard
                                src="/frogz/freg1.png"
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>
                        <div style={{ gridColumn: 2, gridRow: '6 / 9' }}>
                            <LinkCard
                                href={SOCIAL_LINKS.etherscan}
                                icon={EtherscanLogo}
                                label="Etherscan"
                                bgColor="bg-teal-400"
                            />
                        </div>
                    </div>

                    {/* Desktop Layout: 3 columns with organic masonry-like arrangement */}
                    <div
                        className="hidden md:grid gap-6"
                        style={{
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gridTemplateRows: 'repeat(5, 140px)'
                        }}
                    >
                        {/* Column 1: DoodleFreg (rows 1-3), OpenSea (rows 4-5) */}
                        <div className="col-start-1" style={{ gridRow: '1 / 4' }}>
                            <VideoCard
                                src={`${VIDEO_BASE_URL}/DoodleFreg.MOV`}
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>
                        <div className="col-start-1" style={{ gridRow: '4 / 6' }}>
                            <a
                                href={SOCIAL_LINKS.opensea}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-emerald-400 rounded-3xl p-6 flex flex-col items-center justify-center w-full h-full
                                    hover:scale-105 transition-transform duration-300 cursor-pointer"
                            >
                                <OpenSeaLogo className="w-14 h-14 text-black mb-3" />
                                <span className="text-black font-bold text-2xl text-center">OpenSea</span>
                            </a>
                        </div>

                        {/* Column 2: X (rows 1-2), HoodieFreg (rows 3-5) */}
                        <div className="col-start-2" style={{ gridRow: '1 / 3' }}>
                            <a
                                href={SOCIAL_LINKS.x}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-lime-400 rounded-3xl p-6 flex flex-col items-center justify-center w-full h-full
                                    hover:scale-105 transition-transform duration-300 cursor-pointer"
                            >
                                <XLogo className="w-14 h-14 text-black mb-3" />
                                <span className="text-black font-bold text-2xl text-center">Follow on X</span>
                            </a>
                        </div>
                        <div className="col-start-2" style={{ gridRow: '3 / 6' }}>
                            <VideoCard
                                src={`${VIDEO_BASE_URL}/HoodieFreg.MOV`}
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>

                        {/* Column 3: freg1.png (rows 1-3), Etherscan (rows 4-5) */}
                        <div className="col-start-3" style={{ gridRow: '1 / 4' }}>
                            <ImageCard
                                src="/frogz/freg1.png"
                                clickable={false}
                                className="w-full h-full !aspect-auto"
                            />
                        </div>
                        <div className="col-start-3" style={{ gridRow: '4 / 6' }}>
                            <a
                                href={SOCIAL_LINKS.etherscan}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-teal-400 rounded-3xl p-6 flex flex-col items-center justify-center w-full h-full
                                    hover:scale-105 transition-transform duration-300 cursor-pointer"
                            >
                                <EtherscanLogo className="w-14 h-14 text-black mb-3" />
                                <span className="text-black font-bold text-2xl text-center">Etherscan</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
