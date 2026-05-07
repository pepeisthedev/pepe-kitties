import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ITEMS_ADDRESS, FregsItemsABI } from "../config/contracts"
import { readWithFallback, getFallbackProvider } from "../lib/rpc"

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000
const WALLET_ATTEMPTS_BEFORE_FALLBACK = 2

export function useUnclaimedKitties() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [unclaimedIds, setUnclaimedIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const retryTimerRef = useRef<number | undefined>(undefined)
  const retryDelayRef = useRef<number>(INITIAL_RETRY_DELAY_MS)
  const failureCountRef = useRef(0)

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  const fetchUnclaimed = useCallback(async () => {
    clearRetryTimer()
    const requestId = ++requestIdRef.current

    if (!walletProvider || !address) {
      setUnclaimedIds([])
      return
    }

    setIsLoading(true)
    setError(null)

    const wallet = new BrowserProvider(walletProvider as any)
    const preferFallback = failureCountRef.current >= WALLET_ATTEMPTS_BEFORE_FALLBACK
      && getFallbackProvider() !== null

    try {
      const result = await readWithFallback(
        wallet,
        (provider) => new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider).getUnclaimedFregs(address),
        preferFallback,
      )

      if (requestId !== requestIdRef.current) return

      setUnclaimedIds(result.map((id: bigint) => Number(id)))
      failureCountRef.current = 0
      retryDelayRef.current = INITIAL_RETRY_DELAY_MS
    } catch (err) {
      console.error("Error fetching unclaimed fregs:", err)
      if (requestId !== requestIdRef.current) return
      failureCountRef.current += 1
      setError(err instanceof Error ? err.message : "Failed to fetch unclaimed fregs")
      const delay = retryDelayRef.current
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchUnclaimed()
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider, address, clearRetryTimer])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      failureCountRef.current = 0
      void fetchUnclaimed()
    } else {
      requestIdRef.current += 1
      clearRetryTimer()
      setUnclaimedIds([])
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchUnclaimed, isConnected, walletProvider, address, clearRetryTimer])

  return { unclaimedIds, isLoading, error, refetch: fetchUnclaimed }
}
