import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitAccount, useAppKitProvider, useAppKitNetwork } from "@reown/appkit/react"
import { BrowserProvider, Contract, formatEther } from "ethers"
import {
  ACTIVE_CHAIN_ID,
  FREGS_ADDRESS,
  FREGS_ITEMS_ADDRESS,
  FREGS_MINTPASS_ADDRESS,
  FregsABI,
  FregsItemsABI,
  FregsMintPassABI,
} from "../config/contracts"
import { readWithFallback, getFallbackProvider, type ReadProvider } from "../lib/rpc"

export interface ContractData {
  // Fregs
  mintPrice: string
  supply: number
  totalMinted: number
  mintPhase: number
  freeMints: number

  // MintPass
  userMintPassBalance: number

  // Items
  chestCoinReward: string
  claimChestCount: number
  totalChestsMinted: number
  maxClaimChests: number
  activeChestSupply: number
  remainingClaimChests: number
  colorChangeWeight: number
  headRerollWeight: number
  metalSkinWeight: number
  goldSkinWeight: number
  diamondSkinWeight: number
  boneWeight: number
  treasureChestWeight: number
}

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000
// After this many consecutive failures for a field, switch that field's reads
// to the fallback RPC first instead of the wallet.
const WALLET_ATTEMPTS_BEFORE_FALLBACK = 2

type FieldKey =
  | "mintPrice" | "supply" | "totalMinted" | "mintPhase"
  | "freeMints" | "userMintPassBalance"
  | "chestCoinReward" | "claimChestCount" | "totalChestsMinted" | "maxClaimChests"
  | "activeChestSupply" | "remainingClaimChests"
  | "colorChangeWeight" | "headRerollWeight" | "metalSkinWeight" | "goldSkinWeight"
  | "diamondSkinWeight" | "boneWeight" | "treasureChestWeight"

type FieldContext = {
  fregs: Contract
  items: Contract
  mintPass: Contract
  address: string | undefined
}

type FieldSpec = {
  key: FieldKey
  // Public fields can be read without a connected wallet — they don't depend on the user.
  userScoped?: boolean
  read: (ctx: FieldContext) => Promise<any>
  transform?: (raw: any) => any
}

const FIELDS: FieldSpec[] = [
  { key: "mintPrice", read: ({ fregs }) => fregs.mintPrice(), transform: formatEther },
  { key: "supply", read: ({ fregs }) => fregs.supply(), transform: Number },
  { key: "totalMinted", read: ({ fregs }) => fregs.totalMinted(), transform: Number },
  { key: "mintPhase", read: ({ fregs }) => fregs.mintPhase(), transform: Number },
  { key: "freeMints", userScoped: true, read: ({ fregs, address }) => address ? fregs.freeMints(address) : Promise.resolve(0n), transform: Number },
  { key: "userMintPassBalance", userScoped: true, read: ({ mintPass, address }) => address ? mintPass.balanceOf(address, 1) : Promise.resolve(0n), transform: Number },
  { key: "chestCoinReward", read: ({ items }) => items.chestCoinReward(), transform: formatEther },
  { key: "claimChestCount", read: ({ items }) => items.claimChestCount(), transform: Number },
  { key: "totalChestsMinted", read: ({ items }) => items.totalChestsMinted(), transform: Number },
  { key: "maxClaimChests", read: ({ items }) => items.MAX_CLAIM_CHESTS(), transform: Number },
  { key: "activeChestSupply", read: ({ items }) => items.getActiveChestSupply(), transform: Number },
  { key: "remainingClaimChests", read: ({ items }) => items.getRemainingClaimChests(), transform: Number },
  { key: "colorChangeWeight", read: ({ items }) => items.colorChangeWeight(), transform: Number },
  { key: "headRerollWeight", read: ({ items }) => items.headRerollWeight(), transform: Number },
  { key: "metalSkinWeight", read: ({ items }) => items.metalSkinWeight(), transform: Number },
  { key: "goldSkinWeight", read: ({ items }) => items.goldSkinWeight(), transform: Number },
  { key: "diamondSkinWeight", read: ({ items }) => items.diamondSkinWeight(), transform: Number },
  { key: "boneWeight", read: ({ items }) => items.boneWeight(), transform: Number },
  { key: "treasureChestWeight", read: ({ items }) => items.treasureChestWeight(), transform: Number },
]

const DEFAULT_DATA: ContractData = {
  mintPrice: "0", supply: 0, totalMinted: 0, mintPhase: 0, freeMints: 0,
  userMintPassBalance: 0,
  chestCoinReward: "0", claimChestCount: 0, totalChestsMinted: 0, maxClaimChests: 0,
  activeChestSupply: 0, remainingClaimChests: 0,
  colorChangeWeight: 0, headRerollWeight: 0, metalSkinWeight: 0, goldSkinWeight: 0,
  diamondSkinWeight: 0, boneWeight: 0, treasureChestWeight: 0,
}

function buildContext(provider: ReadProvider, address: string | undefined): FieldContext {
  return {
    fregs: new Contract(FREGS_ADDRESS, FregsABI, provider),
    items: new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider),
    mintPass: new Contract(FREGS_MINTPASS_ADDRESS, FregsMintPassABI, provider),
    address,
  }
}

export function useContractData() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")
  const { chainId } = useAppKitNetwork()

  const [data, setData] = useState<ContractData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retryTimerRef = useRef<number | undefined>(undefined)
  const retryDelayRef = useRef<number>(INITIAL_RETRY_DELAY_MS)
  const requestIdRef = useRef(0)
  const failureCountsRef = useRef<Map<FieldKey, number>>(new Map())

  const walletChainId = typeof chainId === "string"
    ? Number.parseInt(chainId, chainId.startsWith("0x") ? 16 : 10)
    : typeof chainId === "number"
      ? chainId
      : undefined
  const wrongNetwork = walletChainId !== undefined && walletChainId !== ACTIVE_CHAIN_ID

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  const fetchData = useCallback(async (keysToFetch?: Set<FieldKey>) => {
    clearRetryTimer()
    const requestId = ++requestIdRef.current
    const isRefetch = keysToFetch === undefined

    // Decide which source(s) to use for reads:
    // - Wallet connected + right network: wallet first, fallback as backup.
    // - Wallet missing/wrong network: fallback only, and only for public fields.
    const canUseWallet = Boolean(walletProvider) && isConnected && !wrongNetwork
    const fallback = getFallbackProvider()

    if (!canUseWallet && !fallback) {
      setIsLoading(false)
      return
    }

    // Skip user-scoped fields when there's no address.
    const eligibleFields = FIELDS.filter(f => !f.userScoped || address)
    const fields = isRefetch
      ? eligibleFields
      : eligibleFields.filter(f => keysToFetch!.has(f.key))

    if (fields.length === 0) {
      retryDelayRef.current = INITIAL_RETRY_DELAY_MS
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const wallet = canUseWallet ? new BrowserProvider(walletProvider as any) : null

    const readField = (field: FieldSpec) => {
      const fetcher = (provider: ReadProvider) => field.read(buildContext(provider, address))
      if (!wallet) {
        // No wallet to try — fallback is the only option. (We already bailed above
        // if fallback is also missing.)
        return fetcher(fallback!)
      }
      const failures = failureCountsRef.current.get(field.key) ?? 0
      const preferFallback = failures >= WALLET_ATTEMPTS_BEFORE_FALLBACK && fallback !== null
      return readWithFallback(wallet, fetcher, preferFallback)
    }

    try {
      const results = await Promise.allSettled(fields.map(readField))

      if (requestId !== requestIdRef.current) return

      const stillFailing = new Set<FieldKey>()
      setData(prev => {
        const next = { ...(prev ?? DEFAULT_DATA) }
        fields.forEach((field, i) => {
          const res = results[i]
          if (res.status === "fulfilled") {
            const value = field.transform ? field.transform(res.value) : res.value
            ;(next as any)[field.key] = value
            failureCountsRef.current.delete(field.key)
          } else {
            stillFailing.add(field.key)
            failureCountsRef.current.set(
              field.key,
              (failureCountsRef.current.get(field.key) ?? 0) + 1,
            )
          }
        })
        return next
      })

      if (stillFailing.size > 0) {
        const delay = retryDelayRef.current
        console.warn(
          `Contract data: ${stillFailing.size}/${fields.length} calls still failing, retrying in ${delay}ms`,
          Array.from(stillFailing),
        )
        if (isRefetch && stillFailing.size === fields.length) {
          setError("Failed to fetch contract data")
        }
        const keysToRetry = new Set(stillFailing)
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = undefined
          void fetchData(keysToRetry)
        }, delay)
        retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
      } else {
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS
      }
    } catch (err) {
      console.error("Error fetching contract data:", err)
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : "Failed to fetch contract data")
      const delay = retryDelayRef.current
      const keysToRetry = new Set(fields.map(f => f.key))
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchData(keysToRetry)
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider, isConnected, address, wrongNetwork, clearRetryTimer])

  const refetch = useCallback(() => fetchData(), [fetchData])

  useEffect(() => {
    failureCountsRef.current.clear()
    void fetchData()
    return () => {
      clearRetryTimer()
    }
  }, [fetchData, clearRetryTimer])

  return { data, isLoading, error, wrongNetwork, refetch }
}
