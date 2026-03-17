const VRF_FEE_BUFFER_BPS = 1500n
const BPS_DENOMINATOR = 10000n
const MIN_VRF_FEE_BUFFER_WEI = 1_000_000_000_000n

type QuoteFunctionName =
  | "quoteMintFee"
  | "quoteClaimItemFee"
  | "quoteHeadRerollFee"
  | "quoteSpinFee"

type FeeQuoteProvider = {
  getFeeData(): Promise<{
    gasPrice: bigint | null
    maxFeePerGas: bigint | null
  }>
  call(tx: {
    to: string
    data: string
    gasPrice?: bigint
  }): Promise<string>
}

type FeeQuoteContract = {
  interface: {
    encodeFunctionData(functionName: QuoteFunctionName, values: readonly unknown[]): string
    decodeFunctionResult(functionName: QuoteFunctionName, data: string): readonly [bigint]
  }
  getAddress(): Promise<string>
}

export function addVrfFeeBuffer(vrfFee: bigint): bigint {
  const proportionalBuffer = (vrfFee * VRF_FEE_BUFFER_BPS + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR
  const appliedBuffer = proportionalBuffer > MIN_VRF_FEE_BUFFER_WEI
    ? proportionalBuffer
    : MIN_VRF_FEE_BUFFER_WEI

  return vrfFee + appliedBuffer
}

async function getQuoteGasPrice(provider: FeeQuoteProvider): Promise<bigint> {
  const feeData = await provider.getFeeData()
  const candidates = [feeData.gasPrice, feeData.maxFeePerGas].filter(
    (value): value is bigint => typeof value === "bigint" && value > 0n
  )

  if (candidates.length === 0) {
    return 1n
  }

  return candidates.reduce((max, value) => value > max ? value : max)
}

export async function readGasAwareVrfFee(
  contract: FeeQuoteContract,
  provider: FeeQuoteProvider,
  functionName: QuoteFunctionName
): Promise<bigint> {
  const gasPrice = await getQuoteGasPrice(provider)
  const data = contract.interface.encodeFunctionData(functionName, [])
  const result = await provider.call({
    to: await contract.getAddress(),
    data,
    gasPrice,
  })

  const [quote] = contract.interface.decodeFunctionResult(functionName, result)
  return quote
}

export async function readBufferedGasAwareVrfFee(
  contract: FeeQuoteContract,
  provider: FeeQuoteProvider,
  functionName: QuoteFunctionName
): Promise<bigint> {
  const vrfFee = await readGasAwareVrfFee(contract, provider, functionName)
  return addVrfFeeBuffer(vrfFee)
}
