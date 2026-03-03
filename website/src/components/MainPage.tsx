import React from "react"
import LandingSection from "./LandingSection"

export type SectionId = "landing" | "mint" | "my-kitties" | "treasure-chests" | "spin-wheel" | "admin"

export default function MainPage(): React.JSX.Element {
    return (
        <div>
            <main>
                <LandingSection />
            </main>
        </div>
    )
}
