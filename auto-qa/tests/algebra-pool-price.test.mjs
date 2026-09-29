/**
 * getAlgebraPoolPrice spec mirror (auto-qa).
 *
 * Pins src/utils/getAlgebraPoolPrice.js — the RPC-rotating Algebra
 * pool price reader used to fetch on-chain prices for non-Quoter paths
 * (e.g. background spot watchers, dashboards). Has its own RPC-fallback
 * + cooldown machinery distinct from getBestRpc.js.
 *
 * Five concerns:
 *
 *   1. POOL_ABI globalState DIVERGENCE — pinned that this file's
 *      6-field tuple (uint160 price, int24 tick, uint16 lastFee,
 *      uint8 pluginConfig, uint16 communityFee, bool unlocked) is
 *      DIFFERENT from algebraQuoter.js's 7-field tuple (the older
 *      Algebra V3 shape with timepointIndex + communityFeeToken0/1).
 *      This file targets the newer Algebra Integral shape. A regression
 *      that flips them silently mis-decodes globalState in production.
 *
 *   2. GNOSIS_RPCS — since f2b0de2 this file no longer carries its own
 *      4-entry list; it reads chain 100 from config/rpcEndpoints.js, whose
 *      contents rpc-config.test.mjs pins. Pinned here that it stays that
 *      way, so the duplication cannot creep back in.
 *
 *   3. Constants — CACHE_DURATION = 30s, BASE_RETRY_DELAY = 30s,
 *      RANDOM_RETRY_RANGE = 10s, MOCK_MODE = false.
 *
 *   4. isRateLimitError — pure classifier across 7 indicators
 *      (429 code, "429" string, "rate limit", "cors", "too many
 *      requests", "network error", "fetch"). A regression that drops
 *      one means the corresponding error class slips past cooldown.
 *
 *   5. Price formula — `(Number(sqrtPriceX96) ** 2) / 2 ** 192`.
 *      Same Algebra V3 standard as sqrt-price-x96.test.mjs and
 *      algebra-quoter.test.mjs but written using the `**` operator.
 *      Pinned for cross-file consistency.
 *
 *   6. Module-level mutable state pattern — pinned via shape (count
 *      of Maps + the `let currentRpcIndex` declaration). A refactor
 *      to functional / class-based would surface here so cooldown
 *      semantics get re-evaluated.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/getAlgebraPoolPrice.js', import.meta.url),
    'utf8',
);
const ALGEBRA_QUOTER_SRC = readFileSync(
    new URL('../../src/utils/algebraQuoter.js', import.meta.url),
    'utf8',
);

// --- spec mirror of isRateLimitError (pure classifier) ---
function isRateLimitError(error) {
    const msg = error.message?.toLowerCase() || '';
    const code = error.code;
    return (
        code === 429 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('cors') ||
        msg.includes('too many requests') ||
        msg.includes('network error') ||
        msg.includes('fetch')
    );
}

// --- spec mirror of price formula ---
function priceFromSqrtX96(sqrtPriceX96) {
    return (Number(sqrtPriceX96) ** 2) / 2 ** 192;
}

// ---------------------------------------------------------------------------
// POOL_ABI — divergence from algebraQuoter.js (Integral vs V3 shape)
// ---------------------------------------------------------------------------

test('POOL_ABI — globalState declares 6 fields (Integral shape: lastFee + pluginConfig)', () => {
    // Pinned: this file's globalState struct expects the newer Algebra
    // Integral shape:
    //   uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig,
    //   uint16 communityFee, bool unlocked
    // (6 fields). A regression that flips this back to the V3 shape
    // would mis-decode the 4th/5th fields silently.
    // Source uses { type: ..., name: ... } order — pin name only.
    assert.match(SRC, /name:\s*["']price["']/,
        `POOL_ABI globalState first field name must be "price"`);
    assert.match(SRC, /type:\s*["']uint160["'],\s*name:\s*["']price["']/,
        `POOL_ABI globalState price field must be uint160`);
    assert.match(SRC, /name:\s*["']lastFee["']/,
        `POOL_ABI globalState must include lastFee (Integral shape)`);
    assert.match(SRC, /name:\s*["']pluginConfig["']/,
        `POOL_ABI globalState must include pluginConfig (Integral-only field)`);
    assert.match(SRC, /name:\s*["']communityFee["']/,
        `POOL_ABI globalState must include communityFee (single field, NOT split into Token0/Token1)`);
});

test('POOL_ABI — does NOT include timepointIndex (the older V3 field)', () => {
    // Pinned the divergence. timepointIndex = old V3; pluginConfig = Integral.
    assert.doesNotMatch(SRC, /timepointIndex/,
        `POOL_ABI globalState must NOT include timepointIndex — that's the older V3 shape, ` +
        `which is in algebraQuoter.js. These two files target DIFFERENT Algebra versions.`);
});

test('POOL_ABI — does NOT split communityFee into Token0/Token1 (V3-style)', () => {
    // Pinned that this file uses the unified communityFee (Integral).
    assert.doesNotMatch(SRC, /communityFeeToken[01]/,
        `POOL_ABI must use single 'communityFee' (Integral), NOT 'communityFeeToken0/1' (V3)`);
});

test('cross-file divergence — algebraQuoter.js POOL_ABI uses the OLDER V3 7-field shape', () => {
    // Sanity-pin: algebraQuoter still uses the V3 shape (with
    // timepointIndex + Token0/1 community fees). If both files ever
    // converge, that's a deliberate refactor — re-check both call sites.
    assert.match(ALGEBRA_QUOTER_SRC, /timepointIndex/,
        `algebraQuoter.js POOL_ABI must still include timepointIndex (V3 shape)`);
    assert.match(ALGEBRA_QUOTER_SRC, /communityFeeToken[01]/,
        `algebraQuoter.js POOL_ABI must still split communityFee into Token0/Token1 (V3 shape)`);
});

// ---------------------------------------------------------------------------
// GNOSIS_RPCS — read from the shared config, not an inline list
// ---------------------------------------------------------------------------
// The old tests here pinned an inline 4-entry list. f2b0de2 moved every RPC
// list into config/rpcEndpoints.js on purpose (the copies had drifted apart);
// HTTPS-only / dedup / non-empty are now pinned once, in rpc-config.test.mjs.

test('GNOSIS_RPCS — sourced from config/rpcEndpoints RPC_ENDPOINTS[100]', () => {
    assert.match(SRC, /import\s*\{[^}]*\bRPC_ENDPOINTS\b[^}]*\}\s*from\s*["']\.\.\/config\/rpcEndpoints["']/);
    assert.match(SRC, /const GNOSIS_RPCS\s*=\s*RPC_ENDPOINTS\[100\];/);
});

test('GNOSIS_RPCS — no inline URL list creeps back in', () => {
    assert.doesNotMatch(SRC, /GNOSIS_RPCS\s*=\s*\[/,
        'getAlgebraPoolPrice.js declares its own RPC list again — use RPC_ENDPOINTS');
});

test('GNOSIS_RPCS — rotation still wraps around the shared list', () => {
    assert.match(SRC, /currentRpcIndex\s*=\s*\(currentRpcIndex \+ 1\) % GNOSIS_RPCS\.length/);
});

// ---------------------------------------------------------------------------
// Constants — CACHE_DURATION, BASE_RETRY_DELAY, RANDOM_RETRY_RANGE, MOCK_MODE
// ---------------------------------------------------------------------------

test('CACHE_DURATION — pinned at 30s (different from getBestRpc which is 5min)', () => {
    // Pinned: 30s makes sense for pool prices (rapid change). Drift
    // would either over-fetch (sub-30s) or show stale pool prices
    // (longer than 30s).
    assert.match(SRC, /CACHE_DURATION\s*=\s*30\s*\*\s*1000/,
        `CACHE_DURATION drifted from 30 * 1000 (30s)`);
});

test('BASE_RETRY_DELAY — pinned at 30s', () => {
    // Pinned: this is the cooldown window after a rate-limit error.
    // Too short = thrashing; too long = inflated UX latency on flaky RPCs.
    assert.match(SRC, /BASE_RETRY_DELAY\s*=\s*30\s*\*\s*1000/,
        `BASE_RETRY_DELAY drifted from 30 * 1000 (30s base cooldown)`);
});

test('RANDOM_RETRY_RANGE — pinned at 10s (jitter window)', () => {
    // Pinned: a 1-10s additional random delay smooths thundering-herd
    // behavior on rate-limit recovery.
    assert.match(SRC, /RANDOM_RETRY_RANGE\s*=\s*10\s*\*\s*1000/,
        `RANDOM_RETRY_RANGE drifted from 10 * 1000 (10s jitter)`);
});

test('MOCK_MODE — pinned to FALSE in production source', () => {
    // CRITICAL pin: MOCK_MODE=true returns deterministic mock data
    // (0.98765 + random*0.02). Shipping with MOCK_MODE=true would
    // serve fake prices to every consumer — silent catastrophe.
    assert.match(SRC, /const MOCK_MODE\s*=\s*false/,
        `MOCK_MODE must be false in source. Setting to true ships fake prices to every consumer.`);
});

// ---------------------------------------------------------------------------
// isRateLimitError — 7-indicator classifier (each indicator pinned)
// ---------------------------------------------------------------------------

test('isRateLimitError — error.code === 429 → true', () => {
    assert.equal(isRateLimitError({ code: 429 }), true);
    assert.equal(isRateLimitError({ code: 429, message: 'whatever' }), true);
});

test('isRateLimitError — message contains "429" → true', () => {
    assert.equal(isRateLimitError({ message: 'HTTP 429: Too Many Requests' }), true);
});

test('isRateLimitError — message contains "rate limit" → true (case-insensitive via toLowerCase)', () => {
    assert.equal(isRateLimitError({ message: 'Rate Limit exceeded' }), true);
    assert.equal(isRateLimitError({ message: 'rate limit ok' }), true);
});

test('isRateLimitError — message contains "cors" → true (CORS counts as rate-limit-like)', () => {
    // Pinned: CORS errors are common when an RPC is misconfigured. The
    // file lumps them in with rate-limits so the same cooldown
    // applies.
    assert.equal(isRateLimitError({ message: 'CORS blocked' }), true);
    assert.equal(isRateLimitError({ message: 'cors policy' }), true);
});

test('isRateLimitError — message contains "too many requests" → true', () => {
    assert.equal(isRateLimitError({ message: 'Too Many Requests' }), true);
});

test('isRateLimitError — message contains "network error" → true', () => {
    assert.equal(isRateLimitError({ message: 'Network Error' }), true);
});

test('isRateLimitError — message contains "fetch" → true', () => {
    // Pinned: covers fetch-related failures (e.g. "TypeError: fetch failed").
    assert.equal(isRateLimitError({ message: 'fetch failed' }), true);
});

test('isRateLimitError — non-matching error → false', () => {
    assert.equal(isRateLimitError({ message: 'Internal server error', code: 500 }), false);
    assert.equal(isRateLimitError({ message: 'Invalid params', code: -32602 }), false);
});

test('isRateLimitError — empty/missing message + non-429 code → false', () => {
    assert.equal(isRateLimitError({}), false);
    assert.equal(isRateLimitError({ message: null }), false);
});

// ---------------------------------------------------------------------------
// Price formula — sqrt² / 2^192 (Algebra V3 standard)
// ---------------------------------------------------------------------------

test('priceFromSqrtX96 — sqrt = 2^96 → price = 1', () => {
    // Cross-pin against canonical sqrt-price-x96 / algebra-quoter math.
    // Note: this file uses Number(sqrt) ** 2 (NOT BigInt mul), losing
    // precision at extreme prices. Pinned-as-is per /loop directive.
    const r = priceFromSqrtX96((2n ** 96n).toString());
    assert.equal(r, 1);
});

test('priceFromSqrtX96 — non-negative for any non-negative sqrt (square invariant)', () => {
    for (const exp of [0, 48, 96, 144, 160]) {
        const r = priceFromSqrtX96((2n ** BigInt(exp)).toString());
        assert.ok(r >= 0, `sqrt=2^${exp} produced negative price ${r}`);
    }
});

test('priceFromSqrtX96 — monotonic in sqrtPrice', () => {
    const a = priceFromSqrtX96((1n << 96n).toString());
    const b = priceFromSqrtX96((2n << 96n).toString());
    const c = priceFromSqrtX96((10n << 96n).toString());
    assert.ok(a < b && b < c);
});

test('source — price formula uses ** operator (Number coercion path)', () => {
    // Pinned: this file uses `(Number(sqrtPriceX96) ** 2) / 2 ** 192`,
    // distinct stylistically from algebra-quoter.js's BigNumber.mul().
    // Both should produce the same value; pin the syntactic form so a
    // refactor to BigInt would be deliberate (changes precision).
    assert.match(SRC,
        /\(Number\(sqrtPriceX96\)\s*\*\*\s*2\)\s*\/\s*2\s*\*\*\s*192/,
        `price formula drifted from (Number(sqrt) ** 2) / 2 ** 192`);
});

// ---------------------------------------------------------------------------
// Cooldown / dedup machinery — source-text shape pins
// ---------------------------------------------------------------------------

test('source — module-level state: 5 distinct Maps for caches + a single mutable index', () => {
    // Pinned: providers, poolContracts, loadingStates, retryStates,
    // rateLimitCooldowns. A refactor that consolidates these silently
    // changes cache scoping.
    const mapDecls = [...SRC.matchAll(/const\s+(\w+)\s*=\s*new Map\(\)/g)].map(m => m[1]);
    assert.equal(mapDecls.length, 5,
        `expected 5 module-level Map() declarations; got ${mapDecls.length}: ${mapDecls.join(', ')}`);
    for (const name of ['providers', 'poolContracts', 'loadingStates', 'retryStates', 'rateLimitCooldowns']) {
        assert.ok(mapDecls.includes(name),
            `expected Map "${name}" not declared`);
    }
});

test('source — currentRpcIndex is `let` (mutable round-robin counter)', () => {
    // Pinned: `let` not `const` — getNextRpc / rotateRpc reassign it.
    // A refactor to const would either stop rotating (always RPC 0)
    // or throw on assignment.
    assert.match(SRC,
        /let\s+currentRpcIndex\s*=\s*0/,
        `currentRpcIndex must be \`let\` initialized to 0 (mutable round-robin counter)`);
});

test('source — getNextRpc rotates round-robin via modulo (currentRpcIndex + 1) % len', () => {
    // Pinned the rotation primitive. A regression to `currentRpcIndex++`
    // (no modulo) would walk off the end into undefined.
    const matches = [...SRC.matchAll(/currentRpcIndex\s*=\s*\(currentRpcIndex\s*\+\s*1\)\s*%\s*GNOSIS_RPCS\.length/g)];
    assert.ok(matches.length >= 2,
        `expected >=2 round-robin rotation expressions; got ${matches.length}`);
});

test('source — callWithRpcFallback default maxRetries = 3', () => {
    // Pinned: a regression that lowers to 1 means a single transient
    // RPC error fails the entire call — UX cascade.
    assert.match(SRC,
        /callWithRpcFallback\(address,\s*maxRetries\s*=\s*3\)/,
        `callWithRpcFallback default maxRetries drifted from 3`);
});

test('source — getAlgebraPoolPrice IMMEDIATE deduplication checks loadingStates BEFORE Date.now()', () => {
    // Pinned: the comment says "IMMEDIATE deduplication - check all
    // states first before doing ANYTHING". A regression that moves
    // Date.now() ahead of the dedup check would re-enter the function
    // for in-flight requests.
    const fn = SRC.match(/export\s+async\s+function\s+getAlgebraPoolPrice\(poolConfig\)\s*\{([\s\S]*?)^\}/m);
    assert.ok(fn);
    const dedupIdx = fn[1].indexOf('loadingStates.has(address)');
    const nowIdx = fn[1].indexOf('Date.now()');
    assert.ok(dedupIdx > -1 && nowIdx > -1);
    assert.ok(dedupIdx < nowIdx,
        `loadingStates dedup check must come BEFORE Date.now() — IMMEDIATE dedup invariant`);
});

test('source — successful RPC call clears address-level cooldown', () => {
    // Pinned: rateLimitCooldowns.delete(address) on success ensures a
    // recovered RPC restores normal behavior immediately. A regression
    // that drops this leaves stale cooldowns blocking valid responses.
    assert.match(SRC,
        /\/\/.*Clear any rate limit cooldown on success[\s\S]*rateLimitCooldowns\.delete\(address\)/,
        `must clear rateLimitCooldowns on success — stale cooldowns block recovered RPCs`);
});

test('source — finally block ALWAYS removes loading state (no leak path)', () => {
    // Pinned: loadingStates.delete(address) lives in `finally`, not
    // after the try. A regression that moves it to the success path
    // leaks the in-flight promise on errors → all subsequent calls
    // wait on a rejected promise.
    assert.match(SRC,
        /\}\s*finally\s*\{[\s\S]*?loadingStates\.delete\(address\)/,
        `loadingStates.delete must be in finally — error-path leak otherwise`);
});
