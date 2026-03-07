import { useState, useEffect, useCallback } from "react"
import { useContracts } from "./useContracts"
import { ITEMS } from "../config/contracts"

export interface ShopItem {
  itemTypeId: number
  name: string
  description: string
  price: bigint
  isActive: boolean
  maxSupply: number
  mintCount: number
}

export function useShopItems() {
  const contracts = useContracts()
  const [items, setItems] = useState<ShopItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    if (!contracts?.fregShop) {
      setItems([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await contracts.fregShop.read.getListedItems()
      const [itemTypeIds, prices, actives, maxSupplies, mintCounts] = result

      const shopItems: ShopItem[] = []
      for (let i = 0; i < itemTypeIds.length; i++) {
        const typeId = Number(itemTypeIds[i])
        const itemConfig = ITEMS.find(item => item.id === typeId)

        shopItems.push({
          itemTypeId: typeId,
          name: itemConfig?.name ?? `Item #${typeId}`,
          description: itemConfig?.description ?? "",
          price: prices[i],
          isActive: actives[i],
          maxSupply: Number(maxSupplies[i]),
          mintCount: Number(mintCounts[i]),
        })
      }

      setItems(shopItems)
    } catch (err) {
      console.error("Error fetching shop items:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch shop items")
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [contracts])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  return { items, isLoading, error, refetch: fetchItems }
}
