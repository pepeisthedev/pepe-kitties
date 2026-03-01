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
  mintPhase: number
  freeMints: number

  // MintPass
  userMintPassBalance: number

  // Items
  chestCoinReward: string
  claimChestCount: number
  totalChestsMinted: number
  maxClaimChests: number
  activeChestSupply: number
  remainingClaimChests: number
  colorChangeWeight: number
  headRerollWeight: number
  metalSkinWeight: number
  goldSkinWeight: number
  diamondSkinWeight: number
  boneWeight: number
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
        mintPhase,
        userFreeMints,
        userMintPassBalance,
        chestCoinReward,
        claimChestCount,
        totalChestsMinted,
        maxClaimChests,
        activeChestSupply,
        remainingClaimChests,
        colorChangeWeight,
        headRerollWeight,
        metalSkinWeight,
        goldSkinWeight,
        diamondSkinWeight,
        boneWeight,
        treasureChestWeight,
      ] = await Promise.all([
        fregs.mintPrice(),
        fregs.supply(),
        fregs.totalMinted(),
        fregs.mintPhase(),
        address ? fregs.freeMints(address) : Promise.resolve(0n),
        address ? mintPass.balanceOf(address, 1) : Promise.resolve(0n),
        items.chestCoinReward(),
        items.claimChestCount(),
        items.totalChestsMinted(),
        items.MAX_CLAIM_CHESTS(),
        items.getActiveChestSupply(),
        items.getRemainingClaimChests(),
        items.colorChangeWeight(),
        items.headRerollWeight(),
        items.metalSkinWeight(),
        items.goldSkinWeight(),
        items.diamondSkinWeight(),
        items.boneWeight(),
        items.treasureChestWeight(),
      ])

      setData({
        mintPrice: formatEther(mintPrice),
        supply: Number(supply),
        totalMinted: Number(totalMinted),
        mintPhase: Number(mintPhase),
        freeMints: Number(userFreeMints),
        userMintPassBalance: Number(userMintPassBalance),
        chestCoinReward: formatEther(chestCoinReward),
        claimChestCount: Number(claimChestCount),
        totalChestsMinted: Number(totalChestsMinted),
        maxClaimChests: Number(maxClaimChests),
        activeChestSupply: Number(activeChestSupply),
        remainingClaimChests: Number(remainingClaimChests),
        colorChangeWeight: Number(colorChangeWeight),
        headRerollWeight: Number(headRerollWeight),
        metalSkinWeight: Number(metalSkinWeight),
        goldSkinWeight: Number(goldSkinWeight),
        diamondSkinWeight: Number(diamondSkinWeight),
        boneWeight: Number(boneWeight),
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
