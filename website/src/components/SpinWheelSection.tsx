import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useContracts, useOwnedItems, useFregCoinBalance } from "../hooks"
import ItemCard from "./ItemCard"
import { FREGCOIN_ADDRESS } from "../config/contracts"
import { Coins, RotateCw, Frown, Ticket, X, Sparkles } from "lucide-react"

// Prize types from contract
const PRIZE_NONE = 0
const PRIZE_MINTPASS = 1
const PRIZE_ITEM = 2

// Wheel animation constants
const SPIN_SPEED = 540 // degrees per second during fast spin
const DECELERATE_DURATION = 3500 // ms for the slowdown phase
const REVEAL_DELAY = 1500 // ms to show result on wheel before modal

// Easing function: fast start, slow finish
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

interface SpinResult {
  won: boolean
  prizeType: number
  itemType: number
}

type SpinPhase = "idle" | "confirming" | "spinning" | "decelerating" | "revealing" | "result"

// Confetti particle component for win celebrations
function ConfettiParticles() {
  const particles = useMemo(() => {
    const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#A855F7", "#EC4899", "#F59E0B", "#10B981"]
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 10,
      rotation: Math.random() * 360,
    }))
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute -top-4"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.size > 10 ? "50%" : "2px",
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}

// Star burst decoration behind the prize
function StarBurst() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="absolute w-full h-1 animate-star-burst opacity-0"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.6), transparent)",
            transform: `rotate(${i * 22.5}deg)`,
            animationDelay: `${0.3 + i * 0.05}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function SpinWheelSection(): React.JSX.Element | null {
  const { isConnected } = useAppKitAccount()
  const contracts = useContracts()
  const { balance, isLoading: balanceLoading, refetch: refetchBalance } = useFregCoinBalance()
  const { refetch: refetchItems } = useOwnedItems()

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("idle")
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)

  // Wheel animation refs (decoupled from React render cycle for smooth 60fps)
  const wheelImgRef = useRef<HTMLImageElement>(null)
  const rafRef = useRef<number>()
  const currentAngleRef = useRef(0)
  const decelerateInfoRef = useRef<{
    fromAngle: number
    toAngle: number
    startTime: number
  } | null>(null)

  // If FregCoin contract is not configured, don't render the section
  if (!FREGCOIN_ADDRESS) {
    return null
  }

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

  // Start the rAF animation loop (fast constant spin)
  const startSpinLoop = useCallback(() => {
    decelerateInfoRef.current = null
    let lastTime = performance.now()

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000
      lastTime = time

      const decel = decelerateInfoRef.current
      if (decel) {
        // Decelerating to target angle
        const elapsed = time - decel.startTime
        const progress = Math.min(elapsed / DECELERATE_DURATION, 1)
        const eased = easeOutQuart(progress)
        currentAngleRef.current = decel.fromAngle + (decel.toAngle - decel.fromAngle) * eased

        if (wheelImgRef.current) {
          wheelImgRef.current.style.transform = `rotate(${currentAngleRef.current}deg)`
        }

        if (progress >= 1) {
          // Deceleration complete - wheel has stopped
          decelerateInfoRef.current = null
          setSpinPhase("revealing")
          return
        }
      } else {
        // Fast constant spin
        currentAngleRef.current += SPIN_SPEED * dt
        if (wheelImgRef.current) {
          wheelImgRef.current.style.transform = `rotate(${currentAngleRef.current}deg)`
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // Trigger deceleration: adds extra rotations then eases to a stop
  const triggerDeceleration = useCallback(() => {
    const currentAngle = currentAngleRef.current
    // 3-5 extra full rotations + random stop position
    const extraSpins = (3 + Math.random() * 2) * 360
    const randomOffset = Math.random() * 360
    const targetAngle = currentAngle + extraSpins + randomOffset

    decelerateInfoRef.current = {
      fromAngle: currentAngle,
      toAngle: targetAngle,
      startTime: performance.now()
    }
  }, [])

  // Stop the animation loop
  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
    }
    decelerateInfoRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAnimation()
  }, [stopAnimation])

  const handleSpin = useCallback(async () => {
    if (!contracts || !contracts.fregCoin || balance < 1) return

    setSpinPhase("confirming")
    setSpinResult(null)

    try {
      const contract = await contracts.fregCoin.write()
      const tx = await contract.spin({ gasLimit: 500000n })

      // Transaction submitted - start spinning the wheel
      setSpinPhase("spinning")
      startSpinLoop()

      const receipt = await tx.wait()
      const result = parseSpinResultEvent(receipt)

      setSpinResult(result)

      // Trigger the slowdown — the rAF loop handles the rest
      // and will set phase to "revealing" when done
      setSpinPhase("decelerating")
      triggerDeceleration()

      // Refresh balance and items in the background
      Promise.all([refetchBalance(), refetchItems()])
    } catch (err: any) {
      stopAnimation()
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setSpinPhase("idle")
      } else {
        setSpinResult({ won: false, prizeType: PRIZE_NONE, itemType: 0 })
        setSpinPhase("result")
      }
    }
  }, [contracts, balance, refetchBalance, refetchItems, startSpinLoop, triggerDeceleration, stopAnimation])

  const handleCloseResult = () => {
    setSpinPhase("idle")
    setSpinResult(null)
  }

  // Transition from "revealing" (wheel stopped) to "result" (modal appears)
  useEffect(() => {
    if (spinPhase === "revealing") {
      const timer = setTimeout(() => setSpinPhase("result"), REVEAL_DELAY)
      return () => clearTimeout(timer)
    }
  }, [spinPhase])

  const isSpinning = spinPhase === "confirming" || spinPhase === "spinning" || spinPhase === "decelerating"

  return (
    <section
      id="spin-wheel"
      className="h-full flex flex-col relative overflow-hidden"
    >
      {/* Vegas background - covers entire section */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/vegas-bg.png')" }}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-24 pb-8">
        <div className="mx-auto relative z-10 max-w-6xl">

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

          {/* Spin Wheel: rotating disc + static frame overlay */}
          <div className="relative w-80 h-80 md:w-80 md:h-80 mt-40 md:mt-20">
            {/* Rotating wheel disc (behind the frame) */}
            <div
              ref={wheelImgRef}
              className="absolute inset-0 w-full h-full"
              style={{
                transform: `rotate(${currentAngleRef.current}deg)`,
                transformOrigin: "50% 45%",
              }}
            >
              <img
                src="/wheel14x.png"
                alt="Spin wheel disc"
                className="w-full h-full object-contain"
              />
            </div>
            {/* Static frame overlay (pointer, border, center hub, stand) */}
            <img
              src="/wheel-frame.png"
              alt="Wheel frame"
              className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
            />
          </div>

          {/* Spin Button */}
          <Button
            onClick={spinPhase === "result" ? handleCloseResult : handleSpin}
            disabled={isSpinning || spinPhase === "revealing" || (spinPhase !== "result" && balance < 1)}
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

        </div>
      )}

        </div>
      </div>

      {/* Result Modal - appears after reveal delay */}
      {spinPhase === "result" && spinResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-fade"
          style={{ backgroundColor: spinResult.won ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.6)" }}
          onClick={handleCloseResult}
        >
          {/* Confetti for wins */}
          {spinResult.won && <ConfettiParticles />}

          {/* Modal card */}
          <div
            className={`relative z-10 ${spinResult.won ? "animate-spiral-in" : "animate-spiral-in-loss"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {spinResult.won ? (
              /* === WIN MODAL === */
              <div className="relative rounded-3xl p-8 md:p-10 text-center max-w-sm mx-4 animate-prize-glow"
                style={{
                  background: "linear-gradient(135deg, #1e0533 0%, #2d1054 40%, #1a0a2e 100%)",
                  border: "3px solid rgba(255, 215, 0, 0.7)",
                }}
              >
                {/* Star burst behind content */}
                <StarBurst />

                {/* Close button */}
                <button
                  onClick={handleCloseResult}
                  className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors z-20"
                >
                  <X className="w-6 h-6" />
                </button>

                {/* Sparkle decorations */}
                <Sparkles className="absolute top-4 left-4 w-6 h-6 text-yellow-400 animate-float" />
                <Sparkles className="absolute bottom-4 right-4 w-5 h-5 text-yellow-300 animate-float" style={{ animationDelay: "1s" }} />

                {/* Title */}
                <div className="relative z-10 mb-6">
                  <p className="font-bangers text-5xl md:text-6xl text-transparent bg-clip-text animate-shimmer"
                    style={{
                      backgroundImage: "linear-gradient(90deg, #FFD700, #FFA500, #FFD700, #FFEC8B, #FFD700)",
                      backgroundSize: "200% 100%",
                    }}
                  >
                    YOU WON!
                  </p>
                  <p className="font-righteous text-purple-300 text-sm mt-1">
                    {spinResult.prizeType === PRIZE_ITEM ? "New Item Acquired!" : "Mint Pass Earned!"}
                  </p>
                </div>

                {/* Prize display */}
                <div className="relative z-10 mb-6">
                  {spinResult.prizeType === PRIZE_ITEM ? (
                    <div className="inline-block rounded-2xl p-3 bg-purple-900/50 border border-purple-400/30">
                      <ItemCard
                        tokenId={0}
                        itemType={spinResult.itemType}
                        size="lg"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center mb-3 border-2 border-purple-400/50 animate-float">
                        <Ticket className="w-14 h-14 text-purple-200" />
                      </div>
                      <p className="font-bangers text-2xl text-white">Mint Pass</p>
                      <p className="font-righteous text-sm text-purple-300">Use it to mint a free Freg!</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="relative z-10 flex flex-col gap-3">
                  {balance > 0 && (
                    <Button
                      onClick={() => { handleCloseResult(); setTimeout(handleSpin, 100) }}
                      className="w-full px-8 py-4 rounded-2xl font-bangers text-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
                    >
                      <Coins className="w-5 h-5 mr-2" />
                      Spin Again!
                    </Button>
                  )}
                  <Button
                    onClick={handleCloseResult}
                    variant="ghost"
                    className="w-full px-8 py-3 rounded-2xl font-righteous text-base text-white/70 hover:text-white hover:bg-white/10"
                  >
                    Collect & Close
                  </Button>
                </div>
              </div>
            ) : (
              /* === LOSS MODAL === */
              <div className="relative rounded-3xl p-8 text-center max-w-xs mx-4"
                style={{
                  background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                  border: "2px solid rgba(255,255,255,0.1)",
                }}
              >
                {/* Close button */}
                <button
                  onClick={handleCloseResult}
                  className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <Frown className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="font-bangers text-3xl text-gray-300 mb-2">No Luck!</p>
                <p className="font-righteous text-base text-white/50 mb-6">Better luck next time</p>

                {balance > 0 ? (
                  <Button
                    onClick={() => { handleCloseResult(); setTimeout(handleSpin, 100) }}
                    className="w-full px-8 py-4 rounded-2xl font-bangers text-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
                  >
                    <RotateCw className="w-5 h-5 mr-2" />
                    Try Again!
                  </Button>
                ) : (
                  <Button
                    onClick={handleCloseResult}
                    className="w-full px-8 py-4 rounded-2xl font-bangers text-xl bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    Close
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
