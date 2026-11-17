/**
 * Trades in a categorical proposal's conditional pools: buying the company
 * token if one answer wins (that answer's currency token → its company token)
 * or selling it (the reverse), through @seer-pm/sdk like every other swap
 * (utils/seerSwap.js).
 *
 * When the wallet holds less of the input token than the trade spends, the
 * shortfall is split from the collateral first. A split gives the same amount
 * of every slot, so the other answers' and INVALID tokens of that collateral
 * stay in the wallet; merging them back needs all of them.
 *
 * With `batch` (utils/batchCalls.js) the split, the approvals and the swap
 * are one transaction.
 */

import { erc20Abi } from 'viem';
import { sendBatch, shouldBatch } from './batchCalls.js';
import { splitCalls, splitCollateral } from './collateralActions.js';
import { executeSeerSwap, getSeerPublicClient, quoteSeerSwap, seerSwapCalls } from './seerSwap.js';
import { slippageBpsForMinimum } from './swapQuoteMath.js';
import { PRICE_MOVED_WHILE_SIGNING, SAFE_TRANSACTION_SENT, assertReceiptSucceeded } from './txErrors.js';

/**
 * Splits what the wallet lacks of `tokenIn`, then sends the quoted swap.
 * The swap never goes out for less than `trade.minimumAmountOut()`, the
 * minimum the user saw: if the split and approval outlast the quote, the
 * fresh quote must still honour it.
 *
 * @param {object} p
 * @param {object} p.trade quoteSeerSwap result for tokenIn → tokenOut and amountIn
 * @param {number} p.quotedAt Date.now() when `trade` was quoted
 * @param {bigint} p.amountIn raw units of tokenIn the trade spends
 * @param {string} p.collateralToken collateral that `tokenIn` is an outcome token of
 * @param {string} p.router FutarchyCategoricalRouter
 * @param {string} p.proposal the market's FutarchyProposal
 * @param {boolean} [p.batch] the wallet supports atomic batches (hooks/useAtomicBatch.js)
 * @param {(step: 'batch'|'split'|'approval'|'swap') => void} [p.onStep]
 *   'batch': split, approvals and swap were sent as one transaction
 * @returns {Promise<{hash: string, receipt: object, split: bigint}>} split is the collateral split first
 */
export async function tradeOutcome({
    publicClient, walletClient, account, router, proposal, collateralToken, collateralSymbol,
    tokenIn, tokenOut, amountIn, trade, quotedAt, slippageBps,
    isSafe = false, useUnlimitedApproval = false, batch = false, onStep,
}) {
    const balance = await publicClient.readContract({ address: tokenIn, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
    const split = amountIn > balance ? amountIn - balance : 0n;

    const confirmedMinimum = trade.minimumAmountOut();
    const quote = (bps) => quoteSeerSwap({ chainId: trade.chainId, account, tokenIn, tokenOut, amountInRaw: amountIn, slippageBps: bps });
    const requote = async () => {
        let fresh = await quote(slippageBps);
        if (fresh.minimumAmountOut() < confirmedMinimum) {
            const bps = slippageBpsForMinimum(fresh.amountOut, confirmedMinimum, slippageBps);
            fresh = bps === null ? null : await quote(bps);
        }
        if (!fresh || fresh.minimumAmountOut() < confirmedMinimum) throw new Error(PRICE_MOVED_WHILE_SIGNING);
        return fresh;
    };

    if (shouldBatch({ batch, isSafe, account, walletClient })) {
        const calls = [
            ...(split > 0n ? await splitCalls({
                publicClient, account, router, proposal, collateralToken, amount: split, symbol: collateralSymbol, useUnlimitedApproval,
            }) : []),
            ...await seerSwapCalls({ trade, account, useUnlimitedApproval, requote, quotedAt }),
        ];
        onStep?.('batch');
        const receipt = await sendBatch({ walletClient, account, calls });
        if (receipt) return { hash: receipt.transactionHash, receipt, split };
    }

    if (split > 0n) {
        onStep?.('split');
        await splitCollateral({
            publicClient, walletClient, account, router, proposal, collateralToken, amount: split,
            symbol: collateralSymbol, useUnlimitedApproval, isSafe,
        });
    }

    onStep?.('swap');
    const hash = await executeSeerSwap({
        trade, account, walletClient, isSafe, useUnlimitedApproval, requote, quotedAt,
        onApprovalNeeded: () => onStep?.('approval'),
        onApprovalComplete: () => onStep?.('swap'),
    });
    // From a Safe the hash is a safeTxHash: the Safe executes the swap later.
    if (isSafe) throw new Error(SAFE_TRANSACTION_SENT);
    const receipt = await getSeerPublicClient(trade.chainId).waitForTransactionReceipt({ hash });
    assertReceiptSucceeded(receipt, hash);
    return { hash, receipt, split };
}
