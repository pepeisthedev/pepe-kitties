import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { useContracts, useOwnedItems, useSpinTokenBalance } from "../hooks"
import { waitForEvent } from "../lib/waitForEvent"
import { readBufferedGasAwareVrfFee } from "../lib/vrfFee"
import ItemCard from "./ItemCard"
import { ITEM_TYPE_NAMES, ITEM_TYPES, SPIN_THE_WHEEL_ADDRESS } from "../config/contracts"
import { CircleHelp, RotateCw, X } from "lucide-react"

// Prize types from contract
const PRIZE_MINTPASS = 1
const PRIZE_ITEM = 2
const SPIN_COST = 1

const SPINNING_MESSAGES = [
    "What happens in Freg Vegas, stays in Freg vegas...",
    "The wheel is turning...",
    "Round and round she goes...",
    "Where it stops, nobody knows...",
    "Too weird to live, and too rare to die",
    "Gud Tek, Not fast Tek...",
    "Feeling lucky today?",
    "Come on, big money!",
    "The house always... wait.",
    "Stars aligning...",
]

type PrizeInfoEntry = {
  key: string
  label: string
  percentage: number
  description: string
}

const FALLBACK_PRIZE_INFO: PrizeInfoEntry[] = [
{
  key: "mintpass",
  label: "Mint Pass",
  percentage: 78,
  description: "An ERC1155 token that grants access to mint a Freg in the whitelist phase."
},
{
  key: "chest",
  label: "Treasure Chest",
  percentage: 20,
  description: "Can be burned later to claim $FREG tokens."
},
{
  key: "hoodie",
  label: "Hoodie",
  percentage: 1,
  description: "Lets you equip a hoodie trait on your Freg."
},
{
  key: "frogsuit",
  label: "Frogsuit",
  percentage: 1,
  description: "Lets you equip a frog suit trait on your Freg."
}
]

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
const SPIN_SPEED = 540 // degrees per second during spin
const DECELERATE_DURATION = 3500 // ms for the slowdown to target segment
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

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

function buildPrizeInfoEntries(
  loseWeight: number,
  mintPassWeight: number,
  itemWeights: Map<number, number>
): PrizeInfoEntry[] {
  const totalWeight = loseWeight + mintPassWeight + Array.from(itemWeights.values()).reduce((sum, value) => sum + value, 0)
  if (totalWeight <= 0) {
    return FALLBACK_PRIZE_INFO
  }

  const toPercentage = (weight: number) => (weight * 100) / totalWeight
  const entries: PrizeInfoEntry[] = []

  if (mintPassWeight > 0) {
    entries.push({
      key: "mintpass",
      label: "Mint Pass",
      percentage: toPercentage(mintPassWeight),
      description: "An ERC1155 token that grants access to mint a Freg in the whitelist phase."
    })
  }

  const preferredItemOrder = [
    ITEM_TYPES.TREASURE_CHEST,
    ITEM_TYPES.HOODIE,
    ITEM_TYPES.FROGSUIT
  ]

  const itemDescriptions: Record<number, string> = {
    [ITEM_TYPES.TREASURE_CHEST]: "Can be burned later to claim $FREG tokens.",
    [ITEM_TYPES.HOODIE]: "Lets you equip a hoodie trait on your Freg.",
    [ITEM_TYPES.FROGSUIT]: "Lets you equip a frog suit trait on your Freg."
  }

  for (const itemType of preferredItemOrder) {
    const weight = itemWeights.get(itemType) || 0
    if (weight <= 0) {
      continue
    }

    entries.push({
      key: `item-${itemType}`,
      label: ITEM_TYPE_NAMES[itemType] || `Item ${itemType}`,
      percentage: toPercentage(weight),
      description: itemDescriptions[itemType] || "A prize item from the wheel."
    })
  }

  for (const [itemType, weight] of itemWeights.entries()) {
    if (preferredItemOrder.includes(itemType) || weight <= 0) {
      continue
    }

    entries.push({
      key: `item-${itemType}`,
      label: ITEM_TYPE_NAMES[itemType] || `Item ${itemType}`,
      percentage: toPercentage(weight),
      description: "A prize item from the wheel."
    })
  }

  if (loseWeight > 0) {
    entries.push({
      key: "lose",
      label: "No Prize",
      percentage: toPercentage(loseWeight),
      description: "A losing spin."
    })
  }

  return entries
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
  const { address, isConnected } = useAppKitAccount()
  const contracts = useContracts()
  const { balance, isLoading: balanceLoading, refetch: refetchBalance } = useSpinTokenBalance()
  const { refetch: refetchItems } = useOwnedItems()

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("idle")
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfoEntry[]>(FALLBACK_PRIZE_INFO)
  const [isPrizeInfoLoading, setIsPrizeInfoLoading] = useState(false)
  const [spinningMessageIndex, setSpinningMessageIndex] = useState(0)

  useEffect(() => {
    if (spinPhase !== "spinning") {
      setSpinningMessageIndex(0)
      return
    }
    const interval = window.setInterval(() => {
      setSpinningMessageIndex(i => (i + 1) % SPINNING_MESSAGES.length)
    }, 3000)
    return () => window.clearInterval(interval)
  }, [spinPhase])

  // Wheel animation refs (decoupled from React render cycle for smooth 60fps)
  const wheelImgRef = useRef<HTMLImageElement>(null)
  const rafRef = useRef<number>()
  const currentAngleRef = useRef(0)
  const decelerateInfoRef = useRef<{
    fromAngle: number
    toAngle: number
    startTime: number
  } | null>(null)

  // If SpinTheWheel contract is not configured, don't render the section
  if (!SPIN_THE_WHEEL_ADDRESS) {
    return null
  }

  const parseSpinResultEvent = (receipt: any) => {
    const contract = contracts!.spinTheWheel!.read

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

  // Start the rAF animation loop (constant fast spin until result arrives)
  const startSpinLoop = useCallback(() => {
    decelerateInfoRef.current = null
    let lastTime = performance.now()

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000
      lastTime = time

      const decel = decelerateInfoRef.current
      if (decel) {
        // Decelerate from current speed down to stop at target
        const elapsed = time - decel.startTime
        const progress = Math.min(elapsed / DECELERATE_DURATION, 1)
        const eased = easeOutQuart(progress)
        currentAngleRef.current = decel.fromAngle + (decel.toAngle - decel.fromAngle) * eased

        if (wheelImgRef.current) {
          wheelImgRef.current.style.transform = `rotate(${currentAngleRef.current}deg)`
        }

        if (progress >= 1) {
          decelerateInfoRef.current = null
          setSpinPhase("revealing")
          return
        }
      } else {
        // Fast constant spin while waiting for tx
        currentAngleRef.current += SPIN_SPEED * dt
        if (wheelImgRef.current) {
          wheelImgRef.current.style.transform = `rotate(${currentAngleRef.current}deg)`
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // Trigger deceleration: eases from current speed to stop at the correct segment.
  // The total distance is calculated so the initial easing speed matches SPIN_SPEED,
  // preventing any visible speed jump.
  const triggerDeceleration = useCallback((result: SpinResult) => {
    const currentAngle = currentAngleRef.current
    const targetOffset = getTargetAngleForResult(result)
    const currentMod = ((currentAngle % 360) + 360) % 360

    // easeOutQuart derivative at t=0 is 4, so initial speed = 4 * totalDist / duration.
    // To match SPIN_SPEED: totalDist = SPIN_SPEED * DECELERATE_DURATION / 4000 (ms→s)
    const totalDist = (SPIN_SPEED * DECELERATE_DURATION) / 4000

    // How far to the target segment within one rotation
    let delta = targetOffset - currentMod
    if (delta < 0) delta += 360

    // Add full rotations so total distance >= totalDist
    const fullSpins = Math.ceil((totalDist - delta) / 360) * 360
    const targetAngle = currentAngle + Math.max(fullSpins, 0) + delta

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

  useEffect(() => {
    let cancelled = false

    async function loadPrizeInfo() {
      if (!contracts?.spinTheWheel?.read) {
        setPrizeInfo(FALLBACK_PRIZE_INFO)
        return
      }

      setIsPrizeInfoLoading(true)

      try {
        const [loseWeightRaw, mintPassWeightRaw, itemPrizeResult] = await Promise.all([
          contracts.spinTheWheel.read.loseWeight(),
          contracts.spinTheWheel.read.mintPassWeight(),
          contracts.spinTheWheel.read.getAllItemPrizes()
        ])

        if (cancelled) {
          return
        }

        const loseWeight = Number(loseWeightRaw)
        const mintPassWeight = Number(mintPassWeightRaw)
        const itemTypes = itemPrizeResult[0].map((value: bigint) => Number(value))
        const itemWeights = itemPrizeResult[1].map((value: bigint) => Number(value))
        const weightMap = new Map<number, number>()

        for (let index = 0; index < itemTypes.length; index += 1) {
          weightMap.set(itemTypes[index], itemWeights[index])
        }

        setPrizeInfo(buildPrizeInfoEntries(loseWeight, mintPassWeight, weightMap))
      } catch (error) {
        if (!cancelled) {
          setPrizeInfo(FALLBACK_PRIZE_INFO)
        }
      } finally {
        if (!cancelled) {
          setIsPrizeInfoLoading(false)
        }
      }
    }

    void loadPrizeInfo()

    return () => {
      cancelled = true
    }
  }, [contracts])

  const handleSpin = useCallback(async () => {
    if (!contracts || !contracts.spinTheWheel || !address || balance < SPIN_COST) return

    setSpinPhase("confirming")
    setSpinResult(null)

    try {
      const contract = await contracts.spinTheWheel.write()
      const bufferedVrfFee = await readBufferedGasAwareVrfFee(
        contracts.spinTheWheel.read,
        contracts.provider,
        "quoteSpinFee"
      )
      const tx = await contract.spin({ value: bufferedVrfFee, gasLimit: 500000n })

      // Transaction submitted - start spinning the wheel
      setSpinPhase("spinning")
      startSpinLoop()

      const receipt = await tx.wait()
      let result = parseSpinResultEvent(receipt)

      if (!result) {
        const spinEvent = await waitForEvent({
          contract: contracts.spinTheWheel.read,
          filter: contracts.spinTheWheel.read.filters.SpinResult(address),
          fromBlock: receipt.blockNumber,
        })

        result = {
          won: Boolean(spinEvent.args.won),
          prizeType: Number(spinEvent.args.prizeType),
          itemType: Number(spinEvent.args.itemType),
        }
      }

      setSpinResult(result)
      setSpinPhase("decelerating")
      triggerDeceleration(result)

      // Refresh balance and items in the background
      void Promise.all([refetchBalance(), refetchItems()])
    } catch (err: any) {
      stopAnimation()
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setSpinPhase("idle")
      } else {
        setSpinResult(null)
        setSpinPhase("result")
      }
    }
  }, [address, contracts, balance, refetchBalance, refetchItems, startSpinLoop, triggerDeceleration, stopAnimation])

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
  const canSpin = balance >= SPIN_COST
  const displayedBalance = balanceLoading ? "..." : String(balance)

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
      {/* Spinning message banner — slides down from top, covers top of wheel only */}
      <div
        className={`absolute left-0 right-0 z-30 transition-all duration-500 ease-out ${
          isSpinning ? "top-16 opacity-100" : "-top-20 opacity-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto max-w-sm px-4">
          <div className="rounded-b-2xl px-6 py-3 text-center"
            style={{
              background: "linear-gradient(180deg, #1a0a2e 0%, #2b1237 80%, #2b1237cc 100%)",
              border: "2px solid rgba(245,200,66,0.6)",
              borderTop: "none",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <p className="font-bangers text-xl md:text-2xl text-yellow-300 leading-snug">
              {spinPhase === "confirming"
                ? "Confirm in wallet..."
                : SPINNING_MESSAGES[spinningMessageIndex]}
            </p>
          </div>
        </div>
      </div>

      {/* Wheel area — scrollable, centered */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 pt-20 pb-2 relative z-10">
        {!isConnected ? (
          <Card className="bg-black/80 border-4 border-purple-400 rounded-3xl">
            <CardContent className="p-12 text-center">
              <p className="font-righteous text-xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Connect your wallet to spin the wheel
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Spin Wheel: rotating disc + static frame overlay */}
            <div className="relative w-72 h-72 sm:w-96 sm:h-96 md:w-[30rem] md:h-[30rem] lg:w-[36rem] lg:h-[36rem]">
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

          </div>
        )}
      </div>

      {/* Slot machine control bar */}
      <div className="relative z-20 flex-shrink-0"
        style={{
          background: "linear-gradient(180deg, #3d1a00 0%, #7c3a00 30%, #c47a00 60%, #e8a800 80%, #f5c842 100%)",
          borderTop: "4px solid #f5c842",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.15)",
        }}
      >
        {/* Inner ridge line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/20" />

        <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-8 md:py-4 max-w-4xl mx-auto">

          {/* Left: Info button */}
          <button
            type="button"
            onClick={() => setIsInfoOpen(true)}
            className="flex items-center justify-center w-11 h-11 md:w-13 md:h-13 rounded-full border-2 border-[#3d1a00]/60 bg-[#2b1237] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)] hover:bg-[#3a1849] transition-colors cursor-pointer"
            aria-label="Wheel info"
          >
            <CircleHelp className="h-5 w-5 md:h-6 md:w-6 text-yellow-200" />
          </button>

          {/* Center: Big spin button — always visible */}
          <div className="flex flex-col items-center -mt-8 md:-mt-10">
            <button
              onClick={spinPhase === "result" ? handleCloseResult : handleSpin}
              disabled={spinPhase === "revealing" || !isConnected || (!canSpin && spinPhase !== "result")}
              className="relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Spin the wheel"
            >
              {/* Outer ring */}
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #ff9a00 0%, #ff4500 50%, #cc2200 100%)",
                  boxShadow: "0 0 0 4px #f5c842, 0 0 0 7px #c47a00, 0 8px 24px rgba(0,0,0,0.6), inset 0 2px 6px rgba(255,255,255,0.3)",
                }}
              >
                {/* Inner button face */}
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #ff6030 0%, #cc2200 60%, #991500 100%)",
                    boxShadow: "inset 0 3px 8px rgba(255,255,255,0.25), inset 0 -3px 6px rgba(0,0,0,0.4)",
                  }}
                >
                  <span className="font-bangers text-lg md:text-xl text-white leading-tight tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {isSpinning
                      ? (spinPhase === "confirming" ? "CONFIRM" : "SPINNING")
                      : spinPhase === "result"
                        ? (canSpin ? "SPIN AGAIN" : "CLOSE")
                        : "SPIN"}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Right: Coins display */}
          <div className="flex items-center gap-1.5 rounded-full border-2 border-[#3d1a00]/60 bg-[#2b1237] px-3 py-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)]">
            <img src="/spincoin.png" alt="SpinToken" className="h-5 w-5 md:h-6 md:w-6 object-contain" />
            <span className="font-bangers text-xl md:text-2xl text-lime-300 leading-none tabular-nums">
              {isConnected ? displayedBalance : "—"}
            </span>
          </div>

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
                {spinResult.prizeType === PRIZE_ITEM && spinResult.itemType === 6 ? (
                  <div className="flex flex-col items-center">
                    <div className="w-32 h-32 mb-3 animate-float">
                      <img src="/chest.svg" alt="Treasure Chest" className="w-full h-full object-contain" />
                    </div>
                  </div>
                ) : spinResult.prizeType === PRIZE_ITEM ? (
                  <div className="inline-block rounded-2xl p-3 bg-purple-900/50 border border-purple-400/30">
                    <ItemCard
                      tokenId={0}
                      itemType={spinResult.itemType}
                      size="lg"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-32 h-32 mb-3 animate-float">
                      <img src="/Whitelist.svg" alt="Whitelist" className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="relative z-10 flex flex-col gap-3">
                {canSpin && (
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

      <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
        <DialogContent className="bg-[#12051f] border-2 border-yellow-300/60 text-white sm:max-w-xl">
          <DialogHeader className="text-left">
            <DialogTitle className="font-bangers text-4xl text-yellow-300">
              Spin The Wheel
            </DialogTitle>
            <DialogDescription className="font-righteous text-white/75 text-base leading-relaxed">
              Spin the wheel for a chance to win prizes. It costs {SPIN_COST} SpinToken to play.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
      

            <div>
              <div className="rounded-2xl border border-cyan-300/30 bg-black/25 p-4">
                <div className="mb-3 flex items-center justify-between border-b border-cyan-300/20 pb-2">
                  <p className="font-righteous text-xs uppercase tracking-[0.24em] text-cyan-100/70">Prizes</p>
                  <p className="font-righteous text-xs uppercase tracking-[0.24em] text-cyan-100/70">Odds</p>
                </div>
                <div className="space-y-3">
                  {prizeInfo.map((entry) => (
                    <div key={entry.key} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bangers text-xl text-white">{entry.label}</p>
                        <p className="font-righteous text-sm text-white/65">{entry.description}</p>
                      </div>
                      <div className="font-righteous text-2xl text-cyan-200 whitespace-nowrap tabular-nums">
                        {formatPercentage(entry.percentage)}
                      </div>
                    </div>
                  ))}
                </div>
       
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
