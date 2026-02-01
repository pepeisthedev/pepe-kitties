import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { useContracts } from "./useContracts"

export function useIsOwner() {
  const { address, isConnected } = useAppKitAccount()
  const contracts = useContracts()

  const [isOwner, setIsOwner] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const checkOwnership = useCallback(async () => {
    if (!contracts || !address || !isConnected) {
      setIsOwner(false)
      return
    }

    setIsLoading(true)

    try {
      // Check ownership of both contracts
      const [fregsOwner, itemsOwner] = await Promise.all([
        contracts.fregs.read.owner(),
        contracts.items.read.owner(),
      ])

      // User is owner if they own either contract (typically the same address)
      const isFregsOwner = fregsOwner.toLowerCase() === address.toLowerCase()
      const isItemsOwner = itemsOwner.toLowerCase() === address.toLowerCase()

      setIsOwner(isFregsOwner || isItemsOwner)
    } catch (err) {
      console.error("Error checking ownership:", err)
      setIsOwner(false)
    } finally {
      setIsLoading(false)
    }
  }, [contracts, address, isConnected])

  useEffect(() => {
    checkOwnership()
  }, [checkOwnership])

  return { isOwner, isLoading }
}
