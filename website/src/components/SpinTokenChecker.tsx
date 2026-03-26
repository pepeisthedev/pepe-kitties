import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

type CheckState = "idle" | "loading" | "found" | "not-found" | "error"

export default function SpinTokenChecker() {
    const [open, setOpen] = useState(false)
    const [address, setAddress] = useState("")
    const [checkState, setCheckState] = useState<CheckState>("idle")

    const reset = () => {
        setAddress("")
        setCheckState("idle")
    }

    const handleClose = (isOpen: boolean) => {
        setOpen(isOpen)
        if (!isOpen) reset()
    }

    const handleCheck = async () => {
        const trimmed = address.trim()
        if (!trimmed) return
        setCheckState("loading")
        try {
            const res = await fetch(`/api/check-wl?address=${encodeURIComponent(trimmed)}`)
            const data = await res.json()
            setCheckState(data.found ? "found" : "not-found")
        } catch {
            setCheckState("error")
        }
    }

    return (
        <>
            <Button
                onClick={() => setOpen(true)}
                className="px-8 py-4 md:px-12 md:py-6 rounded-full font-bangers text-xl md:text-2xl text-white transition duration-200 hover:opacity-90"
                style={{ backgroundColor: "#2d6a4f" }}
            >
                Spin Token Checker
            </Button>

            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent
                    className="max-w-sm border-white/10 text-white"
                    style={{ backgroundColor: "#0a0a0a" }}
                    overlayClassName="bg-transparent"
                >
                    <DialogHeader className="text-center sm:text-center">
                        <DialogTitle className="text-xl font-bangers text-white text-center">Check address</DialogTitle>
                    </DialogHeader>

                    {checkState === "idle" || checkState === "loading" ? (
                        <div className="flex flex-col gap-4">
                            <Input
                                placeholder="0x..."
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                                disabled={checkState === "loading"}
                                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            />
                            <Button
                                onClick={handleCheck}
                                disabled={checkState === "loading" || !address.trim()}
                                className="bg-[#2d6a4f] hover:bg-[#3a8a65] text-white"
                            >
                                {checkState === "loading" ? "Checking..." : "Check"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {checkState === "found" ? (
                                <div
                                    className="rounded-lg px-4 py-5 text-center"
                                    style={{
                                        background: "radial-gradient(ellipse at center, rgba(74,222,128,0.15) 0%, transparent 70%)",
                                        boxShadow: "0 0 32px rgba(74,222,128,0.4), inset 0 0 20px rgba(74,222,128,0.08)",
                                        border: "1px solid rgba(74,222,128,0.4)",
                                    }}
                                >
                                    <p className="text-green-300 font-bangers text-2xl tracking-wide drop-shadow-[0_0_12px_rgba(74,222,128,0.8)]">
                                        You made the list!<br />Spin Tokens will be airdropped at launch.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-center text-base text-white/70 font-righteous">
                                    {checkState === "not-found"
                                        ? "This address is not on the list."
                                        : "Something went wrong. Please try again."}
                                </p>
                            )}
                            <Button
                                variant="outline"
                                onClick={reset}
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                Check another
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
