import type { Contract } from "ethers"

type WaitForEventOptions = {
  contract: Contract
  filter: any
  fromBlock: bigint | number
  match?: (log: any) => boolean
  timeoutMs?: number
  pollMs?: number
}

const DEFAULT_TIMEOUT_MS = 120000
const DEFAULT_POLL_MS = 2500
const MAX_LOG_BLOCK_RANGE = 10

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitForEvent({
  contract,
  filter,
  fromBlock,
  match,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
}: WaitForEventOptions) {
  const startedAt = Date.now()
  let nextFromBlock = Number(fromBlock)

  while (Date.now() - startedAt < timeoutMs) {
    const latestBlock = await contract.runner?.provider?.getBlockNumber()
    if (typeof latestBlock === "number" && nextFromBlock <= latestBlock) {
      for (let startBlock = nextFromBlock; startBlock <= latestBlock; startBlock += MAX_LOG_BLOCK_RANGE) {
        const endBlock = Math.min(startBlock + MAX_LOG_BLOCK_RANGE - 1, latestBlock)
        const logs = await contract.queryFilter(filter, startBlock, endBlock)
        const matchedLog = match ? logs.find(match) : logs[logs.length - 1]

        if (matchedLog) {
          return matchedLog
        }
      }

      nextFromBlock = latestBlock + 1
    }

    await delay(pollMs)
  }

  throw new Error("Timed out waiting for transaction result")
}
