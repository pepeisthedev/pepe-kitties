import React, { useState, useEffect, useMemo } from "react"
import { BrowserProvider, Contract, formatEther } from "ethers"
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider } from "@reown/appkit/react"
import Section from "./Section"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { useOwnedItems, useContractData, useContracts, useFregCoinBalance } from "../hooks"
import LoadingSpinner from "./LoadingSpinner"
import ResultModal from "./ResultModal"
import {
    ACTIVE_CHAIN_ID,
    FREGS_LIQUIDITY_ADDRESS,
    FREG_MARKET_ADDRESS,
    FREG_MARKET_CHAIN_SLUG,
    FregCoinABI,
    ITEM_TYPES,
} from "../config/contracts"
import { getFallbackProvider, readWithFallback, type ReadProvider } from "../lib/rpc"
import { ArrowUpRight, BarChart3, Check, Copy, Flame, Lock, PieChart, RefreshCw } from "lucide-react"

interface Props {
    chestOpeningActive: boolean
}

interface DexScreenerToken {
    address?: string
    name?: string
    symbol?: string
}

interface DexScreenerPair {
    chainId?: string
    dexId?: string
    url?: string
    pairAddress?: string
    baseToken?: DexScreenerToken
    quoteToken?: DexScreenerToken
    priceNative?: string
    priceUsd?: string | null
    priceChange?: {
        h24?: number
    } | null
    liquidity?: {
        usd?: number
    } | null
    volume?: {
        h24?: number
    } | null
}

interface DexScreenerPairResponse {
    pairs?: DexScreenerPair[] | null
}

interface CoinbaseSpotResponse {
    data?: {
        amount?: string
    }
}

interface VaultBalances {
    eth: bigint
    freg: bigint
}

const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006"
const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000"
const ETH_SENTINEL_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
const DEXSCREENER_API_BASE = "https://api.dexscreener.com"
const COINBASE_ETH_USD_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot"
const MARKET_REFRESH_MS = 45_000
const TOKENOMICS_ALLOCATIONS = [
    { label: "LP", percent: 30, barClass: "bg-lime-400", percentClass: "text-lime-400" },
    { label: "Airdrop", percent: 26, barClass: "bg-sky-400", percentClass: "text-sky-400" },
    { label: "Chests", percent: 10, barClass: "bg-yellow-400", percentClass: "text-yellow-400" },
    { label: "Liquidity Vault", percent: 34, barClass: "bg-pink-400", percentClass: "text-pink-400" },
]

function getNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function getPositiveNumber(value: unknown): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isSameAddress(left?: string, right?: string): boolean {
    return !!left && !!right && left.toLowerCase() === right.toLowerCase()
}

function isEthAddress(address?: string): boolean {
    return (
        isSameAddress(address, BASE_WETH_ADDRESS) ||
        isSameAddress(address, NATIVE_ETH_ADDRESS) ||
        isSameAddress(address, ETH_SENTINEL_ADDRESS)
    )
}

function chooseFregPair(pairs: DexScreenerPair[]): DexScreenerPair | null {
    if (pairs.length === 0) return null

    return [...pairs].sort((left, right) => getPairScore(right) - getPairScore(left))[0]
}

function getPairScore(pair: DexScreenerPair): number {
    const baseAddress = pair.baseToken?.address
    const quoteAddress = pair.quoteToken?.address
    const usesFreg = isSameAddress(baseAddress, FREG_MARKET_ADDRESS) || isSameAddress(quoteAddress, FREG_MARKET_ADDRESS)
    const usesEth = isEthAddress(baseAddress) || isEthAddress(quoteAddress)
    const isUniswap = pair.dexId?.toLowerCase().includes("uniswap") === true

    return (
        (usesFreg ? 1_000_000_000_000 : 0) +
        (isUniswap ? 10_000_000_000 : 0) +
        (usesEth ? 1_000_000_000 : 0) +
        getNumber(pair.liquidity?.usd) +
        getNumber(pair.volume?.h24) / 1000
    )
}

function getDexScreenerTokenUrl(): string {
    return `https://dexscreener.com/${FREG_MARKET_CHAIN_SLUG}/${FREG_MARKET_ADDRESS}`
}

function getDexScreenerChartUrl(pair: DexScreenerPair): string | null {
    if (!pair.pairAddress) return null

    const chain = pair.chainId || FREG_MARKET_CHAIN_SLUG
    return `https://dexscreener.com/${chain}/${pair.pairAddress}?embed=1&theme=dark&trades=0&info=0`
}

function getUniswapSwapUrl(inputCurrency: string, outputCurrency: string): string {
    const url = new URL("https://app.uniswap.org/swap")
    url.searchParams.set("chain", FREG_MARKET_CHAIN_SLUG)
    url.searchParams.set("inputCurrency", inputCurrency)
    url.searchParams.set("outputCurrency", outputCurrency)
    return url.toString()
}

function formatTokenAmount(value: bigint): string {
    const amount = Number(formatEther(value))
    if (!Number.isFinite(amount)) return "0"

    return amount.toLocaleString(undefined, {
        maximumFractionDigits: amount >= 1000 ? 0 : 2,
    })
}

function formatVaultAmount(value: bigint | null, maximumFractionDigits: number): string {
    if (value === null) return "Pending"

    const amount = Number(formatEther(value))
    if (!Number.isFinite(amount)) return "0"

    return amount.toLocaleString("en-US", {
        minimumFractionDigits: amount > 0 && amount < 1 ? Math.min(maximumFractionDigits, 4) : 0,
        maximumFractionDigits: amount >= 1000 ? 0 : maximumFractionDigits,
    })
}

function formatCompactTokenAmount(value: bigint | null): string {
    if (value === null) return "Pending"

    const amount = Number(formatEther(value))
    if (!Number.isFinite(amount)) return "0"
    if (amount < 1000) {
        return amount.toLocaleString("en-US", {
            maximumFractionDigits: 2,
        })
    }

    return amount.toLocaleString("en-US", {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 1,
    })
}

function formatPriceUsd(value: number | null): string {
    if (value === null) return "Pending"
    if (value === 0) return "$0.00"
    if (value >= 1) {
        return value.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    }

    if (value >= 0.01) {
        return value.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        })
    }

    return `$${value.toPrecision(4)}`
}

function formatUsdValue(value: number | null): string {
    if (value === null) return "USD pending"
    if (value > 0 && value < 0.01) return "<$0.01"

    return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

function formatCompactUsd(value: number | null): string {
    if (value === null) return "Pending"
    return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        notation: value >= 1000 ? "compact" : "standard",
        maximumFractionDigits: value >= 1000 ? 1 : 2,
    })
}

function formatPercent(value: number | undefined): string {
    if (!Number.isFinite(value)) return "Pending"
    const parsed = Number(value)
    return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`
}

function formatPairName(pair: DexScreenerPair | null): string {
    if (!pair) return "$FREG / ETH"
    const baseSymbol = formatTokenSymbol(pair.baseToken?.symbol, "FREG")
    const quoteSymbol = formatTokenSymbol(pair.quoteToken?.symbol, "ETH")
    return `${baseSymbol}/${quoteSymbol}`
}

function formatTokenSymbol(symbol: string | undefined, fallback: string): string {
    if (!symbol) return fallback
    return symbol.toUpperCase() === "WETH" ? "ETH" : symbol
}

function formatDexName(pair: DexScreenerPair | null): string {
    if (!pair?.dexId) return "Uniswap on Base"
    if (pair.dexId.toLowerCase().includes("uniswap")) return "Uniswap on Base"
    return `${pair.dexId} on Base`
}

function getPairTokenUsdPrice(pair: DexScreenerPair | null, tokenAddress: string): number | null {
    if (!pair || !tokenAddress) return null

    const baseUsd = getPositiveNumber(pair.priceUsd)
    if (baseUsd === null) return null
    const targetIsEth = isEthAddress(tokenAddress)

    if (isSameAddress(pair.baseToken?.address, tokenAddress) || (targetIsEth && isEthAddress(pair.baseToken?.address))) {
        return baseUsd
    }

    if (isSameAddress(pair.quoteToken?.address, tokenAddress) || (targetIsEth && isEthAddress(pair.quoteToken?.address))) {
        const baseInQuote = getPositiveNumber(pair.priceNative)
        return baseInQuote === null ? null : baseUsd / baseInQuote
    }

    return null
}

function parseWalletChainId(chainId: string | number | undefined): number | undefined {
    if (typeof chainId === "number") return chainId
    if (typeof chainId !== "string") return undefined

    const parsed = Number.parseInt(chainId, chainId.startsWith("0x") ? 16 : 10)
    return Number.isFinite(parsed) ? parsed : undefined
}

async function readVaultBalances(provider: ReadProvider): Promise<VaultBalances> {
    const fregCoin = new Contract(FREG_MARKET_ADDRESS, FregCoinABI, provider)
    const [eth, freg] = await Promise.all([
        provider.getBalance(FREGS_LIQUIDITY_ADDRESS),
        fregCoin.balanceOf(FREGS_LIQUIDITY_ADDRESS),
    ])

    return { eth, freg }
}

export default function TreasureChestSection({ chestOpeningActive }: Props): React.JSX.Element {
    const { isConnected } = useAppKitAccount()
    const { open } = useAppKit()
    const { walletProvider } = useAppKitProvider("eip155")
    const { chainId } = useAppKitNetwork()
    const contracts = useContracts()
    const { data: contractData } = useContractData()
    const { items, isLoading, refetch } = useOwnedItems()
    const { balance: fregBalance, refetch: refetchFregBalance } = useFregCoinBalance()

    const [marketPair, setMarketPair] = useState<DexScreenerPair | null>(null)
    const [marketLoading, setMarketLoading] = useState(false)
    const [marketError, setMarketError] = useState<string | null>(null)
    const [burningId, setBurningId] = useState<number | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalData, setModalData] = useState<{ success: boolean; message: string }>({ success: false, message: "" })
    const [redeemETH, setRedeemETH] = useState<string | null>(null)
    const [redeemCoin, setRedeemCoin] = useState<string | null>(null)
    const [contractAddressCopied, setContractAddressCopied] = useState(false)
    const [vaultBalances, setVaultBalances] = useState<VaultBalances | null>(null)
    const [vaultLoading, setVaultLoading] = useState(false)
    const [vaultError, setVaultError] = useState<string | null>(null)
    const [ethOraclePriceUsd, setEthOraclePriceUsd] = useState<number | null>(null)
    const [ethPriceLoading, setEthPriceLoading] = useState(false)

    const fregBalanceAmount = useMemo(() => Number(formatEther(fregBalance)), [fregBalance])
    const fregPriceUsd = useMemo(() => {
        return getPairTokenUsdPrice(marketPair, FREG_MARKET_ADDRESS)
    }, [marketPair])
    const ethPriceUsd = useMemo(() => {
        return getPairTokenUsdPrice(marketPair, BASE_WETH_ADDRESS) ?? ethOraclePriceUsd
    }, [marketPair, ethOraclePriceUsd])
    const fregBalanceUsd = fregPriceUsd === null ? null : fregBalanceAmount * fregPriceUsd
    const vaultEthAmount = vaultBalances === null ? null : Number(formatEther(vaultBalances.eth))
    const vaultFregAmount = vaultBalances === null ? null : Number(formatEther(vaultBalances.freg))
    const vaultEthUsd = vaultEthAmount === null || ethPriceUsd === null ? null : vaultEthAmount * ethPriceUsd
    const vaultFregUsd = vaultFregAmount === null || fregPriceUsd === null ? null : vaultFregAmount * fregPriceUsd
    const vaultEthUsdPending = vaultEthAmount !== null && vaultEthAmount > 0 && ethPriceUsd === null
    const vaultFregUsdPending = vaultFregAmount !== null && vaultFregAmount > 0 && fregPriceUsd === null
    const vaultTotalUsd = vaultEthUsdPending || vaultFregUsdPending
        ? null
        : (vaultEthUsd ?? 0) + (vaultFregUsd ?? 0)
    const chartUrl = useMemo(() => marketPair ? getDexScreenerChartUrl(marketPair) : null, [marketPair])
    const dexScreenerUrl = marketPair?.url || getDexScreenerTokenUrl()
    const uniswapBuyUrl = useMemo(() => getUniswapSwapUrl("ETH", FREG_MARKET_ADDRESS), [])
    const uniswapSellUrl = useMemo(() => getUniswapSwapUrl(FREG_MARKET_ADDRESS, "ETH"), [])
    const marketLiquidityUsd = marketPair?.liquidity?.usd ?? null
    const marketVolumeUsd = marketPair?.volume?.h24 ?? null
    const marketChange24h = marketPair?.priceChange?.h24

    useEffect(() => {
        let cancelled = false

        const fetchMarketData = async () => {
            if (!FREG_MARKET_ADDRESS) {
                setMarketPair(null)
                setMarketError("FREG market token is not configured")
                return
            }

            setMarketLoading(true)

            try {
                const endpoint = `${DEXSCREENER_API_BASE}/token-pairs/v1/${FREG_MARKET_CHAIN_SLUG}/${FREG_MARKET_ADDRESS}`
                const response = await fetch(endpoint, { headers: { Accept: "application/json" } })

                if (!response.ok) {
                    throw new Error(`Dexscreener request failed with ${response.status}`)
                }

                const data: DexScreenerPair[] | DexScreenerPairResponse = await response.json()
                const pairs = Array.isArray(data) ? data : data.pairs ?? []
                const selectedPair = chooseFregPair(pairs)

                if (!cancelled) {
                    setMarketPair(selectedPair)
                    setMarketError(null)
                }
            } catch (err) {
                console.error("Error fetching FREG market data:", err)
                if (!cancelled) {
                    setMarketPair(null)
                    setMarketError("Market data unavailable")
                }
            } finally {
                if (!cancelled) {
                    setMarketLoading(false)
                }
            }
        }

        fetchMarketData()
        const intervalId = window.setInterval(fetchMarketData, MARKET_REFRESH_MS)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const fetchEthPrice = async () => {
            setEthPriceLoading(true)

            try {
                const response = await fetch(COINBASE_ETH_USD_URL, { headers: { Accept: "application/json" } })

                if (!response.ok) {
                    throw new Error(`ETH price request failed with ${response.status}`)
                }

                const data: CoinbaseSpotResponse = await response.json()
                const price = getPositiveNumber(data.data?.amount)

                if (price === null) {
                    throw new Error("ETH price response did not include a valid amount")
                }

                if (!cancelled) {
                    setEthOraclePriceUsd(price)
                }
            } catch (err) {
                console.error("Error fetching ETH price:", err)
            } finally {
                if (!cancelled) {
                    setEthPriceLoading(false)
                }
            }
        }

        fetchEthPrice()
        const intervalId = window.setInterval(fetchEthPrice, MARKET_REFRESH_MS)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const fetchVaultBalances = async () => {
            if (!FREGS_LIQUIDITY_ADDRESS || !FREG_MARKET_ADDRESS) {
                setVaultBalances(null)
                setVaultError("Liquidity vault is not configured")
                return
            }

            const walletChainId = parseWalletChainId(chainId)
            const canUseWallet = Boolean(walletProvider) && (!isConnected || walletChainId === ACTIVE_CHAIN_ID)
            const wallet = canUseWallet ? new BrowserProvider(walletProvider as any) : null
            const fallback = getFallbackProvider()

            if (!wallet && !fallback) {
                setVaultBalances(null)
                setVaultError("Vault data unavailable")
                return
            }

            setVaultLoading(true)

            try {
                const balances = wallet
                    ? await readWithFallback(wallet, readVaultBalances)
                    : await readVaultBalances(fallback!)

                if (!cancelled) {
                    setVaultBalances(balances)
                    setVaultError(null)
                }
            } catch (err) {
                console.error("Error fetching liquidity vault balances:", err)
                if (!cancelled) {
                    setVaultBalances(null)
                    setVaultError("Vault data unavailable")
                }
            } finally {
                if (!cancelled) {
                    setVaultLoading(false)
                }
            }
        }

        fetchVaultBalances()
        const intervalId = window.setInterval(fetchVaultBalances, MARKET_REFRESH_MS)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [chainId, isConnected, walletProvider])

    // Fetch redeem amounts from liquidity contract
    useEffect(() => {
        if (!contracts?.liquidity) return
        contracts.liquidity.read.getRedeemAmount().then(([eth, coin]: [bigint, bigint]) => {
            setRedeemETH(parseFloat(formatEther(eth)).toFixed(6))
            setRedeemCoin(parseFloat(formatEther(coin)).toFixed(0))
        }).catch(() => {})
    }, [contracts])

    // Filter to only treasure chests
    const chests = items.filter(item => item.itemType === ITEM_TYPES.TREASURE_CHEST)

    const handleBurn = async (chestId: number) => {
        if (!contracts || !contractData) return

        setBurningId(chestId)
        try {
            const contract = await contracts.items.write()
            const tx = await contract.burnChest(chestId)
            await tx.wait()

            setModalData({
                success: true,
                message: `You received ${contractData.chestCoinReward} FregCoin!`
            })
            refetch()
            refetchFregBalance()
        } catch (err: any) {
            setModalData({ success: false, message: err.message || "Burn failed" })
        } finally {
            setBurningId(null)
            setShowModal(true)
        }
    }

    const handleCopyContractAddress = async () => {
        try {
            await navigator.clipboard.writeText(FREG_MARKET_ADDRESS)
            setContractAddressCopied(true)
            window.setTimeout(() => setContractAddressCopied(false), 1600)
        } catch (err) {
            console.error("Failed to copy FREG contract address:", err)
        }
    }

    return (
        <Section id="treasure-chests">
            {isConnected && (
                <div className="flex justify-end mb-4">
                    <div className="flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl md:rounded-full px-4 py-3 shadow-lg">
                        <img src="/coin.svg" alt="FREG" className="w-6 h-6" />
                        <div className="text-right leading-none">
                            <span className="block font-bangers text-xl text-yellow-400">
                                {formatTokenAmount(fregBalance)}
                            </span>
                            <span className="block font-righteous text-xs text-theme-subtle mt-1">
                                {marketLoading && fregPriceUsd === null ? "Loading USD..." : formatUsdValue(fregBalanceUsd)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
            {/* $FREG Token Info */}
            <div className="text-center mb-12">
                <h2 className="font-bangers text-5xl md:text-7xl text-theme-primary mb-4">
                    $FREG
                </h2>
                <p className="font-righteous text-xl md:text-2xl text-theme-muted max-w-2xl mx-auto mb-8">
                    The official token of the Fregs ecosystem
                </p>

                <div className="flex flex-wrap justify-center gap-3 mb-10">
                    <Button
                        asChild
                        className="font-bangers text-lg px-6 py-3 rounded-full bg-theme hover:opacity-90 text-theme border-2 border-theme"
                    >
                        <a href={dexScreenerUrl} target="_blank" rel="noreferrer">
                            <img src="/dexscreener-logo.svg" alt="" className="w-5 h-5 mr-2" />
                            Dexscreener
                            <ArrowUpRight className="w-4 h-4 ml-2" />
                        </a>
                    </Button>
                    <Button
                        asChild
                        className="font-bangers text-lg px-6 py-3 rounded-full bg-pink-500 hover:bg-pink-400 text-white border-2 border-pink-200"
                    >
                        <a href={uniswapBuyUrl} target="_blank" rel="noreferrer">
                            <img src="/uniswap-logo.svg" alt="" className="w-5 h-5 mr-2" />
                            Buy on Uniswap
                            <ArrowUpRight className="w-4 h-4 ml-2" />
                        </a>
                    </Button>
                </div>

                <Card className="max-w-6xl mx-auto mb-6 bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-5 md:p-6">
                        <div className="flex items-center gap-3 mb-5 text-left">
                            <PieChart className="w-6 h-6 text-theme-primary" />
                            <h3 className="font-bangers text-3xl text-theme-primary">Tokenomics</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {TOKENOMICS_ALLOCATIONS.map((item) => (
                                <div key={item.label} className="rounded-2xl border-2 border-theme bg-black/30 p-4 text-left">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <p className="font-righteous text-sm text-theme-muted">{item.label}</p>
                                        <p className={`font-bangers text-3xl ${item.percentClass}`}>{item.percent}%</p>
                                    </div>
                                    <div className="h-3 overflow-hidden rounded-full bg-black/40">
                                        <div
                                            className={`h-full rounded-full ${item.barClass}`}
                                            style={{ width: `${item.percent}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] gap-6 max-w-6xl mx-auto text-left">
                    <Card className="bg-theme-card border-4 border-theme rounded-3xl overflow-hidden">
                        <CardContent className="p-0">
                            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b-2 border-theme">
                                <div className="flex items-center gap-3">
                                    <BarChart3 className="w-6 h-6 text-theme-primary" />
                                    <div>
                                        <h3 className="font-bangers text-2xl text-theme-primary">Live FREG Chart</h3>
                                        <p className="font-righteous text-sm text-theme-subtle">{formatPairName(marketPair)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 font-righteous text-sm text-theme-muted">
                                    {marketLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                                    {marketPair ? "Live" : "Pending"}
                                </div>
                            </div>
                            {chartUrl ? (
                                <iframe
                                    title="FREG Dexscreener chart"
                                    src={chartUrl}
                                    className="w-full h-[420px] md:h-[500px] bg-black"
                                    allowFullScreen
                                />
                            ) : (
                                <div className="h-[420px] md:h-[500px] flex flex-col items-center justify-center gap-4 p-6 text-center">
                                    <p className="font-righteous text-lg text-theme-muted max-w-md">
                                        Chart appears after Dexscreener indexes the Base liquidity pool.
                                    </p>
                                    <Button
                                        asChild
                                        className="font-bangers text-lg px-6 py-3 rounded-full bg-theme hover:opacity-90 text-theme border-2 border-theme"
                                    >
                                        <a href={dexScreenerUrl} target="_blank" rel="noreferrer">
                                            Open Dexscreener
                                            <ArrowUpRight className="w-4 h-4 ml-2" />
                                        </a>
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <img src="/coin.svg" alt="$FREG" className="w-12 h-12" />
                                <div>
                                    <h3 className="font-bangers text-3xl text-theme-primary">{formatPairName(marketPair)}</h3>
                                    <p className="font-righteous text-sm text-theme-subtle">{formatDexName(marketPair)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="rounded-2xl border-2 border-theme bg-black/30 p-4">
                                    <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">Price</p>
                                    <p className="font-bangers text-2xl text-theme-primary">{formatPriceUsd(fregPriceUsd)}</p>
                                </div>
                                <div className="rounded-2xl border-2 border-theme bg-black/30 p-4">
                                    <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">24H</p>
                                    <p className={`font-bangers text-2xl ${getNumber(marketChange24h) >= 0 ? "text-lime-400" : "text-red-400"}`}>
                                        {formatPercent(marketChange24h)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border-2 border-theme bg-black/30 p-4">
                                    <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">Liquidity</p>
                                    <p className="font-bangers text-2xl text-theme-primary">{formatCompactUsd(marketLiquidityUsd)}</p>
                                </div>
                                <div className="rounded-2xl border-2 border-theme bg-black/30 p-4">
                                    <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">Volume</p>
                                    <p className="font-bangers text-2xl text-theme-primary">{formatCompactUsd(marketVolumeUsd)}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border-2 border-theme bg-black/30 p-4">
                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div>
                                        <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">Liquidity Vault</p>
                                        <p className="font-bangers text-3xl text-theme-primary">Total: {formatUsdValue(vaultTotalUsd)}</p>
                                    </div>
                                    {(vaultLoading || (ethPriceLoading && ethPriceUsd === null)) && <RefreshCw className="w-4 h-4 animate-spin text-theme-muted mt-1" />}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-black/30 border border-theme/60 p-3">
                                        <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">ETH</p>
                                        <p className="font-bangers text-2xl text-theme-primary">
                                            {formatVaultAmount(vaultBalances?.eth ?? null, 6)}
                                        </p>
                                        <p className="font-righteous text-xs text-theme-subtle mt-1">{formatUsdValue(vaultEthUsd)}</p>
                                    </div>
                                    <div className="rounded-xl bg-black/30 border border-theme/60 p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <img src="/coin.svg" alt="" className="w-4 h-4" />
                                            <p className="font-righteous text-xs uppercase text-theme-subtle">FREG</p>
                                        </div>
                                        <p className="font-bangers text-2xl text-theme-primary">
                                            {formatCompactTokenAmount(vaultBalances?.freg ?? null)}
                                        </p>
                                        <p className="font-righteous text-xs text-theme-subtle mt-1">{formatUsdValue(vaultFregUsd)}</p>
                                    </div>
                                </div>

                                {vaultError && (
                                    <p className="font-righteous text-sm text-yellow-300 mt-3">{vaultError}</p>
                                )}
                            </div>

                            <div className="mt-5 pt-5 border-t-2 border-theme">
                                <p className="font-righteous text-xs uppercase text-theme-subtle mb-1">$FREG CA</p>
                                <div className="flex items-start gap-2">
                                    <p className="min-w-0 flex-1 font-mono text-sm text-theme-muted break-all">
                                        {FREG_MARKET_ADDRESS}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleCopyContractAddress}
                                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-theme bg-black/40 text-theme-primary transition-colors hover:bg-black/60"
                                        aria-label="Copy FREG contract address"
                                        title="Copy contract address"
                                    >
                                        {contractAddressCopied ? (
                                            <Check className="h-4 w-4 text-lime-400" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                                {marketError && (
                                    <p className="font-righteous text-sm text-yellow-300 mt-3">{marketError}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Treasure Chests Separator */}
            <div className="border-t-2 border-theme my-12" />

            <div className="text-center mb-12">
                <h3 className="font-bangers text-4xl md:text-5xl text-theme-primary mb-4">
                    YOUR TREASURE CHESTS
                </h3>
      
            </div>


            {!isConnected ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
                    <CardContent className="p-12 text-center flex flex-col items-center gap-4">
                        <p className="font-righteous text-xl text-theme-muted">
                            Connect your wallet to view your treasure chests
                        </p>
                        <Button
                            onClick={() => open()}
                            className="font-bangers text-lg px-8 py-3 rounded-full bg-theme hover:opacity-90 text-theme border-2 border-theme"
                        >
                            Connect Wallet
                        </Button>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" message="Loading chests..." />
                </div>
            ) : chests.length === 0 ? (
                <Card className="bg-theme-card border-4 border-theme rounded-3xl">
          <CardContent className="p-12 text-center">
                        <p className="font-bangers text-3xl text-theme-muted mb-4">No Treasure Chests</p>
                        <p className="font-righteous text-lg text-theme-subtle">
                            Treasure chests can be obtained by spinning the wheel or claiming an item!
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                    {chests.map((chest) => (
                        <div key={chest.tokenId} className="flex flex-col items-center">
                            <div className="w-48 h-48 mb-4">
                                <img
                                    src="/items/chest.svg"
                                    alt="Treasure Chest"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <p className="font-bangers text-2xl text-theme-primary mb-3">
                                Chest #{chest.tokenId}
                            </p>
                            {chestOpeningActive ? (
                                <Button
                                    onClick={() => handleBurn(chest.tokenId)}
                                    disabled={burningId !== null}
                                    className="px-8 py-3 rounded-xl font-bangers text-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white"
                                >
                                    {burningId === chest.tokenId ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            <Flame className="w-5 h-5 mr-2" />
                                            Burn & Claim
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    disabled
                                    className="px-8 py-3 rounded-xl font-bangers text-lg opacity-40 cursor-not-allowed"
                                >
                                    <Lock className="w-5 h-5 mr-2" />
                                    Coming soon
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ResultModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalData.success ? "FregCoin Claimed!" : "Error"}
                description={modalData.message}
                success={modalData.success}
            />
        </Section>
    )
}
