import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ADDRESS,
  FREGS_ITEMS_ADDRESS,
  SPIN_THE_WHEEL_ADDRESS,
  SLOT_MACHINE_ADDRESS,
  FREG_SHOP_ADDRESS,
  FREGS_LIQUIDITY_ADDRESS,
  FregsABI,
  FregsItemsABI,
  SpinTheWheelABI,
  SlotMachineABI,
  FregShopABI,
  FregsLiquidityABI,
} from "../config/contracts"
import { readWithFallback, getFallbackProvider, type ReadProvider } from "../lib/rpc"

export interface FeatureFlags {
  mintActive: boolean
  spinActive: boolean
  slotMachineActive: boolean
  chestOpeningActive: boolean
  liquidityActive: boolean
  shopActive: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  mintActive: false,
  spinActive: false,
  slotMachineActive: false,
  chestOpeningActive: false,
  liquidityActive: false,
  shopActive: false,
}

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000
const WALLET_ATTEMPTS_BEFORE_FALLBACK = 2

type FlagKey = keyof FeatureFlags

type FlagSpec = {
  key: FlagKey
  read: (provider: ReadProvider) => Promise<any>
  transform: (raw: any) => boolean
}

const SPECS: FlagSpec[] = [
  {
    key: "chestOpeningActive",
    read: (p) => new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, p).chestOpeningActive(),
    transform: Boolean,
  },
  {
    key: "mintActive",
    read: (p) => new Contract(FREGS_ADDRESS, FregsABI, p).mintPhase(),
    transform: (raw) => Number(raw) > 0,
  },
  {
    key: "spinActive",
    read: (p) => SPIN_THE_WHEEL_ADDRESS
      ? new Contract(SPIN_THE_WHEEL_ADDRESS, SpinTheWheelABI, p).active()
      : Promise.resolve(false),
    transform: Boolean,
  },
  {
    key: "slotMachineActive",
    read: (p) => SLOT_MACHINE_ADDRESS
      ? new Contract(SLOT_MACHINE_ADDRESS, SlotMachineABI, p).active()
      : Promise.resolve(false),
    transform: Boolean,
  },
  {
    key: "liquidityActive",
    read: (p) => FREGS_LIQUIDITY_ADDRESS
      ? new Contract(FREGS_LIQUIDITY_ADDRESS, FregsLiquidityABI, p).active()
      : Promise.resolve(false),
    transform: Boolean,
  },
  {
    key: "shopActive",
    read: (p) => FREG_SHOP_ADDRESS
      ? new Contract(FREG_SHOP_ADDRESS, FregShopABI, p).shopActive()
      : Promise.resolve(false),
    transform: Boolean,
  },
]

export function useFeatureFlags() {
  const { walletProvider } = useAppKitProvider("eip155")

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS)
  const [isLoading, setIsLoading] = useState(false)

  const retryTimerRef = useRef<number | undefined>(undefined)
  const retryDelayRef = useRef<number>(INITIAL_RETRY_DELAY_MS)
  const failureCountsRef = useRef<Map<FlagKey, number>>(new Map())

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  const fetchFlags = useCallback(async () => {
    if (!walletProvider) return

    clearRetryTimer()
    setIsLoading(true)

    const wallet = new BrowserProvider(walletProvider as any)

    const readSpec = (spec: FlagSpec) => {
      const failures = failureCountsRef.current.get(spec.key) ?? 0
      const preferFallback = failures >= WALLET_ATTEMPTS_BEFORE_FALLBACK
        && getFallbackProvider() !== null
      return readWithFallback(wallet, spec.read, preferFallback)
    }

    try {
      const results = await Promise.allSettled(SPECS.map(readSpec))

      setFlags(prev => {
        const next = { ...prev }
        SPECS.forEach((spec, i) => {
          const res = results[i]
          if (res.status === "fulfilled") {
            next[spec.key] = spec.transform(res.value)
            failureCountsRef.current.delete(spec.key)
          } else {
            failureCountsRef.current.set(
              spec.key,
              (failureCountsRef.current.get(spec.key) ?? 0) + 1,
            )
          }
        })
        return next
      })

      const failures = results.filter(r => r.status === "rejected")
      if (failures.length > 0) {
        const delay = retryDelayRef.current
        console.warn(
          `Feature flags: ${failures.length}/${results.length} calls failed, retrying in ${delay}ms`,
          failures.map(f => (f as PromiseRejectedResult).reason)
        )
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = undefined
          void fetchFlags()
        }, delay)
        retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
      } else {
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS
      }
    } catch (err) {
      console.error("Error fetching feature flags:", err)
      const delay = retryDelayRef.current
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchFlags()
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, clearRetryTimer])

  useEffect(() => {
    if (walletProvider) {
      failureCountsRef.current.clear()
      void fetchFlags()
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchFlags, walletProvider, clearRetryTimer])

  return { flags, isLoading, refetch: fetchFlags }
}
