/**
 * FutarchyQuoteHelper spec mirror (auto-qa).
 *
 * Pins src/utils/FutarchyQuoteHelper.js — the swap-quote helper that
 * wraps the on-chain FutarchyArbitrageHelper contract via callStatic
 * (eth_call simulation, no signature). Powers swap-modal price quotes
 * everywhere in the UI.
 *
 * Five concerns:
 *
 *   1. HELPER_ADDRESS — pinned canonical Gnosis address. A typo
 *      silently routes every quote to a non-existent / wrong contract.
 *   2. HELPER_ABI — exact tuple shape (6 fields). Drift in ordering
 *      or types means callStatic returns garbage that this code then
 *      "interprets" — silent quote corruption.
 *   3. calculatePriceFromSqrt — Algebra V3 sqrtPriceX96 → price math,
 *      duplicated from utils/algebraQuoter.js style. Cross-checked
 *      against the canonical sqrtPriceX96ToPrice in sqrt-price-x96.test.mjs.
 *   4. Slippage math — `slippageBps = round(slippage * 10000)`,
 *      `minReceive = out * (10000 - bps) / 10000`. Same algorithm as
 *      the canonical getMinReceive (slippage-math.test.mjs). Cross-pin
 *      so a divergent change here is visible.
 *   5. Gas limit override (12_000_000) — pinned safety margin below
 *      Gnosis block gas limit (~17M). A regression to a higher value
 *      would cause public RPCs to reject the eth_call.
 *
 * The async getSwapQuote() function itself (network-bound) is NOT
 * unit-tested — only its source-text branches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/FutarchyQuoteHelper.js', import.meta.url),
    'utf8',
);

// --- spec mirror of calculatePriceFromSqrt (pure number math) ---
function calculatePriceFromSqrt(sqrtPriceX96Str) {
    const curr = Number(sqrtPriceX96Str) / (2 ** 96);
    return curr * curr;
}

// --- spec mirror of slippage math ---
function slippageMath(amountOutBigStr, slippagePercentage) {
    // BigInt-safe mirror; the source uses ethers BigNumber but the math
    // is integer / 10000.
    const amountOut = BigInt(amountOutBigStr);
    const slippageBps = Math.round(slippagePercentage * 10000);
    const minReceive = (amountOut * BigInt(10000 - slippageBps)) / 10000n;
    return { slippageBps, minReceive };
}

// ---------------------------------------------------------------------------
// HELPER_ADDRESS — canonical Gnosis FutarchyArbitrageHelper
// ---------------------------------------------------------------------------

test('HELPER_ADDRESS — pinned to the canonical 0xe32bfb3 verified Gnosis contract', () => {
    const m = SRC.match(/HELPER_ADDRESS\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'HELPER_ADDRESS not found');
    assert.equal(m[1], '0xe32bfb3DD8bA4c7F82dADc4982c04Afa90027EFb',
        `HELPER_ADDRESS drifted from canonical Gnosis FutarchyArbitrageHelper. ` +
        `Every swap quote in the UI calls this contract — drift = wrong contract = wrong quotes.`);
});

test('HELPER_ADDRESS — valid 0x + 40 hex chars (EVM address shape)', () => {
    const m = SRC.match(/HELPER_ADDRESS\s*=\s*['"]([^'"]+)['"]/);
    assert.match(m[1], /^0x[0-9a-fA-F]{40}$/,
        `HELPER_ADDRESS shape invalid`);
});

test('HELPER_ADDRESS — preserves EIP-55 mixed-case checksum form', () => {
    // Pinned: keeping the checksummed form (lowercase + uppercase mix)
    // means a future programmatic check (ethers.utils.getAddress) won't
    // throw. A regression to all-lowercase would still validate but
    // loses the visual hint about checksum integrity.
    const m = SRC.match(/HELPER_ADDRESS\s*=\s*['"]([^'"]+)['"]/);
    const addr = m[1];
    assert.notEqual(addr, addr.toLowerCase(),
        `HELPER_ADDRESS must preserve EIP-55 checksum case (mixed case)`);
});

// ---------------------------------------------------------------------------
// HELPER_ABI — exact tuple shape
// ---------------------------------------------------------------------------

test('HELPER_ABI — declares simulateQuote with EXACT param signature', () => {
    // Pinned: (address proposal, bool isYesPool, uint8 inputType, uint256 amountIn).
    // Drift in arg order or types changes the call ABI and either
    // silently mis-decodes data or reverts. callStatic surfaces neither
    // cleanly — it's a tough class of bug.
    assert.match(SRC,
        /function simulateQuote\(address proposal, bool isYesPool, uint8 inputType, uint256 amountIn\)/,
        `simulateQuote arg signature drift`);
});

test('HELPER_ABI — return tuple has exactly 6 fields in canonical order', () => {
    // Pinned: (int256 amount0Delta, int256 amount1Delta, uint160 startSqrtPrice,
    //         uint160 endSqrtPrice, bytes debugReason, bool isToken0Outcome).
    // The handler reads result.amount0Delta, .amount1Delta, .startSqrtPrice,
    // .endSqrtPrice, .isToken0Outcome — all six fields are wired in.
    assert.match(SRC,
        /tuple\(int256 amount0Delta, int256 amount1Delta, uint160 startSqrtPrice, uint160 endSqrtPrice, bytes debugReason, bool isToken0Outcome\)/,
        `simulateQuote return tuple shape drift`);
});

// ---------------------------------------------------------------------------
// Empty / invalid amount → null
// ---------------------------------------------------------------------------

test('source — getSwapQuote returns null for empty/NaN/<=0 amount', () => {
    // Pinned: the guard `if (!amount || isNaN(parseFloat(amount)) ||
    // parseFloat(amount) <= 0) return null;` short-circuits BEFORE the
    // network call. A regression that drops any branch wastes an
    // eth_call and surfaces a wrong-shaped rejection to the UI.
    assert.match(SRC,
        /if\s*\(\s*!amount\s*\|\|\s*isNaN\(parseFloat\(amount\)\)\s*\|\|\s*parseFloat\(amount\)\s*<=\s*0\s*\)\s*\{\s*return null\s*;?\s*\}/,
        `empty/invalid-amount guard shape drifted`);
});

// ---------------------------------------------------------------------------
// inputType encoding — company → 0, currency → 1
// ---------------------------------------------------------------------------

test('source — inputType: isInputCompanyToken ? 0 : 1 (company=0, currency=1)', () => {
    // Pinned: the contract enum encoding. Flipping these silently
    // routes EVERY swap to the OTHER token side — buy becomes sell,
    // sell becomes buy. Catastrophic and hard to detect from outside.
    assert.match(SRC,
        /inputType\s*=\s*isInputCompanyToken\s*\?\s*0\s*:\s*1/,
        `inputType encoding drifted from "company=0, currency=1"`);
});

// ---------------------------------------------------------------------------
// Gas limit override — 12M (safe under Gnosis 17M block limit)
// ---------------------------------------------------------------------------

test('source — gasLimit override pinned at 12_000_000 (safe under Gnosis ~17M block limit)', () => {
    // Pinned: the comment in the source explains this — public RPCs
    // reject eth_call with gas above the block limit. 12M leaves room.
    // A regression to 20M would silently break quotes on public RPCs
    // (works on local fork, fails in prod).
    assert.match(SRC,
        /gasLimit:\s*12_000_000/,
        `gasLimit drifted from 12_000_000 — too high → public RPC rejects ` +
        `("Block gas limit exceeded"); too low → simulation runs out of gas.`);
});

// ---------------------------------------------------------------------------
// calculatePriceFromSqrt — spec mirror + cross-pin
// ---------------------------------------------------------------------------

test('calcPriceFromSqrt — square root invariant: price = (sqrt / 2^96)^2', () => {
    // Pinned the formula. A regression to /2^192 (full Q-format) would
    // be off by a factor of 2^96 — silent.
    const sqrt = 2n ** 96n;  // sqrt = 1 in raw price terms
    const price = calculatePriceFromSqrt(sqrt.toString());
    // price = (2^96 / 2^96)^2 = 1
    assert.equal(price, 1);
});

test('calcPriceFromSqrt — sqrt = 2 * 2^96 → price = 4', () => {
    const sqrt = 2n * (2n ** 96n);
    const price = calculatePriceFromSqrt(sqrt.toString());
    assert.equal(price, 4);
});

test('calcPriceFromSqrt — output is non-negative for any input (square invariant)', () => {
    // Probe a few sample sqrt values; price = (x/2^96)^2 ≥ 0 always.
    for (const exp of [0, 48, 96, 144, 192]) {
        const sqrt = 2n ** BigInt(exp);
        const price = calculatePriceFromSqrt(sqrt.toString());
        assert.ok(price >= 0, `price for sqrt=2^${exp} was negative: ${price}`);
    }
});

test('calcPriceFromSqrt — monotonic in sqrtPrice (larger sqrt → larger price)', () => {
    const a = calculatePriceFromSqrt(((1n << 96n)).toString());
    const b = calculatePriceFromSqrt(((2n << 96n)).toString());
    const c = calculatePriceFromSqrt(((10n << 96n)).toString());
    assert.ok(a < b && b < c, `monotonicity broken: a=${a}, b=${b}, c=${c}`);
});

test('calcPriceFromSqrt — source uses Number() not BigInt for the math (precision tradeoff pinned)', () => {
    // Pinned: the source comment acknowledges JS Number is double-precision
    // (15-17 digits). For prices in normal ranges this is enough; for
    // extreme prices this is a known precision tradeoff. A regression
    // to BigInt-only would lose the fractional portion entirely.
    assert.match(SRC,
        /Number\(sqrtPriceStr\)\s*\/\s*\(\s*2\s*\*\*\s*96\s*\)/,
        `calculatePriceFromSqrt formula drifted — must be Number(sqrt) / (2**96)`);
});

// ---------------------------------------------------------------------------
// Slippage math — same algorithm as canonical getMinReceive (cross-pin)
// ---------------------------------------------------------------------------

test('slippage — slippageBps = round(slippagePercentage * 10000)', () => {
    // 3% → 300 bps. Pinned as the universal slippage encoding in this
    // codebase (matches slippage-math.test.mjs canonical mirror).
    assert.equal(slippageMath('1000', 0.03).slippageBps, 300);
    assert.equal(slippageMath('1000', 0.005).slippageBps, 50);
});

test('slippage — slippageBps rounds (e.g. 0.0001 → 1, 0.00005 → 1, 0.00004 → 0)', () => {
    // Pinned because Math.round(0.5) = 1 (banker's rounding behavior).
    // 0.00004 * 10000 = 0.4 → 0; 0.00005 * 10000 = 0.5 → 1.
    assert.equal(slippageMath('1', 0.00005).slippageBps, 1);
    assert.equal(slippageMath('1', 0.00004).slippageBps, 0);
});

test('slippage — minReceive = amountOut * (10000 - bps) / 10000 (BigInt-safe)', () => {
    // Probed amount: 1e18 (1 ether scale); 3% slippage → 0.97 * 1e18.
    const r = slippageMath((10n ** 18n).toString(), 0.03);
    const expected = (10n ** 18n) * 9700n / 10000n;
    assert.equal(r.minReceive, expected);
});

test('slippage — zero slippage returns amountOut unchanged', () => {
    const out = '12345678901234567890';
    const r = slippageMath(out, 0);
    assert.equal(r.minReceive, BigInt(out),
        `zero slippage must produce identity (got ${r.minReceive})`);
});

test('slippage — minReceive is non-increasing as slippage grows', () => {
    const out = '1000000000000000000';
    let prev = BigInt(out) + 1n; // sentinel
    for (const slip of [0, 0.001, 0.01, 0.05, 0.1]) {
        const r = slippageMath(out, slip);
        assert.ok(r.minReceive < prev,
            `monotonicity broken: slip=${slip} produced minReceive=${r.minReceive} ≥ prev=${prev}`);
        prev = r.minReceive;
    }
});

test('source — slippage math expression matches canonical getMinReceive shape', () => {
    // Cross-pin: slippage-math.test.mjs covers the canonical helper.
    // This file inlines the same formula. Drift here would diverge
    // from the canonical UI math — silent quote-vs-execution mismatch.
    assert.match(SRC,
        /slippageBps\s*=\s*Math\.round\(slippagePercentage\s*\*\s*10000\)/,
        `inline slippageBps formula drifted from canonical`);
    assert.match(SRC,
        /\.mul\(10000\s*-\s*slippageBps\)\.div\(10000\)/,
        `inline minReceive formula drifted from canonical (out * (10000-bps) / 10000)`);
});

// ---------------------------------------------------------------------------
// Inversion logic — !isToken0Outcome → invert price (1/p)
// ---------------------------------------------------------------------------

test('source — inverts BOTH currentPoolPrice AND priceAfterNum when !isToken0Outcome', () => {
    // Pinned: a regression that inverts only one side would display
    // the start/end prices in different units — silent UX corruption.
    assert.match(SRC,
        /currentPoolPrice\s*=\s*\(currentPoolPrice\s*>\s*0\)\s*\?\s*1\s*\/\s*currentPoolPrice\s*:\s*0/,
        `currentPoolPrice inversion shape drifted`);
    assert.match(SRC,
        /priceAfterNum\s*=\s*\(priceAfterNum\s*>\s*0\)\s*\?\s*1\s*\/\s*priceAfterNum\s*:\s*0/,
        `priceAfterNum inversion shape drifted`);
});

test('source — division-by-zero guard: invert only when current/price > 0', () => {
    // Pinned because 1/0 = Infinity in JS, not throw. A regression
    // that drops the guard returns Infinity to UI rendering code.
    // Source uses `(x > 0) ? 1/x : 0`.
    const inversionGuards = [...SRC.matchAll(/\(\s*\w+(?:PoolPrice|AfterNum)\s*>\s*0\s*\)\s*\?\s*1\s*\/\s*\w+/g)];
    assert.ok(inversionGuards.length >= 2,
        `expected >=2 div-by-zero guards in inversion path; got ${inversionGuards.length}`);
});

// ---------------------------------------------------------------------------
// Output selection — by sign, via selectSwapDeltas (M18)
// ---------------------------------------------------------------------------

test('source — output delta is picked by sign (selectSwapDeltas), not "whichever is not amountIn"', () => {
    // The old rule (if |d0| == amountIn then out = |d1| else out = |d0|)
    // reported the INPUT as the output whenever a thin pool stopped at its
    // price limit and consumed less than amountIn.
    assert.match(SRC, /import\s*\{\s*selectSwapDeltas\s*\}\s*from\s*["']\.\/swapQuoteMath(\.js)?["']/,
        'FutarchyQuoteHelper must use selectSwapDeltas');
    assert.match(SRC, /selectSwapDeltas\(\{[\s\S]*?amount0Delta:[\s\S]*?amount1Delta:[\s\S]*?amountIn:/,
        'selectSwapDeltas must receive both deltas and the requested amountIn');
    assert.doesNotMatch(SRC, /absD0\.eq\(amountBig\)/,
        'the "match the input size" output rule must not come back');
});

test('source — partial fills are reported (partialFill + raw.amountInConsumed)', () => {
    assert.match(SRC, /partialFill:\s*isPartialFill/);
    assert.match(SRC, /amountInConsumed:\s*amountInConsumed\.toString\(\)/);
});

test('source — a failed simulation keeps the original error as cause (code/reason survive)', () => {
    assert.match(SRC, /wrapped\.cause\s*=\s*error/);
    assert.match(SRC, /wrapped\.code\s*=\s*error\.code/);
});

test('source — uses callStatic (eth_call simulation, NOT a real tx)', () => {
    // Pinned: a regression to `await helper.simulateQuote(...)` (no
    // callStatic) would attempt a real signed transaction — would
    // require gas, fail without a signer, and on a signer would
    // BURN GAS for a query.
    assert.match(SRC,
        /helper\.callStatic\.simulateQuote\(/,
        `must use callStatic (NOT direct call — direct call would burn gas)`);
});

test('source — empty-/null-provider guard throws BEFORE constructing the contract', () => {
    // Pinned: the `if (!provider) throw` runs at the top of the
    // function. A regression that lets it through would surface as
    // a confusing ethers error deeper in the stack.
    assert.match(SRC,
        /if\s*\(!provider\)\s*\{\s*throw\s+new\s+Error\(["']Provider required for getSwapQuote["']\)/,
        `provider guard shape drifted`);
});

// ---------------------------------------------------------------------------
// Output shape — the returned object has all expected fields
// ---------------------------------------------------------------------------

test('source — returned object includes all 9 documented fields', () => {
    // Pinned: callers destructure these. A field rename here breaks
    // the consumer silently (undefined vs missing key).
    const fields = [
        'expectedReceive', 'minReceive', 'slippagePct',
        'currentPoolPrice', 'priceAfter', 'executionPrice',
        'startSqrtPrice', 'endSqrtPrice', 'isInverted',
    ];
    for (const f of fields) {
        // Each field must appear as a key in the returned object literal.
        assert.match(SRC, new RegExp(`${f}\\s*:`),
            `returned object missing field "${f}"`);
    }
});

test('source — raw.amountIn / raw.amountOut are STRINGS (not BigNumbers) for JSON safety', () => {
    // Pinned: BigNumbers don't JSON-serialize cleanly. Returning them
    // as strings ensures callers can safely round-trip through
    // JSON.stringify (e.g. analytics, logs).
    assert.match(SRC,
        /amountIn:\s*amountBig\.toString\(\)/,
        `raw.amountIn must be .toString() (string for JSON safety)`);
    assert.match(SRC,
        /amountOut:\s*amountOutBig\.toString\(\)/,
        `raw.amountOut must be .toString() (string for JSON safety)`);
});
