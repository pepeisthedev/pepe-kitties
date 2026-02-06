import React from "react"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "../context/ThemeContext"

export default function ThemeToggle(): React.JSX.Element {
    const { theme, toggleTheme } = useTheme()

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full transition-all duration-300 hover:scale-110
                bg-theme-surface text-theme-primary hover:bg-theme-surface-hover"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
            {theme === "dark" ? (
                <Sun className="w-5 h-5" />
            ) : (
                <Moon className="w-5 h-5" />
            )}
        </button>
    )
}
