import React from "react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Rocket, Heart, Users, Flame } from "lucide-react"

const features = [
    {
        icon: Rocket,
        title: "TO THE MOON",
        description: "Each Pepe Kitty is your ticket to the meme economy. Diamond paws only! 💎🐾",
        color: "text-lime-400",
    },
    {
        icon: Heart,
        title: "COMMUNITY FIRST",
        description: "Join the most pawsitive community in Web3. We're all gonna make it, fren!",
        color: "text-lime-400",
    },
    {
        icon: Users,
        title: "10K UNIQUE KITTIES",
        description: "Algorithmically generated with over 200 traits. No two Pepe Kitties are alike!",
        color: "text-lime-400",
    },
    {
        icon: Flame,
        title: "RARE TRAITS",
        description: "Legendary, epic, and rare traits that make your kitty extra spicy. Much wow!",
        color: "text-lime-400",
    },
]

export default function AboutSection(): React.JSX.Element {
    return (
        <Section id="about">
            <div className="text-center mb-16">
                <h2 className="font-bangers text-5xl md:text-7xl text-lime-400 text-comic-shadow-lg mb-4">
                    🚀 WHY PEPE KITTIES? 🚀
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-white/90 max-w-2xl mx-auto">
                    Because the internet demanded the ultimate crossover. Memes + Cats = Inevitable.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-16">
                {features.map((feature, i) => (
                    <Card
                        key={i}
                        className="bg-black/40 border-4 border-lime-400 rounded-3xl backdrop-blur-sm
                            hover:border-lime-300 transition-all duration-300 hover:scale-[1.02] group"
                    >
                        <CardContent className="p-8">
                            <div className="flex items-start gap-4">
                                <div className={`p-4 rounded-2xl bg-white/10 ${feature.color} group-hover:animate-pulse-rainbow`}>
                                    <feature.icon className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className={`font-bangers text-2xl ${feature.color} mb-2`}>
                                        {feature.title}
                                    </h3>
                                    <p className="font-righteous text-white/80">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Fun Stats Banner */}
            <Card className="bg-black/40 border-4 border-lime-400 rounded-3xl backdrop-blur-sm">
                <CardContent className="p-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { value: "10K", label: "Unique NFTs", emoji: "🎨" },
                            { value: "200+", label: "Traits", emoji: "✨" },
                            { value: "∞", label: "Meme Potential", emoji: "🐸" },
                            { value: "100%", label: "Adorable", emoji: "😻" },
                        ].map((stat, i) => (
                            <div key={i} className="group">
                                <span className="text-4xl mb-2 block group-hover:animate-pulse-rainbow">
                                    {stat.emoji}
                                </span>
                                <p className="font-bangers text-4xl text-white mb-1">{stat.value}</p>
                                <p className="font-righteous text-white/60">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Coming Soon Teaser */}
            <div className="mt-16 text-center">
                <div className="inline-block px-8 py-4 bg-black/40 border-4 border-dashed border-lime-400/50 rounded-2xl">
                    <p className="font-bangers text-2xl text-lime-400 mb-2">🔮 COMING SOON 🔮</p>
                    <p className="font-righteous text-white/70">
                        Staking • Breeding • Pepe Kitty Metaverse • More Chaos!
                    </p>
                </div>
            </div>
        </Section>
    )
}
