/**
 * Shared helpers for transaction outcomes: the Safe "queued, not executed"
 * signal, reverted receipts, and turning wallet/RPC errors into one short line
 * a modal can show.
 */

// Thrown (as an Error message) when a Safe has queued a transaction for its
// owners to sign. It is a control-flow signal, not a failure. Helpers that wrap
// errors may prefix it ("Failed to approve token for X: SAFE_TRANSACTION_SENT"),
// so match it with isSafeTransactionSent rather than comparing messages.
export const SAFE_TRANSACTION_SENT = 'SAFE_TRANSACTION_SENT';

export const isSafeTransactionSent = (error) => {
    const message = typeof error === 'string' ? error : error?.message;
    return typeof message === 'string' && message.includes(SAFE_TRANSACTION_SENT);
};

// viem receipts use 'success' | 'reverted'; ethers v5 receipts use 1 | 0.
export const isReceiptReverted = (receipt) => {
    if (!receipt) return false;
    const { status } = receipt;
    return status === 'reverted' || status === 0 || status === 0n || status === '0x0';
};

// Shaped like the error ethers v5 throws from tx.wait() on a reverted
// transaction (code CALL_EXCEPTION, with the receipt attached), so callers
// written against ethers keep working.
export const revertedTransactionError = (receipt, hash) => {
    const transactionHash = receipt?.transactionHash || hash;
    const error = new Error(`Transaction reverted on-chain${transactionHash ? ` (${transactionHash})` : ''}`);
    error.code = 'CALL_EXCEPTION';
    error.reason = 'transaction failed';
    error.transactionHash = transactionHash;
    error.receipt = receipt;
    return error;
};

export const assertReceiptSucceeded = (receipt, hash) => {
    if (isReceiptReverted(receipt)) throw revertedTransactionError(receipt, hash);
    return receipt;
};

const REJECTION_PATTERN = /user rejected|user denied|rejected by (the )?user|user cancell?ed|request rejected|denied transaction signature|action_rejected/i;

// Walks the error and its causes (viem nests the provider error in `cause`;
// ethers v5 in `error`).
const errorChain = (error) => {
    const chain = [];
    let current = error;
    while (current && typeof current === 'object' && chain.length < 8 && !chain.includes(current)) {
        chain.push(current);
        current = current.cause || current.error;
    }
    return chain;
};

export const isUserRejection = (error) => {
    if (!error) return false;
    if (typeof error === 'string') return REJECTION_PATTERN.test(error);
    return errorChain(error).some((e) =>
        e.code === 4001 ||
        e.code === 'ACTION_REJECTED' ||
        e.name === 'UserRejectedRequestError' ||
        REJECTION_PATTERN.test(e.shortMessage || '') ||
        REJECTION_PATTERN.test(e.message || '')
    );
};

export const TX_CANCELLED_MESSAGE = 'Transaction cancelled';

const MAX_ERROR_LENGTH = 200;

/**
 * One short, human-readable line for a failed transaction. User rejections
 * become "Transaction cancelled"; otherwise viem's shortMessage (or the first
 * line of the message) is used, so request arguments and calldata that viem
 * appends never reach the UI.
 */
export const describeTxError = (error, fallback = 'Transaction failed. Please try again.') => {
    if (!error) return fallback;
    if (isUserRejection(error)) return TX_CANCELLED_MESSAGE;

    // viem's shortMessage is already the human part (sometimes two lines, e.g.
    // "...reverted with the following reason:\nToo little received"); of a
    // full message only the first line is kept.
    const text = typeof error === 'string' ? error : (error.shortMessage || null);
    const summary = text
        ? text.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
        : String(error.message ?? error).split('\n').map((line) => line.trim()).find(Boolean);
    if (!summary) return fallback;
    return summary.length > MAX_ERROR_LENGTH
        ? `${summary.slice(0, MAX_ERROR_LENGTH - 1)}…`
        : summary;
};
