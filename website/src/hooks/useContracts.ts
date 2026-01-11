import { useMemo } from "react"
import { useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import {
  PEPE_KITTIES_ADDRESS,
  PEPE_KITTIES_ITEMS_ADDRESS,
  PEPE_KITTIES_MINTPASS_ADDRESS,
  PepeKittiesABI,
  PepeKittiesItemsABI,
  PepeKittiesMintPassABI,
} from "../config/contracts"

export function useContracts() {
  const { walletProvider } = useAppKitProvider("eip155")

  const contracts = useMemo(() => {
    if (!walletProvider) return null

    const provider = new BrowserProvider(walletProvider as any)

    return {
      provider,
      getSigner: async () => provider.getSigner(),
      pepeKitties: {
        read: new Contract(PEPE_KITTIES_ADDRESS, PepeKittiesABI, provider),
        write: async () => {
          const signer = await provider.getSigner()
          return new Contract(PEPE_KITTIES_ADDRESS, PepeKittiesABI, signer)
        },
      },
      items: {
        read: new Contract(PEPE_KITTIES_ITEMS_ADDRESS, PepeKittiesItemsABI, provider),
        write: async () => {
          const signer = await provider.getSigner()
          return new Contract(PEPE_KITTIES_ITEMS_ADDRESS, PepeKittiesItemsABI, signer)
        },
      },
      mintPass: {
        read: new Contract(PEPE_KITTIES_MINTPASS_ADDRESS, PepeKittiesMintPassABI, provider),
        write: async () => {
          const signer = await provider.getSigner()
          return new Contract(PEPE_KITTIES_MINTPASS_ADDRESS, PepeKittiesMintPassABI, signer)
        },
      },
    }
  }, [walletProvider])

  return contracts
}
