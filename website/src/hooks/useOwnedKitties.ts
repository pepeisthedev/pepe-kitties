import { useState, useEffect, useCallback, useRef } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { BrowserProvider, Contract } from "ethers"
import { FREGS_ADDRESS, FregsABI } from "../config/contracts"

// Matches NONE_TRAIT in Fregs.sol — type(uint256).max
const NONE_TRAIT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
const toTraitNumber = (val: bigint): number => val === NONE_TRAIT ? 0 : Number(val)

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
  const requestIdRef = useRef(0)

  const fetchKitties = useCallback(async () => {
    const requestId = ++requestIdRef.current

    if (!walletProvider || !address) {
      setKitties([])
      setError(null)
      setIsLoading(false)
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
        head: toTraitNumber(heads[i]),
        mouth: toTraitNumber(mouths[i]),
        stomach: toTraitNumber(stomachs[i]),
      }))

      if (requestId === requestIdRef.current) {
        setKitties(kittyList)
      }
    } catch (err) {
      console.error("Error fetching owned fregs:", err)
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch owned fregs")
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [walletProvider, address])

  const updateKitty = useCallback((nextKitty: Kitty) => {
    setKitties(prev => {
      let didUpdate = false
      const next = prev.map(kitty => {
        if (kitty.tokenId !== nextKitty.tokenId) return kitty
        didUpdate = true
        return nextKitty
      })
      return didUpdate ? next : prev
    })
  }, [])

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      void fetchKitties()
    } else {
      requestIdRef.current += 1
      setKitties([])
      setError(null)
      setIsLoading(false)
    }
  }, [fetchKitties, isConnected, walletProvider, address])

  return { kitties, isLoading, error, refetch: fetchKitties, updateKitty }
}
