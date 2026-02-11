import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGCOIN_ADDRESS, FregCoinABI } from "../config/contracts"

export function useFregCoinBalance() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [balance, setBalance] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!walletProvider || !address || !FREGCOIN_ADDRESS) {
      setBalance(0)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const contract = new Contract(FREGCOIN_ADDRESS, FregCoinABI, provider)

      // Token ID 1 is FREG_COIN
      const bal = await contract.balanceOf(address, 1)
      setBalance(Number(bal))
    } catch (err) {
      console.error("Error fetching FregCoin balance:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch FregCoin balance")
      setBalance(0)
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (isConnected && walletProvider && address && FREGCOIN_ADDRESS) {
      fetchBalance()
    } else {
      setBalance(0)
    }
  }, [fetchBalance, isConnected, walletProvider, address])

  return { balance, isLoading, error, refetch: fetchBalance }
}
