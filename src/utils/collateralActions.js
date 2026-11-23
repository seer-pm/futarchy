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
 *
 * Batch: with `batch` (the wallet supports atomic batches, utils/batchCalls.js)
 * the approvals and the split or merge go out as one transaction, reported
 * as the single step 'batch'. Without it, or when the wallet declines the
 * batch, each is its own transaction as before.
 */

import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';
import { approvalAmountFor } from './approvalAmount.js';
import { sendBatch, shouldBatch } from './batchCalls.js';
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

const allowanceIsShort = async (publicClient, account, token, spender, needed) =>
    await publicClient.readContract({
        address: token, abi: erc20Abi, functionName: 'allowance', args: [account, spender],
    }) < needed;

const approveArgs = (spender, needed, useUnlimitedApproval) =>
    [spender, toBigInt(approvalAmountFor(needed.toString(), useUnlimitedApproval))];

/** The approve call for `token` when its allowance to `spender` is short, for a batch. */
export async function approvalCalls({ publicClient, account, token, spender, amount, useUnlimitedApproval = false }) {
    const needed = toBigInt(amount);
    if (!await allowanceIsShort(publicClient, account, token, spender, needed)) return [];
    return [{
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: approveArgs(spender, needed, useUnlimitedApproval) }),
    }];
}

const routerCall = (router, functionName, proposal, collateralToken, amount) => ({
    to: router,
    data: encodeFunctionData({ abi: ROUTER_ABI, functionName, args: [proposal, collateralToken, amount] }),
});

const assertSplitBalance = async (publicClient, collateralToken, account, amount, symbol) => {
    if (await balanceOf(publicClient, collateralToken, account) < amount) {
        throw new Error(`Insufficient ${symbol} balance`);
    }
};

/**
 * The calls of a split, for a batch: the approval of the token the split
 * spends if the allowance is short, then the split. Throws when the balance
 * is short.
 * @param {string} [p.sourceToken] the token the split spends: the collateral,
 *   or for a proposal conditional on a parent's answer that answer's token of
 *   the collateral (utils/proposalFamily.js)
 * @param {boolean} [p.checkBalance] false when an earlier call of the same
 *   batch gives the account the source token
 */
export async function splitCalls({
    publicClient, account, router, proposal, collateralToken, sourceToken = collateralToken, amount, symbol = 'token',
    useUnlimitedApproval = false, checkBalance = true,
}) {
    const amountRaw = toBigInt(amount);
    if (checkBalance) await assertSplitBalance(publicClient, sourceToken, account, amountRaw, symbol);
    return [
        ...await approvalCalls({ publicClient, account, token: sourceToken, spender: router, amount: amountRaw, useUnlimitedApproval }),
        routerCall(router, 'splitPosition', proposal, collateralToken, amountRaw),
    ];
}

// Sends `calls` as one batch. Returns null when the wallet declined to batch.
const sendAsBatch = async ({ walletClient, account, calls, onStep }) => {
    onStep?.('batch');
    const receipt = await sendBatch({ walletClient, account, calls });
    if (!receipt) return null;
    onStep?.('done');
    return { hash: receipt.transactionHash, receipt };
};

/**
 * Approves `spender` for `amount` of `token` if the allowance is short.
 * @returns {Promise<boolean>} whether an approval was sent
 */
export async function approveIfNeeded({
    publicClient, walletClient, account, token, spender, amount,
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false,
}) {
    const needed = toBigInt(amount);
    if (!await allowanceIsShort(publicClient, account, token, spender, needed)) return false;

    const hash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: approveArgs(spender, needed, useUnlimitedApproval),
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
 * @param {string} [p.sourceToken] the token the split spends, if not the
 *   collateral: a parent answer's token (see splitCalls)
 * @param {bigint|string} p.amount raw units
 * @param {string} [p.symbol] for the insufficient-balance message
 * @param {boolean} [p.batch] the wallet supports atomic batches (hooks/useAtomicBatch.js)
 * @param {(step: 'batch'|'approval'|'approved'|'split'|'done') => void} [p.onStep]
 *   'batch': approval and split were sent together, the next step is 'done'
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export async function splitCollateral({
    publicClient, walletClient, account, router, proposal, collateralToken, sourceToken = collateralToken, amount, symbol = 'token',
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, batch = false, onStep,
}) {
    const amountRaw = toBigInt(amount);
    if (shouldBatch({ batch, isSafe, account, walletClient })) {
        const calls = await splitCalls({ publicClient, account, router, proposal, collateralToken, sourceToken, amount: amountRaw, symbol, useUnlimitedApproval });
        const sent = await sendAsBatch({ walletClient, account, calls, onStep });
        if (sent) return sent;
    } else {
        await assertSplitBalance(publicClient, sourceToken, account, amountRaw, symbol);
    }

    onStep?.('approval');
    await approveIfNeeded({
        publicClient, walletClient, account, token: sourceToken, spender: router, amount: amountRaw,
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
 * @param {(step: 'batch'|'yesApproval'|'yesApproved'|'noApproval'|'noApproved'|'merge'|'done') => void} [p.onStep]
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export function mergeCollateral({ yesToken, noToken, onStep, ...rest }) {
    const approvalSteps = [['yesApproval', 'yesApproved'], ['noApproval', 'noApproved']];
    return mergeOutcomeTokens({
        ...rest,
        outcomeTokens: [yesToken, noToken],
        onStep: onStep && ((step, index) => {
            if (step === 'approval') onStep(approvalSteps[index][0]);
            else if (step === 'approved') onStep(approvalSteps[index][1]);
            else onStep(step);
        }),
    });
}

/**
 * Merges `amount` of every outcome token of a collateral back into it: YES
 * and NO for a binary proposal, each answer and INVALID for a categorical one
 * (utils/proposalOutcomes.js).
 *
 * @param {object} p
 * @param {string[]} p.outcomeTokens wrapped outcome tokens of `collateralToken`, one per condition slot
 * @param {boolean} [p.batch] the wallet supports atomic batches (hooks/useAtomicBatch.js)
 * @param {(step: 'batch'|'approval'|'approved'|'merge'|'done', index?: number) => void} [p.onStep]
 *   index is the position in outcomeTokens of the token being approved;
 *   'batch': approvals and merge were sent together, the next step is 'done'
 * @returns {Promise<{hash: string, receipt: object}>}
 */
export async function mergeOutcomeTokens({
    publicClient, walletClient, account, router, proposal, collateralToken, outcomeTokens, amount,
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, batch = false, onStep,
}) {
    const amountRaw = toBigInt(amount);
    const balances = await Promise.all(outcomeTokens.map((token) => balanceOf(publicClient, token, account)));
    if (balances.some((balance) => balance < amountRaw)) {
        throw new Error('Insufficient token balance. You need this amount of every outcome token.');
    }

    if (shouldBatch({ batch, isSafe, account, walletClient })) {
        const approvals = await Promise.all(outcomeTokens.map((token) => approvalCalls({
            publicClient, account, token, spender: router, amount: amountRaw, useUnlimitedApproval,
        })));
        const calls = [...approvals.flat(), routerCall(router, 'mergePositions', proposal, collateralToken, amountRaw)];
        const sent = await sendAsBatch({ walletClient, account, calls, onStep });
        if (sent) return sent;
    }

    for (const [index, token] of outcomeTokens.entries()) {
        onStep?.('approval', index);
        await approveIfNeeded({
            publicClient, walletClient, account, token, spender: router, amount: amountRaw,
            useUnlimitedApproval, isSafe, waitForSafeExecution,
        });
        onStep?.('approved', index);
    }

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

/**
 * Runs splits one after another, such as a market's whole family of chained
 * proposals (utils/proposalFamily.js familySplitPlan): each split after the
 * first spends tokens an earlier one gives. With `batch` they are one
 * transaction; otherwise one splitCollateral each.
 *
 * @param {object} p
 * @param {Array<{proposal: string, collateralToken: string, sourceToken: {address: string, name: string|null}, amount: bigint}>} p.steps
 * @param {string} [p.symbol] the collateral's symbol, for the insufficient-balance message
 * @param {(step: 'batch'|'split'|'done', index?: number) => void} [p.onStep] index is the split's in `steps`
 * @returns {Promise<{hash: string, receipt: object}>} the last transaction
 */
export async function splitThrough({
    publicClient, walletClient, account, router, steps, symbol = 'token',
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, batch = false, onStep,
}) {
    if (shouldBatch({ batch, isSafe, account, walletClient })) {
        const calls = await Promise.all(steps.map((split, index) => splitCalls({
            publicClient, account, router, proposal: split.proposal, collateralToken: split.collateralToken,
            sourceToken: split.sourceToken.address, amount: split.amount, symbol: split.sourceToken.name || symbol,
            useUnlimitedApproval, checkBalance: index === 0,
        })));
        const sent = await sendAsBatch({ walletClient, account, calls: calls.flat(), onStep });
        if (sent) return sent;
    }
    let result;
    for (const [index, split] of steps.entries()) {
        onStep?.('split', index);
        result = await splitCollateral({
            publicClient, walletClient, account, router, proposal: split.proposal, collateralToken: split.collateralToken,
            sourceToken: split.sourceToken.address, amount: split.amount, symbol: split.sourceToken.name || symbol,
            useUnlimitedApproval, isSafe, waitForSafeExecution,
        });
    }
    onStep?.('done');
    return result;
}

/**
 * Runs merges one after another (utils/proposalFamily.js familyMergePlan,
 * deepest proposal first): each merge after the first may spend tokens an
 * earlier one gives back. With `batch` they are one transaction, with the
 * approvals each needs; otherwise one mergeOutcomeTokens each.
 *
 * @param {object} p
 * @param {Array<{proposal: string, collateralToken: string, outcomeTokens: string[], amount: bigint}>} p.steps
 * @param {(step: 'batch'|'merge'|'done', index?: number) => void} [p.onStep] index is the merge's in `steps`
 * @returns {Promise<{hash: string, receipt: object}>} the last transaction
 */
export async function mergeThrough({
    publicClient, walletClient, account, router, steps,
    useUnlimitedApproval = false, isSafe = false, waitForSafeExecution = false, batch = false, onStep,
}) {
    if (shouldBatch({ batch, isSafe, account, walletClient })) {
        const calls = await Promise.all(steps.map(async (merge) => {
            const approvals = await Promise.all(merge.outcomeTokens.map((token) => approvalCalls({
                publicClient, account, token, spender: router, amount: merge.amount, useUnlimitedApproval,
            })));
            return [...approvals.flat(), routerCall(router, 'mergePositions', merge.proposal, merge.collateralToken, merge.amount)];
        }));
        const sent = await sendAsBatch({ walletClient, account, calls: calls.flat(), onStep });
        if (sent) return sent;
    }
    let result;
    for (const [index, merge] of steps.entries()) {
        onStep?.('merge', index);
        result = await mergeOutcomeTokens({
            publicClient, walletClient, account, router, proposal: merge.proposal, collateralToken: merge.collateralToken,
            outcomeTokens: merge.outcomeTokens, amount: merge.amount, useUnlimitedApproval, isSafe, waitForSafeExecution,
        });
    }
    onStep?.('done');
    return result;
}
