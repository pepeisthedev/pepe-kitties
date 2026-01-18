import React from "react"
import { Button } from "./ui/button"

interface LandingSectionProps {
    onEnter: () => void
}

export default function LandingSection({ onEnter }: LandingSectionProps): React.JSX.Element {
    // Check if #fregs is in the URL to use local video
    const useLocalVideo = typeof window !== "undefined" && window.location.hash === "#fregs"

    return (
        <div className="relative h-screen w-full overflow-hidden bg-black">
            {useLocalVideo ? (
                // Local video background (when #fregs in URL)
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                >
                    <source src="https://pub-59fac2662d16414c8202fc478b0c90b7.r2.dev/landing/background-landing.MP4" type="video/mp4" />
                </video>
            ) : (
                <>
                    {/* Desktop Video Background */}
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="hidden md:block absolute inset-0 w-full h-full object-cover"
                    >
                        <source src="https://pub-59fac2662d16414c8202fc478b0c90b7.r2.dev/landing/homepage_video_build.mp4" type="video/mp4" />
                    </video>

                    {/* Mobile Video Background (9:16 aspect ratio) */}
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="md:hidden absolute inset-0 w-full h-full object-cover"
                    >
                        <source src="https://pub-59fac2662d16414c8202fc478b0c90b7.r2.dev/landing/homepage_video_build_9x16.mp4" type="video/mp4" />
                    </video>
                </>
            )}

            {/* Left side dark gradient (desktop only) */}
            <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black via-black/60 via-20% to-transparent to-40%" />

            {/* Content */}
            <div className="relative z-10 h-full flex items-end pb-12 md:pb-20">
                <div className="max-w-[348px] md:max-w-[600px] mx-6 md:mx-16 lg:mx-24 text-left">
                    {/* Title */}
                    <h1 className="text-white text-3xl md:text-[44px] font-bold tracking-tight mb-4 md:mb-8">
                        Fregs
                    </h1>

                    {/* Description */}
                    <p className="text-white/90 text-xl md:text-2xl font-medium tracking-tight mb-6 md:mb-16">
                        Born from forgotten swamps and half-remembered dreams, Freg wanders the blockchain in search of meaning. No one knows what he’s seen, but he’s definitely judging you.                    </p>

                    {/* CTA Button */}
                    <Button
                        onClick={onEnter}
                        className="px-8 py-4 md:px-12 md:py-6 rounded-full font-bangers text-xl md:text-2xl
                            bg-lime-500 hover:bg-lime-400
                            text-black
                            transition duration-200"
                    >
                        ENTER
                    </Button>
                </div>
            </div>
        </div>
    )
}
