import { BrowserProvider, JsonRpcProvider } from "ethers"

// Fallback read-only RPC used when the user's wallet RPC is throttled or failing.
// Writes always go through the wallet — only reads ever touch this.
const FALLBACK_RPC_URL = import.meta.env.VITE_FALLBACK_RPC_URL as string | undefined

let cachedFallback: JsonRpcProvider | null | undefined

export function getFallbackProvider(): JsonRpcProvider | null {
  if (cachedFallback !== undefined) return cachedFallback
  cachedFallback = FALLBACK_RPC_URL ? new JsonRpcProvider(FALLBACK_RPC_URL) : null
  return cachedFallback
}

export type ReadProvider = BrowserProvider | JsonRpcProvider

// Run a read against the wallet's RPC. If it fails (throttled, network error, etc.)
// and a fallback RPC is configured, transparently retry against the fallback.
// `preferFallback=true` flips the order — useful for fields that have failed on the
// wallet repeatedly and we want to skip the wasted attempt.
export async function readWithFallback<T>(
  walletProvider: BrowserProvider,
  read: (provider: ReadProvider) => Promise<T>,
  preferFallback = false,
): Promise<T> {
  const fallback = getFallbackProvider()
  const primary: ReadProvider = preferFallback && fallback ? fallback : walletProvider
  const secondary: ReadProvider | null = preferFallback ? walletProvider : fallback

  try {
    return await read(primary)
  } catch (primaryErr) {
    if (secondary) {
      try {
        return await read(secondary)
      } catch {
        throw primaryErr
      }
    }
    throw primaryErr
  }
}
