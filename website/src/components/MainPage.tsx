import React, { useState } from "react"
import Header from "./Header"
import LandingSection from "./LandingSection"
import MintSection from "./MintSection"
import MyKittiesSection from "./MyKittiesSection"
import ExploreSection from "./ExploreSection"
import TreasureChestSection from "./TreasureChestSection"
import SpinWheelSection from "./SpinWheelSection"
import SlotMachineSection from "./SlotMachineSection"
import ShopSection from "./ShopSection"
import AdminSection from "./AdminSection"
import { useIsOwner, useFeatureFlags } from "../hooks"

export type SectionId = "landing" | "mint" | "my-kitties" | "explore" | "treasure-chests" | "spin-wheel" | "slot-machine" | "shop" | "admin"

export default function MainPage(): React.JSX.Element {
    const [activeSection, setActiveSection] = useState<SectionId>("landing")
    const { isOwner } = useIsOwner()
    const { flags, refetch: refetchFlags } = useFeatureFlags()

    const renderSection = () => {
        switch (activeSection) {
            case "landing":
                return <LandingSection onEnter={() => setActiveSection("my-kitties")} />
            case "mint":
                return <MintSection />
            case "my-kitties":
                return <MyKittiesSection />
            case "explore":
                return <ExploreSection />
            case "treasure-chests":
                return <TreasureChestSection chestOpeningActive={flags.chestOpeningActive} />
            case "spin-wheel":
                return <SpinWheelSection spinActive={flags.spinActive} />
            case "slot-machine":
                return <SlotMachineSection slotMachineActive={flags.slotMachineActive} />
            case "shop":
                return <ShopSection />
            case "admin":
                return isOwner ? <AdminSection featureFlags={flags} onFeatureFlagsChange={refetchFlags} /> : <MintSection />
            default:
                return <MintSection />
        }
    }

    const isLanding = activeSection === "landing"
    const isFullscreen = isLanding || activeSection === "spin-wheel" || activeSection === "slot-machine"

    return (
        <div className={isLanding ? "" : "h-screen flex flex-col overflow-hidden"}>
            <Header activeSection={activeSection} onSectionChange={setActiveSection} featureFlags={flags} />

            <main className={isLanding ? "" : `flex-1 overflow-hidden ${isFullscreen ? "" : "pt-20"}`}>
                {renderSection()}
            </main>
        </div>
    )
}
