/**
 * Sending several calls as one transaction (EIP-5792 wallet_sendCalls),
 * for wallets that execute a batch atomically: smart accounts, and EOAs
 * upgraded through EIP-7702, such as MetaMask's smart account. An approval
 * and the split, merge or swap it funds then cost the user one confirmation.
 *
 * The same approach as seer-pm/demo: the wallet's `atomic` capability on the
 * chain decides (hooks/useAtomicBatch.js), and every flow keeps its
 * step-by-step path for wallets without it. A Safe always goes step by step:
 * it queues transactions for its owners rather than executing them.
 *
 * A wallet can advertise the capability and still decline a batch, most
 * often because the user rejected the smart-account upgrade it asks for.
 * Nothing is sent in that case, so sendBatch returns null, the caller falls
 * back to step by step, and this account is not offered a batch again until
 * the page reloads.
 */

import { assertReceiptSucceeded, revertedTransactionError } from './txErrors.js';

// Errors meaning the wallet will not batch, before anything was sent:
// EIP-5792 unsupported capability (5700), unsupported chain (5710), rejected
// 7702 upgrade (5750), atomicity not supported (5760); EIP-1193 unsupported
// method (4200) and JSON-RPC method not found (-32601).
const BATCH_UNAVAILABLE_CODES = new Set([5700, 5710, 5750, 5760, 4200, -32601]);

// A batch is mined like any transaction; this only bounds the wait.
const CALLS_STATUS_TIMEOUT_MS = 5 * 60_000;

const declined = new Set();
const declineKey = (account, chainId) => `${String(account).toLowerCase()}:${Number(chainId)}`;

/** Whether wallet_getCapabilities reports atomic batches on `chainId` ("ready" asks the user to upgrade first). */
export const isAtomicBatchCapable = (capabilities, chainId) => {
    const status = capabilities?.[Number(chainId)]?.atomic?.status;
    return status === 'supported' || status === 'ready';
};

/** Whether a flow should send its calls as one batch. */
export const shouldBatch = ({ batch, isSafe, account, walletClient }) =>
    Boolean(batch) && !isSafe && Boolean(walletClient?.sendCalls) &&
    !declined.has(declineKey(account, walletClient.chain?.id));

const isBatchUnavailable = (error) => {
    for (let e = error, depth = 0; e && typeof e === 'object' && depth < 8; e = e.cause, depth += 1) {
        if (BATCH_UNAVAILABLE_CODES.has(e.code)) return true;
    }
    return false;
};

/**
 * Sends `calls` as one atomic batch and waits for it to be mined.
 *
 * @param {object} p
 * @param {{to: string, data: string, value?: bigint}[]} p.calls in execution order
 * @returns {Promise<object|null>} the batch's transaction receipt, or null when
 *   the wallet declined to batch and nothing was sent
 */
export async function sendBatch({ walletClient, account, calls }) {
    let id;
    try {
        ({ id } = await walletClient.sendCalls({
            account,
            chain: walletClient.chain,
            calls: calls.map(({ to, data, value = 0n }) => ({ to, data, value })),
            forceAtomic: true,
        }));
    } catch (error) {
        if (!isBatchUnavailable(error)) throw error;
        declined.add(declineKey(account, walletClient.chain?.id));
        return null;
    }

    const { status, receipts = [] } = await walletClient.waitForCallsStatus({ id, timeout: CALLS_STATUS_TIMEOUT_MS });
    // An atomic batch is one transaction; a wallet may still list a receipt per call.
    const receipt = receipts[receipts.length - 1];
    if (status !== 'success' || !receipt) {
        throw revertedTransactionError(receipt, receipt?.transactionHash);
    }
    return assertReceiptSucceeded(receipt, receipt.transactionHash);
}
