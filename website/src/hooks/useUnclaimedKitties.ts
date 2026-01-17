import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ITEMS_ADDRESS,
  FregsItemsABI,
} from "../config/contracts"

export function useUnclaimedKitties() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [unclaimedIds, setUnclaimedIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUnclaimed = useCallback(async () => {
    if (!walletProvider || !address) {
      setUnclaimedIds([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const contract = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)

      const result = await contract.getUnclaimedFregs(address)
      const ids = result.map((id: bigint) => Number(id))

      setUnclaimedIds(ids)
    } catch (err) {
      console.error("Error fetching unclaimed fregs:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch unclaimed fregs")
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      fetchUnclaimed()
    } else {
      setUnclaimedIds([])
    }
  }, [fetchUnclaimed, isConnected, walletProvider, address])

  return { unclaimedIds, isLoading, error, refetch: fetchUnclaimed }
}
