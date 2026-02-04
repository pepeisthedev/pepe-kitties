import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ADDRESS, FregsABI } from "../config/contracts"

export interface Kitty {
  tokenId: number
  bodyColor: string
  background: number  // 0 = use bodyColor, 1+ = special background
  body: number        // 0 = use bodyColor, 1+ = special skin
  head: number
  mouth: number
  stomach: number
}

export function useOwnedKitties() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [kitties, setKitties] = useState<Kitty[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchKitties = useCallback(async () => {
    if (!walletProvider || !address) {
      setKitties([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)
      const contract = new Contract(FREGS_ADDRESS, FregsABI, provider)

      const result = await contract.getOwnedFregs(address)
      const [
        tokenIds,
        bodyColors,
        backgrounds,
        bodies,
        heads,
        mouths,
        stomachs,
      ] = result

      const kittyList: Kitty[] = tokenIds.map((id: bigint, i: number) => ({
        tokenId: Number(id),
        bodyColor: bodyColors[i],
        background: Number(backgrounds[i]),
        body: Number(bodies[i]),
        head: Number(heads[i]),
        mouth: Number(mouths[i]),
        stomach: Number(stomachs[i]),
      }))

      setKitties(kittyList)
    } catch (err) {
      console.error("Error fetching owned fregs:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch owned fregs")
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      fetchKitties()
    } else {
      setKitties([])
    }
  }, [fetchKitties, isConnected, walletProvider, address])

  return { kitties, isLoading, error, refetch: fetchKitties }
}
