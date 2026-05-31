import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatEther } from "ethers"
import { useAppKit, useAppKitAccount } from "@reown/appkit/react"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { useContracts, useFregCoinBalance, useOwnedItems, useOwnedKitties } from "../hooks"
import { SLOT_MACHINE_ADDRESS } from "../config/contracts"
import { waitForEvent } from "../lib/waitForEvent"
import { ArrowDownRight, CircleHelp, Coins, Lock, X } from "lucide-react"

const PRIZE_TYPE_ERC721 = 1
const PRIZE_TYPE_ERC20 = 2
const WEIGHT_DENOMINATOR = 10_000
const REEL_COUNT = 3
const STOP_DELAY_MS = 650
const RESULT_DELAY_MS = 900
const REEL_SPEEDS = [15.5, 18, 20.5]
const REEL_VISIBLE_RANGE = [-2, -1, 0, 1, 2]
const SLOT_MACHINE_IMAGE = "/slotmachine/slotmachine.png"
const SLOT_MACHINE_ARM_UP_IMAGE = "/slotmachine/slotmachine-arm-up.png"
const SLOT_MACHINE_ARM_DOWN_IMAGE = "/slotmachine/slotmachine-arm-down.png"
const REEL_WINDOW_STYLES: React.CSSProperties[] = [
  { left: "19.3%", top: "39.5%", width: "19.4%", height: "24.9%" },
  { left: "39.7%", top: "39.5%", width: "19.7%", height: "25.0%" },
  { left: "60.4%", top: "39.6%", width: "19.4%", height: "25.0%" },
]

type SlotPhase = "idle" | "approving" | "confirming" | "spinning" | "stopping" | "result"

type PrizeInfo = {
  prizeId: number
  name: string
  token: string
  prizeType: number
  weightBps: number
  erc20Amount: bigint
  active: boolean
  stock: bigint
}

type SlotResult = {
  requestId: bigint
  won: boolean
  prizeId: number
  prizeType: number
  prizeToken: string
  tokenId: bigint
  amount: bigint
}

type SlotSymbol = {
  key: string
  name: string
  image: string
  prizeId?: number
}

type ReelTween = {
  from: number
  to: number
  startTime: number
  duration: number
}

const NO_WIN_SYMBOL: SlotSymbol = {
  key: "no-win",
  name: "No Win",
  image: "/slotmachine/no-win.png",
}

const LOSING_SYMBOLS: SlotSymbol[] = [
  { key: "loss-no-win-1", name: "No Win", image: "/slotmachine/no-win.png" },
  { key: "loss-no-win-2", name: "No Win", image: "/slotmachine/no-win2.png" },
]

const DEFAULT_SYMBOLS: SlotSymbol[] = LOSING_SYMBOLS

const STATUS_TEXT: Record<SlotPhase, string> = {
  idle: "Pull",
  approving: "Approve $FREG",
  confirming: "Confirm Spin",
  spinning: "",
  stopping: "",
  result: "",
}

let persistedReelOffsets = [0, 1, 2]
let persistedSpinCost = 0n
let persistedPrizes: PrizeInfo[] = []
let persistedLoseWeightBps = WEIGHT_DENOMINATOR
let persistedEffectiveWinWeightBps = 0

function getPrizeImage(name: string, prizeType: number): string {
  const normalized = name.toLowerCase()

  if (normalized.includes("godzilla")) return "/items/godzilla.svg"
  if (normalized.includes("bull")) return "/items/bull.svg"
  if (normalized.includes("shiba")) return "/items/shibainu.svg"
  if (normalized.includes("freg")) return "/fregs.svg"
  if (prizeType === PRIZE_TYPE_ERC20) return "/coin.svg"

  return "/items/placeholder.svg"
}

function formatFregAmount(value: bigint): string {
  const numeric = Number(formatEther(value))
  if (!Number.isFinite(numeric)) return formatEther(value)
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(2)}B`
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(0)}M`
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatPercent(weightBps: number): string {
  const percentage = weightBps / 100
  return Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(2)}%`
}

function getRandomSymbol(symbols: SlotSymbol[]): SlotSymbol {
  return symbols[Math.floor(Math.random() * symbols.length)] || NO_WIN_SYMBOL
}

function normalizeIndex(index: number, length: number): number {
  return ((index % length) + length) % length
}

function getAlignedStopOffset(currentOffset: number, targetIndex: number, symbolCount: number, minCycles: number): number {
  const currentMod = normalizeIndex(currentOffset, symbolCount)
  let delta = targetIndex - currentMod
  if (delta < 0) delta += symbolCount
  return currentOffset + delta + minCycles * symbolCount
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function getLosingSymbols(availableSymbols: SlotSymbol[]): SlotSymbol[] {
  const available = availableSymbols.length > 1 ? availableSymbols : DEFAULT_SYMBOLS
  const result = Array.from({ length: REEL_COUNT }, () => getRandomSymbol(available))
  const hasNoWinSymbol = result.some(symbol => LOSING_SYMBOLS.some(noWinSymbol => noWinSymbol.key === symbol.key))

  if (!hasNoWinSymbol) {
    result[Math.floor(Math.random() * REEL_COUNT)] = getRandomSymbol(LOSING_SYMBOLS)
  }

  if (result.every(symbol => symbol.key === result[0].key)) {
    const replacement = available.find(symbol => symbol.key !== result[0].key) ||
      LOSING_SYMBOLS.find(symbol => symbol.key !== result[0].key) ||
      NO_WIN_SYMBOL
    result[REEL_COUNT - 1] = replacement
  }

  return result
}

function parseReceiptEvents(receipt: any, contract: any) {
  let requestId: bigint | null = null
  let result: SlotResult | null = null

  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      })

      if (parsed?.name === "SpinRequested") {
        requestId = BigInt(parsed.args.requestId)
      }

      if (parsed?.name === "SpinResult") {
        result = {
          requestId: BigInt(parsed.args.requestId),
          won: Boolean(parsed.args.won),
          prizeId: Number(parsed.args.prizeId),
          prizeType: Number(parsed.args.prizeType),
          prizeToken: String(parsed.args.prizeToken),
          tokenId: BigInt(parsed.args.tokenId),
          amount: BigInt(parsed.args.amount),
        }
      }
    } catch {
      // Ignore logs from other contracts in the same transaction.
    }
  }

  return { requestId, result }
}

function getErrorMessage(err: any): string {
  return err?.reason || err?.shortMessage || err?.message || "Transaction failed"
}

interface ReelCylinderProps {
  symbols: SlotSymbol[]
  offset: number
  stopped: boolean
}

function ReelCylinder({ symbols, offset, stopped }: ReelCylinderProps) {
  const symbolCount = Math.max(symbols.length, 1)
  const baseIndex = Math.floor(offset)
  const fractionalOffset = offset - baseIndex

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-[#08070a] shadow-[inset_0_12px_28px_rgba(0,0,0,0.82)] [perspective:680px]">
      <div className="absolute inset-x-0 top-0 z-20 h-1/3 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 z-20 h-1/3 bg-gradient-to-t from-black/65 via-black/25 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 left-0 z-20 w-1/5 bg-gradient-to-r from-black/45 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 z-20 w-1/5 bg-gradient-to-l from-black/45 to-transparent pointer-events-none" />
      <div className="absolute left-1 right-1 top-1/2 z-10 h-[45%] -translate-y-1/2 rounded-md border-y border-yellow-200/45 bg-white/8 shadow-[0_0_18px_rgba(245,200,66,0.18)] pointer-events-none" />

      {REEL_VISIBLE_RANGE.map((slotOffset) => {
        const position = slotOffset - fractionalOffset
        const symbol = symbols[normalizeIndex(baseIndex + slotOffset, symbolCount)] || NO_WIN_SYMBOL
        const distance = Math.abs(position)
        const scale = Math.max(0.62, 1 - distance * 0.12)
        const scaleY = Math.max(0.46, 1 - distance * 0.2)
        const opacity = Math.max(0.2, 1 - distance * 0.22)
        const brightness = Math.max(0.54, 1 - distance * 0.14)
        const blur = stopped ? 0 : Math.min(distance * 0.45, 0.9)
        const zIndex = Math.round(20 - distance * 4)

        return (
          <div
            key={slotOffset}
            className="absolute left-1/2 top-1/2 flex h-[43%] w-[82%] items-center justify-center rounded-md bg-white p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.35)] [backface-visibility:hidden] sm:p-2 md:p-3"
            style={{
              opacity,
              zIndex,
              filter: `brightness(${brightness}) blur(${blur}px)`,
              transform: [
                "translate(-50%, -50%)",
                `translateY(${position * 70}%)`,
                `rotateX(${position * -31}deg)`,
                `scale(${scale})`,
                `scaleY(${scaleY})`,
                `skewX(${position * -1.8}deg)`,
              ].join(" "),
              transformOrigin: "50% 50%",
            }}
          >
            <img
              src={symbol.image}
              alt={symbol.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
        )
      })}
    </div>
  )
}

interface SlotMachineSectionProps {
  slotMachineActive: boolean
}

export default function SlotMachineSection({ slotMachineActive }: SlotMachineSectionProps): React.JSX.Element | null {
  const { address, isConnected } = useAppKitAccount()
  const { open } = useAppKit()
  const contracts = useContracts()
  const { balance: fregBalance, isLoading: balanceLoading, refetch: refetchFregBalance } = useFregCoinBalance()
  const { refetch: refetchItems } = useOwnedItems()
  const { refetch: refetchKitties } = useOwnedKitties()

  const [slotPhase, setSlotPhase] = useState<SlotPhase>("idle")
  const [spinCost, setSpinCost] = useState<bigint>(() => persistedSpinCost)
  const [prizes, setPrizes] = useState<PrizeInfo[]>(() => [...persistedPrizes])
  const [loseWeightBps, setLoseWeightBps] = useState(() => persistedLoseWeightBps)
  const [effectiveWinWeightBps, setEffectiveWinWeightBps] = useState(() => persistedEffectiveWinWeightBps)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [slotResult, setSlotResult] = useState<SlotResult | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isPrizeInfoLoading, setIsPrizeInfoLoading] = useState(false)
  const [armPulled, setArmPulled] = useState(false)
  const [hasPulledThisVisit, setHasPulledThisVisit] = useState(false)
  const [reelOffsets, setReelOffsets] = useState<number[]>(() => [...persistedReelOffsets])
  const [stoppedReels, setStoppedReels] = useState<boolean[]>([true, true, true])

  const reelAnimationRef = useRef<number>()
  const reelLastTimeRef = useRef<number>(0)
  const reelOffsetsRef = useRef<number[]>([...persistedReelOffsets])
  const reelSpinningRef = useRef<boolean[]>([false, false, false])
  const reelTweensRef = useRef<(ReelTween | null)[]>([null, null, null])
  const stopTimersRef = useRef<number[]>([])
  const resultRevealPendingRef = useRef(false)

  const symbols = useMemo(() => {
    if (prizes.length === 0) {
      return DEFAULT_SYMBOLS
    }

    return [
      ...prizes.map(prize => ({
        key: `prize-${prize.prizeId}`,
        name: prize.name,
        image: getPrizeImage(prize.name, prize.prizeType),
        prizeId: prize.prizeId,
      })),
      ...LOSING_SYMBOLS,
    ]
  }, [prizes])

  const loadSlotData = useCallback(async () => {
    if (!contracts?.slotMachine?.read) {
      return
    }

    setIsPrizeInfoLoading(true)

    try {
      const [cost, countRaw, loseWeightRaw, effectiveWinWeightRaw] = await Promise.all([
        contracts.slotMachine.read.spinCost(),
        contracts.slotMachine.read.getPrizesCount(),
        contracts.slotMachine.read.getLoseWeightBps(),
        contracts.slotMachine.read.getEffectiveWinWeightBps(),
      ])
      const count = Number(countRaw)
      const loadedPrizes: PrizeInfo[] = []

      for (let prizeId = 1; prizeId <= count; prizeId += 1) {
        const info = await contracts.slotMachine.read.getPrizeInfo(prizeId)
        loadedPrizes.push({
          prizeId,
          name: String(info[0]),
          token: String(info[1]),
          prizeType: Number(info[2]),
          weightBps: Number(info[3]),
          erc20Amount: BigInt(info[4]),
          active: Boolean(info[5]),
          stock: BigInt(info[6]),
        })
      }

      const nextSpinCost = BigInt(cost)
      const nextLoseWeightBps = Number(loseWeightRaw)
      const nextEffectiveWinWeightBps = Number(effectiveWinWeightRaw)

      persistedSpinCost = nextSpinCost
      persistedPrizes = loadedPrizes
      persistedLoseWeightBps = nextLoseWeightBps
      persistedEffectiveWinWeightBps = nextEffectiveWinWeightBps

      setSpinCost(nextSpinCost)
      setPrizes(loadedPrizes)
      setLoseWeightBps(nextLoseWeightBps)
      setEffectiveWinWeightBps(nextEffectiveWinWeightBps)
    } catch (error) {
      console.error("Error loading slot machine data:", error)
    } finally {
      setIsPrizeInfoLoading(false)
    }
  }, [contracts])

  const clearReelTimers = useCallback(() => {
    persistedReelOffsets = [...reelOffsetsRef.current]
    for (const timer of stopTimersRef.current) {
      window.clearTimeout(timer)
    }
    stopTimersRef.current = []
    if (reelAnimationRef.current) {
      window.cancelAnimationFrame(reelAnimationRef.current)
      reelAnimationRef.current = undefined
    }
    reelSpinningRef.current = [false, false, false]
    reelTweensRef.current = [null, null, null]
    resultRevealPendingRef.current = false
  }, [])

  const runReelAnimation = useCallback((time: number) => {
    const previous = reelLastTimeRef.current || time
    const deltaSeconds = Math.min((time - previous) / 1000, 0.05)
    reelLastTimeRef.current = time

    let hasMotion = false
    let completedStop = false
    const nextOffsets = [...reelOffsetsRef.current]

    for (let index = 0; index < REEL_COUNT; index += 1) {
      const tween = reelTweensRef.current[index]

      if (tween) {
        hasMotion = true
        const progress = Math.min((time - tween.startTime) / tween.duration, 1)
        nextOffsets[index] = tween.from + (tween.to - tween.from) * easeOutCubic(progress)

        if (progress >= 1) {
          nextOffsets[index] = tween.to
          reelTweensRef.current[index] = null
          reelSpinningRef.current[index] = false
          completedStop = true
        }
      } else if (reelSpinningRef.current[index]) {
        hasMotion = true
        nextOffsets[index] += REEL_SPEEDS[index] * deltaSeconds
      }
    }

    reelOffsetsRef.current = nextOffsets
    persistedReelOffsets = [...nextOffsets]
    setReelOffsets(nextOffsets)

    if (completedStop) {
      setStoppedReels([
        !reelSpinningRef.current[0] && reelTweensRef.current[0] === null,
        !reelSpinningRef.current[1] && reelTweensRef.current[1] === null,
        !reelSpinningRef.current[2] && reelTweensRef.current[2] === null,
      ])
    }

    const allStopped = reelSpinningRef.current.every((spinning, index) => !spinning && reelTweensRef.current[index] === null)
    if (allStopped && resultRevealPendingRef.current) {
      resultRevealPendingRef.current = false
      const resultTimer = window.setTimeout(() => setSlotPhase("result"), RESULT_DELAY_MS)
      stopTimersRef.current.push(resultTimer)
    }

    if (hasMotion || !allStopped) {
      reelAnimationRef.current = window.requestAnimationFrame(runReelAnimation)
    } else {
      reelAnimationRef.current = undefined
    }
  }, [])

  const startReels = useCallback(() => {
    clearReelTimers()
    setStoppedReels([false, false, false])
    resultRevealPendingRef.current = false
    reelSpinningRef.current = [true, true, true]
    reelTweensRef.current = [null, null, null]
    reelLastTimeRef.current = performance.now()

    reelAnimationRef.current = window.requestAnimationFrame(runReelAnimation)
  }, [clearReelTimers, runReelAnimation])

  const stopReelsForResult = useCallback((result: SlotResult, availableSymbols: SlotSymbol[]) => {
    const winningSymbol = availableSymbols.find(symbol => symbol.prizeId === result.prizeId)
    const finalSymbols = result.won && winningSymbol
      ? [winningSymbol, winningSymbol, winningSymbol]
      : getLosingSymbols(availableSymbols)

    resultRevealPendingRef.current = true

    for (let index = 0; index < REEL_COUNT; index += 1) {
      const timer = window.setTimeout(() => {
        const targetSymbol = finalSymbols[index]
        const targetIndex = Math.max(0, availableSymbols.findIndex(symbol => symbol.key === targetSymbol.key))
        const currentOffset = reelOffsetsRef.current[index]
        const targetOffset = getAlignedStopOffset(currentOffset, targetIndex, availableSymbols.length, 2 + index)

        reelTweensRef.current[index] = {
          from: currentOffset,
          to: targetOffset,
          startTime: performance.now(),
          duration: 1050 + index * 180,
        }

        if (!reelAnimationRef.current) {
          reelLastTimeRef.current = performance.now()
          reelAnimationRef.current = window.requestAnimationFrame(runReelAnimation)
        }
      }, STOP_DELAY_MS * (index + 1))
      stopTimersRef.current.push(timer)
    }
  }, [runReelAnimation])

  useEffect(() => {
    void loadSlotData()
  }, [loadSlotData])

  useEffect(() => {
    return () => clearReelTimers()
  }, [clearReelTimers])

  if (!SLOT_MACHINE_ADDRESS) {
    return null
  }

  const handlePull = async () => {
    setArmPulled(true)
    setHasPulledThisVisit(true)

    if (!isConnected) {
      open()
      setArmPulled(false)
      return
    }

    if (!contracts?.slotMachine || !contracts?.fregCoin || !address || slotPhase !== "idle") {
      setArmPulled(false)
      return
    }

    if (!slotMachineActive) {
      setSlotError("Slot machine is not active")
      setSlotPhase("result")
      setArmPulled(false)
      return
    }

    if (isPrizeInfoLoading) {
      setArmPulled(false)
      return
    }

    const noAvailablePrizes = !isPrizeInfoLoading && (prizes.length === 0 || effectiveWinWeightBps <= 0)
    if (noAvailablePrizes) {
      setSlotError("No prizes left")
      setSlotPhase("result")
      setArmPulled(false)
      return
    }

    if (spinCost <= 0n) {
      setSlotError("Spin cost is not configured")
      setSlotPhase("result")
      setArmPulled(false)
      return
    }

    if (fregBalance < spinCost) {
      setSlotError("Not enough $FREG")
      setSlotPhase("result")
      setArmPulled(false)
      return
    }

    setSlotResult(null)
    setSlotError(null)

    try {
      const slotAddress = await contracts.slotMachine.read.getAddress()
      const allowance = await contracts.fregCoin.read.allowance(address, slotAddress)

      if (BigInt(allowance) < spinCost) {
        setSlotPhase("approving")
        const fregCoinWrite = await contracts.fregCoin.write()
        const approveTx = await fregCoinWrite.approve(slotAddress, spinCost)
        await approveTx.wait()
      }

      setSlotPhase("confirming")
      const slotWrite = await contracts.slotMachine.write()
      const tx = await slotWrite.spin({ gasLimit: 650000n })

      setSlotPhase("spinning")
      startReels()

      const receipt = await tx.wait()
      setArmPulled(false)

      const parsed = parseReceiptEvents(receipt, contracts.slotMachine.read)
      let result = parsed.result

      if (!result) {
        const resultEvent = await waitForEvent({
          contract: contracts.slotMachine.read,
          filter: contracts.slotMachine.read.filters.SpinResult(address),
          fromBlock: receipt.blockNumber,
          match: (log: any) => parsed.requestId === null || BigInt(log.args.requestId) === parsed.requestId,
          timeoutMs: 180000,
        })

        result = {
          requestId: BigInt(resultEvent.args.requestId),
          won: Boolean(resultEvent.args.won),
          prizeId: Number(resultEvent.args.prizeId),
          prizeType: Number(resultEvent.args.prizeType),
          prizeToken: String(resultEvent.args.prizeToken),
          tokenId: BigInt(resultEvent.args.tokenId),
          amount: BigInt(resultEvent.args.amount),
        }
      }

      if (!result) {
        throw new Error("Missing slot machine result")
      }

      setSlotResult(result)
      setSlotPhase("stopping")
      stopReelsForResult(result, symbols)

      void Promise.all([
        refetchFregBalance(),
        refetchItems(),
        refetchKitties(),
        loadSlotData(),
      ])
    } catch (err: any) {
      clearReelTimers()
      setStoppedReels([true, true, true])

      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setSlotPhase("idle")
        setArmPulled(false)
        return
      }

      setSlotError(getErrorMessage(err))
      setSlotResult(null)
      setSlotPhase("result")
      setArmPulled(false)
    }
  }

  const handleCloseResult = () => {
    setSlotPhase("idle")
    setSlotResult(null)
    setSlotError(null)
  }

  const handlePrizeInfoOpenChange = (open: boolean) => {
    setIsInfoOpen(open)
    if (open) {
      void loadSlotData()
    }
  }

  const getPrizeStatusText = (prize: PrizeInfo) => {
    const stockText = `Stock ${prize.stock.toString()}`
    if (!prize.active) {
      return `${stockText} - inactive`
    }
    if (prize.stock === 0n) {
      return `${stockText} - resolves as no win`
    }
    return stockText
  }

  const isBusy = slotPhase === "approving" || slotPhase === "confirming" || slotPhase === "spinning" || slotPhase === "stopping"
  const slotSoldOut = slotMachineActive && !isPrizeInfoLoading && (prizes.length === 0 || effectiveWinWeightBps <= 0)
  const slotControlsDisabled = isBusy || isPrizeInfoLoading || slotSoldOut
  const canAfford = spinCost > 0n && fregBalance >= spinCost
  const displayedCost = spinCost > 0n ? formatFregAmount(spinCost) : "..."
  const displayedBalance = balanceLoading ? "..." : formatFregAmount(fregBalance)
  const resultPrize = slotResult?.won ? prizes.find(prize => prize.prizeId === slotResult.prizeId) : null
  const showLeverPrompt = !hasPulledThisVisit && !slotControlsDisabled
  const effectiveLoseWeightBps = Math.max(0, WEIGHT_DENOMINATOR - effectiveWinWeightBps)
  const statusText = isBusy ? STATUS_TEXT[slotPhase] : isPrizeInfoLoading ? "Loading" : slotSoldOut ? "Out of prizes" : canAfford ? "" : "Need $FREG"
  const actionText = !isConnected ? "Connect" : isPrizeInfoLoading ? "Loading" : slotSoldOut ? "Out of prizes" : STATUS_TEXT[slotPhase]

  return (
    <section id="slot-machine" className="relative flex h-full flex-col overflow-hidden bg-[#120815]">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
        style={{ backgroundImage: "url('/vegas-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(245,200,66,0.28),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.72))]" />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-28 pt-24">
        {!isConnected ? (
          <div className="rounded-2xl border-4 border-yellow-400 bg-black/80 p-10 text-center shadow-2xl">
            <Lock className="mx-auto mb-4 h-12 w-12 text-yellow-300" />
            <p className="mb-5 font-bangers text-3xl text-yellow-300">Connect Wallet</p>
            <Button
              onClick={() => open()}
              className="rounded-full bg-lime-500 px-8 py-3 font-bangers text-xl text-black hover:bg-lime-400"
            >
              Connect
            </Button>
          </div>
        ) : !slotMachineActive ? (
          <div className="rounded-2xl border-4 border-yellow-400 bg-black/80 p-10 text-center shadow-2xl">
            <Lock className="mx-auto mb-4 h-12 w-12 text-yellow-300" />
            <p className="font-bangers text-3xl text-yellow-300">Slots Closed</p>
          </div>
        ) : (
          <div className="relative flex w-full max-w-5xl flex-col items-center justify-center gap-3">
            <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border-2 border-yellow-300/60 bg-black/55 px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.42)]">
              <div className="flex min-w-0 items-center gap-2">
                <Coins className="h-5 w-5 shrink-0 text-lime-300" />
                <span className="truncate font-bangers text-xl text-lime-300 md:text-3xl">{displayedBalance} $FREG</span>
              </div>
              <div className="shrink-0 font-bangers text-xl text-yellow-200 md:text-3xl">
                {displayedCost} / spin
              </div>
            </div>

            <div className="relative aspect-square w-full max-w-[44rem] drop-shadow-[0_24px_60px_rgba(0,0,0,0.68)]">
              <img
                src={SLOT_MACHINE_IMAGE}
                alt="$FREG slot machine"
                className="absolute inset-0 z-10 h-full w-full select-none object-contain"
                draggable={false}
              />

              {Array.from({ length: REEL_COUNT }, (_, index) => (
                <div
                  key={index}
                  className="absolute z-20 overflow-hidden rounded-[5%]"
                  style={REEL_WINDOW_STYLES[index]}
                >
                  <ReelCylinder
                    symbols={symbols}
                    offset={reelOffsets[index] || 0}
                    stopped={stoppedReels[index]}
                  />
                </div>
              ))}

              <img
                src={armPulled ? SLOT_MACHINE_ARM_DOWN_IMAGE : SLOT_MACHINE_ARM_UP_IMAGE}
                alt=""
                className="pointer-events-none absolute inset-0 z-30 h-full w-full select-none object-contain"
                draggable={false}
                aria-hidden="true"
              />

              <button
                type="button"
                onClick={handlePull}
                disabled={slotControlsDisabled}
                className="absolute right-[4.2%] top-[34%] z-40 h-[30%] w-[10.8%] cursor-pointer rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-yellow-200/80 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                aria-label="Pull slot machine arm"
              />

              {showLeverPrompt && (
                <div className="pointer-events-none absolute right-[11%] top-[27%] z-50 flex items-center gap-2 rounded-full border-2 border-yellow-200 bg-black/75 px-4 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.5)] animate-bounce sm:right-[12%] sm:top-[29%]">
                  <span className="font-bangers text-3xl leading-none text-yellow-200 drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] sm:text-4xl">
                    Pull
                  </span>
                  <ArrowDownRight className="h-10 w-10 text-yellow-200 drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] sm:h-12 sm:w-12" />
                </div>
              )}
            </div>

            <div className="flex min-h-10 items-center justify-center">
              <p className="font-bangers text-2xl text-yellow-200 drop-shadow-[0_3px_0_rgba(0,0,0,0.8)] md:text-4xl">
                {statusText}
              </p>
            </div>
          </div>
        )}
      </div>

      <div
        className="relative z-20 flex-shrink-0"
        style={{
          background: "linear-gradient(180deg, #3d1a00 0%, #7c3a00 30%, #c47a00 65%, #e8a800 100%)",
          borderTop: "4px solid #f5c842",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.15)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
          <button
            type="button"
            onClick={() => handlePrizeInfoOpenChange(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#3d1a00]/60 bg-[#2b1237] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)] transition-colors hover:bg-[#3a1849] md:h-13 md:w-13"
            aria-label="Slot machine info"
          >
            <CircleHelp className="h-5 w-5 text-yellow-200 md:h-6 md:w-6" />
          </button>

          <Button
            onClick={handlePull}
            disabled={isBusy || (isConnected && (isPrizeInfoLoading || !slotMachineActive || slotSoldOut || spinCost <= 0n || !canAfford))}
            className="rounded-2xl bg-gradient-to-r from-lime-500 to-yellow-300 px-8 py-5 font-bangers text-2xl text-black shadow-lg hover:from-lime-400 hover:to-yellow-200 disabled:cursor-not-allowed disabled:opacity-50 md:px-14 md:text-3xl"
          >
            {actionText}
          </Button>

          <div className="flex items-center gap-1.5 rounded-full border-2 border-[#3d1a00]/60 bg-[#2b1237] px-3 py-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)]">
            <img src="/coin.svg" alt="FREG" className="h-7 w-7 object-contain md:h-9 md:w-9" />
            <span className="font-bangers text-xl leading-none text-lime-300 md:text-3xl">
              {displayedCost}
            </span>
          </div>
        </div>
      </div>

      {slotPhase === "result" && (slotResult || slotError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 animate-backdrop-fade"
          onClick={handleCloseResult}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl border-4 border-yellow-300 bg-[#1a0a2e] p-7 text-center shadow-2xl animate-spiral-in"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={handleCloseResult}
              className="absolute right-3 top-3 text-white/60 transition-colors hover:text-white"
              aria-label="Close result"
            >
              <X className="h-6 w-6" />
            </button>

            {slotError ? (
              <>
                <p className="mb-4 font-bangers text-4xl text-red-400">Spin Failed</p>
                <p className="mb-6 font-righteous text-base text-white/75">{slotError}</p>
              </>
            ) : slotResult?.won ? (
              <>
                <p className="mb-4 font-bangers text-5xl text-yellow-300">Jackpot</p>
                <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-2xl bg-white p-5 animate-prize-glow">
                  <img
                    src={getPrizeImage(resultPrize?.name || "Prize", slotResult.prizeType)}
                    alt={resultPrize?.name || "Prize"}
                    className="h-full w-full object-contain"
                  />
                </div>
                {slotResult.prizeType === PRIZE_TYPE_ERC20 ? (
                  <p className="font-bangers text-3xl text-lime-300">
                    You won {formatFregAmount(slotResult.amount)} $FREG
                  </p>
                ) : (
                  <p className="font-bangers text-3xl text-lime-300">{resultPrize?.name || "Prize"}</p>
                )}
                {slotResult.prizeType === PRIZE_TYPE_ERC721 && slotResult.tokenId >= 0n && (
                  <p className="mt-2 font-righteous text-sm text-white/65">Token #{slotResult.tokenId.toString()}</p>
                )}
              </>
            ) : (
              <>
                <p className="mb-4 font-bangers text-5xl text-white/80 ">No Win</p>
                <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-white">
                  <img src="/slotmachine/no-win-modal.png" alt="No win" className="h-full w-full object-contain rounded-2xl" />
                </div>
              </>
            )}

            <Button
              onClick={handleCloseResult}
              className="mt-6 w-full rounded-2xl bg-lime-500 py-3 font-bangers text-xl text-black hover:bg-lime-400"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isInfoOpen} onOpenChange={handlePrizeInfoOpenChange}>
        <DialogContent className="bg-[#12051f] border-2 border-yellow-300/60 text-white sm:max-w-xl">
          <DialogHeader className="text-left">
            <DialogTitle className="font-bangers text-4xl text-yellow-300">
              FREG Slot
            </DialogTitle>
            <DialogDescription className="font-righteous text-white/75 text-base leading-relaxed">
              Pull the lever for a chance to win prizes. It costs {displayedCost} $FREG to play.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-cyan-300/30 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-cyan-300/20 pb-2">
                <p className="font-righteous text-xs uppercase tracking-[0.24em] text-cyan-100/70">Prizes</p>
                <p className="font-righteous text-xs uppercase tracking-[0.24em] text-cyan-100/70">Odds</p>
              </div>

              {isPrizeInfoLoading ? (
                <p className="font-righteous text-white/70">Loading...</p>
              ) : prizes.length === 0 ? (
                <p className="font-righteous text-white/70">No prizes configured</p>
              ) : (
                <div className="space-y-3">
                  {prizes.map(prize => {
                    const prizeAvailable = prize.active && prize.stock > 0n

                    return (
                      <div key={prize.prizeId} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className={`font-bangers text-xl ${prizeAvailable ? "text-white" : "text-white/55"}`}>
                            {prize.name}
                          </p>
                          <p className="font-righteous text-sm text-white/65">
                            {getPrizeStatusText(prize)}
                          </p>
                        </div>
                        <div className={`font-righteous text-2xl whitespace-nowrap tabular-nums ${
                          prizeAvailable ? "text-cyan-200" : "text-white/45"
                        }`}>
                          {formatPercent(prize.weightBps)}
                        </div>
                      </div>
                    )
                  })}

                  <div className="flex items-start justify-between gap-4 border-t border-cyan-300/20 pt-3">
                    <div>
                      <p className="font-bangers text-xl text-white">No Win</p>
                      <p className="font-righteous text-sm text-white/65">
                        {effectiveLoseWeightBps > loseWeightBps
                          ? "Includes base no-win odds plus inactive or stocked-out prizes."
                          : "Base no-win odds."}
                      </p>
                    </div>
                    <div className="font-righteous text-2xl text-cyan-200 whitespace-nowrap tabular-nums">
                      {formatPercent(effectiveLoseWeightBps)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
