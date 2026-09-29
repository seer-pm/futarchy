/**
 * Balance Read State
 *
 * Pure helpers for telling a failed balance read apart from a zero balance.
 *
 * A read that fails is reported as `null`, never as 0: showing a user a zero
 * balance because an RPC hiccupped is worse than showing nothing, since it
 * looks like their funds are gone. Callers keep the last value they
 * successfully read for any field that failed this time.
 *
 * No imports, so node:test can load this module directly.
 */

/**
 * Run one read. On failure, record `description` in `failed` and resolve
 * to null instead of rejecting, so one bad call does not sink the batch.
 *
 * @param {() => Promise<any>} call
 * @param {string} description
 * @param {string[]} failed - collects the descriptions of failed reads
 * @returns {Promise<any|null>}
 */
export async function readOrNull(call, description, failed) {
    try {
        const result = await call();
        if (result === null || result === undefined) {
            throw new Error('empty result');
        }
        return result;
    } catch (error) {
        console.log(`[UNIFIED-BALANCE] ❌ Failed ${description}:`, error?.message);
        failed.push(description);
        return null;
    }
}

/**
 * Overlay a fresh read on the last known balances: fields that failed this
 * time (null) keep their previous value instead of being blanked or zeroed.
 *
 * @param {Object|null} previous
 * @param {Object} next
 * @returns {Object}
 */
export function mergeWithLastKnown(previous, next) {
    const merged = { ...(previous || {}) };
    for (const [key, value] of Object.entries(next || {})) {
        if (value !== null && value !== undefined) {
            merged[key] = value;
        } else if (!(key in merged)) {
            merged[key] = null;
        }
    }
    return merged;
}

/**
 * User-facing message for a fetch where some reads failed, or null when
 * every read succeeded.
 *
 * @param {string[]} failedReads
 * @param {number} totalReads
 * @returns {string|null}
 */
export function describeFailedReads(failedReads, totalReads) {
    if (!failedReads || failedReads.length === 0) return null;
    if (failedReads.length >= totalReads) {
        return "Couldn't load balances: the RPC did not respond.";
    }
    return `Couldn't load ${failedReads.length} of ${totalReads} balances: the RPC did not respond.`;
}
