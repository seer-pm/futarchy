/**
 * Pure swap-quote math shared by the trade panel (ShowcaseSwapComponent), the
 * confirm dialog (ConfirmSwapModal) and the quote helpers. No network, no
 * ethers: raw amounts are integers (bigint, BigNumber, or decimal strings).
 *
 * The confirm dialog's "Min. Receive" and the transaction's amountOutMinimum
 * both come from minReceiveFromQuote, so what the user sees is what the
 * transaction enforces.
 */

const toBigInt = (value) => {
    if (typeof value === 'bigint') return value;
    if (value === null || value === undefined || value === '') return 0n;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    // ethers v5 BigNumber, or anything with a decimal toString()
    return BigInt(value.toString());
};

const abs = (value) => (value < 0n ? -value : value);

/** Slippage tolerance in percent (3 = 3%) → basis points (300). */
export const slippagePctToBps = (slippagePct) => {
    const pct = Number(slippagePct);
    if (!Number.isFinite(pct) || pct < 0) return 0;
    return Math.min(10000, Math.round(pct * 100));
};

/**
 * Minimum output the transaction accepts: quotedOut * (10000 - bps) / 10000,
 * rounded down. slippagePct is in percent (3 = 3%).
 */
export const minReceiveFromQuote = (quotedAmountOutRaw, slippagePct) => {
    const quoted = toBigInt(quotedAmountOutRaw);
    const bps = BigInt(slippagePctToBps(slippagePct));
    return (quoted * (10000n - bps)) / 10000n;
};

/**
 * Slippage (basis points) to build a fresh quote with, so that the
 * transaction's minimum output is never below the Min. Receive the user
 * confirmed: the largest bps with freshOut * (10000 - bps) / 10000 >=
 * confirmedMin, capped at the user's tolerance. Returns null when the fresh
 * quote is already below the confirmed minimum (the swap would revert).
 */
export const slippageBpsForMinimum = (freshAmountOutRaw, confirmedMinRaw, maxBps) => {
    const fresh = toBigInt(freshAmountOutRaw);
    const min = toBigInt(confirmedMinRaw);
    if (fresh <= 0n || fresh < min) return null;
    const bps = Number(((fresh - min) * 10000n) / fresh);
    return Math.max(0, Math.min(bps, Math.floor(maxBps)));
};

/**
 * Picks input and output from a pool swap's (amount0Delta, amount1Delta).
 *
 * Pool-side sign convention (Uniswap V3 / Algebra, and the
 * FutarchyArbitrageHelper's simulateQuote, verified live): a positive delta
 * is what the pool receives (the input), a negative delta is what it pays out
 * (the output). The output is chosen by sign, never by "whichever delta is
 * not amountIn" — on a thin pool that stops at its price limit the input
 * consumed is smaller than amountIn, and that rule would report the input as
 * the output.
 *
 * isPartialFill is true when the pool consumed less than amountIn.
 */
export const selectSwapDeltas = ({ amount0Delta, amount1Delta, amountIn }) => {
    const d0 = toBigInt(amount0Delta);
    const d1 = toBigInt(amount1Delta);
    const requested = toBigInt(amountIn);

    let inputDelta;
    let outputDelta;
    let outputIsToken0;
    if (d0 > 0n && d1 < 0n) {
        inputDelta = d0; outputDelta = d1; outputIsToken0 = false;
    } else if (d1 > 0n && d0 < 0n) {
        inputDelta = d1; outputDelta = d0; outputIsToken0 = true;
    } else {
        throw new Error('Quote returned no output for this amount');
    }

    const amountInConsumed = abs(inputDelta);
    return {
        amountInConsumed,
        amountOut: abs(outputDelta),
        outputIsToken0,
        isPartialFill: requested > 0n && amountInConsumed < requested,
    };
};

/**
 * Average execution price in currency per company token:
 * buy (currency in, company out) = amountIn / amountOut,
 * sell (company in, currency out) = amountOut / amountIn.
 * Amounts are human units (numbers or numeric strings).
 */
export const executionPriceFor = ({ amountIn, amountOut, isBuy }) => {
    const inNum = Number(amountIn);
    const outNum = Number(amountOut);
    if (!(inNum > 0) || !(outNum > 0)) return null;
    return isBuy ? inNum / outNum : outNum / inNum;
};

/**
 * Compares a fresh quote with the one the user confirmed.
 * movedPct > 0 means the fresh quote pays less. exceedsTolerance is true when
 * the fresh output is below the confirmed Min. Receive — the swap would revert.
 */
export const compareQuotes = ({ confirmedAmountOutRaw, freshAmountOutRaw, slippagePct }) => {
    const confirmed = toBigInt(confirmedAmountOutRaw);
    const fresh = toBigInt(freshAmountOutRaw);
    const minReceive = minReceiveFromQuote(confirmed, slippagePct);
    // percent, at 0.0001% resolution
    const movedPct = confirmed > 0n ? Number(((confirmed - fresh) * 1000000n) / confirmed) / 10000 : 0;
    return {
        movedPct,
        minReceive,
        exceedsTolerance: fresh < minReceive,
    };
};

/**
 * Parses a human decimal string into integer units (like ethers parseUnits),
 * truncating extra decimals. Returns null for anything that isn't a plain
 * non-negative decimal.
 */
export const parseUnitsSafe = (value, decimals = 18) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return null;
    const [whole = '', fraction = ''] = text.split('.');
    const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
    return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
};

/**
 * True when amount is more than available (both human decimal strings).
 * Unparseable input is not reported as insufficient — other checks handle it.
 */
export const exceedsAvailable = (amount, available, decimals = 18) => {
    const amountUnits = parseUnitsSafe(amount, decimals);
    const availableUnits = parseUnitsSafe(available, decimals);
    if (amountUnits === null || availableUnits === null) return false;
    return amountUnits > availableUnits;
};
