import React, { useState, useCallback, useEffect, useRef } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useContracts, useOwnedItems, useFregCoinBalance } from "../hooks"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES, FREGCOIN_ADDRESS } from "../config/contracts"
import { Coins, RotateCw, PartyPopper, Frown, Ticket } from "lucide-react"

// Prize types from contract
const PRIZE_NONE = 0
const PRIZE_MINTPASS = 1
const PRIZE_ITEM = 2

// Minimum spin duration in ms (so the wheel spins for at least this long)
const MIN_SPIN_DURATION = 3000

interface SpinResult {
  won: boolean
  prizeType: number
  itemType: number
}

type SpinPhase = "idle" | "confirming" | "spinning" | "result"

export default function SpinWheelSection(): React.JSX.Element | null {
  const { isConnected } = useAppKitAccount()
  const contracts = useContracts()
  const { balance, isLoading: balanceLoading, refetch: refetchBalance } = useFregCoinBalance()
  const { refetch: refetchItems } = useOwnedItems()

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("idle")
  const [wheelRotation, setWheelRotation] = useState(0)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const spinIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // If FregCoin contract is not configured, don't render the section
  if (!FREGCOIN_ADDRESS) {
    return null
  }

  // Continuous spin animation during confirming and spinning phases
  useEffect(() => {
    if (spinPhase === "confirming" || spinPhase === "spinning") {
      // Continuous rotation
      spinIntervalRef.current = setInterval(() => {
        setWheelRotation(prev => prev + 15)
      }, 30)
    } else {
      // Stop spinning
      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current)
        spinIntervalRef.current = null
      }
    }

    return () => {
      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current)
      }
    }
  }, [spinPhase])

  const parseSpinResultEvent = (receipt: any) => {
    const contract = contracts!.fregCoin!.read

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        })

        if (parsed?.name === "SpinResult") {
          return {
            won: parsed.args.won,
            prizeType: Number(parsed.args.prizeType),
            itemType: Number(parsed.args.itemType)
          }
        }
      } catch {
        // Not a recognized event, continue
      }
    }
    return null
  }

  const handleSpin = useCallback(async () => {
    if (!contracts || !contracts.fregCoin || balance < 1) return

    setSpinPhase("confirming")
    setSpinResult(null)

    try {
      const contract = await contracts.fregCoin.write()
      const tx = await contract.spin({ gasLimit: 500000n })

      // Transaction submitted (user confirmed) - now spinning until mined
      const spinStartTime = Date.now()
      setSpinPhase("spinning")

      const receipt = await tx.wait()

      const result = parseSpinResultEvent(receipt)

      // Ensure minimum spin duration for visual effect
      const elapsed = Date.now() - spinStartTime
      if (elapsed < MIN_SPIN_DURATION) {
        await new Promise(resolve => setTimeout(resolve, MIN_SPIN_DURATION - elapsed))
      }

      setSpinResult(result)
      setSpinPhase("result")

      // Refresh balance and items
      await Promise.all([
        refetchBalance(),
        refetchItems()
      ])
    } catch (err: any) {
      // If user rejected or error occurred
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        // User rejected - go back to idle
        setSpinPhase("idle")
      } else {
        // Other error - show as loss
        setSpinResult({ won: false, prizeType: PRIZE_NONE, itemType: 0 })
        setSpinPhase("result")
      }
    }
  }, [contracts, balance, refetchBalance, refetchItems])

  const handleCloseResult = () => {
    setSpinPhase("idle")
    setSpinResult(null)
  }

  // Wheel segments for visual display
  const segments = [
    { label: "Lose", color: "#374151", weight: 80 },
    { label: "MintPass", color: "#9333ea", weight: 10 },
    { label: "Silver", color: "#c0c0c0", weight: 5 },
    { label: "Neon", color: "#00ff00", weight: 5 },
  ]

  const isSpinning = spinPhase === "confirming" || spinPhase === "spinning"

  return (
    <Section id="spin-wheel" variant="dark">


      {/* Prize Info */}
      

      {!isConnected ? (
        <Card className="bg-black/40 border-4 border-purple-400 rounded-3xl">
          <CardContent className="p-12 text-center">
            <p className="font-righteous text-xl text-white/70">
              Connect your wallet to spin the wheel
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-8 relative">
          {/* FregCoin Balance */}
          <Card className="bg-black/40 border-2 border-yellow-400/50 rounded-2xl">
            <CardContent className="p-6 flex items-center gap-4">
              <Coins className="w-10 h-10 text-yellow-400" />
              <div>
                <p className="font-righteous text-sm text-yellow-400/70">Your FregCoins</p>
                <p className="font-bangers text-4xl text-yellow-400">
                  {balanceLoading ? "..." : balance}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Spin Wheel Visual */}
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            {/* Wheel */}
            <div
              className="w-full h-full rounded-full border-4 border-purple-400 overflow-hidden"
              style={{ transform: `rotate(${wheelRotation}deg)` }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {segments.map((segment, i) => {
                  const startAngle = segments.slice(0, i).reduce((sum, s) => sum + (s.weight / 100) * 360, 0)
                  const endAngle = startAngle + (segment.weight / 100) * 360
                  const largeArc = segment.weight > 50 ? 1 : 0

                  const startRad = (startAngle - 90) * Math.PI / 180
                  const endRad = (endAngle - 90) * Math.PI / 180

                  const x1 = 50 + 50 * Math.cos(startRad)
                  const y1 = 50 + 50 * Math.sin(startRad)
                  const x2 = 50 + 50 * Math.cos(endRad)
                  const y2 = 50 + 50 * Math.sin(endRad)

                  const path = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`

                  const midAngle = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180
                  const textX = 50 + 30 * Math.cos(midAngle)
                  const textY = 50 + 30 * Math.sin(midAngle)

                  return (
                    <g key={i}>
                      <path d={path} fill={segment.color} stroke="#1a1a2e" strokeWidth="0.5" />
                      <text
                        x={textX}
                        y={textY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="5"
                        fontWeight="bold"
                        transform={`rotate(${(startAngle + endAngle) / 2}, ${textX}, ${textY})`}
                      >
                        {segment.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2">
              <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-yellow-400 drop-shadow-lg" />
            </div>

            {/* Center circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 md:w-20 md:h-20 rounded-full bg-purple-900 border-4 border-purple-400 flex items-center justify-center">
              <span className="font-bangers text-xl text-purple-400">SPIN</span>
            </div>

            {/* Confirming overlay */}
            {spinPhase === "confirming" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 text-center">
                  <RotateCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-2" />
                  <p className="font-bangers text-lg text-white">Confirm in wallet</p>
                  <p className="font-righteous text-sm text-white/70">to spin the wheel</p>
                </div>
              </div>
            )}

            {/* Result overlay */}
            {spinPhase === "result" && spinResult && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`backdrop-blur-sm rounded-2xl px-4 py-3 text-center ${
                  spinResult.won
                    ? "bg-purple-900/90 border-2 border-yellow-400"
                    : "bg-black/80"
                }`}>
                  {spinResult.won ? (
                    <>
                      <p className="font-bangers text-sm text-yellow-400 mb-2">YOU WON!</p>
                      {spinResult.prizeType === PRIZE_ITEM ? (
                        <ItemCard
                          tokenId={0}
                          itemType={spinResult.itemType}
                          size="sm"
                        />
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 bg-purple-700 rounded-xl flex items-center justify-center mb-1">
                            <Ticket className="w-10 h-10 text-purple-300" />
                          </div>
                          <p className="font-righteous text-xs text-white">Mint Pass</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Frown className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="font-bangers text-lg text-gray-300">No Prize</p>
                      <p className="font-righteous text-sm text-white/70">Try again!</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Spin Button */}
          <Button
            onClick={spinPhase === "result" ? handleCloseResult : handleSpin}
            disabled={isSpinning || (spinPhase !== "result" && balance < 1)}
            className="px-12 py-6 rounded-2xl font-bangers text-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSpinning ? (
              <>
                <RotateCw className="w-6 h-6 mr-2 animate-spin" />
                {spinPhase === "confirming" ? "Confirm..." : "Spinning..."}
              </>
            ) : spinPhase === "result" ? (
              balance > 0 ? "Spin Again!" : "Close"
            ) : balance < 1 ? (
              "No FregCoins"
            ) : (
              <>
                <Coins className="w-6 h-6 mr-2" />
                Spin (1 FregCoin)
              </>
            )}
          </Button>

          {balance < 1 && !balanceLoading && spinPhase === "idle" && (
            <p className="font-righteous text-sm text-white/50 text-center">
              You need FregCoins to spin. Win them in giveaways or community events!
            </p>
          )}
        </div>
      )}
    </Section>
  )
}
