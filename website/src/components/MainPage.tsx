import React, { useState } from "react"
import Header from "./Header"
import LandingSection from "./LandingSection"
import MintSection from "./MintSection"
import MyKittiesSection from "./MyKittiesSection"
import UseItemsSection from "./UseItemsSection"
import TreasureChestSection from "./TreasureChestSection"
import SpinWheelSection from "./SpinWheelSection"
import AdminSection from "./AdminSection"
import { useIsOwner } from "../hooks"

export type SectionId = "landing" | "mint" | "my-kitties" | "use-items" | "treasure-chests" | "spin-wheel" | "admin"

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
            case "spin-wheel":
                return <SpinWheelSection />
            case "admin":
                return isOwner ? <AdminSection /> : <MintSection />
            default:
                return <MintSection />
        }
    }

    const isLanding = activeSection === "landing"
    const isFullscreen = isLanding || activeSection === "spin-wheel"

    return (
        <div className={isLanding ? "" : "h-screen flex flex-col overflow-hidden"}>
            <Header activeSection={activeSection} onSectionChange={setActiveSection} />

            <main className={isLanding ? "" : `flex-1 overflow-hidden ${isFullscreen ? "" : "pt-20"}`}>
                {renderSection()}
            </main>
        </div>
    )
}
