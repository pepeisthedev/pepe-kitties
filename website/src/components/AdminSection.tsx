import React, { useState, useEffect } from "react"
import { parseEther, formatEther, isAddress } from "ethers"
import Section from "./Section"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Settings, Package, Plus, ChevronDown, ChevronUp, CheckCircle, XCircle, Ticket } from "lucide-react"
import { useContractData, useContracts } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog"
import { TRAIT_TYPES, ITEM_TYPES, ITEM_TYPE_NAMES } from "../config/contracts"

type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

interface ItemType {
  id: number
  name: string
}

export default function AdminSection(): React.JSX.Element {
  const contracts = useContracts()
  const { data: contractData, refetch } = useContractData()

  // Panel visibility
  const [showSettings, setShowSettings] = useState(true)
  const [showMintItems, setShowMintItems] = useState(false)
  const [showCreateItem, setShowCreateItem] = useState(false)
  const [showMintPass, setShowMintPass] = useState(false)

  // Settings form
  const [mintPrice, setMintPrice] = useState("")
  const [supply, setSupply] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [contractBalance, setContractBalance] = useState("0")

  // Mint items form
  const [selectedItemType, setSelectedItemType] = useState<number>(ITEM_TYPES.COLOR_CHANGE)
  const [addressesInput, setAddressesInput] = useState("")
  const [mintAmount, setMintAmount] = useState("1")
  const [mintProgress, setMintProgress] = useState({ current: 0, total: 0 })
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])

  // Create item type form
  const [newItemName, setNewItemName] = useState("")
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemTraitType, setNewItemTraitType] = useState<number>(TRAIT_TYPES.HEAD)
  const [newItemTraitValue, setNewItemTraitValue] = useState("")
  const [newItemOwnerMintable, setNewItemOwnerMintable] = useState(true)
  const [newItemClaimable, setNewItemClaimable] = useState(false)
  const [newItemClaimWeight, setNewItemClaimWeight] = useState("0")

  // Mint pass form
  const [mintPassAddresses, setMintPassAddresses] = useState("")
  const [mintPassAmount, setMintPassAmount] = useState("1")
  const [mintPassProgress, setMintPassProgress] = useState({ current: 0, total: 0 })
  const [mintPassData, setMintPassData] = useState({ totalMinted: 0, maxMintPasses: 0 })

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

        // Fetch built-in item types
        const types: ItemType[] = Object.entries(ITEM_TYPE_NAMES).map(([id, name]) => ({
          id: Number(id),
          name,
        }))

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
        const [totalMinted, maxMintPasses] = await Promise.all([
          contracts.mintPass.read.totalMinted(),
          contracts.mintPass.read.maxMintPasses(),
        ])
        setMintPassData({
          totalMinted: Number(totalMinted),
          maxMintPasses: Number(maxMintPasses),
        })
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

    const addresses = addressesInput
      .split('\n')
      .map(a => a.trim())
      .filter(a => isAddress(a))

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

  const handleCreateItemType = async () => {
    if (!contracts) return
    setTxStatus('pending')
    setTxMessage("Creating new item type...")

    try {
      const contract = await contracts.items.write()
      const tx = await contract.addItemType(
        newItemName,
        newItemDescription,
        newItemTraitType,
        Number(newItemTraitValue),
        newItemOwnerMintable,
        newItemClaimable,
        Number(newItemClaimWeight)
      )
      setTxStatus('confirming')
      await tx.wait()
      setTxStatus('success')
      setTxMessage(`Item type "${newItemName}" created!`)

      // Reset form
      setNewItemName("")
      setNewItemDescription("")
      setNewItemTraitValue("")
      setNewItemOwnerMintable(true)
      setNewItemClaimable(false)
      setNewItemClaimWeight("0")

      // Refresh item types
      const types: ItemType[] = [...itemTypes]
      const newId = types.length > 0 ? Math.max(...types.map(t => t.id)) + 1 : 101
      types.push({ id: newId, name: newItemName })
      setItemTypes(types)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create item type")
      setTxStatus('error')
    }
  }

  const handleMintPassAirdrop = async () => {
    if (!contracts) return

    const addresses = mintPassAddresses
      .split('\n')
      .map(a => a.trim())
      .filter(a => isAddress(a))

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
      const [totalMinted, maxMintPasses] = await Promise.all([
        contracts.mintPass.read.totalMinted(),
        contracts.mintPass.read.maxMintPasses(),
      ])
      setMintPassData({
        totalMinted: Number(totalMinted),
        maxMintPasses: Number(maxMintPasses),
      })
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to airdrop mint passes")
      setTxStatus('error')
    }
  }

  const closeModal = () => {
    setTxStatus('idle')
    setTxMessage("")
    setErrorMessage("")
  }

  const validAddressCount = addressesInput
    .split('\n')
    .map(a => a.trim())
    .filter(a => isAddress(a)).length

  const validMintPassAddressCount = mintPassAddresses
    .split('\n')
    .map(a => a.trim())
    .filter(a => isAddress(a)).length

  return (
    <Section id="admin">
      <div className="text-center mb-8">
        <h2 className="font-bangers text-5xl md:text-7xl text-orange-400 mb-2">
          ADMIN PANEL
        </h2>
        <p className="font-righteous text-white/60">Contract owner controls</p>
      </div>

      <div className="space-y-4">
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

        {/* Create Item Type Panel */}
        <Card className="bg-black/40 border-4 border-orange-400 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => setShowCreateItem(!showCreateItem)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Plus className="w-6 h-6 text-orange-400" />
              <span className="font-bangers text-2xl text-orange-400">Create New Item Type</span>
            </div>
            {showCreateItem ? <ChevronUp className="w-6 h-6 text-orange-400" /> : <ChevronDown className="w-6 h-6 text-orange-400" />}
          </button>

          {showCreateItem && (
            <CardContent className="p-6 pt-0 space-y-4">
              {/* Name */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Name:</label>
                <Input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                  placeholder="Crown"
                />
              </div>

              {/* Description */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Description:</label>
                <Input
                  type="text"
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                  placeholder="A royal crown for your Freg"
                />
              </div>

              {/* Trait Type */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Trait Type:</label>
                <select
                  value={newItemTraitType}
                  onChange={(e) => setNewItemTraitType(Number(e.target.value))}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono p-2 rounded-md"
                >
                  {Object.entries(TRAIT_TYPES).map(([name, id]) => (
                    <option key={id} value={id}>
                      {name} (ID: {id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Trait Value */}
              <div className="flex items-center gap-4">
                <label className="font-righteous text-white/70 w-32">Trait Value:</label>
                <Input
                  type="number"
                  value={newItemTraitValue}
                  onChange={(e) => setNewItemTraitValue(e.target.value)}
                  className="flex-1 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                  placeholder="ID in router"
                />
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-8">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemOwnerMintable}
                    onChange={(e) => setNewItemOwnerMintable(e.target.checked)}
                    className="w-5 h-5 accent-orange-400"
                  />
                  <span className="font-righteous text-white/70">Owner Mintable</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemClaimable}
                    onChange={(e) => setNewItemClaimable(e.target.checked)}
                    className="w-5 h-5 accent-orange-400"
                  />
                  <span className="font-righteous text-white/70">Claimable</span>
                </label>
              </div>

              {/* Claim Weight (only if claimable) */}
              {newItemClaimable && (
                <div className="flex items-center gap-4">
                  <label className="font-righteous text-white/70 w-32">Claim Weight:</label>
                  <Input
                    type="number"
                    value={newItemClaimWeight}
                    onChange={(e) => setNewItemClaimWeight(e.target.value)}
                    className="w-32 bg-black/50 border-2 border-orange-400/50 text-white font-mono"
                    placeholder="0"
                  />
                </div>
              )}

              {/* Create Button */}
              <Button
                onClick={handleCreateItemType}
                disabled={!newItemName || !newItemTraitValue}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bangers text-xl py-4 disabled:opacity-50"
              >
                Create Item Type
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
                  {mintPassData.totalMinted} / {mintPassData.maxMintPasses}
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
