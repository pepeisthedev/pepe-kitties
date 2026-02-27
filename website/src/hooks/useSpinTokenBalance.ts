import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { SPIN_THE_WHEEL_ADDRESS, SpinTheWheelABI } from "../config/contracts"

export function useSpinTokenBalance() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [balance, setBalance] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!walletProvider || !address || !SPIN_THE_WHEEL_ADDRESS) {
      setBalance(0)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const contract = new Contract(SPIN_THE_WHEEL_ADDRESS, SpinTheWheelABI, provider)

      // Token ID 1 is SPIN_TOKEN
      const bal = await contract.balanceOf(address, 1)
      setBalance(Number(bal))
    } catch (err) {
      console.error("Error fetching SpinToken balance:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch SpinToken balance")
      setBalance(0)
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (isConnected && walletProvider && address && SPIN_THE_WHEEL_ADDRESS) {
      fetchBalance()
    } else {
      setBalance(0)
    }
  }, [fetchBalance, isConnected, walletProvider, address])

  return { balance, isLoading, error, refetch: fetchBalance }
}
