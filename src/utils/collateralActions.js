/**
 * Splitting collateral into YES/NO outcome tokens and merging them back,
 * through the futarchy router. One implementation for every dialog that does
 * either (the collateral dialog and the trade dialog's automatic split).
 *
 * Everything goes through the wagmi clients, so the transaction is signed by
 * the connected wallet. Approvals are for the exact amount unless the user
 * asked for an unlimited one, the wallet estimates gas and fees, and a mined
 * transaction that reverted is an error.
 *
 * Safe: a Safe queues a transaction instead of mining it. With
 * `waitForSafeExecution` the functions wait for the Safe to execute it;
 * without, they throw SAFE_TRANSACTION_SENT after queueing so the caller can
 * tell the user it was sent to their Safe.
 */

import { erc20Abi, parseAbi } from 'viem';
import { approvalAmountFor } from './approvalAmount.js';
import { SAFE_TRANSACTION_SENT, assertReceiptSucceeded } from './txErrors.js';
import { waitForSafeTxReceipt } from './waitForSafeTxReceipt.js';

const ROUTER_ABI = parseAbi([
    'function splitPosition(address proposal, address collateralToken, uint256 amount)',
    'function mergePositions(address proposal, address collateralToken, uint256 amount)',
]);

const toBigInt = (value) => BigInt(value.toString());

// Waits for a sent transaction and returns its receipt.
const confirm = async ({ hash, publicClient, walletClient, isSafe, waitForSafeExecution }) => {
    if (!isSafe) {
        return assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
    }
    if (!waitForSafeExecution) throw new Error(SAFE_TRANSACTION_SENT);
    // For a Safe, `hash` is the safeTxHash, not an on-chain transaction hash
    return waitForSafeTxReceipt({ chainId: await walletClient.getChainId(), safeTxHash: hash, publicClient });
};

const balanceOf = (publicClient, token, account) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] });

/**
 * Approves `spender` for `amount` of `token` if the allowance is short.
 * @returns {Promise<boolean>} whether an approval was sent
 */
export async function approveIfNeeded({
    publicClient, walletClient, account, token, spender, amount,
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false,
}) {
    const needed = toBigInt(amount);
    const allowance = await publicClient.readContract({
        address: token, abi: erc20Abi, functionName: 'allowance', args: [account, spender],
    });
    if (allowance >= needed) return false;

    const hash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, toBigInt(approvalAmountFor(needed.toString(), useUnlimitedApproval))],
        account,
        chain: walletClient.chain,
    });
    await confirm({ hash, publicClient, walletClient, isSafe, waitForSafeExecution });
    return true;
}

/**
 * Splits `amount` of a collateral token into its YES and NO outcome tokens.
 *
 * @param {object} p
 * @param {string} p.router futarchy router
 * @param {string} p.proposal the market's FutarchyProposal
 * @param {string} p.collateralToken token to split
 * @param {bigint|string} p.amount raw units
 * @param {string} [p.symbol] for the insufficient-balance message
 * @param {(step: 'approval'|'approved'|'split'|'done') => void} [p.onStep]
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export async function splitCollateral({
    publicClient, walletClient, account, router, proposal, collateralToken, amount, symbol = 'token',
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, onStep,
}) {
    const amountRaw = toBigInt(amount);
    if (await balanceOf(publicClient, collateralToken, account) < amountRaw) {
        throw new Error(`Insufficient ${symbol} balance`);
    }

    onStep?.('approval');
    await approveIfNeeded({
        publicClient, walletClient, account, token: collateralToken, spender: router, amount: amountRaw,
        useUnlimitedApproval, isSafe, waitForSafeExecution,
    });
    onStep?.('approved');

    onStep?.('split');
    const hash = await walletClient.writeContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: 'splitPosition',
        args: [proposal, collateralToken, amountRaw],
        account,
        chain: walletClient.chain,
    });
    const receipt = await confirm({ hash, publicClient, walletClient, isSafe, waitForSafeExecution });
    onStep?.('done');
    return { hash, receipt };
}

/**
 * Merges `amount` of YES and NO outcome tokens back into the collateral token.
 *
 * @param {object} p
 * @param {string} p.yesToken wrapped YES outcome token of `collateralToken`
 * @param {string} p.noToken wrapped NO outcome token of `collateralToken`
 * @param {(step: 'yesApproval'|'yesApproved'|'noApproval'|'noApproved'|'merge'|'done') => void} [p.onStep]
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export async function mergeCollateral({
    publicClient, walletClient, account, router, proposal, collateralToken, yesToken, noToken, amount,
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, onStep,
}) {
    const amountRaw = toBigInt(amount);
    const [yesBalance, noBalance] = await Promise.all([
        balanceOf(publicClient, yesToken, account),
        balanceOf(publicClient, noToken, account),
    ]);
    if (yesBalance < amountRaw || noBalance < amountRaw) {
        throw new Error('Insufficient token balance. You need this amount of both YES and NO tokens.');
    }

    const approve = (token) => approveIfNeeded({
        publicClient, walletClient, account, token, spender: router, amount: amountRaw,
        useUnlimitedApproval, isSafe, waitForSafeExecution,
    });
    onStep?.('yesApproval');
    await approve(yesToken);
    onStep?.('yesApproved');
    onStep?.('noApproval');
    await approve(noToken);
    onStep?.('noApproved');

    onStep?.('merge');
    const hash = await walletClient.writeContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: 'mergePositions',
        args: [proposal, collateralToken, amountRaw],
        account,
        chain: walletClient.chain,
    });
    const receipt = await confirm({ hash, publicClient, walletClient, isSafe, waitForSafeExecution });
    onStep?.('done');
    return { hash, receipt };
}
