import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ITEMS_ADDRESS,
  FregsItemsABI,
  ITEM_TYPE_NAMES,
} from "../config/contracts"

export interface Item {
  tokenId: number
  itemType: number
  name: string
}

export function useOwnedItems() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    if (!walletProvider || !address) {
      setItems([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const contract = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)

      const result = await contract.getOwnedItems(address)
      const [tokenIds, types] = result

      const itemList: Item[] = tokenIds.map((id: bigint, i: number) => {
        const itemType = Number(types[i])
        return {
          tokenId: Number(id),
          itemType,
          name: ITEM_TYPE_NAMES[itemType] || "Unknown",
        }
      })

      setItems(itemList)
    } catch (err) {
      console.error("Error fetching owned items:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch owned items")
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      fetchItems()
    } else {
      setItems([])
    }
  }, [fetchItems, isConnected, walletProvider, address])

  return { items, isLoading, error, refetch: fetchItems }
}
