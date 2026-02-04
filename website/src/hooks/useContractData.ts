import { useState, useEffect, useCallback } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract, formatEther } from "ethers"
import {
  FREGS_ADDRESS,
  FREGS_ITEMS_ADDRESS,
  FREGS_MINTPASS_ADDRESS,
  FregsABI,
  FregsItemsABI,
  FregsMintPassABI,
} from "../config/contracts"

export interface ContractData {
  // Fregs
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
  activeChestSupply: number
  remainingChests: number
  colorChangeWeight: number
  headRerollWeight: number
  bronzeSkinWeight: number
  metalSkinWeight: number
  goldSkinWeight: number
  diamondSkinWeight: number
  treasureChestWeight: number
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
      const fregs = new Contract(FREGS_ADDRESS, FregsABI, provider)
      const items = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)
      const mintPass = new Contract(FREGS_MINTPASS_ADDRESS, FregsMintPassABI, provider)

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
        activeChestSupply,
        remainingChests,
        colorChangeWeight,
        headRerollWeight,
        bronzeSkinWeight,
        metalSkinWeight,
        goldSkinWeight,
        diamondSkinWeight,
        treasureChestWeight,
      ] = await Promise.all([
        fregs.mintPrice(),
        fregs.supply(),
        fregs.totalMinted(),
        mintPass.mintPassPrice(),
        mintPass.mintPassSaleActive(),
        mintPass.maxMintPasses(),
        address ? mintPass.balanceOf(address, 1) : Promise.resolve(0n), // Token ID 1 for mint pass (MINT_PASS constant)
        items.chestETHAmount(),
        items.treasureChestCount(),
        items.MAX_TREASURE_CHESTS(),
        items.getActiveChestSupply(),
        items.getRemainingChests(),
        items.colorChangeWeight(),
        items.headRerollWeight(),
        items.bronzeSkinWeight(),
        items.metalSkinWeight(),
        items.goldSkinWeight(),
        items.diamondSkinWeight(),
        items.treasureChestWeight(),
      ])

      console.log("Contract data fetched:", {
        address,
        userMintPassBalance: Number(userMintPassBalance),
        mintPassSaleActive,
        maxMintPasses: Number(maxMintPasses),
      })

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
        activeChestSupply: Number(activeChestSupply),
        remainingChests: Number(remainingChests),
        colorChangeWeight: Number(colorChangeWeight),
        headRerollWeight: Number(headRerollWeight),
        bronzeSkinWeight: Number(bronzeSkinWeight),
        metalSkinWeight: Number(metalSkinWeight),
        goldSkinWeight: Number(goldSkinWeight),
        diamondSkinWeight: Number(diamondSkinWeight),
        treasureChestWeight: Number(treasureChestWeight),
      })
    } catch (err) {
      console.error("Error fetching contract data:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch contract data")
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider, address])

  useEffect(() => {
    if (walletProvider && isConnected) {
      fetchData()
    }
  }, [fetchData, walletProvider, isConnected, address])

  return { data, isLoading, error, refetch: fetchData }
}
