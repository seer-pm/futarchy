/**
 * Swap quote math (auto-qa).
 *
 * Pins src/utils/swapQuoteMath.js and the places that must use it:
 *   - W4: the confirm dialog's "Min. Receive" and the transaction's
 *     amountOutMinimum come from one function (minReceiveFromQuote) with the
 *     dialog's slippage tolerance — the dialog used to show the trade panel's
 *     0.5% minimum while the transaction used 3%
 *   - W4: no "Slippage Warning" computed from price impact (impact is already
 *     in the quote; the warning said a successful trade "will likely fail")
 *   - M18: the output delta is chosen by sign; partial fills are flagged
 *   - execution price = amountIn / amountOut (buy), not the post-swap spot
 *   - L1: the Confirm button compares the amount with the panel's Available
 *   - M17: quote errors keep their reason; stale responses are dropped
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const math = await import(new URL('../../src/utils/swapQuoteMath.js', import.meta.url));
const tx = await import(new URL('../../src/utils/txErrors.js', import.meta.url));

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const MODAL = read('src/components/futarchyFi/marketPage/ConfirmSwapModal.jsx');
const PANEL = read('src/components/futarchyFi/marketPage/ShowcaseSwapComponent.jsx');

const E18 = 10n ** 18n;

// ---------------------------------------------------------------------------
// minReceiveFromQuote / slippagePctToBps
// ---------------------------------------------------------------------------

test('slippagePctToBps — percent to basis points, clamped', () => {
    assert.equal(math.slippagePctToBps(3), 300);
    assert.equal(math.slippagePctToBps(0.5), 50);
    assert.equal(math.slippagePctToBps('1'), 100);
    assert.equal(math.slippagePctToBps(-1), 0);
    assert.equal(math.slippagePctToBps(NaN), 0);
    assert.equal(math.slippagePctToBps(150), 10000);
});

test('minReceiveFromQuote — W4 case: 3% below the quote, not 0.5%', () => {
    // 0.2 sDAI buy on the TEST market quoted ~0.001936 YES_company. The dialog
    // showed 0.001926 (0.5%) while the transaction used 3%.
    const quoted = 1_936_000_000_000_000n; // 0.001936e18
    assert.equal(math.minReceiveFromQuote(quoted, 3), quoted * 9700n / 10000n);
    assert.equal(math.minReceiveFromQuote(quoted, 3), 1_877_920_000_000_000n);
});

test('minReceiveFromQuote — accepts bigint, decimal string and BigNumber-like input', () => {
    const bn = { toString: () => '1000000000000000000' };
    assert.equal(math.minReceiveFromQuote(E18, 1), 99n * E18 / 100n);
    assert.equal(math.minReceiveFromQuote('1000000000000000000', 1), 99n * E18 / 100n);
    assert.equal(math.minReceiveFromQuote(bn, 1), 99n * E18 / 100n);
});

test('minReceiveFromQuote — zero tolerance is identity; rounding is down', () => {
    assert.equal(math.minReceiveFromQuote(12345n, 0), 12345n);
    assert.equal(math.minReceiveFromQuote(3n, 50), 1n); // 1.5 → 1
});

test('minReceiveFromQuote — matches the slippage-math spec (out * (10000 - bps) / 10000)', () => {
    for (const [out, pct] of [[1234n * E18, 0.5], [99n * E18 + 99n, 3], [7n, 0.123]]) {
        const bps = BigInt(Math.round(pct * 100));
        assert.equal(math.minReceiveFromQuote(out, pct), (out * (10000n - bps)) / 10000n);
    }
});

// ---------------------------------------------------------------------------
// Single source: the dialog's Min. Receive and the tx minimum
// ---------------------------------------------------------------------------

test('modal — minimumFromQuote (the tx amountOutMinimum) is minReceiveFromQuote with the dialog tolerance', () => {
    assert.match(MODAL, /import\s*\{[^}]*minReceiveFromQuote[^}]*\}\s*from\s*'..\/..\/..\/utils\/swapQuoteMath'/);
    assert.match(MODAL,
        /const minimumFromQuote = useCallback\(\(quotedAmountOutRaw\) => \{[\s\S]*?minReceiveFromQuote\(quotedAmountOut\.toString\(\), getSafeSlippageTolerance\(\)\)/);
});

test('modal — displayed Min. Receive is computed by minimumFromQuote from the displayed quote', () => {
    assert.match(MODAL,
        /const displayedMinReceive = \(\(\) => \{[\s\S]*?formatUnits\(minimumFromQuote\(quoted\), outputDecimals\)/);
    // No Min. Receive derived from the trade panel's 0.5% figure or a float formula
    assert.doesNotMatch(MODAL, /minimumReceivedFormatted\)\s*\}/);
    assert.doesNotMatch(MODAL, /parseFloat\(amountFormatted\) \* \(1 - getSafeSlippageTolerance\(\) \/ 100\)/);
    assert.doesNotMatch(MODAL, /minimumReceivedFormatted: transactionData\.minimumReceived/);
});

test('modal — the re-quote uses the same (clamped) tolerance as the display', () => {
    assert.doesNotMatch(MODAL, /\n\s*slippageTolerance \/ 100,/);
    assert.match(MODAL, /const toleranceBps = slippagePctToBps\(tolerance\);/);
    assert.match(MODAL, /const tolerance = getSafeSlippageTolerance\(\);/);
});

test('modal — no "Slippage Warning" computed from price impact', () => {
    assert.doesNotMatch(MODAL, /Slippage Warning/);
    assert.doesNotMatch(MODAL, /Expected slippage/);
    assert.doesNotMatch(MODAL, /swapRouteData\.data\.slippage/);
});

// ---------------------------------------------------------------------------
// selectSwapDeltas (M18)
// ---------------------------------------------------------------------------

test('selectSwapDeltas — live TEST-market buy: positive delta is the input, negative the output', () => {
    // simulateQuote(0xef47…, yes, currency, 0.2e18) on Gnosis returned:
    const r = math.selectSwapDeltas({
        amount0Delta: '-1895700286351220',
        amount1Delta: '200000000000000000',
        amountIn: '200000000000000000',
    });
    assert.equal(r.amountOut, 1895700286351220n);
    assert.equal(r.amountInConsumed, 200000000000000000n);
    assert.equal(r.outputIsToken0, true);
    assert.equal(r.isPartialFill, false);
});

test('selectSwapDeltas — live TEST-market sell: output is token1', () => {
    const r = math.selectSwapDeltas({
        amount0Delta: '1000000000000000',
        amount1Delta: '-99057541816001347',
        amountIn: '1000000000000000',
    });
    assert.equal(r.amountOut, 99057541816001347n);
    assert.equal(r.outputIsToken0, false);
    assert.equal(r.isPartialFill, false);
});

test('selectSwapDeltas — partial fill: never reports the consumed input as output', () => {
    // Pool stops at its price limit after taking 0.6 of 1.0. The old rule
    // (|d0| != amountIn → out = |d0|) returned 0.6 (the input) as the output.
    const r = math.selectSwapDeltas({
        amount0Delta: 6n * E18 / 10n,
        amount1Delta: -(5n * E18 / 1000n),
        amountIn: E18,
    });
    assert.equal(r.amountOut, 5n * E18 / 1000n);
    assert.equal(r.amountInConsumed, 6n * E18 / 10n);
    assert.equal(r.isPartialFill, true);
});

test('selectSwapDeltas — no output (same signs or zero) throws', () => {
    assert.throws(() => math.selectSwapDeltas({ amount0Delta: 0n, amount1Delta: 0n, amountIn: 1n }), /no output/);
    assert.throws(() => math.selectSwapDeltas({ amount0Delta: 5n, amount1Delta: 3n, amountIn: 5n }), /no output/);
});

// ---------------------------------------------------------------------------
// executionPriceFor
// ---------------------------------------------------------------------------

test('executionPriceFor — currency per company for both directions', () => {
    assert.equal(math.executionPriceFor({ amountIn: '100', amountOut: '2', isBuy: true }), 50);
    assert.equal(math.executionPriceFor({ amountIn: '2', amountOut: '100', isBuy: false }), 50);
    assert.equal(math.executionPriceFor({ amountIn: '0', amountOut: '1', isBuy: true }), null);
    assert.equal(math.executionPriceFor({ amountIn: '1', amountOut: '', isBuy: true }), null);
});

test('panel — chain-1 execution price is amountIn/amountOut; post-swap spot is priceAfter', () => {
    assert.doesNotMatch(PANEL, /executionPrice = sqrtPriceX96ToPrice\(quoteResult\.sqrtPriceX96After\)/);
    assert.match(PANEL, /executionPrice = executionPriceFor\(\{[\s\S]*?amountOut: quoteResult\.amountOutFormatted/);
    assert.match(PANEL, /quoteResult\.priceAfter = sqrtPriceX96ToPrice\(quoteResult\.sqrtPriceX96After\)/);
    // the average price is already currency/company — only pool prices are inverted
    assert.doesNotMatch(PANEL, /executionPrice = 1 \/ executionPrice/);
});

// ---------------------------------------------------------------------------
// compareQuotes (M17 re-quote)
// ---------------------------------------------------------------------------

test('compareQuotes — within tolerance proceeds, beyond tolerance stops', () => {
    const confirmed = 1000n * E18;
    const within = math.compareQuotes({ confirmedAmountOutRaw: confirmed, freshAmountOutRaw: 980n * E18, slippagePct: 3 });
    assert.equal(within.exceedsTolerance, false);
    assert.equal(within.movedPct, 2);
    assert.equal(within.minReceive, 970n * E18);

    const beyond = math.compareQuotes({ confirmedAmountOutRaw: confirmed, freshAmountOutRaw: 969n * E18, slippagePct: 3 });
    assert.equal(beyond.exceedsTolerance, true);
    assert.equal(beyond.movedPct, 3.1);

    const better = math.compareQuotes({ confirmedAmountOutRaw: confirmed, freshAmountOutRaw: 1010n * E18, slippagePct: 3 });
    assert.equal(better.exceedsTolerance, false);
    assert.equal(better.movedPct, -1);
});

test('compareQuotes — exactly at Min. Receive still passes (the tx accepts >= min)', () => {
    const r = math.compareQuotes({ confirmedAmountOutRaw: 10000n, freshAmountOutRaw: 9700n, slippagePct: 3 });
    assert.equal(r.exceedsTolerance, false);
});

test('modal — re-quotes before any transaction and keeps the confirmed minimum', () => {
    assert.match(MODAL, /const quotedTrade = await requoteBeforeSend\(amountInWei\);\s*if \(!quotedTrade\) \{/);
    // the re-quote runs before the collateral (split) step
    assert.ok(MODAL.indexOf('await requoteBeforeSend(') < MODAL.indexOf('const needsCollateral ='));
    assert.match(MODAL, /compareQuotes\(\{\s*confirmedAmountOutRaw,/);
    assert.match(MODAL, /if \(exceedsTolerance\) \{\s*applyRefreshedQuote\(fresh\.amountOut\);/);
    // the sent trade's minimum is never below the confirmed Min. Receive
    assert.match(MODAL, /if \(fresh\.minimumAmountOut\(\) >= confirmedMin\) return fresh;/);
    assert.match(MODAL, /slippageBpsForMinimum\(fresh\.amountOut, confirmedMin, toleranceBps\)/);
    assert.match(MODAL, /if \(tightened\.minimumAmountOut\(\) < confirmedMin\) \{/);
    // and the swap that is sent is that trade
    assert.match(MODAL, /executeSeerSwap\(\{\s*trade: quotedTrade,/);
});

// ---------------------------------------------------------------------------
// slippageBpsForMinimum (R3: Seer SDK trades keep the confirmed minimum)
// ---------------------------------------------------------------------------

test('slippageBpsForMinimum — the rebuilt minimum is never below the confirmed one', () => {
    const cases = [
        [1000000n, 970000n, 300], [1000000n, 999999n, 300], [987654321n, 950000000n, 300],
        [10n ** 18n, 97n * 10n ** 16n, 300], [123456789012345678n, 120000000000000000n, 500],
    ];
    for (const [fresh, min, maxBps] of cases) {
        const bps = math.slippageBpsForMinimum(fresh, min, maxBps);
        assert.ok(bps !== null && bps >= 0 && bps <= maxBps);
        assert.ok((fresh * BigInt(10000 - bps)) / 10000n >= min, `${fresh} ${min} -> ${bps}`);
    }
});

test('slippageBpsForMinimum — capped at the tolerance, null when the fresh quote is below the minimum', () => {
    assert.equal(math.slippageBpsForMinimum(2000000n, 970000n, 300), 300);
    assert.equal(math.slippageBpsForMinimum(1000000n, 1000000n, 300), 0);
    assert.equal(math.slippageBpsForMinimum(960000n, 970000n, 300), null);
    assert.equal(math.slippageBpsForMinimum(0n, 0n, 300), null);
});

test('seerSwap — approves the quoted router, then sends the quoted trade', () => {
    const SEER = read('src/utils/seerSwap.js');
    assert.match(SEER, /fetchNeededApprovals\(client, \[trade\.tokenIn\.address\], account, trade\.approveAddress, \[amountIn\]\)/);
    assert.match(SEER, /args: \[trade\.approveAddress, approvalAmountFor\(amountIn\.toString\(\), useUnlimitedApproval\)\.toBigInt\(\)\]/);
    // The caller's Safe check (useSafeConnection, which sees a Safe over
    // WalletConnect) wins; the connector-only check is the fallback.
    assert.match(SEER, /isSafe = isSafeWallet\(walletClient, connector\),/);
    assert.match(SEER, /if \(isSafe\) throw new Error\(SAFE_TRANSACTION_SENT\);/);
    assert.match(MODAL, /isSafe: isSafeConnection\(walletClient\),/);
    assert.match(SEER, /return tradeTokens\(\{ trade, account, isTradingCredits: false \}, \{ client: walletClient \}\);/);
    assert.match(SEER, /tradeType: TradeType\.EXACT_INPUT/);
});

// ---------------------------------------------------------------------------
// exceedsAvailable / parseUnitsSafe (L1)
// ---------------------------------------------------------------------------

test('parseUnitsSafe — exact decimal parsing, truncating past the decimals', () => {
    assert.equal(math.parseUnitsSafe('1.5'), 15n * E18 / 10n);
    assert.equal(math.parseUnitsSafe('.5'), 5n * E18 / 10n);
    assert.equal(math.parseUnitsSafe('2'), 2n * E18);
    assert.equal(math.parseUnitsSafe('0.1234567', 6), 123456n);
    assert.equal(math.parseUnitsSafe('abc'), null);
    assert.equal(math.parseUnitsSafe('-1'), null);
    assert.equal(math.parseUnitsSafe(''), null);
});

test('exceedsAvailable — wei-exact comparison', () => {
    assert.equal(math.exceedsAvailable('1.000000000000000001', '1.0'), true);
    assert.equal(math.exceedsAvailable('1', '1.0'), false);
    assert.equal(math.exceedsAvailable('0.2', '10.5'), false);
    assert.equal(math.exceedsAvailable('5', '0'), true);
    // unparseable → not reported as insufficient (other checks handle it)
    assert.equal(math.exceedsAvailable('abc', '1'), false);
    assert.equal(math.exceedsAvailable('1', null), false);
});

test('panel — Confirm is disabled with "Insufficient balance" using the Available figure', () => {
    assert.match(PANEL, /const insufficientBalance = Boolean\(account\) && availableBalance\.value !== null && exceedsAvailable\(amount, availableBalance\.value\)/);
    assert.match(PANEL, /disabled=\{[^}]*insufficientBalance[^}]*\}/);
    assert.match(PANEL, /insufficientBalance \? 'Insufficient balance'/);
    // the "Available" row renders the same computed value
    assert.match(PANEL, /\{availableBalance\.display\}/);
});

// ---------------------------------------------------------------------------
// Quote errors (M17)
// ---------------------------------------------------------------------------

test('describeQuoteError — RPC trouble', () => {
    const e = Object.assign(new Error('could not detect network (event="noNetwork", code=NETWORK_ERROR, version=providers/5.7.2)'), { code: 'NETWORK_ERROR' });
    assert.deepEqual(tx.describeQuoteError(e), { kind: 'network', message: 'Quote failed: RPC unavailable, try again' });
    assert.equal(tx.describeQuoteError(new Error('Failed to fetch')).kind, 'network');
});

test('describeQuoteError — ethers v5 eth_call over a failing RPC (CALL_EXCEPTION wrapping SERVER_ERROR) is an RPC error', () => {
    // What ethers v5 throws for callStatic when the RPC answers HTTP 503
    // (reproduced against a local 503 server), wrapped by FutarchyQuoteHelper
    const server = Object.assign(new Error('bad response (status=503, headers={}, body="down", requestBody="{}", url="http://rpc", code=SERVER_ERROR, version=web/5.7.1)'), { code: 'SERVER_ERROR', reason: 'bad response' });
    const call = Object.assign(new Error('missing revert data in call exception; Transaction reverted without a reason string'), { code: 'CALL_EXCEPTION', reason: 'missing revert data in call exception; Transaction reverted without a reason string', error: server });
    const wrapped = Object.assign(new Error('Quote simulation failed: missing revert data in call exception'), { code: 'CALL_EXCEPTION', cause: call });
    assert.equal(tx.describeQuoteError(wrapped).kind, 'network');
});

test('describeQuoteError — reverted simulation, with and without a reason', () => {
    const withReason = Object.assign(new Error('call revert exception'), { code: 'CALL_EXCEPTION', reason: 'SPL' });
    assert.deepEqual(tx.describeQuoteError(withReason), { kind: 'reverted', message: 'Quote reverted: SPL' });

    // FutarchyQuoteHelper wraps the ethers error and keeps it as cause
    const inner = Object.assign(new Error('missing revert data in call exception'), { code: 'CALL_EXCEPTION', reason: 'missing revert data in call exception' });
    const wrapped = Object.assign(new Error('Quote simulation failed: missing revert data in call exception'), { cause: inner, code: 'CALL_EXCEPTION' });
    assert.deepEqual(tx.describeQuoteError(wrapped), { kind: 'reverted', message: 'Quote reverted: the pool cannot fill this amount' });
});

test('describeQuoteError — other errors keep their first line without ethers suffixes', () => {
    const e = new Error('Pool address not found (method="slot0()", data="0x", errorArgs=null, code=INVALID_ARGUMENT, version=abi/5.7.0)');
    assert.deepEqual(tx.describeQuoteError(e), { kind: 'other', message: 'Pool address not found' });
    assert.equal(tx.describeQuoteError(new Error('No pool found for A/B with fee 500')).message, 'No pool found for A/B with fee 500');
});

test('panel — quote failures show their reason; only partial/reverted mean insufficient liquidity', () => {
    assert.match(PANEL, /describeQuoteError\(error\)/);
    assert.match(PANEL, /insufficientLiquidity: kind === 'partial' \|\| kind === 'reverted'/);
    assert.doesNotMatch(PANEL, /insufficientLiquidity: true, \/\/ Quoter failure means/);
});

test('panel — stale quote responses are dropped (request id), including after the fallback-price await', () => {
    assert.match(PANEL, /const requestId = \+\+quoteRequestIdRef\.current;/);
    assert.match(PANEL, /const isCurrent = \(\) => isActive && requestId === quoteRequestIdRef\.current;/);
    assert.match(PANEL, /if \(!isCurrent\(\)\) return; \/\/ a newer quote started/);
});

// ---------------------------------------------------------------------------
// Revert hint and mainnet explorer (L2)
// ---------------------------------------------------------------------------

test('modal — on-chain swap reverts get the slippage hint', () => {
    assert.match(tx.SWAP_REVERT_HINT, /price may have moved beyond your slippage tolerance/);
    assert.match(MODAL, /errorMessage = `\$\{describeTxError\(error\)\}\. \$\{SWAP_REVERT_HINT\}`/);
});

test('modal — Ethereum transactions link to Etherscan and show the hash', () => {
    assert.match(MODAL, /url: 'https:\/\/etherscan\.io\/tx\/'/);
    assert.match(MODAL, /\(config\?\.chainId \|\| chain\?\.id\) === 1 && uiExplorerUrl === DEFAULT_EXPLORER_CONFIG\.url/);
});
