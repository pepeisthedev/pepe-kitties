import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ITEMS_ADDRESS,
  FregsItemsABI,
  ITEM_TYPE_NAMES,
} from "../config/contracts"
import { readWithFallback, getFallbackProvider } from "../lib/rpc"

const INITIAL_RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 30000
const WALLET_ATTEMPTS_BEFORE_FALLBACK = 2

export interface Item {
  tokenId: number
  itemType: number
  name: string
  targetTraitType?: number
  traitValue?: number
}

export function useOwnedItems() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [items, setItems] = useState<Item[]>([])
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

  const fetchItems = useCallback(async () => {
    clearRetryTimer()
    const requestId = ++requestIdRef.current

    if (!walletProvider || !address) {
      setItems([])
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
      const itemList = await readWithFallback(wallet, async (provider) => {
        const contract = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)
        const [tokenIds, types] = await contract.getOwnedItems(address)

        return Promise.all(
          tokenIds.map(async (id: bigint, i: number) => {
            const itemType = Number(types[i])
            let name = ITEM_TYPE_NAMES[itemType]
            let targetTraitType: number | undefined
            let traitValue: number | undefined

            if (!name) {
              try {
                const [, itemName] = await contract.getItemInfo(id)
                name = itemName || "Unknown Item"

                const config = await contract.itemTypeConfigs(itemType)
                targetTraitType = Number(config.targetTraitType)
                traitValue = Number(config.traitValue)
              } catch {
                name = "Unknown Item"
              }
            }

            return { tokenId: Number(id), itemType, name, targetTraitType, traitValue }
          }),
        )
      }, preferFallback)

      if (requestId !== requestIdRef.current) return

      setItems(itemList)
      failureCountRef.current = 0
      retryDelayRef.current = INITIAL_RETRY_DELAY_MS
    } catch (err) {
      console.error("Error fetching owned items:", err)
      if (requestId !== requestIdRef.current) return
      failureCountRef.current += 1
      setError(err instanceof Error ? err.message : "Failed to fetch owned items")
      const delay = retryDelayRef.current
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        void fetchItems()
      }, delay)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [walletProvider, address, clearRetryTimer])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      failureCountRef.current = 0
      void fetchItems()
    } else {
      requestIdRef.current += 1
      clearRetryTimer()
      setItems([])
      setError(null)
      setIsLoading(false)
    }
    return () => {
      clearRetryTimer()
    }
  }, [fetchItems, isConnected, walletProvider, address, clearRetryTimer])

  return { items, isLoading, error, refetch: fetchItems }
}
