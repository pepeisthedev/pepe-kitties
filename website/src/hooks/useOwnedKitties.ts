import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ADDRESS, FregsABI } from "../config/contracts"
import { readWithFallback, getFallbackProvider } from "../lib/rpc"

// Matches NONE_TRAIT in Fregs.sol — type(uint256).max
const NONE_TRAIT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
const toTraitNumber = (val: bigint): number => val === NONE_TRAIT ? 0 : Number(val)

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000
const WALLET_ATTEMPTS_BEFORE_FALLBACK = 2

export interface Kitty {
  tokenId: number
  bodyColor: string
  background: number
  body: number
  head: number
  mouth: number
  stomach: number
}

export function useOwnedKitties() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [kitties, setKitties] = useState<Kitty[]>([])
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

  const fetchKitties = useCallback(async () => {
    clearRetryTimer()
    const requestId = ++requestIdRef.current

    if (!walletProvider || !address) {
      setKitties([])
      setError(null)
      setIsLoading(false)
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
        (provider) => new Contract(FREGS_ADDRESS, FregsABI, provider).getOwnedFregs(address),
        preferFallback,
      )

      if (requestId !== requestIdRef.current) return

      const [tokenIds, bodyColors, backgrounds, bodies, heads, mouths, stomachs] = result
      const kittyList: Kitty[] = tokenIds.map((id: bigint, i: number) => ({
        tokenId: Number(id),
        bodyColor: bodyColors[i],
        background: Number(backgrounds[i]),
        body: Number(bodies[i]),
        head: toTraitNumber(heads[i]),
        mouth: toTraitNumber(mouths[i]),
        stomach: toTraitNumber(stomachs[i]),
      }))

      setKitties(kittyList)
      failureCountRef.current = 0
      retryDelayRef.current = INITIAL_RETRY_DELAY_MS
    } catch (err) {
      console.error("Error fetching owned fregs:", err)
      if (requestId !== requestIdRef.current) return
      failureCountRef.current += 1
      setError(err instanceof Error ? err.message : "Failed to fetch owned fregs")
      const delay = retryDelayRef.current
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchKitties()
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider, address, clearRetryTimer])

  const updateKitty = useCallback((nextKitty: Kitty) => {
    setKitties(prev => {
      let didUpdate = false
      const next = prev.map(kitty => {
        if (kitty.tokenId !== nextKitty.tokenId) return kitty
        didUpdate = true
        return nextKitty
      })
      return didUpdate ? next : prev
    })
  }, [])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      failureCountRef.current = 0
      void fetchKitties()
    } else {
      requestIdRef.current += 1
      clearRetryTimer()
      setKitties([])
      setError(null)
      setIsLoading(false)
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchKitties, isConnected, walletProvider, address, clearRetryTimer])

  return { kitties, isLoading, error, refetch: fetchKitties, updateKitty }
}
