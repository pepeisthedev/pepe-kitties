import React, { useState } from "react"
import Header from "./Header"
import LandingSection from "./LandingSection"
import MintSection from "./MintSection"
import MyKittiesSection from "./MyKittiesSection"
import UseItemsSection from "./UseItemsSection"
import TreasureChestSection from "./TreasureChestSection"
import AboutSection from "./AboutSection"
import AdminSection from "./AdminSection"
import { useIsOwner } from "../hooks"

export type SectionId = "landing" | "mint" | "my-kitties" | "use-items" | "treasure-chests" | "about" | "admin"

export default function MainPage(): React.JSX.Element {
    const [activeSection, setActiveSection] = useState<SectionId>("landing")
    const { isOwner } = useIsOwner()

    const renderSection = () => {
        switch (activeSection) {
            case "landing":
                return <LandingSection onEnter={() => setActiveSection("mint")} />
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
            case "admin":
                return isOwner ? <AdminSection /> : <MintSection />
            default:
                return <MintSection />
        }
    }

    const isLanding = activeSection === "landing"

    return (
        <div className={isLanding ? "" : "h-screen flex flex-col overflow-hidden"}>
            <Header activeSection={activeSection} onSectionChange={setActiveSection} />

            <main className={isLanding ? "" : "flex-1 overflow-hidden pt-20"}>
                {renderSection()}
            </main>
        </div>
    )
}
