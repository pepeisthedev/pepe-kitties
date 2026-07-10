import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ADDRESS, FregsABI } from "../config/contracts"
import { readWithFallback, getFallbackProvider, ReadProvider } from "../lib/rpc"
import {
  computeCollectionRarity,
  FregRarity,
  FregTraits,
  NameResolver,
} from "../lib/rarity"

// Matches NONE_TRAIT in Fregs.sol — type(uint256).max. getFregDataBatch already
// maps mouth/belly NONE to 0, but head can still carry it, so normalise here too.
const NONE_TRAIT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
const toTraitNumber = (val: bigint): number => (val === NONE_TRAIT ? 0 : Number(val))

const PAGE_SIZE = 200

interface UseCollectionRarityResult {
  fregs: FregTraits[]
  rarityByToken: Map<number, FregRarity>
  total: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

// Loads every minted freg's traits and computes collection-wide rarity once.
// `resolve` turns a (slot, freg) pair into a display name — pass a stable
// reference (memoized) so the effect doesn't recompute on every render.
export function useCollectionRarity(resolve: NameResolver): UseCollectionRarityResult {
  const { walletProvider } = useAppKitProvider("eip155")

  const [fregs, setFregs] = useState<FregTraits[]>([])
  const [rarityByToken, setRarityByToken] = useState<Map<number, FregRarity>>(new Map())
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const resolveRef = useRef(resolve)
  resolveRef.current = resolve

  const fetchAll = useCallback(async () => {
    const requestId = ++requestIdRef.current

    const fallback = getFallbackProvider()
    if (!walletProvider && !fallback) {
      setFregs([])
      setRarityByToken(new Map())
      setTotal(0)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const wallet = walletProvider ? new BrowserProvider(walletProvider as any) : null

    // When no wallet is connected we still want public rarity data, so read
    // straight from the fallback RPC.
    const read = <T,>(fn: (provider: ReadProvider) => Promise<T>): Promise<T> => {
      if (wallet) return readWithFallback(wallet, fn)
      return fn(fallback as ReadProvider)
    }

    try {
      const collected: FregTraits[] = []
      let cursor = 0n

      // Page through all minted token IDs, then batch-read each page's traits.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page = await read((provider) =>
          new Contract(FREGS_ADDRESS, FregsABI, provider).getTokenPage(cursor, PAGE_SIZE, false),
        )
        if (requestId !== requestIdRef.current) return

        const [tokenIds, , nextCursor, , totalMinted] = page as [
          bigint[],
          boolean[],
          bigint,
          bigint,
          bigint,
        ]

        if (tokenIds.length > 0) {
          // getTokenPage returns a frozen ethers Result; ethers mutates the args
          // array while resolving the next call, so pass a mutable copy.
          const idsArg = Array.from(tokenIds)
          const batch = await read((provider) =>
            new Contract(FREGS_ADDRESS, FregsABI, provider).getFregDataBatch(idsArg),
          )
          if (requestId !== requestIdRef.current) return

          const [bodyColors, backgrounds, bodies, heads, mouths, bellies] = batch as [
            string[],
            bigint[],
            bigint[],
            bigint[],
            bigint[],
            bigint[],
          ]

          tokenIds.forEach((id, i) => {
            collected.push({
              tokenId: Number(id),
              bodyColor: bodyColors[i],
              background: Number(backgrounds[i]),
              body: Number(bodies[i]),
              head: toTraitNumber(heads[i]),
              mouth: toTraitNumber(mouths[i]),
              belly: toTraitNumber(bellies[i]),
            })
          })
        }

        cursor = nextCursor
        if (cursor >= totalMinted) break
      }

      const computed = computeCollectionRarity(collected, resolveRef.current)
      if (requestId !== requestIdRef.current) return
      setFregs(collected)
      setRarityByToken(computed)
      setTotal(collected.length)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error("Error computing collection rarity:", err)
      setError(err instanceof Error ? err.message : "Failed to compute rarity")
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider])

  useEffect(() => {
    void fetchAll()
    return () => {
      requestIdRef.current += 1
    }
  }, [fetchAll])

  return { fregs, rarityByToken, total, isLoading, error, refetch: fetchAll }
}
