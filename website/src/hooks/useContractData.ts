import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract, formatEther } from "ethers"
import {
  PEPE_KITTIES_ADDRESS,
  PEPE_KITTIES_ITEMS_ADDRESS,
  PEPE_KITTIES_MINTPASS_ADDRESS,
  PepeKittiesABI,
  PepeKittiesItemsABI,
  PepeKittiesMintPassABI,
} from "../config/contracts"

export interface ContractData {
  // PepeKitties
  mintPrice: string
  supply: number
  totalMinted: number

  // MintPass
  mintPassPrice: string
  mintPassSaleActive: boolean
  maxMintPasses: number
  userMintPassBalance: number

  // Items
  chestETHAmount: string
  treasureChestCount: number
  maxTreasureChests: number
  colorChangeWeight: number
  headRerollWeight: number
  bronzeSkinWeight: number
  silverSkinWeight: number
  goldSkinWeight: number
}

export function useContractData() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider("eip155")

  const [data, setData] = useState<ContractData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!walletProvider) return

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(walletProvider as any)

      // Create contract instances
      const pepeKitties = new Contract(PEPE_KITTIES_ADDRESS, PepeKittiesABI, provider)
      const items = new Contract(PEPE_KITTIES_ITEMS_ADDRESS, PepeKittiesItemsABI, provider)
      const mintPass = new Contract(PEPE_KITTIES_MINTPASS_ADDRESS, PepeKittiesMintPassABI, provider)

      // Fetch all data in parallel
      const [
        mintPrice,
        supply,
        totalMinted,
        mintPassPrice,
        mintPassSaleActive,
        maxMintPasses,
        userMintPassBalance,
        chestETHAmount,
        treasureChestCount,
        maxTreasureChests,
        colorChangeWeight,
        headRerollWeight,
        bronzeSkinWeight,
        silverSkinWeight,
        goldSkinWeight,
      ] = await Promise.all([
        pepeKitties.mintPrice(),
        pepeKitties.supply(),
        pepeKitties.totalMinted(),
        mintPass.mintPassPrice(),
        mintPass.mintPassSaleActive(),
        mintPass.maxMintPasses(),
        address ? mintPass.balanceOf(address, 0) : Promise.resolve(0n), // Token ID 0 for mint pass
        items.chestETHAmount(),
        items.treasureChestCount(),
        items.MAX_TREASURE_CHESTS(),
        items.colorChangeWeight(),
        items.headRerollWeight(),
        items.bronzeSkinWeight(),
        items.silverSkinWeight(),
        items.goldSkinWeight(),
      ])

      setData({
        mintPrice: formatEther(mintPrice),
        supply: Number(supply),
        totalMinted: Number(totalMinted),
        mintPassPrice: formatEther(mintPassPrice),
        mintPassSaleActive,
        maxMintPasses: Number(maxMintPasses),
        userMintPassBalance: Number(userMintPassBalance),
        chestETHAmount: formatEther(chestETHAmount),
        treasureChestCount: Number(treasureChestCount),
        maxTreasureChests: Number(maxTreasureChests),
        colorChangeWeight: Number(colorChangeWeight),
        headRerollWeight: Number(headRerollWeight),
        bronzeSkinWeight: Number(bronzeSkinWeight),
        silverSkinWeight: Number(silverSkinWeight),
        goldSkinWeight: Number(goldSkinWeight),
      })
    } catch (err) {
      console.error("Error fetching contract data:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch contract data")
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (walletProvider) {
      fetchData()
    }
  }, [fetchData, walletProvider])

  return { data, isLoading, error, refetch: fetchData }
}
