import React, { useState, useEffect } from "react"
import { parseEther, formatEther, isAddress, getAddress, Contract } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Settings, Package, ChevronDown, ChevronUp, CheckCircle, XCircle, Ticket, Shield, Users, Dices, Droplets, Power, Gem, Coins } from "lucide-react"
import { useContractData, useContracts } from "../hooks"
import type { FeatureFlags } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog"
import { ITEM_TYPES, FREG_COIN_ADDRESS } from "../config/contracts"

type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

interface ItemType {
  id: number
  name: string
}

interface AdminSectionProps {
  featureFlags: FeatureFlags
  onFeatureFlagsChange: () => void
}

export default function AdminSection({ featureFlags, onFeatureFlagsChange }: AdminSectionProps): React.JSX.Element {
  const contracts = useContracts()
  const { data: contractData, refetch } = useContractData()

  // Panel visibility
  const [showMintPhase, setShowMintPhase] = useState(true)
  const [showFreeMints, setShowFreeMints] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMintItems, setShowMintItems] = useState(false)
  const [showMintPass, setShowMintPass] = useState(false)
  const [showFeatureToggles, setShowFeatureToggles] = useState(true)

  // Settings form
  const [mintPrice, setMintPrice] = useState("")
  const [supply, setSupply] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [contractBalance, setContractBalance] = useState("0")

  // Mint items form
  const [selectedItemType, setSelectedItemType] = useState<number>(101)
  const [addressesInput, setAddressesInput] = useState("")
  const [mintAmount, setMintAmount] = useState("1")
  const [mintProgress, setMintProgress] = useState({ current: 0, total: 0 })
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])

  // Free mint wallets form
  const [freeMintAddresses, setFreeMintAddresses] = useState("")
  const [freeMintCount, setFreeMintCount] = useState("1")

  // Current mint phase from contract
  const currentMintPhase = contractData?.mintPhase ?? 0

  // Mint pass form
  const [mintPassAddresses, setMintPassAddresses] = useState("")
  const [mintPassAmount, setMintPassAmount] = useState("1")
  const [mintPassProgress, setMintPassProgress] = useState({ current: 0, total: 0 })
  const [mintPassData, setMintPassData] = useState({ totalMinted: 0 })

  // Spin token airdrop form
  const [showSpinAirdrop, setShowSpinAirdrop] = useState(false)
  const [spinAddresses, setSpinAddresses] = useState("")
  const [spinAmount, setSpinAmount] = useState("1")

  // Chest funding panel
  const [showChestFunding, setShowChestFunding] = useState(false)
  const [chestCoinBalance, setChestCoinBalance] = useState("0")
  const [chestDepositAmount, setChestDepositAmount] = useState("")
  const [chestRewardAmount, setChestRewardAmount] = useState("")
  const [chestPercentage, setChestPercentage] = useState("")

  // Airdrop panel
  const [showFregAirdrop, setShowFregAirdrop] = useState(false)
  const [airdropCoinBalance, setAirdropCoinBalance] = useState("0")
  const [airdropPercentage, setAirdropPercentage] = useState("60")
  const [airdropDepositAmount, setAirdropDepositAmount] = useState(() => {
    const TOTAL_SUPPLY = 1_337_000_000_000
    return String(Math.floor(TOTAL_SUPPLY * 60 / 100))
  })


  // Rescue pending head reroll panel
  const [showRescueHeadReroll, setShowRescueHeadReroll] = useState(false)
  const [rescueTokenIds, setRescueTokenIds] = useState("")
  const [pendingCounts, setPendingCounts] = useState<{ mintCount: number; headRerollCount: number } | null>(null)
  const [pendingRerollTokenIds, setPendingRerollTokenIds] = useState<number[] | null>(null)
  const [scanning, setScanning] = useState(false)

  // VRF request confirmations panel
  const [showVrfConfirmations, setShowVrfConfirmations] = useState(false)
  const [vrfConfirmations, setVrfConfirmations] = useState("3")

  // VRF gas limits panel
  const [showVrfGasLimits, setShowVrfGasLimits] = useState(false)
  const [vrfMintGas, setVrfMintGas] = useState("700000")
  const [vrfClaimItemGas, setVrfClaimItemGas] = useState("500000")
  const [vrfHeadRerollGas, setVrfHeadRerollGas] = useState("350000")
  const [vrfSpinGas, setVrfSpinGas] = useState("450000")

  // Chainlink subscription panel
  const [showChainlinkSubscription, setShowChainlinkSubscription] = useState(false)
  const [chainlinkSubId, setChainlinkSubId] = useState("19315363693436507623175268498583628439514801257397111320347610079663840815576")
  const [chainlinkGasLane, setChainlinkGasLane] = useState("2gwei")

  // Liquidity panel
  const [showLiquidity, setShowLiquidity] = useState(false)
  const [liquidityEthBalance, setLiquidityEthBalance] = useState("0")
  const [liquidityDepositAmount, setLiquidityDepositAmount] = useState("")
  const [liquidityWithdrawAmount, setLiquidityWithdrawAmount] = useState("")
  const [liquidityCoinBalance, setLiquidityCoinBalance] = useState("0")
  const [liquidityCoinDepositAmount, setLiquidityCoinDepositAmount] = useState("")
  const [liquidityCoinWithdrawAmount, setLiquidityCoinWithdrawAmount] = useState("")

  // Transaction state
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txMessage, setTxMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // Load initial values from contract
  useEffect(() => {
    if (contractData) {
      setMintPrice(contractData.mintPrice)
      setSupply(contractData.supply.toString())
    }
  }, [contractData])

  // Fetch contract balance and item types
  useEffect(() => {
    const fetchData = async () => {
      if (!contracts) return

      try {
        const balance = await contracts.provider.getBalance(await contracts.fregs.read.getAddress())
        setContractBalance(formatEther(balance))

        // Only fetch dynamic item types (101+) - built-in items cannot be owner-minted
        const types: ItemType[] = []

        // Fetch dynamic item types (starting from 101)
        for (let id = 101; id < 200; id++) {
          try {
            const config = await contracts.items.read.itemTypeConfigs(id)
            if (config.name && config.name.length > 0) {
              types.push({ id, name: config.name })
            } else {
              break
            }
          } catch {
            break
          }
        }

        setItemTypes(types)

        // Fetch mint pass data
        const totalMinted = await contracts.mintPass.read.totalMinted()
        setMintPassData({ totalMinted: Number(totalMinted) })

        // Fetch chest FREG balance
        try {
          const itemsAddress = await contracts.items.read.getAddress()
          const fregCoinAddr = await contracts.items.read.fregCoinContract()
          if (fregCoinAddr !== "0x0000000000000000000000000000000000000000") {
            const fregCoinContract = new Contract(fregCoinAddr, ["function balanceOf(address) view returns (uint256)"], contracts.provider)
            const coinBal = await fregCoinContract.balanceOf(itemsAddress)
            setChestCoinBalance(formatEther(coinBal))
          }
        } catch {}

        // Fetch liquidity data
        if (contracts.liquidity) {
          const liqAddress = await contracts.liquidity.read.getAddress()
          const liqBalance = await contracts.provider.getBalance(liqAddress)
          setLiquidityEthBalance(formatEther(liqBalance))

          // Fetch FregCoin balance if set
          try {
            const fregCoinAddr = await contracts.liquidity.read.fregCoin()
            if (fregCoinAddr !== "0x0000000000000000000000000000000000000000") {
              const fregCoinContract = new Contract(fregCoinAddr, ["function balanceOf(address) view returns (uint256)"], contracts.provider)
              const coinBal = await fregCoinContract.balanceOf(liqAddress)
              setLiquidityCoinBalance(formatEther(coinBal))
            }
          } catch {}
        }

        // Fetch airdrop data
        if (contracts.fregAirdrop) {
          try {
            const bal = await contracts.fregAirdrop.read.coinBalance()
            setAirdropCoinBalance(formatEther(bal))
          } catch {}
        }
      } catch (err) {
        console.error("Error fetching admin data:", err)
      }
    }

    fetchData()
  }, [contracts])

  const handleUpdateMintPrice = async () => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage("Updating mint price...")

    try {
      const contract = await contracts.fregs.write()
      const tx = await contract.setMintPrice(parseEther(mintPrice))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage("Mint price updated!")
      refetch()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update mint price")
      setTxStatus('error')
    }
  }

  const handleUpdateSupply = async () => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage("Updating supply...")

    try {
      const contract = await contracts.fregs.write()
      const tx = await contract.setSupply(Number(supply))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage("Supply updated!")
      refetch()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update supply")
      setTxStatus('error')
    }
  }

  const handleWithdraw = async () => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage("Withdrawing ETH...")

    try {
      const contract = await contracts.fregs.write()
      const tx = await contract.withdraw(parseEther(withdrawAmount))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Withdrew ${withdrawAmount} ETH!`)
      setWithdrawAmount("")
      // Refresh balance
      const balance = await contracts.provider.getBalance(await contracts.fregs.read.getAddress())
      setContractBalance(formatEther(balance))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw")
      setTxStatus('error')
    }
  }

  const handleBatchMint = async () => {
    if (!contracts) return

    const addresses = [...new Set(
      addressesInput
        .split('\n')
        .map(a => a.trim())
        .filter(a => isAddress(a))
        .map(a => getAddress(a))
    )]

    if (addresses.length === 0) {
      setErrorMessage("No valid addresses provided")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Minting to ${addresses.length} wallets...`)
    setMintProgress({ current: 0, total: addresses.length })

    try {
      const contract = await contracts.items.write()

      for (let i = 0; i < addresses.length; i++) {
        setMintProgress({ current: i + 1, total: addresses.length })
        setTxMessage(`Minting to wallet ${i + 1} of ${addresses.length}...`)
        const tx = await contract.ownerMint(addresses[i], selectedItemType, Number(mintAmount))
        await tx.wait()
      }

      setTxStatus('success')
      setTxMessage(`Minted to ${addresses.length} wallets!`)
      setAddressesInput("")
      setMintProgress({ current: 0, total: 0 })
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to mint items")
      setTxStatus('error')
    }
  }

  const handleSetVrfConfirmations = async () => {
    if (!contracts?.fregsRandomizer) return
    setTxStatus('pending')
    setTxMessage('Updating VRF request confirmations...')
    try {
      const contract = await contracts.fregsRandomizer.write()
      const tx = await contract.setRequestConfirmations(Number(vrfConfirmations))
      setTxStatus('confirming')
      await tx.wait()
      setTxMessage('Request confirmations updated!')
      setTxStatus('success')
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update request confirmations')
      setTxStatus('error')
    }
  }

  const handleSetVrfGasLimits = async () => {
    if (!contracts?.fregsRandomizer) return
    setTxStatus('pending')
    setTxMessage('Updating VRF callback gas limits...')
    try {
      const contract = await contracts.fregsRandomizer.write()
      const tx = await contract.setCallbackGasLimits(
        Number(vrfMintGas),
        Number(vrfClaimItemGas),
        Number(vrfHeadRerollGas),
        Number(vrfSpinGas)
      )
      setTxStatus('confirming')
      await tx.wait()
      setTxMessage('VRF gas limits updated!')
      setTxStatus('success')
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update VRF gas limits')
      setTxStatus('error')
    }
  }

  const handleSetChainlinkSubscription = async () => {
    if (!contracts?.fregsRandomizer) return
    setTxStatus('pending')
    setTxMessage('Updating Chainlink subscription...')
    try {
      const KEY_HASHES: Record<string, string> = {
        "2gwei":  "0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab",
        "30gwei": "0x3fd2fec10d06ee8f65e7f2e95f5c56511359ece3f33960ad8a866ae24a8ff10b",
      }
      const keyHash = KEY_HASHES[chainlinkGasLane]
      const contract = await contracts.fregsRandomizer.write()
      const tx = await contract.setSubscription(BigInt(chainlinkSubId), keyHash)
      setTxStatus('confirming')
      await tx.wait()
      setTxMessage('Chainlink subscription updated!')
      setTxStatus('success')
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update Chainlink subscription')
      setTxStatus('error')
    }
  }

  const handleToggleFeature = async (feature: string) => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage(`Toggling ${feature}...`)

    try {
      let tx: any
      switch (feature) {
        case 'spin': {
          if (!contracts.spinTheWheel) throw new Error("SpinTheWheel contract not configured")
          const contract = await contracts.spinTheWheel.write()
          tx = await contract.setActive(!featureFlags.spinActive)
          break
        }
        case 'chestOpening': {
          const contract = await contracts.items.write()
          tx = await contract.setChestOpeningActive(!featureFlags.chestOpeningActive)
          break
        }
        case 'liquidity': {
          if (!contracts.liquidity) throw new Error("Liquidity contract not configured")
          const contract = await contracts.liquidity.write()
          tx = await contract.setActive(!featureFlags.liquidityActive)
          break
        }
        case 'shop': {
          if (!contracts.fregShop) throw new Error("Shop contract not configured")
          const contract = await contracts.fregShop.write()
          tx = await contract.setShopActive(!featureFlags.shopActive)
          break
        }
        default:
          throw new Error(`Unknown feature: ${feature}`)
      }
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`${feature} toggled!`)
      onFeatureFlagsChange()
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to toggle ${feature}`)
      setTxStatus('error')
    }
  }

  const handleSetMintPhase = async (phase: number) => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage(`Setting mint phase to ${['Paused', 'Whitelist', 'Public'][phase]}...`)

    try {
      const contract = await contracts.fregs.write()
      const tx = await contract.setMintPhase(phase)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Mint phase set to ${['Paused', 'Whitelist', 'Public'][phase]}!`)
      refetch()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set mint phase")
      setTxStatus('error')
    }
  }

  const handleAddFreeMintWallets = async () => {
    if (!contracts) return

    const addresses = [...new Set(
      freeMintAddresses
        .split('\n')
        .map(a => a.trim())
        .filter(a => isAddress(a))
        .map(a => getAddress(a))
    )]

    if (addresses.length === 0) {
      setErrorMessage("No valid addresses provided")
      setTxStatus('error')
      return
    }

    const count = Number(freeMintCount)
    if (count <= 0) {
      setErrorMessage("Count must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Adding ${addresses.length} free mint wallets (${count} mints each)...`)

    try {
      const contract = await contracts.fregs.write()
      const counts = addresses.map(() => count)
      const tx = await contract.addFreeMintWallets(addresses, counts)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Added ${addresses.length} free mint wallets!`)
      setFreeMintAddresses("")
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add free mint wallets")
      setTxStatus('error')
    }
  }

  const handleMintPassAirdrop = async () => {
    if (!contracts) return

    const addresses = [...new Set(
      mintPassAddresses
        .split('\n')
        .map(a => a.trim())
        .filter(a => isAddress(a))
        .map(a => getAddress(a))
    )]

    if (addresses.length === 0) {
      setErrorMessage("No valid addresses provided")
      setTxStatus('error')
      return
    }

    const amount = Number(mintPassAmount)
    if (amount <= 0) {
      setErrorMessage("Amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Airdropping ${amount} mint pass(es) to ${addresses.length} wallets...`)

    try {
      const contract = await contracts.mintPass.write()

      // Use the airdrop function with same amount for all
      const amounts = addresses.map(() => amount)
      const tx = await contract.airdrop(addresses, amounts)

      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`Airdropped ${amount} mint pass(es) to ${addresses.length} wallets!`)
      setMintPassAddresses("")
      setMintPassProgress({ current: 0, total: 0 })

      // Refresh mint pass data
      const totalMinted = await contracts.mintPass.read.totalMinted()
      setMintPassData({ totalMinted: Number(totalMinted) })
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to airdrop mint passes")
      setTxStatus('error')
    }
  }

  const handleSpinAirdrop = async () => {
    if (!contracts) return

    const addresses = [...new Set(
      spinAddresses
        .split('\n')
        .map(a => a.trim())
        .filter(a => isAddress(a))
        .map(a => getAddress(a))
    )]

    if (addresses.length === 0) {
      setErrorMessage("No valid addresses provided")
      setTxStatus('error')
      return
    }

    const amount = Number(spinAmount)
    if (amount <= 0) {
      setErrorMessage("Amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Airdropping ${amount} spin token(s) to ${addresses.length} wallets...`)

    try {
      const contract = await contracts.spinTheWheel.write()
      const amounts = addresses.map(() => amount)
      const tx = await contract.airdrop(addresses, amounts)

      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`Airdropped ${amount} spin token(s) to ${addresses.length} wallets!`)
      setSpinAddresses("")
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to airdrop spin tokens")
      setTxStatus('error')
    }
  }

  const handleToggleLiquidity = async () => {
    await handleToggleFeature('liquidity')
  }

  const handleLiquidityDeposit = async () => {
    if (!contracts?.liquidity || !liquidityDepositAmount) return
    setTxStatus('pending')
    setTxMessage(`Depositing ${liquidityDepositAmount} ETH...`)

    try {
      const contract = await contracts.liquidity.write()
      const tx = await contract.depositETH({ value: parseEther(liquidityDepositAmount) })
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Deposited ${liquidityDepositAmount} ETH!`)
      setLiquidityDepositAmount("")
      const balance = await contracts.provider.getBalance(await contracts.liquidity.read.getAddress())
      setLiquidityEthBalance(formatEther(balance))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to deposit ETH")
      setTxStatus('error')
    }
  }

  const handleLiquidityWithdraw = async () => {
    if (!contracts?.liquidity || !liquidityWithdrawAmount) return
    setTxStatus('pending')
    setTxMessage(`Withdrawing ${liquidityWithdrawAmount} ETH...`)

    try {
      const contract = await contracts.liquidity.write()
      const tx = await contract.withdrawETH(parseEther(liquidityWithdrawAmount))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Withdrew ${liquidityWithdrawAmount} ETH!`)
      setLiquidityWithdrawAmount("")
      const balance = await contracts.provider.getBalance(await contracts.liquidity.read.getAddress())
      setLiquidityEthBalance(formatEther(balance))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw ETH")
      setTxStatus('error')
    }
  }

  const handleLiquidityCoinDeposit = async () => {
    if (!contracts?.liquidity || !liquidityCoinDepositAmount) return
    setTxStatus('pending')
    setTxMessage(`Sending ${liquidityCoinDepositAmount} FREG to liquidity contract...`)

    try {
      const liqAddress = await contracts.liquidity.read.getAddress()
      const fregCoinAddr = await contracts.liquidity.read.fregCoin()
      const signer = await contracts.getSigner()
      const fregCoin = new Contract(fregCoinAddr, [
        "function transfer(address, uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
      ], signer)

      const amount = parseEther(liquidityCoinDepositAmount)
      const tx = await fregCoin.transfer(liqAddress, amount)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Deposited ${liquidityCoinDepositAmount} FREG!`)
      setLiquidityCoinDepositAmount("")

      const coinBal = await fregCoin.balanceOf(liqAddress)
      setLiquidityCoinBalance(formatEther(coinBal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to deposit FREG")
      setTxStatus('error')
    }
  }

  const handleLiquidityCoinWithdraw = async () => {
    if (!contracts?.liquidity || !liquidityCoinWithdrawAmount) return
    setTxStatus('pending')
    setTxMessage(`Withdrawing ${liquidityCoinWithdrawAmount} FREG...`)

    try {
      const contract = await contracts.liquidity.write()
      const tx = await contract.withdrawCoins(parseEther(liquidityCoinWithdrawAmount))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Withdrew ${liquidityCoinWithdrawAmount} FREG!`)
      setLiquidityCoinWithdrawAmount("")

      const liqAddress = await contracts.liquidity.read.getAddress()
      const fregCoinAddr = await contracts.liquidity.read.fregCoin()
      const fregCoin = new Contract(fregCoinAddr, ["function balanceOf(address) view returns (uint256)"], contracts.provider)
      const coinBal = await fregCoin.balanceOf(liqAddress)
      setLiquidityCoinBalance(formatEther(coinBal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw FREG")
      setTxStatus('error')
    }
  }

  const handleChestDeposit = async () => {
    if (!contracts || !chestDepositAmount) return
    setTxStatus('pending')
    setTxMessage(`Depositing ${chestDepositAmount} FREG for chest rewards...`)

    try {
      const itemsAddress = await contracts.items.read.getAddress()
      const fregCoinAddr = await contracts.items.read.fregCoinContract()
      const signer = await contracts.getSigner()
      const fregCoin = new Contract(fregCoinAddr, [
        "function approve(address, uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
      ], signer)

      const amount = parseEther(chestDepositAmount)

      // Approve first
      const approveTx = await fregCoin.approve(itemsAddress, amount)
      setTxMessage("Approving FREG spend...")
      await approveTx.wait()

      // Then deposit
      setTxMessage("Depositing FREG...")
      const contract = await contracts.items.write()
      const tx = await contract.depositCoins(amount)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Deposited ${chestDepositAmount} FREG!`)
      setChestDepositAmount("")

      const coinBal = await fregCoin.balanceOf(itemsAddress)
      setChestCoinBalance(formatEther(coinBal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to deposit FREG")
      setTxStatus('error')
    }
  }

  const handleChestWithdrawExcess = async () => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage("Withdrawing excess FREG...")

    try {
      const contract = await contracts.items.write()
      const tx = await contract.withdrawExcess()
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage("Withdrew excess FREG!")

      const itemsAddress = await contracts.items.read.getAddress()
      const fregCoinAddr = await contracts.items.read.fregCoinContract()
      const fregCoin = new Contract(fregCoinAddr, ["function balanceOf(address) view returns (uint256)"], contracts.provider)
      const coinBal = await fregCoin.balanceOf(itemsAddress)
      setChestCoinBalance(formatEther(coinBal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw excess FREG")
      setTxStatus('error')
    }
  }

  const handleSetChestReward = async () => {
    if (!contracts || !chestRewardAmount) return
    setTxStatus('pending')
    setTxMessage("Updating chest reward amount...")

    try {
      const contract = await contracts.items.write()
      const tx = await contract.setChestCoinReward(parseEther(chestRewardAmount))
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Chest reward set to ${chestRewardAmount} FREG!`)
      setChestRewardAmount("")
      refetch()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update chest reward")
      setTxStatus('error')
    }
  }

  const handleAirdropDeposit = async () => {
    if (!contracts?.fregAirdrop || !airdropDepositAmount) return
    setTxStatus('pending')
    setTxMessage(`Approving ${airdropDepositAmount} FREG...`)

    try {
      const airdropAddress = await contracts.fregAirdrop.read.getAddress()
      const signer = await contracts.getSigner()
      const fregCoin = new Contract(FREG_COIN_ADDRESS, [
        "function approve(address, uint256) returns (bool)",
      ], signer)

      const amount = parseEther(airdropDepositAmount)
      const approveTx = await fregCoin.approve(airdropAddress, amount)
      setTxMessage("Approving FREG spend...")
      await approveTx.wait()

      setTxMessage("Funding airdrop contract...")
      const contract = await contracts.fregAirdrop.write()
      const tx = await contract.fundAirdrop(amount)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Deposited ${airdropDepositAmount} FREG into airdrop contract!`)
      setAirdropDepositAmount("")

      const bal = await contracts.fregAirdrop.read.coinBalance()
      setAirdropCoinBalance(formatEther(bal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to fund airdrop")
      setTxStatus('error')
    }
  }

  const handleWithdrawRemainder = async () => {
    if (!contracts?.fregAirdrop) return
    setTxStatus('pending')
    setTxMessage("Withdrawing remaining FREG...")

    try {
      const signer = await contracts.getSigner()
      const signerAddress = await signer.getAddress()
      const contract = await contracts.fregAirdrop.write()
      const tx = await contract.withdrawRemainder(signerAddress)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage("Withdrew remaining FREG!")

      const bal = await contracts.fregAirdrop.read.coinBalance()
      setAirdropCoinBalance(formatEther(bal))
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw remainder")
      setTxStatus('error')
    }
  }


  const handleScanPending = async () => {
    if (!contracts || !contractData) return
    setScanning(true)
    setPendingRerollTokenIds(null)
    setPendingCounts(null)
    try {
      const fregs = contracts.fregs.read
      const [mintCount, headRerollCount] = await Promise.all([
        fregs.pendingMintCount(),
        fregs.pendingHeadRerollCount(),
      ])
      setPendingCounts({ mintCount: Number(mintCount), headRerollCount: Number(headRerollCount) })

      if (Number(headRerollCount) > 0) {
        const stuck: number[] = []
        const total = contractData.totalMinted
        for (let tokenId = 0; tokenId < total; tokenId++) {
          const isPending = await fregs.pendingHeadReroll(tokenId)
          if (isPending) {
            stuck.push(tokenId)
            if (stuck.length >= Number(headRerollCount)) break
          }
        }
        setPendingRerollTokenIds(stuck)
        setRescueTokenIds(stuck.join('\n'))
      } else {
        setPendingRerollTokenIds([])
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to scan pending state")
      setTxStatus('error')
    } finally {
      setScanning(false)
    }
  }

  const handleRescueHeadReroll = async () => {
    if (!contracts) return
    const tokenIds = Array.from(new Set(rescueTokenIds
      .split(/[\n,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(Number)
      .filter(n => !isNaN(n))))

    if (tokenIds.length === 0) {
      setErrorMessage("No valid token IDs provided")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Rescuing pending head reroll for token${tokenIds.length > 1 ? 's' : ''} ${tokenIds.join(', ')}...`)
    try {
      const contract = await contracts.items.write()

      for (let i = 0; i < tokenIds.length; i++) {
        setTxMessage(`Rescuing token ${i + 1} of ${tokenIds.length}...`)
        const tx = await contract.rescueHeadReroll(tokenIds[i])
        setTxStatus('confirming')
        await tx.wait()
        if (i < tokenIds.length - 1) {
          setTxStatus('pending')
        }
      }

      setTxStatus('success')
      setTxMessage(`Rescued ${tokenIds.length} pending head reroll${tokenIds.length > 1 ? 's' : ''}! A new Head Reroll item was minted back to each owner.`)
      setRescueTokenIds("")
      setPendingRerollTokenIds(null)
      setPendingCounts(null)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to rescue pending head reroll")
      setTxStatus('error')
    }
  }

  const closeModal = () => {
    setTxStatus('idle')
    setTxMessage("")
    setErrorMessage("")
  }

  const validAddressCount = new Set(
    addressesInput.split('\n').map(a => a.trim()).filter(a => isAddress(a)).map(a => getAddress(a))
  ).size

  const validFreeMintAddressCount = new Set(
    freeMintAddresses.split('\n').map(a => a.trim()).filter(a => isAddress(a)).map(a => getAddress(a))
  ).size

  const validMintPassAddressCount = new Set(
    mintPassAddresses.split('\n').map(a => a.trim()).filter(a => isAddress(a)).map(a => getAddress(a))
  ).size

  const validSpinAddressCount = new Set(
    spinAddresses.split('\n').map(a => a.trim()).filter(a => isAddress(a)).map(a => getAddress(a))
  ).size

  return (
    <Section id="admin">
      <div className="text-center mb-8">
        <h2 className="font-bangers text-5xl md:text-7xl text-orange-400 mb-2">
          ADMIN PANEL
        </h2>
        <p className="font-righteous text-white/60">Contract owner controls</p>
      </div>

      <div className="space-y-4">
        {/* Feature Toggles Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowFeatureToggles(!showFeatureToggles)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Power className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Feature Toggles</span>
            </div>
            {showFeatureToggles ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showFeatureToggles && (
            <CardContent className="p-6 pt-0 space-y-3">
              {[
                { key: 'spin', label: 'Spin the Wheel', active: featureFlags.spinActive, disabled: !contracts?.spinTheWheel },
                { key: 'chestOpening', label: 'Open Chests', active: featureFlags.chestOpeningActive },
                { key: 'liquidity', label: 'Liquidity', active: featureFlags.liquidityActive, disabled: !contracts?.liquidity },
                { key: 'shop', label: 'Shop', active: featureFlags.shopActive, disabled: !contracts?.fregShop },
              ].map(({ key, label, active, disabled }) => (
                <div key={key} className="flex items-center justify-between bg-black/30 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${active ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="font-righteous text-white/80">{label}</span>
                    <span className={`font-righteous text-xs px-2 py-0.5 rounded-full ${
                      active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button
                    onClick={() => handleToggleFeature(key)}
                    disabled={disabled}
                    className={`font-bangers text-sm px-4 py-1 rounded-lg ${
                      active
                        ? "bg-red-500 hover:bg-red-400 text-white"
                        : "bg-green-500 hover:bg-green-400 text-black"
                    } disabled:opacity-30`}
                  >
                    {active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* Mint Phase Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowMintPhase(!showMintPhase)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Mint Phase</span>
              <span className={`font-righteous text-xs px-2 py-0.5 rounded-full ${
                currentMintPhase === 0 ? "bg-red-500/20 text-red-400" :
                currentMintPhase === 1 ? "bg-yellow-500/20 text-yellow-400" :
                "bg-green-500/20 text-green-400"
              }`}>
                {['Paused', 'Whitelist', 'Public'][currentMintPhase]}
              </span>
            </div>
            {showMintPhase ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showMintPhase && (
            <CardContent className="p-6 pt-0 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Button
                  onClick={() => handleSetMintPhase(0)}
                  className={`font-bangers text-lg py-4 rounded-xl transition-all ${
                    currentMintPhase === 0
                      ? "bg-red-500 text-black ring-2 ring-red-300"
                      : "bg-black/50 border-2 border-red-400/50 text-red-400 hover:bg-red-500/20"
                  }`}
                >
                  Paused
                </Button>
                <Button
                  onClick={() => handleSetMintPhase(1)}
                  className={`font-bangers text-lg py-4 rounded-xl transition-all ${
                    currentMintPhase === 1
                      ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                      : "bg-black/50 border-2 border-yellow-400/50 text-yellow-400 hover:bg-yellow-500/20"
                  }`}
                >
                  Whitelist
                </Button>
                <Button
                  onClick={() => handleSetMintPhase(2)}
                  className={`font-bangers text-lg py-4 rounded-xl transition-all ${
                    currentMintPhase === 2
                      ? "bg-green-500 text-black ring-2 ring-green-300"
                      : "bg-black/50 border-2 border-green-400/50 text-green-400 hover:bg-green-500/20"
                  }`}
                >
                  Public
                </Button>
              </div>
              <p className="font-righteous text-white/50 text-sm">
                Paused: only owner can mint. Whitelist: mint pass + free mint wallets. Public: everyone.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Free Mint Wallets Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowFreeMints(!showFreeMints)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Free Mint Wallets</span>
            </div>
            {showFreeMints ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showFreeMints && (
            <CardContent className="p-6 pt-0 space-y-4">
              <div>
                <label className="font-righteous text-white/70 block mb-2">
                  Wallet Addresses (one per line):
                </label>
                <textarea
                  value={freeMintAddresses}
                  onChange={(e) => setFreeMintAddresses(e.target.value)}
                  className="w-full h-32 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-3 rounded-md resize-none"
                  placeholder="0x1234...&#10;0x5678...&#10;0x9abc..."
                />
                <p className="text-white/50 text-sm mt-1 font-righteous">
                  {validFreeMintAddressCount} valid address{validFreeMintAddressCount !== 1 ? 'es' : ''} detected
                </p>
              </div>

              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Mints each:</label>
                <Input
                  type="number"
                  value={freeMintCount}
                  onChange={(e) => setFreeMintCount(e.target.value)}
                  min="1"
                  className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                />
              </div>

              <Button
                onClick={handleAddFreeMintWallets}
                disabled={validFreeMintAddressCount === 0}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4 disabled:opacity-50"
              >
                Add {validFreeMintAddressCount} Free Mint Wallet{validFreeMintAddressCount !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Settings Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Settings</span>
            </div>
            {showSettings ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showSettings && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Mint Price */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Mint Price:</label>
                <Input
                  type="text"
                  value={mintPrice}
                  onChange={(e) => setMintPrice(e.target.value)}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                  placeholder="0.001"
                />
                <span className="text-white/70 font-righteous">ETH</span>
                <Button onClick={handleUpdateMintPrice} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                  Update
                </Button>
              </div>

              {/* Supply */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Supply:</label>
                <Input
                  type="number"
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                  placeholder="3000"
                />
                <span className="text-white/70 font-righteous w-8"></span>
                <Button onClick={handleUpdateSupply} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                  Update
                </Button>
              </div>

              {/* Withdraw */}
              <div className="border-t border-white/20 pt-4">
                <p className="font-righteous text-white/70 mb-2">
                  Contract Balance: <span className="text-orange-400">{Number(contractBalance).toFixed(4)} ETH</span>
                </p>
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Withdraw:</label>
                  <Input
                    type="text"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0.0"
                  />
                  <span className="text-white/70 font-righteous">ETH</span>
                  <Button onClick={handleWithdraw} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Withdraw
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Mint Items Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowMintItems(!showMintItems)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Mint Items to Wallets</span>
            </div>
            {showMintItems ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showMintItems && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Item Type Selection */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Item Type:</label>
                <select
                  value={selectedItemType}
                  onChange={(e) => setSelectedItemType(Number(e.target.value))}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-2 rounded-md"
                >
                  {itemTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} (ID: {type.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Addresses Input */}
              <div>
                <label className="font-righteous text-white/70 block mb-2">
                  Recipient Addresses (one per line):
                </label>
                <textarea
                  value={addressesInput}
                  onChange={(e) => setAddressesInput(e.target.value)}
                  className="w-full h-32 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-3 rounded-md resize-none"
                  placeholder="0x1234...&#10;0x5678...&#10;0x9abc..."
                />
                <p className="text-white/50 text-sm mt-1 font-righteous">
                  {validAddressCount} valid address{validAddressCount !== 1 ? 'es' : ''} detected
                </p>
              </div>

              {/* Amount */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Amount each:</label>
                <Input
                  type="number"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  min="1"
                  className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                />
              </div>

              {/* Mint Progress */}
              {mintProgress.total > 0 && (
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-orange-400">
                    Minting: {mintProgress.current} / {mintProgress.total}
                  </p>
                  <div className="w-full bg-black/50 rounded-full h-2 mt-2">
                    <div
                      className="bg-orange-400 h-2 rounded-full transition-all"
                      style={{ width: `${(mintProgress.current / mintProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Mint Button */}
              <Button
                onClick={handleBatchMint}
                disabled={validAddressCount === 0}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4 disabled:opacity-50"
              >
                Mint to {validAddressCount} wallet{validAddressCount !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Mint Pass Airdrop Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowMintPass(!showMintPass)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Ticket className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Mint Pass Airdrop</span>
            </div>
            {showMintPass ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showMintPass && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Mint Pass Stats */}
              <div className="bg-black/30 rounded-lg p-3 flex justify-between items-center">
                <span className="font-righteous text-white/70">Total Minted:</span>
                <span className="font-mono text-orange-400">
                  {mintPassData.totalMinted}
                </span>
              </div>

              {/* Addresses Input */}
              <div>
                <label className="font-righteous text-white/70 block mb-2">
                  Recipient Addresses (one per line):
                </label>
                <textarea
                  value={mintPassAddresses}
                  onChange={(e) => setMintPassAddresses(e.target.value)}
                  className="w-full h-32 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-3 rounded-md resize-none"
                  placeholder="0x1234...&#10;0x5678...&#10;0x9abc..."
                />
                <p className="text-white/50 text-sm mt-1 font-righteous">
                  {validMintPassAddressCount} valid address{validMintPassAddressCount !== 1 ? 'es' : ''} detected
                </p>
              </div>

              {/* Amount per address */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Amount each:</label>
                <Input
                  type="number"
                  value={mintPassAmount}
                  onChange={(e) => setMintPassAmount(e.target.value)}
                  min="1"
                  className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                />
              </div>

              {/* Progress */}
              {mintPassProgress.total > 0 && (
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-orange-400">
                    Airdropping: {mintPassProgress.current} / {mintPassProgress.total}
                  </p>
                  <div className="w-full bg-black/50 rounded-full h-2 mt-2">
                    <div
                      className="bg-orange-400 h-2 rounded-full transition-all"
                      style={{ width: `${(mintPassProgress.current / mintPassProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Airdrop Button */}
              <Button
                onClick={handleMintPassAirdrop}
                disabled={validMintPassAddressCount === 0}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4 disabled:opacity-50"
              >
                Airdrop to {validMintPassAddressCount} wallet{validMintPassAddressCount !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Spin Token Airdrop Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowSpinAirdrop(!showSpinAirdrop)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Dices className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Spin Token Airdrop</span>
            </div>
            {showSpinAirdrop ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showSpinAirdrop && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Addresses Input */}
              <div>
                <label className="font-righteous text-white/70 block mb-2">
                  Recipient Addresses (one per line):
                </label>
                <textarea
                  value={spinAddresses}
                  onChange={(e) => setSpinAddresses(e.target.value)}
                  className="w-full h-32 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-3 rounded-md resize-none"
                  placeholder="0x1234...&#10;0x5678...&#10;0x9abc..."
                />
                <p className="text-white/50 text-sm mt-1 font-righteous">
                  {validSpinAddressCount} valid address{validSpinAddressCount !== 1 ? 'es' : ''} detected
                </p>
              </div>

              {/* Amount per address */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Amount each:</label>
                <Input
                  type="number"
                  value={spinAmount}
                  onChange={(e) => setSpinAmount(e.target.value)}
                  min="1"
                  className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                />
              </div>

              {/* Airdrop Button */}
              <Button
                onClick={handleSpinAirdrop}
                disabled={validSpinAddressCount === 0}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4 disabled:opacity-50"
              >
                Airdrop to {validSpinAddressCount} wallet{validSpinAddressCount !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          )}
        </Card>
        {/* Chest Funding Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowChestFunding(!showChestFunding)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Gem className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Chest Rewards</span>
            </div>
            {showChestFunding ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showChestFunding && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Current balance and stats */}
              <div className="bg-black/30 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-righteous text-white/70">FREG in contract:</span>
                  <span className="font-mono text-orange-400">{Number(chestCoinBalance).toLocaleString()} FREG</span>
                </div>
                {contractData && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="font-righteous text-white/70">Active chests:</span>
                      <span className="font-mono text-orange-400">{contractData.activeChestSupply}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-righteous text-white/70">Reward per chest:</span>
                      <span className="font-mono text-orange-400">{Number(contractData.chestCoinReward).toLocaleString()} FREG</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-righteous text-white/70">Reserved for chests:</span>
                      <span className="font-mono text-orange-400">{(contractData.activeChestSupply * Number(contractData.chestCoinReward)).toLocaleString()} FREG</span>
                    </div>
                  </>
                )}
              </div>

              {/* Percentage-based reward calculator */}
              <div className="border-t border-white/20 pt-4 space-y-3">
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Percentage:</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={chestPercentage}
                    onChange={(e) => {
                      const pct = e.target.value
                      setChestPercentage(pct)
                      const TOTAL_SUPPLY = 1_337_000_000_000
                      const TOTAL_CHESTS = 1000
                      const parsed = parseFloat(pct)
                      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                        const perChest = Math.floor(TOTAL_SUPPLY * parsed / 100 / TOTAL_CHESTS)
                        setChestRewardAmount(String(perChest))
                        setChestDepositAmount(String(perChest * TOTAL_CHESTS))
                      }
                    }}
                    className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="10"
                  />
                  <span className="text-white/70 font-righteous">%</span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Per chest:</label>
                  <Input
                    type="text"
                    value={chestRewardAmount}
                    onChange={(e) => setChestRewardAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0"
                  />
                  <span className="text-white/70 font-righteous">FREG</span>
                  <Button onClick={handleSetChestReward} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Set
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Total deposit:</label>
                  <Input
                    type="text"
                    value={chestDepositAmount}
                    onChange={(e) => setChestDepositAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0"
                  />
                  <span className="text-white/70 font-righteous">FREG</span>
                  <Button onClick={handleChestDeposit} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Deposit
                  </Button>
                </div>
              </div>

              {/* Withdraw excess */}
              <div className="flex items-center justify-between">
                <span className="font-righteous text-white/70">Withdraw unreserved FREG:</span>
                <Button
                  onClick={handleChestWithdrawExcess}
                  className="bg-orange-500 hover:bg-orange-400 text-black font-bangers"
                >
                  Withdraw Excess
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Liquidity Panel */}
        {contracts?.liquidity && (
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowLiquidity(!showLiquidity)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Droplets className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Liquidity</span>
              <span className={`font-righteous text-xs px-2 py-0.5 rounded-full ${
                featureFlags.liquidityActive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}>
                {featureFlags.liquidityActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {showLiquidity ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showLiquidity && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Toggle active */}
              <div className="flex items-center justify-between">
                <span className="font-righteous text-white/70">Contract status:</span>
                <Button
                  onClick={handleToggleLiquidity}
                  className={`font-bangers text-lg px-6 py-2 rounded-xl ${
                    featureFlags.liquidityActive
                      ? "bg-red-500 hover:bg-red-400 text-white"
                      : "bg-green-500 hover:bg-green-400 text-black"
                  }`}
                >
                  {featureFlags.liquidityActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>

              {/* ETH Balance */}
              <div className="border-t border-white/20 pt-4">
                <p className="font-righteous text-white/70 mb-3">
                  Contract Balance: <span className="text-orange-400">{Number(liquidityEthBalance).toFixed(4)} ETH</span>
                </p>

                {/* Deposit */}
                <div className="flex items-center gap-4 mb-3">
                  <label className="font-righteous text-white/70 w-32">Deposit:</label>
                  <Input
                    type="text"
                    value={liquidityDepositAmount}
                    onChange={(e) => setLiquidityDepositAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0.0"
                  />
                  <span className="text-white/70 font-righteous">ETH</span>
                  <Button onClick={handleLiquidityDeposit} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Deposit
                  </Button>
                </div>

                {/* Withdraw ETH */}
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Withdraw:</label>
                  <Input
                    type="text"
                    value={liquidityWithdrawAmount}
                    onChange={(e) => setLiquidityWithdrawAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0.0"
                  />
                  <span className="text-white/70 font-righteous">ETH</span>
                  <Button onClick={handleLiquidityWithdraw} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Withdraw
                  </Button>
                </div>
              </div>

              {/* FREG Coin */}
              <div className="border-t border-white/20 pt-4">
                <p className="font-righteous text-white/70 mb-3">
                  FREG Balance: <span className="text-orange-400">{Number(liquidityCoinBalance).toFixed(2)} FREG</span>
                </p>

                {/* Deposit FREG */}
                <div className="flex items-center gap-4 mb-3">
                  <label className="font-righteous text-white/70 w-32">Deposit:</label>
                  <Input
                    type="text"
                    value={liquidityCoinDepositAmount}
                    onChange={(e) => setLiquidityCoinDepositAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0.0"
                  />
                  <span className="text-white/70 font-righteous">FREG</span>
                  <Button onClick={handleLiquidityCoinDeposit} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Deposit
                  </Button>
                </div>

                {/* Withdraw FREG */}
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Withdraw:</label>
                  <Input
                    type="text"
                    value={liquidityCoinWithdrawAmount}
                    onChange={(e) => setLiquidityCoinWithdrawAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0.0"
                  />
                  <span className="text-white/70 font-righteous">FREG</span>
                  <Button onClick={handleLiquidityCoinWithdraw} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Withdraw
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        )}
      {/* FREG Coin Airdrop */}
      {contracts?.fregAirdrop && (
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowFregAirdrop(!showFregAirdrop)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Coins className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">FREG Coin Airdrop</span>
            </div>
            {showFregAirdrop ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showFregAirdrop && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Balance */}
              <div className="bg-black/30 rounded-lg p-3 flex justify-between items-center">
                <span className="font-righteous text-white/70">FREG in contract:</span>
                <span className="font-mono text-orange-400">{Number(airdropCoinBalance).toLocaleString()} FREG</span>
              </div>

              {/* Deposit FREG */}
              <div className="border-t border-white/20 pt-4 space-y-3">
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Percentage:</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={airdropPercentage}
                    onChange={(e) => {
                      const pct = e.target.value
                      setAirdropPercentage(pct)
                      const TOTAL_SUPPLY = 1_337_000_000_000
                      const parsed = parseFloat(pct)
                      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                        setAirdropDepositAmount(String(Math.floor(TOTAL_SUPPLY * parsed / 100)))
                      }
                    }}
                    className="w-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="60"
                  />
                  <span className="text-white/70 font-righteous">%</span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Amount:</label>
                  <Input
                    type="text"
                    value={airdropDepositAmount}
                    onChange={(e) => setAirdropDepositAmount(e.target.value)}
                    className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0"
                  />
                  <span className="text-white/70 font-righteous">FREG</span>
                  <Button onClick={handleAirdropDeposit} className="bg-orange-500 hover:bg-orange-400 text-black font-bangers">
                    Deposit
                  </Button>
                </div>
              </div>

              {/* How to trigger airdrop */}
              <div className="border-t border-white/20 pt-4">
                <p className="font-righteous text-white/50 text-sm">
                  To distribute: run <span className="font-mono text-orange-400">node scripts/airdropFregCoin.js --network base</span> from the hardhat directory. Use <span className="font-mono text-orange-400">--dry-run</span> to preview, <span className="font-mono text-orange-400">--resume &lt;file&gt;</span> to continue after a failure.
                </p>
              </div>

              {/* Withdraw remainder */}
              <div className="border-t border-white/20 pt-4 flex items-center justify-between">
                <span className="font-righteous text-white/70">Withdraw remaining FREG:</span>
                <Button
                  onClick={handleWithdrawRemainder}
                  className="bg-orange-500 hover:bg-orange-400 text-black font-bangers"
                >
                  Withdraw Remainder
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Rescue Pending Head Reroll */}
      <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
        <button
          onClick={() => setShowRescueHeadReroll(!showRescueHeadReroll)}
          className="w-full p-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-orange-400" />
            <span className="font-bangers text-2xl text-orange-400">Rescue Pending Head Reroll</span>
          </div>
          {showRescueHeadReroll ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
        </button>

        {showRescueHeadReroll && (
          <CardContent className="p-6 pt-0 space-y-4">
            <p className="font-righteous text-white/60 text-sm">
              Rescues stuck head rerolls safely through the items contract. This cancels the exact VRF request and mints a fresh <span className="font-mono text-orange-400">Head Reroll</span> item back to the freg owner.
            </p>

            {/* Scan button + counters */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleScanPending}
                disabled={scanning}
                className="bg-white/10 hover:bg-white/20 text-white font-bangers text-lg px-6 py-2 border border-white/20 rounded-xl"
              >
                {scanning ? "Scanning..." : "Scan Contract"}
              </Button>
              {pendingCounts && (
                <div className="flex gap-4 font-righteous text-sm">
                  <span className={pendingCounts.mintCount > 0 ? "text-yellow-400" : "text-white/50"}>
                    Pending mints: <span className="font-mono">{pendingCounts.mintCount}</span>
                  </span>
                  <span className={pendingCounts.headRerollCount > 0 ? "text-red-400" : "text-white/50"}>
                    Pending rerolls: <span className="font-mono">{pendingCounts.headRerollCount}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Scan results */}
            {pendingRerollTokenIds !== null && (
              <div className="bg-black/30 rounded-lg p-3">
                {pendingRerollTokenIds.length === 0 ? (
                  <p className="font-righteous text-green-400 text-sm">No tokens with pending head reroll found.</p>
                ) : (
                  <>
                    <p className="font-righteous text-red-400 text-sm mb-2">
                      Stuck tokens ({pendingRerollTokenIds.length}): <span className="font-mono text-white">{pendingRerollTokenIds.join(', ')}</span>
                    </p>
                    <p className="font-righteous text-white/50 text-xs">Token IDs are pre-filled below for rescue.</p>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="font-righteous text-white/70 block mb-2">
                Token IDs to rescue (comma or newline separated):
              </label>
              <textarea
                value={rescueTokenIds}
                onChange={(e) => setRescueTokenIds(e.target.value)}
                className="w-full h-24 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-3 rounded-md resize-none"
                placeholder="42&#10;77&#10;103"
              />
            </div>
            <Button
              onClick={handleRescueHeadReroll}
              className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4"
            >
              Rescue Pending Rerolls
            </Button>
          </CardContent>
        )}
      </Card>

      {/* VRF Request Confirmations */}
      {contracts?.fregsRandomizer && (
        <Card className="bg-white/5 border-white/10">
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => setShowVrfConfirmations(!showVrfConfirmations)}
          >
            <h3 className="font-bangers text-xl text-white">VRF Request Confirmations</h3>
            <span className="text-white/60">{showVrfConfirmations ? '▲' : '▼'}</span>
          </div>
          {showVrfConfirmations && (
            <CardContent className="space-y-4">
              <div>
                <label className="text-white/70 text-sm">Confirmations (min 1, recommended 3)</label>
                <Input
                  type="number"
                  min="1"
                  value={vrfConfirmations}
                  onChange={(e) => setVrfConfirmations(e.target.value)}
                  className="bg-white/10 border-white/20 text-white mt-1"
                />
              </div>
              <Button
                onClick={handleSetVrfConfirmations}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bangers"
              >
                Update Confirmations
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* VRF Callback Gas Limits */}
      {contracts?.fregsRandomizer && (
        <Card className="bg-white/5 border-white/10">
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => setShowVrfGasLimits(!showVrfGasLimits)}
          >
            <h3 className="font-bangers text-xl text-white">VRF Callback Gas Limits</h3>
            <span className="text-white/60">{showVrfGasLimits ? '▲' : '▼'}</span>
          </div>
          {showVrfGasLimits && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-righteous text-white/70 text-sm block mb-1">Mint gas limit</label>
                  <input
                    type="number"
                    value={vrfMintGas}
                    onChange={(e) => setVrfMintGas(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="font-righteous text-white/70 text-sm block mb-1">Claim item gas limit</label>
                  <input
                    type="number"
                    value={vrfClaimItemGas}
                    onChange={(e) => setVrfClaimItemGas(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="font-righteous text-white/70 text-sm block mb-1">Head reroll gas limit</label>
                  <input
                    type="number"
                    value={vrfHeadRerollGas}
                    onChange={(e) => setVrfHeadRerollGas(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="font-righteous text-white/70 text-sm block mb-1">Spin gas limit</label>
                  <input
                    type="number"
                    value={vrfSpinGas}
                    onChange={(e) => setVrfSpinGas(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm"
                  />
                </div>
              </div>
              <Button
                onClick={handleSetVrfGasLimits}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bangers"
              >
                Update Gas Limits
              </Button>
            </CardContent>
          )}
        </Card>
      )}
      {/* Chainlink Subscription */}
      {contracts?.fregsRandomizer && (
        <Card className="bg-white/5 border-white/10">
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => setShowChainlinkSubscription(!showChainlinkSubscription)}
          >
            <h3 className="font-bangers text-xl text-white">Chainlink Subscription</h3>
            <span className="text-white/60">{showChainlinkSubscription ? '▲' : '▼'}</span>
          </div>
          {showChainlinkSubscription && (
            <CardContent className="pt-0 space-y-4">
              <div>
                <label className="text-white/70 text-sm">Subscription ID</label>
                <Input
                  value={chainlinkSubId}
                  onChange={(e) => setChainlinkSubId(e.target.value)}
                  className="bg-white/10 border-white/20 text-white mt-1 font-mono text-xs"
                  placeholder="Subscription ID"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm">Gas Lane</label>
                <select
                  value={chainlinkGasLane}
                  onChange={(e) => setChainlinkGasLane(e.target.value)}
                  className="w-full mt-1 rounded-md bg-white/10 border border-white/20 text-white px-3 py-2 text-sm"
                >
                  <option value="2gwei">2 gwei (cheaper, slower)</option>
                  <option value="30gwei">30 gwei (more expensive, faster)</option>
                </select>
              </div>
              <Button
                onClick={handleSetChainlinkSubscription}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bangers"
              >
                Update Subscription
              </Button>
            </CardContent>
          )}
        </Card>
      )}
      </div>

      {/* Transaction Modal */}
      <Dialog open={txStatus !== 'idle'} onOpenChange={(open) => !open && (txStatus === 'success' || txStatus === 'error') && closeModal()}>
        <DialogContent className="bg-black/95 border-2 border-orange-400 rounded-2xl max-w-md">
          <DialogHeader className="text-center">
            {(txStatus === 'pending' || txStatus === 'confirming') && (
              <>
                <div className="flex justify-center mb-4">
                  <LoadingSpinner size="lg" />
                </div>
                <DialogTitle className="font-bangers text-3xl text-orange-400">
                  {txStatus === 'pending' ? 'Confirm Transaction' : 'Processing...'}
                </DialogTitle>
                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                  {txMessage}
                </DialogDescription>
              </>
            )}

            {txStatus === 'success' && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle className="w-16 h-16 text-orange-400" />
                </div>
                <DialogTitle className="font-bangers text-3xl text-orange-400">
                  Success!
                </DialogTitle>
                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                  {txMessage}
                </DialogDescription>
              </>
            )}

            {txStatus === 'error' && (
              <>
                <div className="flex justify-center mb-4">
                  <XCircle className="w-16 h-16 text-red-400" />
                </div>
                <DialogTitle className="font-bangers text-3xl text-red-400">
                  Error
                </DialogTitle>
                <DialogDescription className="font-righteous text-white/70 text-base mt-2">
                  {errorMessage}
                </DialogDescription>
              </>
            )}
          </DialogHeader>

          {(txStatus === 'success' || txStatus === 'error') && (
            <DialogFooter className="sm:justify-center">
              <Button
                onClick={closeModal}
                className={`font-bangers text-xl px-8 py-3 rounded-xl ${
                  txStatus === 'success'
                    ? "bg-orange-500 hover:bg-orange-400 text-black"
                    : "bg-red-500 hover:bg-red-400 text-white"
                }`}
              >
                {txStatus === 'success' ? "Done" : "Close"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  )
}
