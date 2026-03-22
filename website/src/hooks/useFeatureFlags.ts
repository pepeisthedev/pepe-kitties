import { useState, useEffect, useCallback } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ITEMS_ADDRESS,
  SPIN_THE_WHEEL_ADDRESS,
  FREG_SHOP_ADDRESS,
  FREGS_LIQUIDITY_ADDRESS,
  FregsItemsABI,
  SpinTheWheelABI,
  FregShopABI,
  FregsLiquidityABI,
} from "../config/contracts"

export interface FeatureFlags {
  spinActive: boolean
  chestOpeningActive: boolean
  liquidityActive: boolean
  shopActive: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  spinActive: false,
  chestOpeningActive: false,
  liquidityActive: false,
  shopActive: false,
}

export function useFeatureFlags() {
  const { walletProvider } = useAppKitProvider("eip155")

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS)
  const [isLoading, setIsLoading] = useState(false)

  const fetchFlags = useCallback(async () => {
    if (!walletProvider) return

    setIsLoading(true)
    try {
      const provider = new BrowserProvider(walletProvider as any)
      const items = new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider)

      const promises: Promise<any>[] = [
        items.chestOpeningActive(),
      ]

      if (SPIN_THE_WHEEL_ADDRESS) {
        const spin = new Contract(SPIN_THE_WHEEL_ADDRESS, SpinTheWheelABI, provider)
        promises.push(spin.active())
      } else {
        promises.push(Promise.resolve(false))
      }

      if (FREGS_LIQUIDITY_ADDRESS) {
        const liq = new Contract(FREGS_LIQUIDITY_ADDRESS, FregsLiquidityABI, provider)
        promises.push(liq.active())
      } else {
        promises.push(Promise.resolve(false))
      }

      if (FREG_SHOP_ADDRESS) {
        const shop = new Contract(FREG_SHOP_ADDRESS, FregShopABI, provider)
        promises.push(shop.shopActive())
      } else {
        promises.push(Promise.resolve(false))
      }

      const [chestOpeningActive, spinActive, liquidityActive, shopActive] =
        await Promise.all(promises)

      setFlags({
        spinActive,
        chestOpeningActive,
        liquidityActive,
        shopActive,
      })
    } catch (err) {
      console.error("Error fetching feature flags:", err)
    } finally {
      setIsLoading(false)
    }
  }, [walletProvider])

  useEffect(() => {
    if (walletProvider) {
      fetchFlags()
    }
  }, [fetchFlags, walletProvider])

  return { flags, isLoading, refetch: fetchFlags }
}
