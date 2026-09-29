/**
 * SubgraphBulkPriceFetcher spec mirror (auto-qa).
 *
 * Pins src/utils/SubgraphBulkPriceFetcher.js — the bulk-optimized
 * pool price fetcher used on the Companies + proposal-listing pages.
 * Distinct from SubgraphPoolFetcher.js (which fetches one-by-one or
 * single batch per call): this file groups pools by chainId across
 * MANY proposals and makes one query per chain in parallel.
 *
 * Six concerns:
 *
 *   1. chainId resolution cascade — p.chainId → p.metadata?.chain →
 *      100 (Gnosis default). A regression that drops a fallback step
 *      mis-routes proposals to the wrong subgraph.
 *
 *   2. Two-source pool collection — collects addresses from BOTH
 *      poolAddresses.yes/no AND metadata.conditional_pools.yes/no.address
 *      (NOT one-vs-other). Drift to one-source breaks proposals using
 *      the OTHER metadata shape.
 *
 *   3. Dedup via [...new Set(...)] in fetchPoolsBatch — same address
 *      appearing in BOTH pool sources doesn't get queried twice.
 *
 *   4. NaN→null guard — same as SubgraphPoolFetcher; pinned for
 *      cross-file consistency.
 *
 *   5. Mutation-based attachPrefetchedPrices — mutates input events
 *      in place (NOT a fresh copy). Pinned the contract because
 *      callers chain it: `attachPrefetchedPrices(events, map)`.
 *
 *   6. ?? null (NOT || null) in attachPrefetchedPrices — price=0 must
 *      survive (legitimate 0 price); || null would falsy-coerce 0 to
 *      null. Cross-pin against SubgraphPoolFetcher's same invariant.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/SubgraphBulkPriceFetcher.js', import.meta.url),
    'utf8',
);

// --- spec mirror of chainId resolution cascade ---
function resolveChainId(p) {
    return p.chainId || p.metadata?.chain || 100;
}

// --- spec mirror of pool collection ---
function collectPools(proposal) {
    const out = [];
    const poolAddresses = proposal.poolAddresses || {};
    if (poolAddresses.yes) out.push(poolAddresses.yes);
    if (poolAddresses.no) out.push(poolAddresses.no);
    if (proposal.metadata?.conditional_pools) {
        if (proposal.metadata.conditional_pools.yes?.address) {
            out.push(proposal.metadata.conditional_pools.yes.address);
        }
        if (proposal.metadata.conditional_pools.no?.address) {
            out.push(proposal.metadata.conditional_pools.no.address);
        }
    }
    return out;
}

// --- spec mirror of address dedup + lowercase ---
function dedupAddresses(addresses) {
    return [...new Set(addresses.map(a => a?.toLowerCase()).filter(Boolean))];
}

// --- spec mirror of attachPrefetchedPrices ---
function attachPrefetchedPrices(events, priceMap) {
    if (!events || !priceMap || priceMap.size === 0) return events;
    for (const event of events) {
        const poolAddresses = event.poolAddresses || {};
        const yesAddr = (poolAddresses.yes || '').toLowerCase();
        const noAddr = (poolAddresses.no || '').toLowerCase();
        const yesPrice = yesAddr ? priceMap.get(yesAddr) ?? null : null;
        const noPrice = noAddr ? priceMap.get(noAddr) ?? null : null;
        event.prefetchedPrices = {
            yes: yesPrice,
            no: noPrice,
            source: 'subgraph-bulk',
        };
    }
    return events;
}

// ---------------------------------------------------------------------------
// chainId resolution cascade
// ---------------------------------------------------------------------------

test('chainId — explicit p.chainId wins (no metadata lookup)', () => {
    assert.equal(resolveChainId({ chainId: 1, metadata: { chain: 100 } }), 1);
});

test('chainId — falls back to p.metadata.chain when chainId missing', () => {
    assert.equal(resolveChainId({ metadata: { chain: 1 } }), 1);
});

test('chainId — default 100 (Gnosis) when both chainId AND metadata.chain missing', () => {
    // Pinned: drift to 1 (Ethereum) silently routes default proposals
    // to wrong subgraph → empty results.
    assert.equal(resolveChainId({}), 100);
    assert.equal(resolveChainId({ metadata: {} }), 100);
});

test('chainId — falsy chainId (0, null, undefined) falls through to metadata', () => {
    // Pinned: the OR operator means 0 falls through too. This is
    // arguably a footgun (chainId=0 is invalid Ethereum-style chain
    // but conceptually "explicit") but pinned current behavior.
    assert.equal(resolveChainId({ chainId: 0, metadata: { chain: 1 } }), 1,
        `chainId=0 must fall through to metadata.chain (current OR semantics)`);
    assert.equal(resolveChainId({ chainId: null, metadata: { chain: 1 } }), 1);
    assert.equal(resolveChainId({ chainId: undefined, metadata: { chain: 1 } }), 1);
});

test('source — chainId resolution cascade matches: p.chainId || p.metadata?.chain || 100', () => {
    assert.match(SRC,
        /chainId\s*=\s*p\.chainId\s*\|\|\s*p\.metadata\?\.\s*chain\s*\|\|\s*100/,
        `chainId resolution cascade shape drifted`);
});

// ---------------------------------------------------------------------------
// Two-source pool collection (NOT one-vs-other)
// ---------------------------------------------------------------------------

test('pool collection — poolAddresses.yes/no source extracted', () => {
    const r = collectPools({ poolAddresses: { yes: '0xy', no: '0xn' } });
    assert.deepEqual(r, ['0xy', '0xn']);
});

test('pool collection — metadata.conditional_pools.yes/no.address source extracted', () => {
    const r = collectPools({
        metadata: {
            conditional_pools: {
                yes: { address: '0xY' },
                no: { address: '0xN' },
            },
        },
    });
    assert.deepEqual(r, ['0xY', '0xN']);
});

test('pool collection — BOTH sources collected (proposal with both metadata shapes)', () => {
    // Pinned: the source comments imply these are independent; both
    // get pushed. Dedup happens later in fetchPoolsBatch.
    const r = collectPools({
        poolAddresses: { yes: '0xY1', no: '0xN1' },
        metadata: {
            conditional_pools: {
                yes: { address: '0xY2' },
                no: { address: '0xN2' },
            },
        },
    });
    assert.equal(r.length, 4,
        `both pool-source shapes must be collected (NOT one-vs-other)`);
});

test('pool collection — partial yes/no in poolAddresses: only the present one is pushed', () => {
    const r1 = collectPools({ poolAddresses: { yes: '0xy' } });
    assert.deepEqual(r1, ['0xy']);
    const r2 = collectPools({ poolAddresses: { no: '0xn' } });
    assert.deepEqual(r2, ['0xn']);
});

test('pool collection — missing metadata.conditional_pools is safe (no throw)', () => {
    assert.doesNotThrow(() => collectPools({}));
    assert.doesNotThrow(() => collectPools({ metadata: {} }));
    assert.doesNotThrow(() => collectPools({ metadata: { conditional_pools: {} } }));
    assert.doesNotThrow(() => collectPools({ metadata: { conditional_pools: { yes: {} } } }));
});

// ---------------------------------------------------------------------------
// Dedup + lowercase via [...new Set(...)]
// ---------------------------------------------------------------------------

test('dedup — duplicates removed (same address from poolAddresses + metadata source)', () => {
    const r = dedupAddresses(['0xABC', '0xabc', '0xDEF']);
    // After lowercase + dedup: 2 unique addresses.
    assert.equal(r.length, 2);
    assert.ok(r.includes('0xabc'));
    assert.ok(r.includes('0xdef'));
});

test('dedup — null/undefined entries filtered out', () => {
    const r = dedupAddresses(['0xabc', null, undefined, '']);
    assert.deepEqual(r, ['0xabc']);
});

test('dedup — preserves order of first occurrence (Set insertion order)', () => {
    const r = dedupAddresses(['0xc', '0xa', '0xb', '0xa']);
    assert.deepEqual(r, ['0xc', '0xa', '0xb']);
});

test('source — fetchPoolsBatch dedups via [...new Set(...)]', () => {
    // Pinned the dedup primitive. A regression to plain .map() would
    // re-query duplicates (2x batch size if every address has both
    // sources).
    assert.match(SRC,
        /\[\.\.\.\s*new Set\(poolAddresses\.map\(a\s*=>\s*a\?\.\s*toLowerCase\(\)\)\.filter\(Boolean\)\)\]/,
        `dedup primitive drifted from [...new Set(addresses.map(toLowerCase).filter(Boolean))]`);
});

// ---------------------------------------------------------------------------
// NaN→null guard (same invariant as SubgraphPoolFetcher)
// ---------------------------------------------------------------------------

test('source — fetchPoolsBatch maps parseFloat-NaN to null (cross-file consistency)', () => {
    // Cross-pin against SubgraphPoolFetcher.js — both fetcher families
    // must agree on the NaN→null guard.
    assert.match(SRC,
        /price:\s*isNaN\(price\)\s*\?\s*null\s*:\s*price/,
        `NaN→null guard missing in fetchPoolsBatch — would propagate NaN to consumers`);
});

test('source — poolMap key is LOWERCASED pool.id (defensive re-lowercase)', () => {
    // Pinned: even though the query LOWERCASES inputs, the response
    // pool.id is re-lowercased. Defensive against subgraph returning
    // checksum-cased ids in some path.
    assert.match(SRC,
        /poolMap\.set\(pool\.id\.toLowerCase\(\),/,
        `poolMap key must be pool.id.toLowerCase() (defensive)`);
});

// ---------------------------------------------------------------------------
// fetchPoolsBatch error semantics
// ---------------------------------------------------------------------------

test('source — one chain failing does not blank the others (orchestrator catches per chain)', () => {
    // Pinned: callers chain results into a single priceMap. fetchPoolsBatch
    // now throws on failure, so the per-chain call in collectAndFetchPoolPrices
    // must catch it and drop only that chain; its cards fall back to their
    // per-pool fetch.
    assert.match(SRC,
        /try\s*\{\s*const result = await fetchPoolsBatch\(filtered,\s*Number\(chainId\)\);\s*return \{ chainId, result \};\s*\}\s*catch\s*\(error\)\s*\{[\s\S]*?return null;/,
        `collectAndFetchPoolPrices must catch a failed chain and skip it`);
});

test('source — fetchPoolsBatch returns empty Map when no endpoint OR no addresses', () => {
    // Pinned: short-circuit guards.
    assert.match(SRC,
        /if\s*\(!endpoint\s*\|\|\s*!poolAddresses\s*\|\|\s*poolAddresses\.length\s*===\s*0\)\s*\{[\s\S]*?return\s+new Map\(\)/,
        `fetchPoolsBatch missing-endpoint/no-addresses guard shape drifted`);
});

test('source — fetchPoolsBatch throws on HTTP / GraphQL errors (outage is not "no prices")', () => {
    // Pinned (changed deliberately): a 502 with { errors } used to come
    // back as an empty Map, indistinguishable from pools without a price.
    // It now goes through readGraphqlData, which throws, and nothing in
    // fetchPoolsBatch swallows it.
    assert.match(SRC,
        /const data = await readGraphqlData\(response,/,
        `fetchPoolsBatch must read the response through readGraphqlData`);
    const body = SRC.slice(SRC.indexOf('async function fetchPoolsBatch'), SRC.indexOf('export async function collectAndFetchPoolPrices'));
    assert.doesNotMatch(body, /catch\s*\(/,
        `fetchPoolsBatch must not swallow request failures`);
});

// ---------------------------------------------------------------------------
// collectAndFetchPoolPrices orchestrator
// ---------------------------------------------------------------------------

test('source — collectAndFetchPoolPrices returns empty Map on no proposals', () => {
    assert.match(SRC,
        /if\s*\(!proposals\s*\|\|\s*proposals\.length\s*===\s*0\)\s*\{[\s\S]*?return\s+new Map\(\)/,
        `collectAndFetchPoolPrices missing-proposals guard drifted`);
});

test('source — orchestrator runs per-chain fetches in PARALLEL via Promise.all', () => {
    // Pinned: serial fetches would block on each chain. With multi-
    // chain proposals (Ethereum + Gnosis), parallel cuts wall-clock.
    assert.match(SRC,
        /Promise\.all\(\s*Object\.entries\(poolsByChain\)\.map\(async\s*\(\[chainId,\s*addresses\]\)/,
        `chain-fetches must run in parallel via Promise.all + Object.entries.map`);
});

test('source — orchestrator merges per-chain Maps into single priceMap (LOWERCASED address keys)', () => {
    // Pinned: the final priceMap is keyed by lowercased address (the
    // fetcher already lowercases). Consumers do `priceMap.get(addr.toLowerCase())`.
    assert.match(SRC,
        /for\s*\(const\s*\[addr,\s*data\]\s*of\s*item\.result\.entries\(\)\)\s*\{\s*priceMap\.set\(addr,\s*data\.price\)/,
        `priceMap merge shape drifted — address used as-is (already lowercased upstream)`);
});

test('source — orchestrator skips chains with empty filtered address list', () => {
    // Pinned: filter(Boolean) removes null/undefined. If everything
    // was null, the chain is skipped. A regression that calls
    // fetchPoolsBatch with [] would still work (empty Map) but waste
    // a network call.
    assert.match(SRC,
        /const\s+filtered\s*=\s*addresses\.filter\(Boolean\)[\s\S]*?if\s*\(filtered\.length\s*===\s*0\)\s*return\s+null/,
        `orchestrator must skip chains with no valid addresses (return null)`);
});

test('source — orchestrator passes Number(chainId) (NOT string) to fetchPoolsBatch', () => {
    // Pinned: Object.entries returns string keys. Without Number(),
    // fetchPoolsBatch's chainId === 100 strict-equality checks fail
    // ("100" !== 100). This is an easy regression.
    assert.match(SRC,
        /fetchPoolsBatch\(filtered,\s*Number\(chainId\)\)/,
        `chainId must be Number()'d before passing to fetchPoolsBatch (Object.entries gives string)`);
});

// ---------------------------------------------------------------------------
// attachPrefetchedPrices — mutation contract + ?? null
// ---------------------------------------------------------------------------

test('attachPrefetchedPrices — mutates input events array (returns same reference)', () => {
    // Pinned: caller may both pass-through OR use return value.
    // Mutation contract MUST be preserved.
    const events = [{ eventId: 'e1', poolAddresses: { yes: '0xa', no: '0xb' } }];
    const map = new Map([['0xa', 1.5], ['0xb', 0.5]]);
    const r = attachPrefetchedPrices(events, map);
    assert.equal(r, events,
        `must return SAME array reference (not a copy)`);
    assert.deepEqual(events[0].prefetchedPrices, {
        yes: 1.5, no: 0.5, source: 'subgraph-bulk',
    });
});

test('attachPrefetchedPrices — null events / null map / empty map → no-op pass-through', () => {
    // Pinned: defensive guards. A regression that throws on null
    // would crash the listing page when the bulk fetch hadn't completed.
    assert.equal(attachPrefetchedPrices(null, new Map()), null);
    assert.equal(attachPrefetchedPrices(undefined, new Map()), undefined);
    const emptyEvents = [];
    assert.equal(attachPrefetchedPrices(emptyEvents, new Map()), emptyEvents);
    const events = [{ eventId: 'e1' }];
    assert.equal(attachPrefetchedPrices(events, null), events);
    assert.equal(attachPrefetchedPrices(events, new Map()), events);
});

test('attachPrefetchedPrices — uses ?? null (NOT || null) so price=0 survives', () => {
    // Pinned: prediction markets can legitimately have price=0 for
    // a YES/NO outcome. || null would falsy-coerce 0 to null —
    // silent corruption.
    const events = [{ eventId: 'e1', poolAddresses: { yes: '0xa', no: '0xb' } }];
    const map = new Map([['0xa', 0], ['0xb', 1]]);
    attachPrefetchedPrices(events, map);
    assert.equal(events[0].prefetchedPrices.yes, 0,
        `price=0 must survive (?? null, NOT || null)`);
    assert.equal(events[0].prefetchedPrices.no, 1);
});

test('attachPrefetchedPrices — missing yesAddr/noAddr → null (not undefined)', () => {
    const events = [{ eventId: 'e1' }];  // no poolAddresses at all
    const map = new Map([['0xa', 1]]);
    attachPrefetchedPrices(events, map);
    assert.equal(events[0].prefetchedPrices.yes, null);
    assert.equal(events[0].prefetchedPrices.no, null);
});

test('attachPrefetchedPrices — addresses lowercased before priceMap.get (consumer side)', () => {
    // Pinned: the priceMap is keyed lowercased; consumer-side address
    // also gets .toLowerCase() before lookup. A regression that drops
    // either side would silently miss cache hits for checksummed input.
    const events = [{ eventId: 'e1', poolAddresses: { yes: '0xABC', no: '0xDEF' } }];
    const map = new Map([['0xabc', 1], ['0xdef', 2]]);
    attachPrefetchedPrices(events, map);
    assert.equal(events[0].prefetchedPrices.yes, 1,
        `consumer must lowercase address before priceMap.get`);
    assert.equal(events[0].prefetchedPrices.no, 2);
});

test('source — attachPrefetchedPrices uses ?? null operator', () => {
    // Defense in depth — source-text pin.
    assert.match(SRC,
        /yesAddr\s*\?\s*priceMap\.get\(yesAddr\)\s*\?\?\s*null\s*:\s*null/,
        `attachPrefetchedPrices yesPrice expression must use ?? null (not || null)`);
    assert.match(SRC,
        /noAddr\s*\?\s*priceMap\.get\(noAddr\)\s*\?\?\s*null\s*:\s*null/,
        `attachPrefetchedPrices noPrice expression must use ?? null (not || null)`);
});

test('source — attachPrefetchedPrices tags source: "subgraph-bulk"', () => {
    // Pinned: the source tag lets consumers distinguish bulk-prefetched
    // prices from per-pool fetches. A regression to a different tag
    // breaks any logging / debugging that filters by source.
    assert.match(SRC,
        /source:\s*['"]subgraph-bulk['"]/,
        `prefetchedPrices.source tag must be "subgraph-bulk"`);
});
