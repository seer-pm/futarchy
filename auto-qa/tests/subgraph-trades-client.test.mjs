/**
 * subgraphTradesClient spec mirror (auto-qa).
 *
 * Pins src/utils/subgraphTradesClient.js — the frontend's direct-to-
 * subgraph swaps fetcher used when ?tradeSource=subgraph is set.
 * Four exported functions plus a default object aggregator.
 *
 * Concerns pinned:
 *
 *   1. EXPLORERS table — only chains 1 (etherscan) and 100 (gnosisscan).
 *      Adding a chain to ENDPOINTS without adding it here makes
 *      transactionLink fall back to gnosisscan, silently misleading
 *      users about which network a tx is on.
 *
 *   2. Address lowercasing — CRITICAL comment in source. proposalId,
 *      pool addresses, and user address all .toLowerCase() before
 *      embedding in GraphQL. Source has `userAddress?.toLowerCase()`
 *      optional chaining so undefined user is safe; pinned both.
 *
 *   3. Where-clause shape — with user: {pool_in: [...], origin: "..."};
 *      without: {pool_in: [...]}. The `origin` field name is the
 *      indexer convention — a regression that switched it to `from`
 *      or `sender` would silently return all swaps for "My Trades".
 *
 *   4. Conditional pool filter — `type: "CONDITIONAL"` literal. A
 *      regression to "PREDICTION" would skip outcome pools entirely.
 *
 *   5. Stitching invariant — swaps stitched with pool metadata via
 *      Map keyed by lowercased pool ID. Fallback object when meta
 *      missing preserves {id, name:null, type:null, outcomeSide:null}
 *      shape so downstream reads don't throw.
 *
 *   6. Field swap convention — UI's tokenIN means "what user RECEIVES"
 *      (so it's swap.tokenOut). UI's tokenOUT means "what user GIVES"
 *      (swap.tokenIn). Comment in source explains the inversion. A
 *      regression that uses subgraph-native naming would flip every
 *      buy/sell shown in the UI.
 *
 *   7. BUY/SELL classification — role-based first (YES_COMPANY /
 *      NO_COMPANY / COMPANY), symbol-regex fallback `^(YES|NO)[_\s-]`.
 *      The "buy" side is when user RECEIVES a company token.
 *
 *   8. Event side detection — outcomeSide first (lowercased), then
 *      symbol startsWith YES/NO fallback. Default 'neutral'.
 *
 *   9. Amount units — raw 18-decimal values are converted from wei and
 *      rendered with adaptive precision, never scientific notation.
 *
 *  10. Sort order — fetchFormattedTrades sorts trades DESCENDING by
 *      date (b.date - a.date). Comment notes pool_in queries don't
 *      preserve order, so the client-side sort is load-bearing.
 *
 *  11. Default export — subgraphTradesClient bundles 4 fns + ENDPOINTS.
 *      A consumer using the namespace import can break if any are
 *      dropped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/subgraphTradesClient.js', import.meta.url),
    'utf8',
);

// ───── spec mirrors (private functions in source) ─────

function formatTokenAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return '0.00';
    const absolute = Math.abs(num);
    const fractionDigits = absolute < 1
        ? Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(absolute))))
        : 2;
    return num.toLocaleString('en-US', {
        useGrouping: false,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}

function formatUnits18(value) {
    const raw = BigInt(value);
    const negative = raw < 0n;
    const digits = (negative ? -raw : raw).toString().padStart(19, '0');
    const whole = digits.slice(0, -18);
    const fraction = digits.slice(-18).replace(/0+$/, '') || '0';
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function formatAmount(value) {
    try {
        return formatTokenAmount(formatUnits18(value || '0'));
    } catch {
        return formatTokenAmount(value);
    }
}

function formatPrice(price, poolType) {
    const num = parseFloat(price);
    if (isNaN(num)) return '0';

    if (poolType === 'PREDICTION') {
        const percentage = (num * 100).toFixed(2);
        return `${percentage}%`;
    }
    return num.toFixed(4);
}

const EXPLORERS_REF = {
    1: 'https://etherscan.io/tx/',
    100: 'https://gnosisscan.io/tx/'
};

// classifyBuy spec mirror — distilled from convertSwapToTradeFormat
function classifyBuy(swap) {
    const tInRole = swap.tokenIn?.role || '';
    const tOutRole = swap.tokenOut?.role || '';
    const isCompanyRole = (r) =>
        r === 'YES_COMPANY' || r === 'NO_COMPANY' || r === 'COMPANY';

    if (isCompanyRole(tOutRole) && !isCompanyRole(tInRole)) return true;
    if (isCompanyRole(tInRole) && !isCompanyRole(tOutRole)) return false;

    const tokenInSymbol = swap.tokenIn?.symbol?.toUpperCase() || '';
    const tokenOutSymbol = swap.tokenOut?.symbol?.toUpperCase() || '';
    const tokenInIsConditional = /^(YES|NO)[_\s-]/.test(tokenInSymbol);
    const tokenOutIsConditional = /^(YES|NO)[_\s-]/.test(tokenOutSymbol);

    return tokenOutIsConditional && !tokenInIsConditional;
}

function classifyEventSide(swap) {
    if (swap.pool?.outcomeSide) return swap.pool.outcomeSide.toLowerCase();

    const tokenInSymbol = swap.tokenIn?.symbol?.toUpperCase() || '';
    const tokenOutSymbol = swap.tokenOut?.symbol?.toUpperCase() || '';
    if (tokenInSymbol.startsWith('YES') || tokenOutSymbol.startsWith('YES'))
        return 'yes';
    if (tokenInSymbol.startsWith('NO') || tokenOutSymbol.startsWith('NO'))
        return 'no';
    return 'neutral';
}

// ───── 1. EXPLORERS table ─────

test('EXPLORERS — only chains 1 (mainnet) and 100 (gnosis) are pinned', () => {
    const m = SRC.match(/const EXPLORERS\s*=\s*\{[\s\S]*?\};/);
    assert.ok(m, 'EXPLORERS literal exists');
    const block = m[0];
    assert.match(block, /1:\s*'https:\/\/etherscan\.io\/tx\/'/);
    assert.match(block, /100:\s*'https:\/\/gnosisscan\.io\/tx\/'/);
    // No third chain pinned — adding one without updating callers is the hazard
    const entries = block.match(/\d+:\s*'https/g) || [];
    assert.equal(entries.length, 2, 'exactly 2 chains in EXPLORERS');
});

test('EXPLORERS table source-pin matches the reference', () => {
    assert.deepEqual(Object.keys(EXPLORERS_REF), ['1', '100']);
    assert.equal(EXPLORERS_REF[1], 'https://etherscan.io/tx/');
    assert.equal(EXPLORERS_REF[100], 'https://gnosisscan.io/tx/');
});

// ───── 2. Address lowercasing ─────

test('proposalId is lowercased before embedding in fetchPoolsForProposal query', () => {
    assert.match(SRC, /proposal:\s*"\$\{proposalId\.toLowerCase\(\)\}"/);
});

test('pool addresses are lowercased via .map(p => p.toLowerCase())', () => {
    assert.match(SRC, /poolAddresses\.map\(p\s*=>\s*p\.toLowerCase\(\)\)/);
});

test('user address uses optional chaining .?toLowerCase()', () => {
    // Optional chaining means undefined is safe; a regression that drops
    // the ? would throw "Cannot read .toLowerCase of undefined" for
    // "Recent Activity" view (no user filter).
    assert.match(SRC, /userAddress\?\.toLowerCase\(\)/);
});

test('CRITICAL comment about lowercasing addresses is present', () => {
    assert.match(SRC, /CRITICAL:\s*Lowercase all addresses for GraphQL/i);
});

// ───── 3. Where-clause shape ─────

test('where-clause WITH user filter includes both pool_in AND origin', () => {
    assert.match(
        SRC,
        /\{\s*pool_in:\s*\$\{JSON\.stringify\(poolIds\)\},\s*origin:\s*"\$\{userLower\}"\s*\}/,
    );
});

test('where-clause WITHOUT user filter includes only pool_in', () => {
    assert.match(SRC, /\{\s*pool_in:\s*\$\{JSON\.stringify\(poolIds\)\}\s*\}/);
});

test('the origin field name (not from/sender) is the indexer convention', () => {
    // Indexer exposes the swap's origin (msg.sender at top of call) as
    // `origin`. A regression that switched to `from` would silently
    // return all swaps for any user filter.
    assert.ok(SRC.includes('origin: "${userLower}"'));
});

// ───── 4. Conditional pool filter ─────

test('fetchPoolsForProposal filters on type: "CONDITIONAL" literal', () => {
    assert.match(SRC, /type:\s*"CONDITIONAL"/);
});

test('only ONE type-filter literal in source — adding another would split logic', () => {
    const matches = SRC.match(/type:\s*"CONDITIONAL"/g) || [];
    assert.equal(matches.length, 1, 'exactly one CONDITIONAL filter');
});

// ───── 5. Nested-selection invariant ─────
//
// tokenIn/tokenOut/pool are entity references, so the swaps query asks for
// them nested and the response already has the shape the UI consumes. The
// client used to issue a second pools query and stitch the two together;
// these tests pin that it does not need to any more.

test('swaps query selects pool metadata nested, not as a bare reference', () => {
    assert.match(SRC, /pool\s*\{\s*id\s+name\s+type\s+outcomeSide\s*\}/);
});

test('swaps query selects tokenIn/tokenOut nested with the fields the UI reads', () => {
    assert.match(SRC, /tokenIn\s*\{\s*id\s+symbol\s+decimals\s+role\s*\}/);
    assert.match(SRC, /tokenOut\s*\{\s*id\s+symbol\s+decimals\s+role\s*\}/);
});

test('no client-side stitching remains — a second pools query would be dead weight', () => {
    assert.ok(!/poolMap/.test(SRC), 'poolMap stitching should be gone');
    assert.ok(!/poolsQuery/.test(SRC), 'the separate pools query should be gone');
});

// ───── 6. Field swap convention ─────

test('UI tokenIN comes FROM swap.tokenOut (user receives) — inversion preserved', () => {
    assert.match(SRC, /tokenIN:\s*\{[^}]*symbol:\s*swap\.tokenOut\?\.symbol/);
    assert.match(SRC, /tokenIN:\s*\{[^}]*value:\s*formatAmount\(swap\.amountOut\)/);
});

test('UI tokenOUT comes FROM swap.tokenIn (user gives) — inversion preserved', () => {
    assert.match(SRC, /tokenOUT:\s*\{[^}]*symbol:\s*swap\.tokenIn\?\.symbol/);
    assert.match(SRC, /tokenOUT:\s*\{[^}]*value:\s*formatAmount\(swap\.amountIn\)/);
});

test('inversion explainer comment is present (load-bearing for new contributors)', () => {
    assert.match(SRC, /tokenIN\s*=\s*what user RECEIVES/i);
    assert.match(SRC, /tokenOUT\s*=\s*what user GIVES/i);
});

// ───── 7. BUY/SELL classification ─────

test('classifyBuy: role-based — out=YES_COMPANY, in=non-company → buy', () => {
    const swap = {
        tokenIn: { role: 'COLLATERAL', symbol: 'sDAI' },
        tokenOut: { role: 'YES_COMPANY', symbol: 'YES_FOO' },
    };
    assert.equal(classifyBuy(swap), true);
});

test('classifyBuy: role-based — in=NO_COMPANY, out=non-company → sell', () => {
    const swap = {
        tokenIn: { role: 'NO_COMPANY', symbol: 'NO_FOO' },
        tokenOut: { role: 'COLLATERAL', symbol: 'sDAI' },
    };
    assert.equal(classifyBuy(swap), false);
});

test('classifyBuy: role-based — bare COMPANY also counts', () => {
    const swap = {
        tokenIn: { role: '', symbol: 'sDAI' },
        tokenOut: { role: 'COMPANY', symbol: 'FOO' },
    };
    assert.equal(classifyBuy(swap), true);
});

test('classifyBuy: symbol fallback when roles ambiguous — out is YES_, in is bare → buy', () => {
    const swap = {
        tokenIn: { role: '', symbol: 'sDAI' },
        tokenOut: { role: '', symbol: 'YES_FOO' },
    };
    assert.equal(classifyBuy(swap), true);
});

test('classifyBuy: symbol fallback — out is NO-, in is bare → buy', () => {
    const swap = {
        tokenIn: { role: '', symbol: 'sDAI' },
        tokenOut: { role: '', symbol: 'NO-FOO' },
    };
    assert.equal(classifyBuy(swap), true);
});

test('classifyBuy: symbol fallback — both YES_ → known-flawed (returns false)', () => {
    // Source comment: "This old logic was flawed if BOTH were YES_."
    // The comment acknowledges the fallback can't disambiguate when
    // both sides are conditional. Pinned to make the limitation
    // visible — fix would need to compare against pool.outcomeSide.
    const swap = {
        tokenIn: { role: '', symbol: 'YES_A' },
        tokenOut: { role: '', symbol: 'YES_B' },
    };
    // Both conditional → tokenOutIsConditional && !tokenInIsConditional = false
    assert.equal(classifyBuy(swap), false);
});

test('classifyBuy: regex requires _, space, or - separator after YES/NO', () => {
    // YESCOIN should NOT match — it's not a conditional token.
    const swap = {
        tokenIn: { role: '', symbol: 'sDAI' },
        tokenOut: { role: '', symbol: 'YESCOIN' },
    };
    assert.equal(classifyBuy(swap), false);
});

test('classifyBuy: missing role+symbol → falls through to false', () => {
    const swap = { tokenIn: {}, tokenOut: {} };
    assert.equal(classifyBuy(swap), false);
});

// ───── 8. Event side detection ─────

test('classifyEventSide: pool.outcomeSide takes precedence (lowercased)', () => {
    assert.equal(
        classifyEventSide({ pool: { outcomeSide: 'YES' }, tokenIn: {}, tokenOut: {} }),
        'yes',
    );
    assert.equal(
        classifyEventSide({ pool: { outcomeSide: 'NO' }, tokenIn: {}, tokenOut: {} }),
        'no',
    );
});

test('classifyEventSide: symbol fallback when no outcomeSide', () => {
    assert.equal(
        classifyEventSide({
            pool: {},
            tokenIn: { symbol: 'YES_FOO' },
            tokenOut: { symbol: 'sDAI' },
        }),
        'yes',
    );
    assert.equal(
        classifyEventSide({
            pool: {},
            tokenIn: { symbol: 'sDAI' },
            tokenOut: { symbol: 'NO_FOO' },
        }),
        'no',
    );
});

test('classifyEventSide: default neutral when nothing matches', () => {
    assert.equal(
        classifyEventSide({
            pool: {},
            tokenIn: { symbol: 'sDAI' },
            tokenOut: { symbol: 'WETH' },
        }),
        'neutral',
    );
});

// ───── 9. Raw amount units + adaptive display ─────

test('formatAmount: converts raw 18-decimal values before display', () => {
    assert.equal(formatAmount('520500000000000000'), '0.5205');
    assert.equal(formatAmount('1000000000000000000'), '1.00');
    assert.equal(formatAmount('123456789000000000000'), '123.46');
});

test('formatAmount: tiny raw wei never renders in exponent notation', () => {
    const formatted = formatAmount('261000000000');
    assert.equal(formatted, '0.00000026');
    assert.doesNotMatch(formatted, /e/i);
});

test('formatAmount: no unit conversion — subgraph amounts are already decimal-adjusted', () => {
    // amountIn/amountOut are BigDecimal, divided by 10^decimals in the
    // subgraph mapping, so they arrive as e.g. "0.000004254967638581".
    // formatUnits wants an integer string and throws on that.
    assert.ok(!/formatUnits\s*\(/.test(SRC),
        'formatAmount must not call formatUnits on an already-adjusted value');
    assert.match(SRC, /return formatTokenAmount\(/);
});

test('formatPrice: PREDICTION pool → percentage with 2-decimal precision', () => {
    assert.equal(formatPrice('0.654321', 'PREDICTION'), '65.43%');
    assert.equal(formatPrice('1', 'PREDICTION'), '100.00%');
    assert.equal(formatPrice('0', 'PREDICTION'), '0.00%');
});

test('formatPrice: non-PREDICTION → toFixed(4)', () => {
    assert.equal(formatPrice('1.234567', 'CONDITIONAL'), '1.2346');
    assert.equal(formatPrice('1.234567', 'UNKNOWN'), '1.2346');
});

test('formatPrice: NaN → "0" regardless of poolType', () => {
    assert.equal(formatPrice('not-a-number', 'PREDICTION'), '0');
    assert.equal(formatPrice('not-a-number', 'CONDITIONAL'), '0');
});

// ───── 10. Sort order ─────

test('fetchFormattedTrades sorts DESCENDING by date (b.date - a.date)', () => {
    assert.match(SRC, /trades\.sort\(\(a,\s*b\)\s*=>\s*b\.date\s*-\s*a\.date\)/);
});

test('sort-order comment explains why client-side sort is load-bearing', () => {
    // "querying multiple pools via pool_in may not preserve order"
    assert.match(SRC, /pool_in.*may not preserve order/i);
});

// ───── 11. Default export ─────

test('default export bundles 4 fns + ENDPOINTS — guards namespace consumers', () => {
    const m = SRC.match(/const subgraphTradesClient\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(m, 'default-export aggregator exists');
    const body = m[1];
    for (const key of [
        'fetchPoolsForProposal',
        'fetchSwapsFromSubgraph',
        'convertSwapToTradeFormat',
        'fetchFormattedTrades',
        'ENDPOINTS',
    ]) {
        assert.ok(body.includes(key), `default export includes ${key}`);
    }
});

test('all 4 named exports are present', () => {
    assert.match(SRC, /export\s+async\s+function\s+fetchPoolsForProposal\b/);
    assert.match(SRC, /export\s+async\s+function\s+fetchSwapsFromSubgraph\b/);
    assert.match(SRC, /export\s+function\s+convertSwapToTradeFormat\b/);
    assert.match(SRC, /export\s+async\s+function\s+fetchFormattedTrades\b/);
});

// ───── 12. Result envelope shapes (error/null pinning) ─────

test('fetchPoolsForProposal returns {pools:[], error: "Unsupported chain: <id>"} on missing endpoint', () => {
    assert.match(SRC, /\{\s*pools:\s*\[\],\s*error:\s*`Unsupported chain:\s*\$\{chainId\}`\s*\}/);
});

test('fetchPoolsForProposal returns {pools:[], error: "No proposal ID provided"} when proposalId falsy', () => {
    assert.match(SRC, /\{\s*pools:\s*\[\],\s*error:\s*'No proposal ID provided'\s*\}/);
});

test('fetchSwapsFromSubgraph returns {swaps:[], error:`Unsupported chain: ${chainId}`} on missing endpoint', () => {
    assert.match(SRC, /\{\s*swaps:\s*\[\],\s*error:\s*`Unsupported chain:\s*\$\{chainId\}`\s*\}/);
});

test('fetchFormattedTrades returns {trades:[], error, timestamp: Date.now()} on upstream error', () => {
    assert.match(
        SRC,
        /\{\s*trades:\s*\[\],\s*error,\s*timestamp:\s*Date\.now\(\)\s*\}/,
    );
});

// ───── 13. Limit + ordering pin ─────

test('fetchSwapsFromSubgraph default limit is 30', () => {
    assert.match(SRC, /fetchSwapsFromSubgraph\([^)]*limit\s*=\s*30\s*\)/);
});

test('fetchFormattedTrades default limit is 30', () => {
    assert.match(SRC, /fetchFormattedTrades\([^)]*limit\s*=\s*30\s*\)/);
});

test('swaps query uses orderBy: timestamp + orderDirection: desc', () => {
    assert.match(SRC, /orderBy:\s*timestamp/);
    assert.match(SRC, /orderDirection:\s*desc/);
});

// ───── 14. Console-log hazard ratchet ─────

test('console.log/error count baseline — keeps log volume from creeping silently', () => {
    // 3 console.log + 4 console.error currently. A regression that adds
    // more (esp. inside hot loops) should force a deliberate bump here.
    const logs = SRC.match(/console\.log\(/g) || [];
    const errs = SRC.match(/console\.error\(/g) || [];
    assert.equal(logs.length, 3, 'console.log baseline');
    assert.equal(errs.length, 4, 'console.error baseline');
});

// ───── 15. Explorer-link fallback ─────

test('transactionLink falls back to gnosisscan when chainId not in EXPLORERS', () => {
    assert.match(SRC, /EXPLORERS\[chainId\]\s*\|\|\s*EXPLORERS\[100\]/);
});

// ───── 16. Timestamp conversion ─────

test('timestamp is parseInt(seconds) * 1000 — converts to ms for JS Date', () => {
    assert.match(SRC, /parseInt\(swap\.timestamp\)\s*\*\s*1000/);
});

// ───── 17. Pool-type default ─────

test('poolType defaults to "UNKNOWN" when swap.pool.type missing', () => {
    assert.match(SRC, /swap\.pool\?\.type\s*\|\|\s*'UNKNOWN'/);
});
