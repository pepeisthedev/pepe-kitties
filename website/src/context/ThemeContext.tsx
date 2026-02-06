import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from "react"

type Theme = "light" | "dark"

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Set theme immediately to prevent flash
const getInitialTheme = (): Theme => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem("freg-theme")
        if (saved === "light" || saved === "dark") return saved
    }
    return "dark"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(getInitialTheme)

    // Use layout effect to set theme before paint
    useLayoutEffect(() => {
        document.documentElement.setAttribute("data-theme", theme)
    }, [theme])

    useEffect(() => {
        localStorage.setItem("freg-theme", theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme((prev) => (prev === "dark" ? "light" : "dark"))
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider")
    }
    return context
}
