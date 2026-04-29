import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ADDRESS,
  FREGS_ITEMS_ADDRESS,
  SPIN_THE_WHEEL_ADDRESS,
  FREG_SHOP_ADDRESS,
  FREGS_LIQUIDITY_ADDRESS,
  FregsABI,
  FregsItemsABI,
  SpinTheWheelABI,
  FregShopABI,
  FregsLiquidityABI,
} from "../config/contracts"

export interface FeatureFlags {
  mintActive: boolean
  spinActive: boolean
  chestOpeningActive: boolean
  liquidityActive: boolean
  shopActive: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  mintActive: false,
  spinActive: false,
  chestOpeningActive: false,
  liquidityActive: false,
  shopActive: false,
}

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000

export function useFeatureFlags() {
  const { walletProvider } = useAppKitProvider("eip155")

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS)
  const [isLoading, setIsLoading] = useState(false)

  const retryTimerRef = useRef<number | undefined>(undefined)
  const retryDelayRef = useRef<number>(INITIAL_RETRY_DELAY_MS)

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

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const fregs = new Contract(FREGS_ADDRESS, FregsABI, provider)
      const items = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)

      const calls: Array<() => Promise<any>> = [
        () => items.chestOpeningActive(),
        () => fregs.mintPhase(),
        SPIN_THE_WHEEL_ADDRESS
          ? () => new Contract(SPIN_THE_WHEEL_ADDRESS, SpinTheWheelABI, provider).active()
          : () => Promise.resolve(false),
        FREGS_LIQUIDITY_ADDRESS
          ? () => new Contract(FREGS_LIQUIDITY_ADDRESS, FregsLiquidityABI, provider).active()
          : () => Promise.resolve(false),
        FREG_SHOP_ADDRESS
          ? () => new Contract(FREG_SHOP_ADDRESS, FregShopABI, provider).shopActive()
          : () => Promise.resolve(false),
      ]

      const results = await Promise.allSettled(calls.map(fn => fn()))
      const [chestRes, mintPhaseRes, spinRes, liquidityRes, shopRes] = results

      setFlags(prev => ({
        chestOpeningActive:
          chestRes.status === "fulfilled" ? Boolean(chestRes.value) : prev.chestOpeningActive,
        mintActive:
          mintPhaseRes.status === "fulfilled" ? Number(mintPhaseRes.value) > 0 : prev.mintActive,
        spinActive:
          spinRes.status === "fulfilled" ? Boolean(spinRes.value) : prev.spinActive,
        liquidityActive:
          liquidityRes.status === "fulfilled" ? Boolean(liquidityRes.value) : prev.liquidityActive,
        shopActive:
          shopRes.status === "fulfilled" ? Boolean(shopRes.value) : prev.shopActive,
      }))

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
      fetchFlags()
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchFlags, walletProvider, clearRetryTimer])

  return { flags, isLoading, refetch: fetchFlags }
}
