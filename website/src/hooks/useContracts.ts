import { useMemo } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  FREGS_ADDRESS,
  FREGS_ITEMS_ADDRESS,
  FREGS_MINTPASS_ADDRESS,
  FREGCOIN_ADDRESS,
  FregsABI,
  FregsItemsABI,
  FregsMintPassABI,
  FregCoinABI,
} from "../config/contracts"

export function useContracts() {
  const { walletProvider } = useAppKitProvider("eip155")

  const contracts = useMemo(() => {
    if (!walletProvider) return null

    const provider = new BrowserProvider(walletProvider as any)

    const getSigner = async () => provider.getSigner()

    return {
      provider,
      getSigner,
      fregs: {
        read: new Contract(FREGS_ADDRESS, FregsABI, provider),
        write: async () => {
          const signer = await getSigner()
          return new Contract(FREGS_ADDRESS, FregsABI, signer)
        },
      },
      items: {
        read: new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, provider),
        write: async () => {
          const signer = await getSigner()
          return new Contract(FREGS_ITEMS_ADDRESS, FregsItemsABI, signer)
        },
      },
      mintPass: {
        read: new Contract(FREGS_MINTPASS_ADDRESS, FregsMintPassABI, provider),
        write: async () => {
          const signer = await getSigner()
          return new Contract(FREGS_MINTPASS_ADDRESS, FregsMintPassABI, signer)
        },
      },
      fregCoin: FREGCOIN_ADDRESS ? {
        read: new Contract(FREGCOIN_ADDRESS, FregCoinABI, provider),
        write: async () => {
          const signer = await getSigner()
          return new Contract(FREGCOIN_ADDRESS, FregCoinABI, signer)
        },
      } : null,
    }
  }, [walletProvider])

  return contracts
}
