import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useContracts, useOwnedItems, useFregCoinBalance } from "../hooks"
import ItemCard from "./ItemCard"
import { FREGCOIN_ADDRESS } from "../config/contracts"
import { Coins, RotateCw, Ticket, X, Sparkles } from "lucide-react"

// Prize types from contract
const PRIZE_MINTPASS = 1
const PRIZE_ITEM = 2

// Wheel segment mapping — measured from the actual wheel image (clockwise from top).
// Segments are NOT equal-sized. The pointer is at 0° (top).
// To land on a segment at angle C, CSS rotation = (360 - C) % 360.
const SAFE_MARGIN = 5 // degrees from segment edge to avoid landing on a boundary
const WHEEL_SEGMENTS = [
  { startDeg: 329.24, endDeg: 384.13, centerDeg: 356.69, prize: "mintpass" as const },            // Red → MintPass
  { startDeg: 24.13,  endDeg: 78.4,   centerDeg: 51.27,  prize: "item" as const, itemType: 9 },  // Yellow → Hoodie
  { startDeg: 78.4,   endDeg: 134.3,  centerDeg: 106.35, prize: "mintpass" as const },            // Green → MintPass
  { startDeg: 134.3,  endDeg: 203.8,  centerDeg: 169.05, prize: "item" as const, itemType: 6 },  // Purple → Treasure Chest
  { startDeg: 203.8,  endDeg: 271.88, centerDeg: 237.84, prize: "mintpass" as const },            // Blue → MintPass
  { startDeg: 271.88, endDeg: 329.24, centerDeg: 300.56, prize: "item" as const, itemType: 10 }, // Purple → Frogsuit
]

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

function randomAngleInSegment(segment: typeof WHEEL_SEGMENTS[number]): number {
  // Pick a random angle within the segment, with a safe margin from edges
  const safeStart = segment.startDeg + SAFE_MARGIN
  const safeEnd = segment.endDeg - SAFE_MARGIN
  const angle = safeStart + Math.random() * (safeEnd - safeStart)
  // Normalize to 0–360
  return ((angle % 360) + 360) % 360
}

function getTargetAngleForResult(result: SpinResult): number {
  let segment: typeof WHEEL_SEGMENTS[number] | undefined

  if (result.prizeType === PRIZE_MINTPASS) {
    const mintPassSegments = WHEEL_SEGMENTS.filter(s => s.prize === "mintpass")
    segment = mintPassSegments[Math.floor(Math.random() * mintPassSegments.length)]
  } else if (result.prizeType === PRIZE_ITEM) {
    segment = WHEEL_SEGMENTS.find(s => "itemType" in s && s.itemType === result.itemType)
  }

  if (segment) {
    const wheelAngle = randomAngleInSegment(segment)
    return (360 - wheelAngle + 360) % 360
  }

  // Fallback: random position
  return Math.random() * 360
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

  // Trigger deceleration: adds extra rotations then eases to the correct segment
  const triggerDeceleration = useCallback((result: SpinResult) => {
    const currentAngle = currentAngleRef.current
    // Calculate where the wheel needs to stop (segment-aware)
    const targetOffset = getTargetAngleForResult(result)
    // Normalize current angle to 0-360
    const currentMod = ((currentAngle % 360) + 360) % 360
    // Calculate how far to rotate to reach the target, then add 3-5 extra full spins
    const extraSpins = (3 + Math.floor(Math.random() * 3)) * 360
    let delta = targetOffset - currentMod
    if (delta < 0) delta += 360
    const targetAngle = currentAngle + extraSpins + delta

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
      if (result) {
        triggerDeceleration(result)
      }

      // Refresh balance and items in the background
      Promise.all([refetchBalance(), refetchItems()])
    } catch (err: any) {
      stopAnimation()
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setSpinPhase("idle")
      } else {
        setSpinResult(null)
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
          <div className="relative w-80 h-80 md:w-100 md:h-100 mt-40 md:mt-0">
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
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={handleCloseResult}
        >
          {/* Confetti for wins */}
          <ConfettiParticles />

          {/* Modal card */}
          <div
            className="relative z-10 animate-spiral-in"
            onClick={(e) => e.stopPropagation()}
          >
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
          </div>
        </div>
      )}
    </section>
  )
}
