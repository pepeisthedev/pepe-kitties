import React, { useState, useEffect } from "react"
import { parseEther, formatEther, isAddress, getAddress, Contract } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Settings, Package, ChevronDown, ChevronUp, CheckCircle, XCircle, Ticket, Shield, Users, Dices, Droplets, Power, Gem, Coins, Trophy } from "lucide-react"
import { useContractData, useContracts } from "../hooks"
import type { FeatureFlags } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog"
import { FREG_COIN_ADDRESS, FREGS_LIQUIDITY_ADDRESS, FREG_SHOP_ADDRESS, SLOT_MACHINE_ADDRESS } from "../config/contracts"

type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'
const WEIGHT_DENOMINATOR = 10_000
const PRIZE_TYPE_ERC721 = 1
const PRIZE_TYPE_ERC20 = 2
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

interface ItemType {
  id: number
  name: string
}

interface SlotPrizeInfo {
  prizeId: number
  name: string
  token: string
  prizeType: number
  weightBps: number
  erc20Amount: bigint
  stock: bigint
  active: boolean
  itemTypeId: number
  mintOnWin: boolean
  mintMaxSupply: bigint
  mintCount: bigint
}

interface AdminSectionProps {
  featureFlags: FeatureFlags
  onFeatureFlagsChange: () => void
}

async function loadSlotPrizeInfo(slotMachine: any): Promise<SlotPrizeInfo[]> {
  const count = Number(await slotMachine.getPrizesCount())
  const prizes: SlotPrizeInfo[] = []

  for (let prizeId = 1; prizeId <= count; prizeId += 1) {
    const info = await slotMachine.getPrizeInfo(prizeId)
    let itemTypeId = 0
    let mintOnWin = false
    let mintMaxSupply = 0n
    let mintCount = 0n
    try {
      itemTypeId = Number(await slotMachine.getPrizeItemTypeId(prizeId))
    } catch {}
    try {
      const mintConfig = await slotMachine.getERC721PrizeMintConfig(prizeId)
      mintOnWin = Boolean(mintConfig[0])
      mintMaxSupply = BigInt(mintConfig[1])
      mintCount = BigInt(mintConfig[2])
    } catch {}

    prizes.push({
      prizeId,
      name: String(info[0]),
      token: String(info[1]),
      prizeType: Number(info[2]),
      weightBps: Number(info[3]),
      erc20Amount: BigInt(info[4]),
      stock: BigInt(info[6]),
      active: Boolean(info[5]),
      itemTypeId,
      mintOnWin,
      mintMaxSupply,
      mintCount,
    })
  }

  return prizes
}

function parseTokenIdInput(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\n,\s]+/)
      .map(token => token.trim())
      .filter(token => /^\d+$/.test(token))
  ))
}

function formatWeightPercent(weightBps: number): string {
  const value = weightBps / 100
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`
}

function formatShortAddress(address: string): string {
  if (!address) return "Not configured"
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getSlotPrizeTypeLabel(prize: SlotPrizeInfo): string {
  if (prize.prizeType === PRIZE_TYPE_ERC20) return addressesEqual(prize.token, FREG_COIN_ADDRESS) ? "FREG" : "ERC20"
  if (prize.mintOnWin) return "Mint ERC721"
  if (prize.prizeType === PRIZE_TYPE_ERC721) return "ERC721"
  return "Prize"
}

function addressesEqual(a: string, b: string): boolean {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase()
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const [showShopFunding, setShowShopFunding] = useState(true)
  const [showSlotMachine, setShowSlotMachine] = useState(true)

  // Settings form
  const [mintPrice, setMintPrice] = useState("")
  const [supply, setSupply] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [contractBalance, setContractBalance] = useState("0")

  // Shop FREG balance
  const [shopCoinBalance, setShopCoinBalance] = useState("0")
  const [shopCoinWithdrawAmount, setShopCoinWithdrawAmount] = useState("")
  const [shopCoinWithdrawRecipient, setShopCoinWithdrawRecipient] = useState("")

  // Mint items form
  const [selectedItemType, setSelectedItemType] = useState<number>(101)
  const [addressesInput, setAddressesInput] = useState("")
  const [mintAmount, setMintAmount] = useState("1")
  const [mintProgress, setMintProgress] = useState({ current: 0, total: 0 })
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])

  // Slot machine prize inventory
  const [slotPrizes, setSlotPrizes] = useState<SlotPrizeInfo[]>([])
  const [slotPrizeId, setSlotPrizeId] = useState("1")
  const [slotPrizeWeightPercent, setSlotPrizeWeightPercent] = useState("")
  const [slotPrizeMaxSupply, setSlotPrizeMaxSupply] = useState("")
  const [slotFregPrizeWeightPercent, setSlotFregPrizeWeightPercent] = useState("")
  const [slotFregPrizeAmount, setSlotFregPrizeAmount] = useState("")
  const [slotFregDepositAmount, setSlotFregDepositAmount] = useState("")
  const [slotSelectedErc20DepositAmount, setSlotSelectedErc20DepositAmount] = useState("")
  const [slotFregContractBalance, setSlotFregContractBalance] = useState("0")
  const [slotSelectedErc20Amount, setSlotSelectedErc20Amount] = useState("")
  const [slotRegisterTokenIds, setSlotRegisterTokenIds] = useState("")
  const [slotMintItemType, setSlotMintItemType] = useState<number>(101)
  const [slotMintAmount, setSlotMintAmount] = useState("1")
  const [slotRegistrationProgress, setSlotRegistrationProgress] = useState({ current: 0, total: 0 })
  const [slotCallbackGasLimit, setSlotCallbackGasLimit] = useState("1000000")
  const [slotRequestConfirmations, setSlotRequestConfirmations] = useState("3")
  const [slotPendingSpinCount, setSlotPendingSpinCount] = useState("0")
  const [slotPaymentVault, setSlotPaymentVault] = useState("")
  const [slotSpinCost, setSlotSpinCost] = useState<bigint>(0n)
  const [slotResolveRequestId, setSlotResolveRequestId] = useState("")

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

  const refreshSlotFregBalance = async () => {
    if (!contracts?.slotMachine || !FREG_COIN_ADDRESS) return

    const slotAddress = await contracts.slotMachine.read.getAddress()
    const fregCoin = new Contract(FREG_COIN_ADDRESS, [
      "function balanceOf(address) view returns (uint256)",
    ], contracts.provider)
    const balance = await fregCoin.balanceOf(slotAddress)
    setSlotFregContractBalance(formatEther(balance))
  }

  const refreshShopFregBalance = async () => {
    if (!contracts?.fregShop) return

    const shopAddress = await contracts.fregShop.read.getAddress()
    let fregCoinAddress = FREG_COIN_ADDRESS

    try {
      const configuredFregCoin = await contracts.fregShop.read.fregCoinContract()
      if (configuredFregCoin && configuredFregCoin !== ZERO_ADDRESS) {
        fregCoinAddress = String(configuredFregCoin)
      }
    } catch {}

    if (!fregCoinAddress) return

    const fregCoin = new Contract(fregCoinAddress, [
      "function balanceOf(address) view returns (uint256)",
    ], contracts.provider)
    const balance = await fregCoin.balanceOf(shopAddress)
    setShopCoinBalance(formatEther(balance))
  }

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

        if (contracts.slotMachine) {
          try {
            const slotRead = contracts.slotMachine.read
            const [prizes, callbackGas, confirmations, pendingCount, paymentVault, spinCost] = await Promise.all([
              loadSlotPrizeInfo(slotRead),
              slotRead.callbackGasLimit(),
              slotRead.requestConfirmations(),
              slotRead.pendingSpinCount(),
              slotRead.liquidityVault(),
              slotRead.spinCost(),
            ])
            setSlotPrizes(prizes)
            const selectedPrize = prizes.find(prize => prize.prizeId === Number(slotPrizeId))
            setSlotPrizeMaxSupply(selectedPrize?.mintOnWin ? selectedPrize.mintMaxSupply.toString() : "")
            setSlotCallbackGasLimit(callbackGas.toString())
            setSlotRequestConfirmations(confirmations.toString())
            setSlotPendingSpinCount(pendingCount.toString())
            setSlotPaymentVault(String(paymentVault))
            setSlotSpinCost(BigInt(spinCost))
            await refreshSlotFregBalance()
          } catch {}
        }

        if (contracts.fregShop) {
          try {
            await refreshShopFregBalance()
          } catch {}
        }

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

  useEffect(() => {
    const godzilla = itemTypes.find(type => type.name.toLowerCase().includes("godzilla"))
    if (godzilla) {
      setSlotMintItemType(godzilla.id)
    }
  }, [itemTypes])

  useEffect(() => {
    const prize = slotPrizes.find(p => p.prizeId === Number(slotPrizeId))
    if (prize?.itemTypeId) {
      setSlotMintItemType(prize.itemTypeId)
    }
    setSlotPrizeMaxSupply(prize?.mintOnWin ? prize.mintMaxSupply.toString() : "")
    setSlotSelectedErc20Amount(prize?.prizeType === PRIZE_TYPE_ERC20 ? formatEther(prize.erc20Amount) : "")
  }, [slotPrizeId, slotPrizes])

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

  const handleShopFregWithdraw = async () => {
    if (!contracts?.fregShop) return

    let amount: bigint
    try {
      amount = parseEther(shopCoinWithdrawAmount)
    } catch {
      setErrorMessage("Shop FREG withdraw amount must be a valid token amount")
      setTxStatus('error')
      return
    }

    if (amount <= 0n) {
      setErrorMessage("Shop FREG withdraw amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Withdrawing ${shopCoinWithdrawAmount} FREG from shop...`)

    try {
      const signer = await contracts.getSigner()
      const fallbackRecipient = await signer.getAddress()
      const recipient = shopCoinWithdrawRecipient.trim() || fallbackRecipient

      if (!isAddress(recipient)) {
        throw new Error("Recipient must be a valid address")
      }

      const contract = await contracts.fregShop.write()
      const tx = await contract.withdraw(getAddress(recipient), amount)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Withdrew ${shopCoinWithdrawAmount} FREG from shop!`)
      setShopCoinWithdrawAmount("")
      await refreshShopFregBalance()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to withdraw shop FREG")
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
    setTxMessage(`Checking ${addresses.length} addresses for contracts...`)

    const { receivers, skipped } = await filterOutNonReceivers(addresses)
    const skippedNote = skipped.length > 0 ? ` (skipped ${skipped.length} non-receiver contract${skipped.length > 1 ? 's' : ''}: ${skipped.join(', ')})` : ''

    if (receivers.length === 0) {
      setErrorMessage(`No addresses can receive ERC1155 tokens.${skippedNote}`)
      setTxStatus('error')
      return
    }

    setMintProgress({ current: 0, total: receivers.length })
    setTxMessage(`Minting to ${receivers.length} wallets...${skippedNote}`)

    try {
      const contract = await contracts.items.write()

      for (let i = 0; i < receivers.length; i++) {
        setMintProgress({ current: i + 1, total: receivers.length })
        setTxMessage(`Minting to wallet ${i + 1} of ${receivers.length}...${skippedNote}`)
        const tx = await contract.ownerMint(receivers[i], selectedItemType, Number(mintAmount))
        await tx.wait()
      }

      setTxStatus('success')
      setTxMessage(`Minted to ${receivers.length} wallets!${skippedNote}`)
      setAddressesInput("")
      setMintProgress({ current: 0, total: 0 })
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to mint items")
      setTxStatus('error')
    }
  }

  const getOwnedItemIdsByType = async (owner: string, itemTypeId: number): Promise<string[]> => {
    if (!contracts) return []
    const [tokenIds, itemTypes] = await contracts.items.read.getOwnedItems(owner)
    const ids: string[] = []

    for (let i = 0; i < tokenIds.length; i += 1) {
      if (Number(itemTypes[i]) === Number(itemTypeId)) {
        ids.push(tokenIds[i].toString())
      }
    }

    return ids
  }

  const getOwnerMintedTokenIdsFromReceipt = (
    receipt: any,
    recipient: string,
    itemTypeId: number,
    expectedAmount: number
  ): string[] => {
    if (!contracts?.items?.read || !receipt?.logs) return []

    for (const log of receipt.logs) {
      try {
        const parsed = contracts.items.read.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        })

        if (parsed?.name !== "OwnerMinted") continue
        if (String(parsed.args.to).toLowerCase() !== recipient.toLowerCase()) continue
        if (Number(parsed.args.itemType) !== Number(itemTypeId)) continue

        const mintedAmount = Number(parsed.args.amount)
        if (mintedAmount !== expectedAmount) continue

        const startTokenId = BigInt(parsed.args.itemTokenId)
        return Array.from({ length: mintedAmount }, (_, index) => (startTokenId + BigInt(index)).toString())
      } catch {
        // Ignore logs from other contracts in the mint transaction.
      }
    }

    return []
  }

  const waitForMintedItemIds = async (
    owner: string,
    itemTypeId: number,
    before: string[],
    expectedAmount: number
  ): Promise<string[]> => {
    const beforeSet = new Set(before)

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await wait(1500)
      }

      const after = await getOwnedItemIdsByType(owner, itemTypeId)
      const mintedTokenIds = after.filter(tokenId => !beforeSet.has(tokenId))
      if (mintedTokenIds.length >= expectedAmount) {
        return mintedTokenIds.slice(0, expectedAmount)
      }
    }

    return []
  }

  const waitForTokenItemTypes = async (tokenIds: string[], expectedItemTypeId: number): Promise<void> => {
    if (!contracts?.items?.read || expectedItemTypeId === 0) return

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await wait(1500)
      }

      const actualTypes = await Promise.all(
        tokenIds.map(async tokenId => Number(await contracts.items.read.itemType(tokenId)))
      )
      const mismatchIndex = actualTypes.findIndex(actualType => actualType !== expectedItemTypeId)

      if (mismatchIndex === -1) {
        return
      }

      const hasUnsetType = actualTypes.some(actualType => actualType === 0)
      if (!hasUnsetType) {
        throw new Error(
          `Token ${tokenIds[mismatchIndex]} has item type ${actualTypes[mismatchIndex]}, ` +
          `but prize ${slotPrizeId} expects item type ${expectedItemTypeId}.`
        )
      }
    }

    throw new Error(`Minted token item types did not update to ${expectedItemTypeId} yet. Use Find Unregistered, then Register Tokens.`)
  }

  const refreshSlotPrizes = async () => {
    if (!contracts?.slotMachine) return
    const slotRead = contracts.slotMachine.read
    const [prizes, callbackGas, confirmations, pendingCount, paymentVault, spinCost] = await Promise.all([
      loadSlotPrizeInfo(slotRead),
      slotRead.callbackGasLimit(),
      slotRead.requestConfirmations(),
      slotRead.pendingSpinCount(),
      slotRead.liquidityVault(),
      slotRead.spinCost(),
    ])
    setSlotPrizes(prizes)
    const selectedPrize = prizes.find(prize => prize.prizeId === Number(slotPrizeId))
    setSlotPrizeMaxSupply(selectedPrize?.mintOnWin ? selectedPrize.mintMaxSupply.toString() : "")
    setSlotCallbackGasLimit(callbackGas.toString())
    setSlotRequestConfirmations(confirmations.toString())
    setSlotPendingSpinCount(pendingCount.toString())
    setSlotPaymentVault(String(paymentVault))
    setSlotSpinCost(BigInt(spinCost))
    await refreshSlotFregBalance()
  }

  const handleSetSlotCallbackGasLimit = async () => {
    if (!contracts?.slotMachine) return

    const gasLimit = Number(slotCallbackGasLimit)
    if (!Number.isInteger(gasLimit) || gasLimit <= 0) {
      setErrorMessage("Slot callback gas limit must be a positive number")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Setting slot callback gas limit to ${gasLimit}...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setCallbackGasLimit(gasLimit)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Slot callback gas limit set to ${gasLimit}!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set slot callback gas limit")
      setTxStatus('error')
    }
  }

  const handleSetSlotRequestConfirmations = async () => {
    if (!contracts?.slotMachine) return

    const confirmations = Number(slotRequestConfirmations)
    if (!Number.isInteger(confirmations) || confirmations <= 0) {
      setErrorMessage("Slot request confirmations must be a positive number")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Setting slot request confirmations to ${confirmations}...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setRequestConfirmations(confirmations)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Slot request confirmations set to ${confirmations}!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set slot request confirmations")
      setTxStatus('error')
    }
  }

  const handleResolveSlotPendingSpin = async () => {
    if (!contracts?.slotMachine) return

    const requestId = slotResolveRequestId.trim()
    if (!/^\d+$/.test(requestId)) {
      setErrorMessage("Request ID must be a number")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Resolving pending slot spin ${requestId} as loss...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.resolvePendingSpinAsLoss(requestId)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Resolved pending slot spin ${requestId}.`)
      setSlotResolveRequestId("")
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to resolve pending slot spin")
      setTxStatus('error')
    }
  }

  const handleSetSlotPaymentVault = async (target: "slot" | "liquidity") => {
    if (!contracts?.slotMachine || !FREG_COIN_ADDRESS) return

    if (slotPendingSpinCount !== "0") {
      setErrorMessage("Payment vault cannot be changed while slot spins are pending")
      setTxStatus('error')
      return
    }

    if (slotSpinCost <= 0n) {
      setErrorMessage("Slot spin cost has not loaded yet")
      setTxStatus('error')
      return
    }

    let targetAddress = ""
    if (target === "slot") {
      targetAddress = await contracts.slotMachine.read.getAddress()
    } else {
      targetAddress = FREGS_LIQUIDITY_ADDRESS || (contracts.liquidity ? await contracts.liquidity.read.getAddress() : "")
    }

    if (!isAddress(targetAddress)) {
      setErrorMessage(`Missing ${target === "slot" ? "SlotMachine" : "liquidity"} payment vault address`)
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Routing slot payments to ${target === "slot" ? "SlotMachine" : "liquidity"}...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setPaymentConfig(FREG_COIN_ADDRESS, targetAddress, slotSpinCost)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Slot payments now route to ${target === "slot" ? "SlotMachine" : "liquidity"}!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set slot payment vault")
      setTxStatus('error')
    }
  }

  const handleSetSlotPrizeWeight = async () => {
    if (!contracts?.slotMachine) return

    const prizeId = Number(slotPrizeId)
    const percentage = Number(slotPrizeWeightPercent)

    if (!Number.isInteger(prizeId) || prizeId <= 0) {
      setErrorMessage("Prize ID must be a positive number")
      setTxStatus('error')
      return
    }

    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setErrorMessage("Win percentage must be between 0 and 100")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Setting prize ${prizeId} odds to ${percentage}%...`)

    try {
      const contract = await contracts.slotMachine.write()
      const weightBps = Math.round(percentage * 100)
      const tx = await contract.setPrizeWeight(prizeId, weightBps)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Prize ${prizeId} odds set to ${percentage}%!`)
      setSlotPrizeWeightPercent("")
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set prize odds")
      setTxStatus('error')
    }
  }

  const handleSetSlotPrizeActive = async (active: boolean) => {
    if (!contracts?.slotMachine || !selectedSlotPrize) return

    setTxStatus('pending')
    setTxMessage(`${active ? "Activating" : "Deactivating"} prize ${selectedSlotPrize.prizeId}...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setPrizeActive(selectedSlotPrize.prizeId, active)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Prize ${selectedSlotPrize.prizeId} ${active ? "activated" : "deactivated"}!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update prize active state")
      setTxStatus('error')
    }
  }

  const handleSetSlotPrizeMaxSupply = async () => {
    if (!contracts?.slotMachine) return

    const prizeId = Number(slotPrizeId)
    const prize = slotPrizes.find(p => p.prizeId === prizeId)
    const maxSupplyInput = slotPrizeMaxSupply.trim()

    if (!Number.isInteger(prizeId) || prizeId <= 0) {
      setErrorMessage("Prize ID must be a positive number")
      setTxStatus('error')
      return
    }

    if (!prize?.mintOnWin) {
      setErrorMessage("Selected prize does not mint on win")
      setTxStatus('error')
      return
    }

    if (!/^\d+$/.test(maxSupplyInput)) {
      setErrorMessage("Max prizes must be a whole number")
      setTxStatus('error')
      return
    }

    const maxSupply = BigInt(maxSupplyInput)
    if (maxSupply <= 0n) {
      setErrorMessage("Max prizes must be greater than 0")
      setTxStatus('error')
      return
    }

    if (maxSupply < prize.mintCount) {
      setErrorMessage(`Max prizes cannot be below already minted count (${prize.mintCount.toString()})`)
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Setting prize ${prizeId} max supply to ${maxSupply.toString()}...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setERC721PrizeMintConfig(prizeId, true, maxSupply)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Prize ${prizeId} max supply set to ${maxSupply.toString()}!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set prize max supply")
      setTxStatus('error')
    }
  }

  const handleAddSlotFregPrize = async () => {
    if (!contracts?.slotMachine || !FREG_COIN_ADDRESS) return

    const percentage = Number(slotFregPrizeWeightPercent)
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setErrorMessage("FREG prize percentage must be between 0 and 100")
      setTxStatus('error')
      return
    }

    const weightBps = Math.round(percentage * 100)
    const configuredWeight = slotPrizes.reduce((total, prize) => total + prize.weightBps, 0)
    if (configuredWeight + weightBps > WEIGHT_DENOMINATOR) {
      setErrorMessage("Total configured slot odds cannot exceed 100%")
      setTxStatus('error')
      return
    }

    let amountPerWin: bigint
    try {
      amountPerWin = parseEther(slotFregPrizeAmount.trim())
    } catch {
      setErrorMessage("FREG win amount must be a valid token amount")
      setTxStatus('error')
      return
    }

    if (amountPerWin <= 0n) {
      setErrorMessage("FREG win amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Adding FREG prize with ${percentage}% odds...`)

    try {
      const contract = await contracts.slotMachine.write()
      const prizeId = BigInt(await contract.addERC20Prize.staticCall("FREG", FREG_COIN_ADDRESS, weightBps, amountPerWin))
      const tx = await contract.addERC20Prize("FREG", FREG_COIN_ADDRESS, weightBps, amountPerWin)
      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`FREG prize ${prizeId.toString()} added! Fund the SlotMachine FREG balance separately.`)
      setSlotPrizeId(prizeId.toString())
      setSlotPrizeWeightPercent(String(percentage))
      setSlotSelectedErc20Amount(slotFregPrizeAmount)
      setSlotFregPrizeWeightPercent("")
      setSlotFregPrizeAmount("")
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add FREG prize")
      setTxStatus('error')
    }
  }

  const handleSetSlotERC20PrizeAmount = async () => {
    if (!contracts?.slotMachine || !selectedSlotPrize) return

    if (selectedSlotPrize.prizeType !== PRIZE_TYPE_ERC20) {
      setErrorMessage("Selected prize is not an ERC20 prize")
      setTxStatus('error')
      return
    }

    let amountPerWin: bigint
    try {
      amountPerWin = parseEther(slotSelectedErc20Amount.trim())
    } catch {
      setErrorMessage("ERC20 win amount must be a valid token amount")
      setTxStatus('error')
      return
    }

    if (amountPerWin <= 0n) {
      setErrorMessage("ERC20 win amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Setting prize ${selectedSlotPrize.prizeId} win amount...`)

    try {
      const contract = await contracts.slotMachine.write()
      const tx = await contract.setERC20PrizeAmount(selectedSlotPrize.prizeId, amountPerWin)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Prize ${selectedSlotPrize.prizeId} win amount updated!`)
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to set ERC20 prize amount")
      setTxStatus('error')
    }
  }

  const handleFundSlotFreg = async () => {
    if (!contracts?.slotMachine || !FREG_COIN_ADDRESS) return

    let amount: bigint
    try {
      amount = parseEther(slotFregDepositAmount.trim())
    } catch {
      setErrorMessage("FREG funding amount must be a valid token amount")
      setTxStatus('error')
      return
    }

    if (amount <= 0n) {
      setErrorMessage("FREG funding amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Funding SlotMachine with ${slotFregDepositAmount} FREG...`)

    try {
      const slotAddress = await contracts.slotMachine.read.getAddress()
      const signer = await contracts.getSigner()
      const fregCoin = new Contract(FREG_COIN_ADDRESS, [
        "function transfer(address, uint256) returns (bool)",
      ], signer)
      const tx = await fregCoin.transfer(slotAddress, amount)
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Funded SlotMachine with ${slotFregDepositAmount} FREG!`)
      setSlotFregDepositAmount("")
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to fund SlotMachine FREG")
      setTxStatus('error')
    }
  }

  const handleDepositSlotERC20Prize = async () => {
    if (!contracts?.slotMachine || !selectedSlotPrize) return

    if (selectedSlotPrize.prizeType !== PRIZE_TYPE_ERC20) {
      setErrorMessage("Selected prize is not an ERC20 prize")
      setTxStatus('error')
      return
    }

    let amount: bigint
    try {
      amount = parseEther(slotSelectedErc20DepositAmount.trim())
    } catch {
      setErrorMessage("Deposit amount must be a valid token amount")
      setTxStatus('error')
      return
    }

    if (amount <= 0n) {
      setErrorMessage("Deposit amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setTxMessage(`Funding SlotMachine with ${slotSelectedErc20DepositAmount} ${selectedSlotPrizeTokenLabel}...`)

    try {
      const slotAddress = await contracts.slotMachine.read.getAddress()
      const signer = await contracts.getSigner()
      const prizeToken = new Contract(selectedSlotPrize.token, [
        "function transfer(address, uint256) returns (bool)",
      ], signer)
      const tx = await prizeToken.transfer(slotAddress, amount)
      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`Funded SlotMachine with ${slotSelectedErc20DepositAmount} ${selectedSlotPrizeTokenLabel}!`)
      setSlotSelectedErc20DepositAmount("")
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to deposit ERC20 prize funding")
      setTxStatus('error')
    }
  }

  const handleRegisterSlotPrizeTokens = async () => {
    if (!contracts?.slotMachine) return

    const prizeId = Number(slotPrizeId)
    const tokenIds = parseTokenIdInput(slotRegisterTokenIds)
    const prize = slotPrizes.find(p => p.prizeId === prizeId)

    if (prize?.mintOnWin) {
      setErrorMessage("This prize mints on win, so it does not use registered token inventory.")
      setTxStatus('error')
      return
    }

    if (!Number.isInteger(prizeId) || prizeId <= 0) {
      setErrorMessage("Prize ID must be a positive number")
      setTxStatus('error')
      return
    }

    if (tokenIds.length === 0) {
      setErrorMessage("No valid token IDs provided")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setSlotRegistrationProgress({ current: 0, total: tokenIds.length })

    try {
      if (prize?.itemTypeId) {
        setTxMessage(`Checking item types for ${tokenIds.length} token${tokenIds.length === 1 ? "" : "s"}...`)
        await waitForTokenItemTypes(tokenIds, prize.itemTypeId)
      }

      const contract = await contracts.slotMachine.write()

      for (let i = 0; i < tokenIds.length; i += 1) {
        setSlotRegistrationProgress({ current: i + 1, total: tokenIds.length })
        setTxMessage(`Registering token ${tokenIds[i]} as prize ${prizeId} (${i + 1}/${tokenIds.length})...`)
        const tx = await contract.registerERC721Prize(prizeId, tokenIds[i])
        setTxStatus('confirming')
        await tx.wait()
        if (i < tokenIds.length - 1) {
          setTxStatus('pending')
        }
      }

      setTxStatus('success')
      setTxMessage(`Registered ${tokenIds.length} prize token${tokenIds.length === 1 ? "" : "s"}!`)
      setSlotRegisterTokenIds("")
      setSlotRegistrationProgress({ current: 0, total: 0 })
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to register prize tokens")
      setTxStatus('error')
    }
  }

  const handleFindUnregisteredSlotPrizeTokens = async () => {
    if (!contracts?.slotMachine || !selectedSlotPrize) return

    if (selectedSlotPrize.mintOnWin) {
      setErrorMessage("This prize mints on win, so there are no unregistered inventory tokens to find.")
      setTxStatus('error')
      return
    }

    const prizeId = Number(slotPrizeId)
    const itemTypeId = selectedSlotPrize.itemTypeId || slotMintItemType

    setTxStatus('pending')
    setTxMessage(`Finding unregistered item tokens for prize ${prizeId}...`)

    try {
      const slotAddress = await contracts.slotMachine.read.getAddress()
      const ownedTokenIds = await getOwnedItemIdsByType(slotAddress, itemTypeId)
      let trackedTokenIds: string[] = []

      try {
        const tracked = await contracts.slotMachine.read.getERC721PrizeTokenIds(prizeId)
        trackedTokenIds = tracked.map((tokenId: bigint) => tokenId.toString())
      } catch {}

      const trackedSet = new Set(trackedTokenIds)
      const unregisteredTokenIds = ownedTokenIds.filter(tokenId => !trackedSet.has(tokenId))
      setSlotRegisterTokenIds(unregisteredTokenIds.join("\n"))
      setTxStatus('success')
      setTxMessage(`Found ${unregisteredTokenIds.length} unregistered token${unregisteredTokenIds.length === 1 ? "" : "s"} for prize ${prizeId}.`)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to find unregistered prize tokens")
      setTxStatus('error')
    }
  }

  const handleMintAndRegisterSlotPrize = async () => {
    if (!contracts?.slotMachine || !contracts?.items) return

    const prizeId = Number(slotPrizeId)
    const amount = Number(slotMintAmount)
    const prize = slotPrizes.find(p => p.prizeId === prizeId)
    const mintItemTypeId = prize?.itemTypeId || slotMintItemType

    if (prize?.mintOnWin) {
      setErrorMessage("This prize mints on win, so you do not need to mint and register inventory.")
      setTxStatus('error')
      return
    }

    if (!Number.isInteger(prizeId) || prizeId <= 0) {
      setErrorMessage("Prize ID must be a positive number")
      setTxStatus('error')
      return
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      setErrorMessage("Mint amount must be greater than 0")
      setTxStatus('error')
      return
    }

    setTxStatus('pending')
    setSlotRegistrationProgress({ current: 0, total: amount })
    setTxMessage(`Minting ${amount} item${amount === 1 ? "" : "s"} to the slot machine...`)

    try {
      const slotAddress = await contracts.slotMachine.read.getAddress()
      const before = await getOwnedItemIdsByType(slotAddress, mintItemTypeId)
      const itemsWrite = await contracts.items.write()
      const mintTx = await itemsWrite.ownerMint(slotAddress, mintItemTypeId, amount)
      setTxStatus('confirming')
      const mintReceipt = await mintTx.wait()

      let mintedTokenIds = getOwnerMintedTokenIdsFromReceipt(mintReceipt, slotAddress, mintItemTypeId, amount)
      if (mintedTokenIds.length !== amount) {
        setTxStatus('pending')
        setTxMessage("Mint confirmed. Waiting for RPC reads to catch up...")
        mintedTokenIds = await waitForMintedItemIds(slotAddress, mintItemTypeId, before, amount)
      }

      if (mintedTokenIds.length !== amount) {
        throw new Error(
          `Expected ${amount} minted item tokens, found ${mintedTokenIds.length}. ` +
          "The mint may still have succeeded; use Find unregistered, then Register Tokens."
        )
      }

      if (prize?.itemTypeId) {
        setTxStatus('pending')
        setTxMessage(`Checking minted token item types before registration...`)
        await waitForTokenItemTypes(mintedTokenIds, prize.itemTypeId)
      }

      const slotWrite = await contracts.slotMachine.write()
      setTxStatus('pending')

      for (let i = 0; i < mintedTokenIds.length; i += 1) {
        setSlotRegistrationProgress({ current: i + 1, total: mintedTokenIds.length })
        setTxMessage(`Registering token ${mintedTokenIds[i]} as prize ${prizeId} (${i + 1}/${mintedTokenIds.length})...`)
        const registerTx = await slotWrite.registerERC721Prize(prizeId, mintedTokenIds[i])
        setTxStatus('confirming')
        await registerTx.wait()
        if (i < mintedTokenIds.length - 1) {
          setTxStatus('pending')
        }
      }

      setTxStatus('success')
      setTxMessage(`Minted and registered ${mintedTokenIds.length} slot prize token${mintedTokenIds.length === 1 ? "" : "s"}!`)
      setSlotRegistrationProgress({ current: 0, total: 0 })
      await refreshSlotPrizes()
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to mint and register slot prize")
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
        case 'slotMachine': {
          if (!contracts.slotMachine) throw new Error("SlotMachine contract not configured")
          const contract = await contracts.slotMachine.write()
          tx = await contract.setActive(!featureFlags.slotMachineActive)
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
    setTxMessage(`Checking ${addresses.length} addresses for contracts...`)

    const { receivers, skipped } = await filterOutNonReceivers(addresses)
    const skippedNote = skipped.length > 0 ? ` (skipped ${skipped.length} non-receiver contract${skipped.length > 1 ? 's' : ''}: ${skipped.join(', ')})` : ''

    if (receivers.length === 0) {
      setErrorMessage(`No addresses can receive ERC1155 tokens.${skippedNote}`)
      setTxStatus('error')
      return
    }

    setTxMessage(`Airdropping ${amount} mint pass(es) to ${receivers.length} wallets...${skippedNote}`)

    try {
      const contract = await contracts.mintPass.write()

      // Use the airdrop function with same amount for all
      const amounts = receivers.map(() => amount)
      const tx = await contract.airdrop(receivers, amounts)

      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`Airdropped ${amount} mint pass(es) to ${receivers.length} wallets!${skippedNote}`)
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

  const filterOutNonReceivers = async (addresses: string[]): Promise<{ receivers: string[]; skipped: string[] }> => {
    if (!contracts) return { receivers: addresses, skipped: [] }
    const ON_ERC1155_RECEIVED_SELECTOR = '0xf23a6e61'
    const results = await Promise.all(
      addresses.map(async (addr) => {
        const code = await contracts.provider.getCode(addr)
        if (code === '0x') return { addr, ok: true } // EOA, always fine
        // Contract: check if it accepts ERC1155
        try {
          const iface = new Contract(addr, [
            'function onERC1155Received(address,address,uint256,uint256,bytes) view returns (bytes4)'
          ], contracts.provider)
          const result = await iface.onERC1155Received(
            addr, addr, 0, 1, '0x'
          )
          return { addr, ok: result === ON_ERC1155_RECEIVED_SELECTOR }
        } catch {
          return { addr, ok: false }
        }
      })
    )
    return {
      receivers: results.filter(r => r.ok).map(r => r.addr),
      skipped: results.filter(r => !r.ok).map(r => r.addr),
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
    setTxMessage(`Checking ${addresses.length} addresses for contracts...`)

    const { receivers, skipped } = await filterOutNonReceivers(addresses)
    const skippedNote = skipped.length > 0 ? ` (skipped ${skipped.length} non-receiver contract${skipped.length > 1 ? 's' : ''}: ${skipped.join(', ')})` : ''

    if (receivers.length === 0) {
      setErrorMessage(`No addresses can receive ERC1155 tokens.${skippedNote}`)
      setTxStatus('error')
      return
    }

    setTxMessage(`Airdropping ${amount} spin token(s) to ${receivers.length} wallets...${skippedNote}`)

    try {
      const contract = await contracts.spinTheWheel.write()
      const amounts = receivers.map(() => amount)
      const tx = await contract.airdrop(receivers, amounts)

      setTxStatus('confirming')
      await tx.wait()

      setTxStatus('success')
      setTxMessage(`Airdropped ${amount} spin token(s) to ${receivers.length} wallets!${skippedNote}`)
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

  const selectedSlotPrize = slotPrizes.find(prize => prize.prizeId === Number(slotPrizeId))
  const validSlotTokenIds = parseTokenIdInput(slotRegisterTokenIds)
  const slotConfiguredWinWeightBps = slotPrizes.reduce((total, prize) => total + prize.weightBps, 0)
  const slotFundedWinWeightBps = slotPrizes.reduce(
    (total, prize) => total + (prize.active && prize.stock > 0n ? prize.weightBps : 0),
    0
  )
  const txBusy = txStatus === 'pending' || txStatus === 'confirming'
  const selectedPrizeItemType = selectedSlotPrize?.itemTypeId || 0
  const slotMintEffectiveItemType = selectedPrizeItemType || slotMintItemType
  const slotMintItemTypeOptions = itemTypes.some(type => type.id === slotMintEffectiveItemType)
    ? itemTypes
    : selectedPrizeItemType > 0
      ? [{ id: selectedPrizeItemType, name: `Prize item type ${selectedPrizeItemType}` }, ...itemTypes]
      : itemTypes
  const selectedSlotPrizeMintsOnWin = Boolean(selectedSlotPrize?.mintOnWin)
  const selectedSlotPrizeIsERC20 = selectedSlotPrize?.prizeType === PRIZE_TYPE_ERC20
  const selectedSlotPrizeIsFreg = Boolean(selectedSlotPrize && addressesEqual(selectedSlotPrize.token, FREG_COIN_ADDRESS))
  const selectedSlotPrizeTokenLabel = selectedSlotPrize && addressesEqual(selectedSlotPrize.token, FREG_COIN_ADDRESS) ? "FREG" : "ERC20"
  const slotMintButtonDisabled = txBusy || !contracts?.slotMachine || !selectedSlotPrize || selectedSlotPrizeMintsOnWin || slotMintEffectiveItemType <= 0 || Number(slotMintAmount) <= 0
  const slotPaymentsGoToSlot = Boolean(slotPaymentVault && SLOT_MACHINE_ADDRESS && addressesEqual(slotPaymentVault, SLOT_MACHINE_ADDRESS))
  const slotPaymentsGoToLiquidity = Boolean(slotPaymentVault && FREGS_LIQUIDITY_ADDRESS && addressesEqual(slotPaymentVault, FREGS_LIQUIDITY_ADDRESS))
  const slotPaymentVaultLabel = slotPaymentsGoToSlot
    ? "SlotMachine"
    : slotPaymentsGoToLiquidity
      ? "Liquidity"
      : slotPaymentVault
        ? formatShortAddress(slotPaymentVault)
        : "Unknown"

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
                { key: 'slotMachine', label: 'Slot Machine', active: featureFlags.slotMachineActive, disabled: !contracts?.slotMachine },
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

        {/* Shop FREG Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowShopFunding(!showShopFunding)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Coins className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Shop FREG</span>
              <span className={`font-righteous text-xs px-2 py-0.5 rounded-full ${
                contracts?.fregShop ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}>
                {contracts?.fregShop ? "Configured" : "Missing Address"}
              </span>
            </div>
            {showShopFunding ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showShopFunding && (
            <CardContent className="p-6 pt-0 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">Contract</p>
                  <p className="font-mono text-orange-400 break-all">
                    {FREG_SHOP_ADDRESS ? formatShortAddress(FREG_SHOP_ADDRESS) : "Not configured"}
                  </p>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">FREG Balance</p>
                  <p className="font-mono text-orange-400">
                    {Number(shopCoinBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} FREG
                  </p>
                </div>
              </div>

              {!contracts?.fregShop ? (
                <p className="font-righteous text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  Set VITE_FREG_SHOP_ADDRESS for this network before managing shop funds.
                </p>
              ) : (
                <div className="bg-black/30 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-righteous text-white/70">Withdraw FREG from shop</span>
                    <Button
                      onClick={refreshShopFregBalance}
                      disabled={txBusy}
                      className="bg-black/50 border-2 border-orange-400/50 hover:bg-orange-500/20 text-orange-400 font-bangers disabled:opacity-50"
                    >
                      Refresh
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label className="font-righteous text-white/70 block mb-2">Recipient</label>
                      <Input
                        type="text"
                        value={shopCoinWithdrawRecipient}
                        onChange={(e) => setShopCoinWithdrawRecipient(e.target.value)}
                        className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                        placeholder="Connected wallet"
                      />
                    </div>
                    <div>
                      <label className="font-righteous text-white/70 block mb-2">Amount</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.000000000000000001"
                        value={shopCoinWithdrawAmount}
                        onChange={(e) => setShopCoinWithdrawAmount(e.target.value)}
                        className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                        placeholder="0"
                      />
                    </div>
                    <Button
                      onClick={handleShopFregWithdraw}
                      disabled={txBusy || !shopCoinWithdrawAmount}
                      className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Slot Machine Prize Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowSlotMachine(!showSlotMachine)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Slot Machine Prizes</span>
              <span className={`font-righteous text-xs px-2 py-0.5 rounded-full ${
                contracts?.slotMachine ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}>
                {contracts?.slotMachine ? "Configured" : "Missing Address"}
              </span>
            </div>
            {showSlotMachine ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showSlotMachine && (
            <CardContent className="p-6 pt-0 space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">Contract</p>
                  <p className="font-mono text-orange-400 break-all">
                    {SLOT_MACHINE_ADDRESS ? formatShortAddress(SLOT_MACHINE_ADDRESS) : "Not configured"}
                  </p>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">Configured Win Odds</p>
                  <p className="font-mono text-orange-400">
                    {formatWeightPercent(slotConfiguredWinWeightBps)}
                  </p>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">Funded Win Odds</p>
                  <p className="font-mono text-orange-400">
                    {formatWeightPercent(slotFundedWinWeightBps)}
                  </p>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="font-righteous text-white/50 text-xs uppercase">Slot FREG Balance</p>
                  <p className="font-mono text-orange-400">
                    {Number(slotFregContractBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {!contracts?.slotMachine ? (
                <p className="font-righteous text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  Set VITE_SLOT_MACHINE_ADDRESS for this network before managing slot prizes.
                </p>
              ) : (
                <>
                  <div className="bg-black/30 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                      <span className="font-righteous text-white/70">Current prizes</span>
                      <Button
                        onClick={refreshSlotPrizes}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers px-4 py-1"
                      >
                        Refresh
                      </Button>
                    </div>

                    {slotPrizes.length === 0 ? (
                      <p className="font-righteous text-white/50">No prizes configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {slotPrizes.map(prize => (
                          <div key={prize.prizeId} className="grid gap-2 md:grid-cols-[80px_1fr_110px_110px_90px] items-center bg-black/30 rounded-lg p-3">
                            <span className="font-mono text-white/70">#{prize.prizeId}</span>
                            <div className="min-w-0">
                              <p className="font-bangers text-xl text-white truncate">{prize.name}</p>
                              <p className="font-mono text-xs text-white/45 break-all">
                                {formatShortAddress(prize.token)}
                                {prize.itemTypeId > 0 ? ` | item type ${prize.itemTypeId}` : ""}
                                {prize.prizeType === PRIZE_TYPE_ERC20 ? " | ERC20" : ""}
                              </p>
                              {prize.prizeType === PRIZE_TYPE_ERC20 && (
                                <p className="font-righteous text-xs text-cyan-300">
                                  Pays {formatEther(prize.erc20Amount)} {addressesEqual(prize.token, FREG_COIN_ADDRESS) ? "FREG" : "tokens"} per win
                                </p>
                              )}
                              {prize.mintOnWin && (
                                <p className="font-righteous text-xs text-lime-400">
                                  Mints on win: {prize.mintCount.toString()} / {prize.mintMaxSupply.toString()}
                                </p>
                              )}
                            </div>
                            <span className="font-righteous text-orange-400 tabular-nums">
                              {formatWeightPercent(prize.weightBps)}
                            </span>
                            <span className="font-righteous text-white/70 tabular-nums">
                              Stock: {prize.stock.toString()}
                            </span>
                            <span className={`font-righteous text-xs px-2 py-0.5 rounded-full text-center ${
                              prize.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                            }`}>
                              {prize.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        ))}

                        <div className="grid gap-2 md:grid-cols-[80px_1fr_110px_110px_90px] items-center border-t border-white/10 pt-3">
                          <span className="font-mono text-white/70">-</span>
                          <span className="font-righteous text-white/70">No Win</span>
                          <span className="font-righteous text-orange-400 tabular-nums">
                            {formatWeightPercent(Math.max(0, WEIGHT_DENOMINATOR - slotConfiguredWinWeightBps))}
                          </span>
                          <span className="font-righteous text-white/70">
                            Effective: {formatWeightPercent(Math.max(0, WEIGHT_DENOMINATOR - slotFundedWinWeightBps))}
                          </span>
                          <span />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-black/30 rounded-lg p-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-[160px_1fr_auto_auto] items-center">
                      <label className="font-righteous text-white/70">Payment vault:</label>
                      <div>
                        <div className="font-mono text-orange-400">{slotPaymentVaultLabel}</div>
                        <div className="font-mono text-xs text-white/45 break-all">
                          {slotPaymentVault || "Not loaded"} | {slotSpinCost > 0n ? formatEther(slotSpinCost) : "..."} FREG / spin
                        </div>
                      </div>
                      <Button
                        onClick={() => handleSetSlotPaymentVault("slot")}
                        disabled={txBusy || slotPaymentsGoToSlot || slotPendingSpinCount !== "0" || slotSpinCost <= 0n}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                      >
                        Use Slot
                      </Button>
                      <Button
                        onClick={() => handleSetSlotPaymentVault("liquidity")}
                        disabled={txBusy || slotPaymentsGoToLiquidity || slotPendingSpinCount !== "0" || slotSpinCost <= 0n || !FREGS_LIQUIDITY_ADDRESS}
                        className="bg-black/50 border-2 border-orange-400/50 hover:bg-orange-500/20 text-orange-400 font-bangers disabled:opacity-50"
                      >
                        Use Liquidity
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-center">
                      <label className="font-righteous text-white/70">Callback gas:</label>
                      <Input
                        type="number"
                        min="1"
                        value={slotCallbackGasLimit}
                        onChange={(e) => setSlotCallbackGasLimit(e.target.value)}
                        className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                      />
                      <Button
                        onClick={handleSetSlotCallbackGasLimit}
                        disabled={txBusy}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                      >
                        Set Gas
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-center">
                      <label className="font-righteous text-white/70">Confirmations:</label>
                      <Input
                        type="number"
                        min="1"
                        value={slotRequestConfirmations}
                        onChange={(e) => setSlotRequestConfirmations(e.target.value)}
                        className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                      />
                      <Button
                        onClick={handleSetSlotRequestConfirmations}
                        disabled={txBusy}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                      >
                        Set Conf
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-center">
                      <label className="font-righteous text-white/70">Pending spins:</label>
                      <div className="font-mono text-orange-400">{slotPendingSpinCount}</div>
                      <Button
                        onClick={refreshSlotPrizes}
                        disabled={txBusy}
                        className="bg-black/50 border-2 border-orange-400/50 hover:bg-orange-500/20 text-orange-400 font-bangers disabled:opacity-50"
                      >
                        Refresh
                      </Button>
                    </div>

                    {slotPendingSpinCount !== "0" && (
                      <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-center">
                        <label className="font-righteous text-white/70">Resolve request:</label>
                        <Input
                          type="text"
                          value={slotResolveRequestId}
                          onChange={(e) => setSlotResolveRequestId(e.target.value)}
                          className="bg-black/50 border-2 border-red-400/50 text-white font-mono"
                          placeholder="VRF request ID"
                        />
                        <Button
                          onClick={handleResolveSlotPendingSpin}
                          disabled={txBusy || !slotResolveRequestId.trim()}
                          className="bg-red-500 hover:bg-red-400 text-white font-bangers disabled:opacity-50"
                        >
                          Resolve Loss
                        </Button>
                      </div>
                    )}

                    <p className="font-righteous text-white/50 text-sm">
                      Payment vault changes require zero pending spins. Callback gas is used by Chainlink VRF when settling slot spins. Use 1000000 or higher for ERC721 prize mints.
                    </p>
                  </div>

                  <div className="bg-black/30 rounded-lg p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bangers text-2xl text-orange-400">Add FREG Prize</p>
                        <p className="font-righteous text-white/50 text-sm">
                          Adds a prize configuration only. Fund the SlotMachine FREG balance separately.
                        </p>
                      </div>
                      <Button
                        onClick={handleAddSlotFregPrize}
                        disabled={txBusy || !FREG_COIN_ADDRESS || !slotFregPrizeWeightPercent || !slotFregPrizeAmount}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                      >
                        Add FREG Prize
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="font-righteous text-white/70 block mb-2">Win odds %</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={slotFregPrizeWeightPercent}
                          onChange={(e) => setSlotFregPrizeWeightPercent(e.target.value)}
                          className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                          placeholder="5"
                        />
                      </div>
                      <div>
                        <label className="font-righteous text-white/70 block mb-2">Win amount</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.000000000000000001"
                          value={slotFregPrizeAmount}
                          onChange={(e) => setSlotFregPrizeAmount(e.target.value)}
                          className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                          placeholder="1000000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/30 rounded-lg p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bangers text-2xl text-orange-400">Fund Slot FREG</p>
                        <p className="font-righteous text-white/50 text-sm">
                          Sends FREG directly to the SlotMachine contract. This shared balance funds all FREG prize configurations.
                        </p>
                      </div>
                      <div className="font-mono text-orange-400">
                        Balance: {Number(slotFregContractBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} FREG
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                      <div>
                        <label className="font-righteous text-white/70 block mb-2">Funding amount</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.000000000000000001"
                          value={slotFregDepositAmount}
                          onChange={(e) => setSlotFregDepositAmount(e.target.value)}
                          className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                          placeholder="10000000"
                        />
                      </div>
                      <Button
                        onClick={handleFundSlotFreg}
                        disabled={txBusy || !FREG_COIN_ADDRESS || !slotFregDepositAmount}
                        className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                      >
                        Fund FREG
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="bg-black/30 rounded-lg p-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-[120px_1fr] items-center">
                        <label className="font-righteous text-white/70">Prize ID:</label>
                        <Input
                          type="number"
                          min="1"
                          value={slotPrizeId}
                          onChange={(e) => {
                            const nextPrizeId = e.target.value
                            setSlotPrizeId(nextPrizeId)
                            const prize = slotPrizes.find(p => p.prizeId === Number(nextPrizeId))
                            if (prize) {
                              setSlotPrizeWeightPercent(String(prize.weightBps / 100))
                              setSlotPrizeMaxSupply(prize.mintOnWin ? prize.mintMaxSupply.toString() : "")
                              setSlotSelectedErc20Amount(prize.prizeType === PRIZE_TYPE_ERC20 ? formatEther(prize.erc20Amount) : "")
                            }
                          }}
                          className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                        />
                      </div>

                      {selectedSlotPrize && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/30 p-3">
                          <p className="font-righteous text-white/50 text-sm">
                            Selected: {selectedSlotPrize.name} with {formatWeightPercent(selectedSlotPrize.weightBps)} odds and {selectedSlotPrize.stock.toString()} {selectedSlotPrize.mintOnWin ? "mints remaining" : "funded win(s)"}.
                          </p>
                          <Button
                            onClick={() => handleSetSlotPrizeActive(!selectedSlotPrize.active)}
                            disabled={txBusy}
                            className={`font-bangers disabled:opacity-50 ${
                              selectedSlotPrize.active
                                ? "bg-red-500 hover:bg-red-400 text-white"
                                : "bg-green-500 hover:bg-green-400 text-black"
                            }`}
                          >
                            {selectedSlotPrize.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] items-center">
                        <label className="font-righteous text-white/70">Win odds:</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={slotPrizeWeightPercent}
                          onChange={(e) => setSlotPrizeWeightPercent(e.target.value)}
                          className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                          placeholder={selectedSlotPrize ? String(selectedSlotPrize.weightBps / 100) : "10"}
                        />
                        <Button
                          onClick={handleSetSlotPrizeWeight}
                          disabled={txBusy || !selectedSlotPrize || !slotPrizeWeightPercent}
                          className="bg-orange-500 hover:bg-orange-400 text-black font-bangers"
                        >
                          Set Odds
                        </Button>
                      </div>

                      {selectedSlotPrize?.mintOnWin && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] items-center">
                            <label className="font-righteous text-white/70">Max prizes:</label>
                            <Input
                              type="number"
                              min={selectedSlotPrize.mintCount.toString()}
                              step="1"
                              value={slotPrizeMaxSupply}
                              onChange={(e) => setSlotPrizeMaxSupply(e.target.value)}
                              className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                              placeholder={selectedSlotPrize.mintMaxSupply.toString()}
                            />
                            <Button
                              onClick={handleSetSlotPrizeMaxSupply}
                              disabled={txBusy || !slotPrizeMaxSupply}
                              className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                            >
                              Set Max
                            </Button>
                          </div>

                          <p className="font-righteous text-white/50 text-sm">
                            Already minted {selectedSlotPrize.mintCount.toString()} of {selectedSlotPrize.mintMaxSupply.toString()}.
                          </p>
                        </>
                      )}

                    <p className="font-righteous text-white/50 text-sm">
                      Odds are stored on the prize as basis points. Mint-on-win prizes use their configured max supply; inventory prizes use registered token stock.
                    </p>
                    </div>

                    <div className="bg-black/30 rounded-lg p-4 space-y-4">
                      <div>
                        <p className="font-bangers text-2xl text-orange-400">ERC20 Prize Settings</p>
                        <p className="font-righteous text-white/50 text-sm">
                          Select an ERC20 prize to update its payout. FREG funding is handled by the separate Slot FREG balance above.
                        </p>
                      </div>

                      {selectedSlotPrizeIsERC20 && selectedSlotPrize ? (
                        <>
                          <div className="bg-black/30 rounded-lg p-3 space-y-1">
                            <p className="font-righteous text-white/70">
                              {selectedSlotPrize.name}: {selectedSlotPrize.stock.toString()} funded win{selectedSlotPrize.stock === 1n ? "" : "s"}
                            </p>
                            <p className="font-mono text-xs text-white/45 break-all">
                              Token: {selectedSlotPrize.token}
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] items-center">
                            <label className="font-righteous text-white/70">Win amount:</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.000000000000000001"
                              value={slotSelectedErc20Amount}
                              onChange={(e) => setSlotSelectedErc20Amount(e.target.value)}
                              className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                              placeholder={formatEther(selectedSlotPrize.erc20Amount)}
                            />
                            <Button
                              onClick={handleSetSlotERC20PrizeAmount}
                              disabled={txBusy || !slotSelectedErc20Amount}
                              className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                            >
                              Set Win
                            </Button>
                          </div>

                          {selectedSlotPrizeIsFreg ? (
                            <p className="font-righteous text-white/50 text-sm">
                              This is a FREG prize. Use Fund Slot FREG above to add shared prize balance.
                            </p>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] items-center">
                              <label className="font-righteous text-white/70">Fund token:</label>
                              <Input
                                type="number"
                                min="0"
                                step="0.000000000000000001"
                                value={slotSelectedErc20DepositAmount}
                                onChange={(e) => setSlotSelectedErc20DepositAmount(e.target.value)}
                                className="bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                                placeholder="10000000"
                              />
                              <Button
                                onClick={handleDepositSlotERC20Prize}
                                disabled={txBusy || !slotSelectedErc20DepositAmount}
                                className="bg-orange-500 hover:bg-orange-400 text-black font-bangers disabled:opacity-50"
                              >
                                Fund Token
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="font-righteous text-white/50 text-sm">
                          No ERC20 prize selected.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
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
