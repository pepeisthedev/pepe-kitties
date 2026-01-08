import React, { useState, useEffect } from "react"
import { useAppKitAccount, useAppKitProvider, useAppKit } from "@reown/appkit/react"
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers"
import Abi from "../assets/abis/example.json"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Wallet } from "lucide-react"

const MEMELOOT_CONTRACT_ADDRESS = import.meta.env.VITE_MEMELOOT_CONTRACT_ADDRESS

export default function MainPage(): React.JSX.Element {
    const { address, isConnected } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")
    const { open } = useAppKit()
    
    const [mintPrice, setMintPrice] = useState<string>("0")
    const [loading, setLoading] = useState<boolean>(false)

    // Fetch points and mint price when wallet connects
    useEffect(() => {
        if (isConnected && address && walletProvider) {
            fetchDataFromSmartContract()
        } else {
            setMintPrice("0")
        }
    }, [isConnected, address, walletProvider])

    // Poll prices every 5 minutes
    useEffect(() => {
        if (!isConnected || !address || !walletProvider) return

        // Set up polling interval (5 minutes = 300000ms)
        const pollInterval = setInterval(() => {
            fetchDataFromSmartContract()
        }, 300000) // 5 minutes

        // Cleanup interval on unmount or when dependencies change
        return () => clearInterval(pollInterval)
    }, [isConnected, address, walletProvider])



    const fetchDataFromSmartContract = async () => {
        try {
            setLoading(true)
            const provider = new BrowserProvider(walletProvider as any)
            const contract = new Contract(MEMELOOT_CONTRACT_ADDRESS, Abi, provider)
     
            // Fetch user's points and mint price
            const [fetchedPrice] = await contract.getMintPrice(address)
            
            const priceFormatted = formatEther(fetchedPrice)

            setMintPrice(parseFloat(priceFormatted).toFixed(18))

        } catch (error) {
            console.error("Error fetching data from smart contract:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleWalletClick = () => {
        if (!isConnected) {
            // Open wallet connection modal
            open()
        } else {
            // If connected, open account modal to show details/disconnect
            open({ view: "Account" })
        }
    }

    const formatAddress = (addr: string | undefined): string => {
        if (!addr) return ""
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    }

    return (
        <div className="min-h-screen">
            
        </div>
    )
}