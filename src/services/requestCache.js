/**
 * Request Cache
 *
 * Collapses repeated identical reads into one network call.
 *
 * The pattern this exists for: several components on a page independently
 * need the same remote data, each mounts its own hook or calls its own
 * fetcher, and every one of them issues the same request. React's
 * StrictMode doubles the count again in development.
 *
 * The cache lives here rather than in TanStack Query because a good number
 * of these callers are plain async functions rather than hooks, and would
 * bypass a query cache entirely.
 *
 * Only ever cache reads that are independent of the connected wallet and of
 * any other per-caller state. Per-caller rules (ownership, visibility) are
 * applied on top of the shared raw data.
 */

// Long enough to collapse a page load — including StrictMode's double effect
// pass and the refetch wagmi triggers once the wallet address resolves —
// short enough that a write shows up on the next interaction.
export const DEFAULT_TTL_MS = 30_000;

const responseCache = new Map();    // key -> { at, value }
const inflightRequests = new Map(); // key -> Promise

/**
 * Run `producer` at most once per key per TTL window, sharing the pending
 * promise with every concurrent caller. Rejections are never cached.
 *
 * @param {string} key
 * @param {() => Promise<any>} producer
 * @param {number} [ttlMs]
 */
export function cachedOnce(key, producer, ttlMs = DEFAULT_TTL_MS) {
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
        return Promise.resolve(hit.value);
    }

    const pending = inflightRequests.get(key);
    if (pending) return pending;

    const request = Promise.resolve()
        .then(producer)
        .then((value) => {
            responseCache.set(key, { at: Date.now(), value });
            return value;
        })
        .finally(() => {
            inflightRequests.delete(key);
        });

    inflightRequests.set(key, request);
    return request;
}

/**
 * Drop cached entries so the next read hits the network. Call after a write
 * whose result should show up immediately.
 *
 * @param {string} [keySubstring] - clears every key containing it
 *   (case-insensitive); omit to clear the whole cache
 */
export function invalidateCache(keySubstring) {
    if (!keySubstring) {
        responseCache.clear();
        return;
    }
    const needle = String(keySubstring).toLowerCase();
    for (const key of responseCache.keys()) {
        if (key.toLowerCase().includes(needle)) responseCache.delete(key);
    }
}

export default cachedOnce;
