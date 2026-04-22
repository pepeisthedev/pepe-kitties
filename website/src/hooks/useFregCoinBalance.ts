import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { useContracts } from "./useContracts"

export function useFregCoinBalance() {
  const { address, isConnected } = useAppKitAccount()
  const contracts = useContracts()

  const [balance, setBalance] = useState<bigint>(0n)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!contracts?.fregCoin || !address) {
      setBalance(0n)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const bal = await contracts.fregCoin.read.balanceOf(address)
      setBalance(bal)
    } catch (err) {
      console.error("Error fetching FregCoin balance:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch balance")
      setBalance(0n)
    } finally {
      setIsLoading(false)
    }
  }, [contracts, address])

  useEffect(() => {
    if (isConnected && address) {
      fetchBalance()
    } else {
      setBalance(0n)
    }
  }, [fetchBalance, isConnected, address])

  return { balance, isLoading, error, refetch: fetchBalance }
}
