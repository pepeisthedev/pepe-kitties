import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ADDRESS, FregsABI } from "../config/contracts"

export interface Kitty {
  tokenId: number
  bodyColor: string
  head: number
  mouth: number
  belly: number
  specialSkin: number
  background: number
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
      const [tokenIds, bodyColors, heads, mouths, bellies, specialSkins, backgrounds] = result

      const kittyList: Kitty[] = tokenIds.map((id: bigint, i: number) => ({
        tokenId: Number(id),
        bodyColor: bodyColors[i],
        head: Number(heads[i]),
        mouth: Number(mouths[i]),
        belly: Number(bellies[i]),
        specialSkin: Number(specialSkins[i]),
        // Default to 1 if background is missing (old kitties minted before update)
        background: backgrounds ? Number(backgrounds[i]) || 1 : 1,
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
