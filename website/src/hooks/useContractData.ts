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

  // Normalize chainId — wallets may report a hex string ("0x2105"), a decimal string,
  // or a number. Match against our expected ACTIVE_CHAIN_ID.
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

  const fetchData = useCallback(async () => {
    if (!walletProvider) return
    // If the wallet is on the wrong chain, don't overwrite any data we already have
    // with garbage reads — the user needs to switch networks first.
    if (wrongNetwork) {
      setIsLoading(false)
      return
    }

    clearRetryTimer()
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)

      const fregs = new Contract(FREGS_ADDRESS, FregsABI, provider)
      const items = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)
      const mintPass = new Contract(FREGS_MINTPASS_ADDRESS, FregsMintPassABI, provider)

      const calls: Array<() => Promise<any>> = [
        () => fregs.mintPrice(),
        () => fregs.supply(),
        () => fregs.totalMinted(),
        () => fregs.mintPhase(),
        () => address ? fregs.freeMints(address) : Promise.resolve(0n),
        () => address ? mintPass.balanceOf(address, 1) : Promise.resolve(0n),
        () => items.chestCoinReward(),
        () => items.claimChestCount(),
        () => items.totalChestsMinted(),
        () => items.MAX_CLAIM_CHESTS(),
        () => items.getActiveChestSupply(),
        () => items.getRemainingClaimChests(),
        () => items.colorChangeWeight(),
        () => items.headRerollWeight(),
        () => items.metalSkinWeight(),
        () => items.goldSkinWeight(),
        () => items.diamondSkinWeight(),
        () => items.boneWeight(),
        () => items.treasureChestWeight(),
      ]

      const results = await Promise.allSettled(calls.map(fn => fn()))

      // Drop stale responses if a newer fetch has started.
      if (requestId !== requestIdRef.current) return

      const [
        mintPriceRes, supplyRes, totalMintedRes, mintPhaseRes,
        freeMintsRes, mintPassRes,
        chestCoinRes, claimChestRes, totalChestsRes, maxClaimChestsRes,
        activeChestRes, remainingClaimChestsRes,
        colorChangeRes, headRerollRes, metalSkinRes, goldSkinRes,
        diamondSkinRes, boneRes, treasureChestRes,
      ] = results

      const pickNum = (res: PromiseSettledResult<any>, fallback: number): number =>
        res.status === "fulfilled" ? Number(res.value) : fallback

      setData(prev => ({
        mintPrice: mintPriceRes.status === "fulfilled"
          ? formatEther(mintPriceRes.value)
          : prev?.mintPrice ?? "0",
        supply: pickNum(supplyRes, prev?.supply ?? 0),
        totalMinted: pickNum(totalMintedRes, prev?.totalMinted ?? 0),
        mintPhase: pickNum(mintPhaseRes, prev?.mintPhase ?? 0),
        freeMints: pickNum(freeMintsRes, prev?.freeMints ?? 0),
        userMintPassBalance: pickNum(mintPassRes, prev?.userMintPassBalance ?? 0),
        chestCoinReward: chestCoinRes.status === "fulfilled"
          ? formatEther(chestCoinRes.value)
          : prev?.chestCoinReward ?? "0",
        claimChestCount: pickNum(claimChestRes, prev?.claimChestCount ?? 0),
        totalChestsMinted: pickNum(totalChestsRes, prev?.totalChestsMinted ?? 0),
        maxClaimChests: pickNum(maxClaimChestsRes, prev?.maxClaimChests ?? 0),
        activeChestSupply: pickNum(activeChestRes, prev?.activeChestSupply ?? 0),
        remainingClaimChests: pickNum(remainingClaimChestsRes, prev?.remainingClaimChests ?? 0),
        colorChangeWeight: pickNum(colorChangeRes, prev?.colorChangeWeight ?? 0),
        headRerollWeight: pickNum(headRerollRes, prev?.headRerollWeight ?? 0),
        metalSkinWeight: pickNum(metalSkinRes, prev?.metalSkinWeight ?? 0),
        goldSkinWeight: pickNum(goldSkinRes, prev?.goldSkinWeight ?? 0),
        diamondSkinWeight: pickNum(diamondSkinRes, prev?.diamondSkinWeight ?? 0),
        boneWeight: pickNum(boneRes, prev?.boneWeight ?? 0),
        treasureChestWeight: pickNum(treasureChestRes, prev?.treasureChestWeight ?? 0),
      }))
      const failures = results.filter(r => r.status === "rejected")
      if (failures.length > 0) {
        const delay = retryDelayRef.current
        console.warn(
          `Contract data: ${failures.length}/${results.length} calls failed, retrying in ${delay}ms`,
          failures.map(f => (f as PromiseRejectedResult).reason)
        )
        if (failures.length === results.length) {
          setError("Failed to fetch contract data")
        }
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = undefined
          void fetchData()
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
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchData()
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider, address, wrongNetwork, clearRetryTimer])

  useEffect(() => {
    if (walletProvider && isConnected && !wrongNetwork) {
      fetchData()
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchData, walletProvider, isConnected, address, wrongNetwork, clearRetryTimer])

  return { data, isLoading, error, wrongNetwork, refetch: fetchData }
}
