import React, { useState } from "react"
import Header from "./Header"
import MintSection from "./MintSection"
import MyKittiesSection from "./MyKittiesSection"
import UseItemsSection from "./UseItemsSection"
import TreasureChestSection from "./TreasureChestSection"
import AboutSection from "./AboutSection"

export type SectionId = "mint" | "my-kitties" | "use-items" | "treasure-chests" | "about"

export default function MainPage(): React.JSX.Element {
    const [activeSection, setActiveSection] = useState<SectionId>("mint")

    const renderSection = () => {
        switch (activeSection) {
            case "mint":
                return <MintSection />
            case "my-kitties":
                return <MyKittiesSection />
            case "use-items":
                return <UseItemsSection />
            case "treasure-chests":
                return <TreasureChestSection />
            case "about":
                return <AboutSection />
            default:
                return <MintSection />
        }
    }

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <Header activeSection={activeSection} onSectionChange={setActiveSection} />

            <main className="flex-1 overflow-hidden pt-20">
                {renderSection()}
            </main>
        </div>
    )
}
