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
  targetTraitType?: number
  traitValue?: number
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

      // Fetch item info for each item to get dynamic names
      const itemList: Item[] = await Promise.all(
        tokenIds.map(async (id: bigint, i: number) => {
          const itemType = Number(types[i])
          let name = ITEM_TYPE_NAMES[itemType]
          let targetTraitType: number | undefined
          let traitValue: number | undefined

          // For unknown item types, fetch info from contract
          if (!name) {
            try {
              const [, itemName] = await contract.getItemInfo(id)
              name = itemName || "Unknown Item"

              // Also fetch config for dynamic items
              const config = await contract.itemTypeConfigs(itemType)
              targetTraitType = Number(config.targetTraitType)
              traitValue = Number(config.traitValue)
            } catch {
              name = "Unknown Item"
            }
          }

          return {
            tokenId: Number(id),
            itemType,
            name,
            targetTraitType,
            traitValue,
          }
        })
      )

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
