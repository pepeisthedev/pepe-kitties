/**
 * Shared owner-resolution helpers for the holder-snapshot scripts.
 *
 * Resolves token owners with bounded concurrency and inter-batch pacing so we
 * stay under RPC rate limits (e.g. Alchemy 429 Too Many Requests). Each call
 * retries indefinitely with exponential backoff, so a healthy run never drops
 * a token silently.
 */

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 250;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resolves a single token's owner, retrying indefinitely on transient RPC
 * failures. Every token ID comes from getAllTokenIds() (live tokens only), so
 * a persistent revert means an unexpected on-chain state and is surfaced —
 * we never silently drop a holder.
 */
async function ownerOfWithRetry(fregs, id) {
    let attempt = 0;
    while (true) {
        try {
            return await fregs.ownerOf(id);
        } catch (err) {
            attempt++;
            const backoff = Math.min(1000 * 2 ** Math.min(attempt - 1, 5), 30000);
            process.stdout.write(`\n  ⚠️  ownerOf(${id}) failed (attempt ${attempt}): ${err.shortMessage || err.message}. Retrying in ${backoff}ms...`);
            await sleep(backoff);
        }
    }
}

async function batchedOwnerOf(fregs, tokenIds) {
    const owners = new Array(tokenIds.length);
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
        const slice = tokenIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            slice.map(id => ownerOfWithRetry(fregs, id))
        );
        for (let j = 0; j < results.length; j++) {
            owners[i + j] = results[j];
        }
        process.stdout.write(`\r  Fetched ${Math.min(i + BATCH_SIZE, tokenIds.length)}/${tokenIds.length} owners`);
        if (i + BATCH_SIZE < tokenIds.length) {
            await sleep(BATCH_DELAY_MS);
        }
    }
    process.stdout.write("\n");
    return owners;
}

module.exports = { BATCH_SIZE, BATCH_DELAY_MS, sleep, ownerOfWithRetry, batchedOwnerOf };
