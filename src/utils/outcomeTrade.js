/**
 * Trades in a categorical proposal's conditional pools: buying the company
 * token if one answer wins (that answer's currency token → its company token)
 * or selling it (the reverse), through @seer-pm/sdk like every other swap
 * (utils/seerSwap.js).
 *
 * When the wallet holds less of the input token than the trade spends, the
 * shortfall is split from the collateral first. A split gives the same amount
 * of every slot, so the other answers' and INVALID tokens of that collateral
 * stay in the wallet; merging them back needs all of them. An answer of a
 * proposal chained to another one's answer (utils/proposalFamily.js) splits
 * that answer's tokens, which may in turn be split from the collateral, so
 * the splits run down the answer's path, parents first.
 *
 * With `batch` (utils/batchCalls.js) the split, the approvals and the swap
 * are one transaction.
 */

import { erc20Abi } from 'viem';
import { sendBatch, shouldBatch } from './batchCalls.js';
import { splitCalls, splitCollateral } from './collateralActions.js';
import { sourceToken, tradeSplitPlan } from './proposalFamily.js';
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
 * @param {object} p.leaf the answer traded (proposalFamily.js familyLeaves)
 * @param {'company'|'currency'} p.side the side of the answer `tokenIn` is
 * @param {string} p.router FutarchyCategoricalRouter
 * @param {boolean} [p.batch] the wallet supports atomic batches (hooks/useAtomicBatch.js)
 * @param {(step: 'batch'|'split'|'approval'|'swap', splitStep?: object) => void} [p.onStep]
 *   'batch': splits, approvals and swap were sent as one transaction;
 *   'split' comes once per split with its tradeSplitPlan step
 * @returns {Promise<{hash: string, receipt: object, splits: Array}>} splits is what was split first
 */
export async function tradeOutcome({
    publicClient, walletClient, account, router, leaf, side, collateralSymbol,
    tokenIn, tokenOut, amountIn, trade, quotedAt, slippageBps,
    isSafe = false, useUnlimitedApproval = false, batch = false, onStep,
}) {
    // The token traded and every token above it that a split could spend.
    const nodes = [...leaf.path.map(({ node }) => node), leaf.node];
    const tokens = [tokenIn, ...nodes.map((node) => sourceToken(node, side).address)];
    const held = await Promise.all(tokens.map((token) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] })));
    const balances = new Map(tokens.map((token, i) => [token.toLowerCase(), held[i]]));
    const { steps: splits, available } = tradeSplitPlan(leaf, side, amountIn, balances);
    if (available < amountIn) throw new Error(`Insufficient ${collateralSymbol} balance`);

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
        // Each split after the first spends tokens the one before gives.
        const splitCallLists = await Promise.all(splits.map((split, i) => splitCalls({
            publicClient, account, router, proposal: split.proposal, collateralToken: split.collateralToken,
            sourceToken: split.sourceToken.address, amount: split.amount, symbol: split.sourceToken.name || collateralSymbol,
            useUnlimitedApproval, checkBalance: i === 0,
        })));
        const calls = [
            ...splitCallLists.flat(),
            ...await seerSwapCalls({ trade, account, useUnlimitedApproval, requote, quotedAt }),
        ];
        onStep?.('batch');
        const receipt = await sendBatch({ walletClient, account, calls });
        if (receipt) return { hash: receipt.transactionHash, receipt, splits };
    }

    for (const split of splits) {
        onStep?.('split', split);
        await splitCollateral({
            publicClient, walletClient, account, router, proposal: split.proposal, collateralToken: split.collateralToken,
            sourceToken: split.sourceToken.address, amount: split.amount,
            symbol: split.sourceToken.name || collateralSymbol, useUnlimitedApproval, isSafe,
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
    return { hash, receipt, splits };
}
