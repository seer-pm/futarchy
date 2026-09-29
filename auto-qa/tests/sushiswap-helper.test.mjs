/**
 * sushiswapHelper spec mirror (auto-qa).
 *
 * Pins src/utils/sushiswapHelper.js — the Sushi V5 API integration
 * used for legacy V2 swaps in the swap modal. Eight concerns +
 * two hazards.
 *
 * Concerns:
 *
 *   1. Sushi API URL — pinned as `https://api.sushi.com/swap/v5/100`
 *      (Gnosis chainId in path). A regression that drops `/100` or
 *      bumps to a different version silently fails every swap.
 *
 *   2. Default options — maxSlippage='0.005', gasPrice='1000000008'
 *      (~1 gwei), fee='0.0025', mockMode=false. Drift in any silently
 *      changes UX behavior.
 *
 *   3. Query params — referrer='sushi', enableFee='false', feeBy='output',
 *      includeTransaction='true', includeRoute='true'. Removing any
 *      changes API response shape.
 *
 *   4. feeReceiver validation — must start with '0x' to be included;
 *      otherwise omitted (NOT thrown). A regression that throws would
 *      crash every swap when feeReceiver isn't set.
 *
 *   5. Mock-mode hardcoded slippage — `amount.mul(95).div(100)` (5%).
 *      Pinned because mock-mode is wired into UI tests.
 *
 *   6. Success-status guard — throws when swapData.status !== "Success".
 *      Otherwise the txData passthrough would propagate a malformed tx.
 *
 *   7. executeSushiSwapRoute gas defaults — gasLimit fallback chain
 *      (options || routeData.gasSpent || 400000), gasPrice default
 *      0.97 gwei. Drift would over/under-pay gas silently.
 *
 *   8. checkAndApproveToken uses MaxUint256 (infinite approval).
 *      Pinned because limited approval would force re-approval per swap.
 *
 * HAZARDS pinned (leave-as-is per /loop directive):
 *
 *   H1. (resolved) The positional caller lived in the dead
 *       src/futarchyJS/futarchy.js, now deleted. The remaining call site
 *       (ShowcaseSwapComponent.jsx) uses the destructured form; pinned
 *       via grep so a refactor that breaks it flags the test.
 *
 *   H2. Hardcoded feeReceiver leak in console.log — line 91 logs
 *       `0xca226bd9c754F1283123d32B2a7cF62a722f8ADa` regardless of
 *       what the caller passes. Looks like a debug artifact / dev
 *       fee-receiver address. Pinned for visibility.
 *
 *   H3. USEFUTARCHY debug logs — 4 console.log lines (tokenIn/Out/
 *       amount/userAddress) fire on every swap call. Production noise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
    new URL('../../src/utils/sushiswapHelper.js', import.meta.url),
    'utf8',
);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Sushi API URL — pinned chain in path (100 = Gnosis)
// ---------------------------------------------------------------------------

test('source — Sushi API URL is api.sushi.com/swap/v5/100 (Gnosis chain in path)', () => {
    // Pinned: hardcoded chainId 100 in URL path. A regression that
    // drops /100 → wrong chain; bump to /v6 → wrong API version.
    assert.match(SRC,
        /https:\/\/api\.sushi\.com\/swap\/v5\/100\?\$\{params\.toString\(\)\}/,
        `Sushi API URL drifted from https://api.sushi.com/swap/v5/100 (chainId in path)`);
});

test('source — Sushi API URL uses HTTPS (NOT HTTP)', () => {
    assert.doesNotMatch(SRC, /http:\/\/api\.sushi\.com/,
        `Sushi API URL must be HTTPS (HTTP would leak swap details)`);
});

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

test('source — maxSlippage default = 0.005 (0.5%)', () => {
    // Pinned: 0.5% is conservative. Drift to 0.05 (5%) would silently
    // accept much worse fills.
    assert.match(SRC, /maxSlippage\s*=\s*['"]0\.005['"]/,
        `maxSlippage default drifted from '0.005' (0.5%)`);
});

test('source — gasPrice default = 1000000008 wei (~1 gwei)', () => {
    // Pinned: ~1 gwei. Gnosis is cheap; this is reasonable.
    assert.match(SRC, /gasPrice\s*=\s*['"]1000000008['"]/,
        `gasPrice default drifted from '1000000008'`);
});

test('source — fee default = 0.0025 (0.25%)', () => {
    assert.match(SRC, /fee\s*=\s*['"]0\.0025['"]/,
        `fee default drifted from '0.0025' (0.25%)`);
});

test('source — mockMode default = false (live API by default)', () => {
    // Pinned: shipping with mockMode=true would hit the mock path
    // for every swap → fake routes returned → tx fails.
    assert.match(SRC, /mockMode\s*=\s*false/,
        `mockMode default drifted from false`);
});

// ---------------------------------------------------------------------------
// Query parameters — explicit list pin
// ---------------------------------------------------------------------------

test('source — query params include referrer="sushi"', () => {
    assert.match(SRC, /referrer:\s*['"]sushi['"]/,
        `referrer param drifted from 'sushi'`);
});

test('source — enableFee param is "false" (strings, not boolean — URLSearchParams)', () => {
    // Pinned: URLSearchParams stringifies, so the value MUST be string.
    // Drift to boolean true would coerce to "true" — but enableFee is
    // explicitly false here.
    assert.match(SRC, /enableFee:\s*['"]false['"]/,
        `enableFee param drifted from 'false'`);
});

test('source — feeBy param is "output" (NOT input)', () => {
    // Pinned: fee taken from OUTPUT side. A regression to "input"
    // would change which token the fee is denominated in.
    assert.match(SRC, /feeBy:\s*['"]output['"]/,
        `feeBy param drifted from 'output'`);
});

test('source — includeTransaction + includeRoute both "true" (need full tx data)', () => {
    // Pinned: omitting either drops txData / route from the response,
    // breaking executeSushiSwapRoute (which reads .tx.data + .routeProcessorAddr).
    assert.match(SRC, /includeTransaction:\s*['"]true['"]/);
    assert.match(SRC, /includeRoute:\s*['"]true['"]/);
});

// ---------------------------------------------------------------------------
// feeReceiver validation — must start with 0x to be included
// ---------------------------------------------------------------------------

test('source — feeReceiver included only when starts with "0x" (else omitted, NOT thrown)', () => {
    // Pinned: a regression that throws on missing feeReceiver would
    // crash every swap when caller doesn't set it.
    assert.match(SRC,
        /if\s*\(feeReceiver\s*&&\s*typeof feeReceiver\s*===\s*['"]string['"]\s*&&\s*feeReceiver\.startsWith\(['"]0x['"]\)\)\s*\{[\s\S]*?params\.set\(['"]feeReceiver['"],\s*feeReceiver\)/,
        `feeReceiver validation shape drifted (must require startsWith('0x') AND be string AND truthy)`);
});

// ---------------------------------------------------------------------------
// Amount validation — throw on missing / 0 / non-positive
// ---------------------------------------------------------------------------

test('source — throws "Invalid amount provided" when amount falsy or "0"', () => {
    assert.match(SRC,
        /if\s*\(!amount\s*\|\|\s*amount\s*===\s*['"]0['"]\)\s*\{[\s\S]*?throw new Error\(['"]Invalid amount provided['"]\)/,
        `amount falsy/0 guard shape drifted`);
});

test('source — throws "Amount must be greater than 0" when amountBN.lte(0)', () => {
    // Pinned: defensive guard against negative inputs (shouldn't
    // happen but BigNumber accepts negatives).
    assert.match(SRC,
        /if\s*\(amountBN\.lte\(0\)\)\s*\{[\s\S]*?throw new Error\(['"]Amount must be greater than 0['"]\)/,
        `amount-positive guard shape drifted`);
});

// ---------------------------------------------------------------------------
// Mock-mode 5% slippage hardcoded
// ---------------------------------------------------------------------------

test('source — mock mode amountOutMin = amount * 95 / 100 (5% slippage hardcoded)', () => {
    // Pinned: mockMode=true returns hardcoded 5% slippage. This is
    // distinct from the default 0.5% maxSlippage in the live API path.
    // A test/UI that asserts mock returns 0.5% would catch this.
    assert.match(SRC,
        /amountOutMin:\s*ethers\.BigNumber\.from\(amount\)\.mul\(95\)\.div\(100\)/,
        `mock-mode slippage drifted from amount.mul(95).div(100) (5% hardcoded — distinct from live's 0.5%)`);
});

test('source — mock mode hardcoded gasSpent: "158604"', () => {
    // Pinned: this number looks like a recorded gas value from a
    // historical mock swap. A regression that changes it would
    // make mock-mode tests use different gas estimates.
    assert.match(SRC,
        /gasSpent:\s*['"]158604['"]/,
        `mock-mode gasSpent drifted from '158604'`);
});

test('source — mock mode hardcoded status: "Success"', () => {
    // Pinned because the live-path status check guards on this exact
    // string — mock must produce the same to pass the guard.
    assert.match(SRC,
        /mockMode\)\s*\{[\s\S]*?status:\s*['"]Success['"]/,
        `mock-mode status drifted — must be exactly "Success" to pass the live-path guard`);
});

// ---------------------------------------------------------------------------
// Success-status guard
// ---------------------------------------------------------------------------

test('source — throws when swapData.status !== "Success"', () => {
    // Pinned: silent acceptance would propagate malformed txData
    // to executeSushiSwapRoute → tx execution fails opaquely.
    assert.match(SRC,
        /if\s*\(swapData\.status\s*!==\s*['"]Success['"]\)\s*\{[\s\S]*?throw new Error\(swapData\.message\s*\|\|\s*['"]Failed to get swap route from Sushi API['"]\)/,
        `success-status guard shape drifted`);
});

// ---------------------------------------------------------------------------
// executeSushiSwapRoute gas defaults
// ---------------------------------------------------------------------------

test('source — gasLimit fallback chain: options || routeData.gasSpent || 400000', () => {
    // Pinned the exact fallback chain. Drift in priority would change
    // which gasLimit wins in different scenarios.
    assert.match(SRC,
        /gasLimit:\s*options\.gasLimit\s*\|\|\s*routeData\.gasSpent\s*\|\|\s*400000/,
        `gasLimit fallback chain drifted from options || routeData.gasSpent || 400000`);
});

test('source — gasPrice default = 0.97 gwei (parseUnits)', () => {
    // Pinned: 0.97 gwei is below the typical 1 gwei. Drift to higher
    // would over-pay gas.
    assert.match(SRC,
        /options\.gasPrice\s*\|\|\s*ethers\.utils\.parseUnits\(['"]0\.97['"],\s*['"]gwei['"]\)/,
        `executeSushiSwapRoute gasPrice default drifted from parseUnits('0.97', 'gwei')`);
});

test('source — throws "Router address not found in route data" when routeProcessorAddr missing', () => {
    assert.match(SRC,
        /if\s*\(!routeData\.routeProcessorAddr\)\s*\{[\s\S]*?throw new Error\(['"]Router address not found in route data['"]\)/,
        `routeProcessorAddr guard shape drifted`);
});

// ---------------------------------------------------------------------------
// checkAndApproveToken — exact approval
// ---------------------------------------------------------------------------

test('source — checkAndApproveToken uses the exact required approval amount', () => {
    // Unlimited approval is opt-in only. The default swap path limits router
    // authority to the amount required by this operation.
    assert.match(SRC,
        /tokenContract\.approve\(\s*spenderAddress,\s*approvalAmountFor\(amount\)/,
        `approval amount drifted from approvalAmountFor(amount)`);
});

test('source — allowance check uses .lt() (strictly less than amount)', () => {
    // Pinned: lt (NOT lte). If currentAllowance === amount, we DON'T
    // re-approve. A regression to lte would force re-approval on
    // the boundary case.
    assert.match(SRC,
        /currentAllowance\.lt\(amount\)/,
        `allowance check must use .lt() (strictly less than)`);
});

// ---------------------------------------------------------------------------
// HAZARD H1: the positional-args caller in src/futarchyJS/futarchy.js was
// deleted with that dead module; only the correct call site remains.
// ---------------------------------------------------------------------------

test('hazard H1 — ShowcaseSwapComponent.jsx still uses the CORRECT destructured form', async () => {
    // Sanity-pin the working call site so a refactor that breaks it
    // would surface here.
    const cmd = `grep -A 6 'fetchSushiSwapRoute({' ${JSON.stringify(resolve(REPO_ROOT, 'src/components/futarchyFi/marketPage/ShowcaseSwapComponent.jsx'))} | head -8`;
    const out = execSync(cmd, { encoding: 'utf8' });
    assert.ok(out.includes('tokenIn'),
        `ShowcaseSwapComponent.jsx no longer uses {tokenIn, ...} destructured form — verify call still works`);
});

// ---------------------------------------------------------------------------
// HAZARD H2: hardcoded feeReceiver in console.log
// ---------------------------------------------------------------------------

test('hazard H2 — hardcoded feeReceiver address in console.log line 91', () => {
    // PINNED HAZARD: line 91 logs a HARDCODED feeReceiver address
    // (`0xca226bd9c754F1283123d32B2a7cF62a722f8ADa`) regardless of
    // what the caller actually passed. Looks like a debug artifact /
    // dev fee-receiver leak. Pinned for visibility — if the line
    // ever uses the actual `feeReceiver` parameter, that's an
    // improvement and this test should be updated.
    assert.match(SRC,
        /console\.log\(['"]USEFUTARCHY feeReceiver['"],\s*["']0xca226bd9c754F1283123d32B2a7cF62a722f8ADa["']\)/,
        `hardcoded feeReceiver leak drifted — either fixed (good — delete test) or rephrased (re-pin)`);
});

// ---------------------------------------------------------------------------
// HAZARD H3: USEFUTARCHY debug log spam
// ---------------------------------------------------------------------------

test('hazard H3 — 5 USEFUTARCHY console.log lines fire on every swap call', () => {
    // PINNED HAZARD: 5 always-on debug logs in production. Pin via
    // count so a cleanup that removes them flags the test for deletion.
    const matches = [...SRC.matchAll(/console\.log\(['"]USEFUTARCHY/g)];
    assert.equal(matches.length, 5,
        `USEFUTARCHY debug-log count drifted from 5 — if cleanup removed them, ` +
        `delete this test (and update the count above to current).`);
});
