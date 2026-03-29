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
    "The wheel is turning...",
    "Round and round she goes...",
    "Where it stops, nobody knows...",
    "Gud Tek, Gud Freg (Not fast Tek)",
    "Feeling lucky today?",
    "The house always... wait.",
    "Come on, big money!",
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
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-24 pb-8">
        <div className="mx-auto relative z-10 max-w-6xl">
          <div className="w-full max-w-4xl mx-auto flex items-start justify-between gap-3 mt-2 md:mt-6">
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              className="self-start inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-yellow-300 bg-[#2b1237] px-3 py-2 text-sm font-righteous text-yellow-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-colors hover:bg-[#3a1849] sm:gap-3 sm:px-5 sm:py-3 sm:text-base"
            >
              <CircleHelp className="h-4 w-4 sm:h-5 sm:w-5" />
              Wheel info
            </button>

            {isConnected && (
              <Card className="w-fit shrink-0 border-2 border-yellow-300/80 bg-[#2b1237] shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
                <CardContent className="px-3 py-2 sm:px-4 sm:py-3">
                  <p className="mb-1 text-center font-bangers text-lg text-theme-primary sm:mb-3 sm:text-2xl">
                    Your Coins
                  </p>
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                    <img
                      src="/spincoin.png"
                      alt="SpinToken"
                      className="h-12 w-12 object-contain sm:h-16 sm:w-16"
                    />
                    <p className="font-bangers text-[2.1rem] leading-none text-lime-300 sm:text-[2.7rem]">
                      {displayedBalance}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

      {!isConnected ? (
        <Card className="bg-black/80 border-4 border-purple-400 rounded-3xl">
          <CardContent className="p-12 text-center">
            <p className="font-righteous text-xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Connect your wallet to spin the wheel
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-8 relative">

          {/* Spin Wheel: rotating disc + static frame overlay */}
          <div className="relative w-80 h-80 md:w-140 md:h-140 2xl:w-[44rem] 2xl:h-[44rem] mt-40 md:mt-0 2xl:mt-60">
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

          {/* Spinning message */}
          {spinPhase === "spinning" && (
            <div className="bg-black/50 rounded-xl px-6 py-2 animate-pulse">
              <p className="font-bangers text-2xl text-yellow-300 text-center">
                {SPINNING_MESSAGES[spinningMessageIndex]}
              </p>
            </div>
          )}

          {/* Spin Button */}
          <Button
            onClick={spinPhase === "result" ? handleCloseResult : handleSpin}
            disabled={isSpinning || spinPhase === "revealing"}
            className={`px-12 py-6 rounded-2xl font-bangers text-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed ${spinPhase !== "result" && !canSpin ? "cursor-default" : "hover:from-purple-500 hover:to-pink-500"}`}
          >
            {isSpinning ? (
              <>
                <RotateCw className="w-6 h-6 mr-2 animate-spin" />
                {spinPhase === "confirming" ? "Confirm..." : "Spinning..."}
              </>
            ) : spinPhase === "result" ? (
              canSpin ? "Spin Again!" : "Close"
            ) : !canSpin ? (
              "No SpinTokens"
            ) : (
              <>
                Spin (1 SpinToken)
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
