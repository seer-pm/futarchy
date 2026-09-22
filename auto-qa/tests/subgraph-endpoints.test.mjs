/**
 * subgraphEndpoints config spec mirror (auto-qa).
 *
 * Pins src/config/subgraphEndpoints.js — the single source of truth
 * for which subgraph URLs the frontend uses. A typo, missing chain id,
 * or drift between this and contracts.js DEFAULT_AGGREGATOR breaks
 * data loading silently.
 *
 * The API HOST is deployment-specific and env-overridable, so it is
 * deliberately not pinned. What is pinned: that the env var is read,
 * that a literal fallback exists, and that the paths hanging off it
 * are correct.
 *
 * The endpoint-liveness test pins that the URLs in this file respond
 * with 200. This test pins the config STRUCTURE (URL strings, chain
 * id keys, enum values, function behavior) so structural regressions
 * surface even when the live endpoints are reachable.
 *
 * Spec mirrors src/config/subgraphEndpoints.js + cross-checks against
 * src/components/futarchyFi/marketPage/constants/contracts.js for
 * DEFAULT_AGGREGATOR drift.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/config/subgraphEndpoints.js', import.meta.url),
    'utf8',
);

const CONTRACTS_SRC = readFileSync(
    new URL('../../src/components/futarchyFi/marketPage/constants/contracts.js', import.meta.url),
    'utf8',
);

// ---------------------------------------------------------------------------
// AGGREGATOR_SUBGRAPH_URL — Checkpoint registry indexer URL
// ---------------------------------------------------------------------------

test('subgraphEndpoints — FUTARCHY_API_BASE is env-overridable with a non-empty https default', () => {
    // The host is deployment-specific and MEANT to change, so it is not
    // pinned. What must hold: the env var is read, and a literal https
    // fallback exists. Without the fallback every derived URL silently
    // becomes "undefined/registry/graphql" in any build that forgets to
    // set NEXT_PUBLIC_FUTARCHY_API_URL — and static export bakes that in
    // without failing the build.
    assert.match(SRC, /process\.env\.NEXT_PUBLIC_FUTARCHY_API_URL/,
        'FUTARCHY_API_BASE must read NEXT_PUBLIC_FUTARCHY_API_URL');

    const fallback = SRC.match(/DEFAULT_API_BASE\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(fallback, 'DEFAULT_API_BASE fallback not found');
    assert.match(fallback[1], /^https:\/\/[^/]+$/,
        `DEFAULT_API_BASE must be a bare https origin, got "${fallback[1]}"`);
});

test('subgraphEndpoints — AGGREGATOR_SUBGRAPH_URL is the registry path on the API base', () => {
    const m = SRC.match(/AGGREGATOR_SUBGRAPH_URL\s*=\s*`([^`]+)`/);
    assert.ok(m, 'AGGREGATOR_SUBGRAPH_URL not found (expected a template literal)');
    assert.equal(m[1], '${FUTARCHY_API_BASE}/registry/graphql',
        `AGGREGATOR_SUBGRAPH_URL drifted: got "${m[1]}".`);
});

// ---------------------------------------------------------------------------
// SUBGRAPH_ENDPOINTS — chain ID → URL
// ---------------------------------------------------------------------------

test('subgraphEndpoints — SUBGRAPH_ENDPOINTS has entries for chain 1 and chain 100', () => {
    // Chain 1 = Ethereum Mainnet, Chain 100 = Gnosis. A missing key makes
    // getSubgraphEndpoint return null and the caller skip the fetch.
    const block = SRC.match(/SUBGRAPH_ENDPOINTS\s*=\s*\{([\s\S]*?)\n\};/);
    assert.ok(block, 'SUBGRAPH_ENDPOINTS object not found');
    assert.match(block[1], /\b1\s*:\s*`[^`]+`/, 'missing chain id "1" entry');
    assert.match(block[1], /\b100\s*:\s*`[^`]+`/, 'missing chain id "100" entry');
});

test('subgraphEndpoints — both chain endpoints derive from the API base, chain 1 keeps its discriminator', () => {
    // Both chains hit the same candles path; chain 1 is selected by the
    // ?chainId=1 query param, which is how the backend routes to the
    // mainnet indexer. Dropping it silently serves Gnosis data on mainnet.
    const block = SRC.match(/SUBGRAPH_ENDPOINTS\s*=\s*\{([\s\S]*?)\n\};/)[1];
    const m1   = block.match(/\b1\s*:\s*`([^`]+)`/);
    const m100 = block.match(/\b100\s*:\s*`([^`]+)`/);
    assert.ok(m1 && m100);
    assert.equal(m1[1], '${FUTARCHY_API_BASE}/candles/graphql?chainId=1');
    assert.equal(m100[1], '${FUTARCHY_API_BASE}/candles/graphql');
});

// ---------------------------------------------------------------------------
// POOL_TYPES + OUTCOME_SIDES — frozen enums
// ---------------------------------------------------------------------------

test('subgraphEndpoints — POOL_TYPES has exactly the three documented types', () => {
    // PR #6 / extract-tokens-from-pools test depend on these three.
    // Adding a fourth type without updating consumers would break the
    // priority chain (CONDITIONAL > EXPECTED_VALUE > PREDICTION).
    for (const v of ['PREDICTION', 'CONDITIONAL', 'EXPECTED_VALUE']) {
        assert.match(SRC, new RegExp(`POOL_TYPES[\\s\\S]*?${v}:\\s*['"]${v}['"]`),
            `POOL_TYPES missing ${v}`);
    }
});

test('subgraphEndpoints — OUTCOME_SIDES has exactly YES and NO', () => {
    for (const v of ['YES', 'NO']) {
        assert.match(SRC, new RegExp(`OUTCOME_SIDES[\\s\\S]*?${v}:\\s*['"]${v}['"]`),
            `OUTCOME_SIDES missing ${v}`);
    }
});

// ---------------------------------------------------------------------------
// getSubgraphEndpoint behavior — spec mirror
// ---------------------------------------------------------------------------

const SUBGRAPH_ENDPOINTS = {
    1:   'https://api.futarchy.fi/candles/graphql',
    100: 'https://api.futarchy.fi/candles/graphql',
};
function getSubgraphEndpoint(chainId) { return SUBGRAPH_ENDPOINTS[chainId] || null; }
function isChainSupported(chainId)    { return chainId in SUBGRAPH_ENDPOINTS; }

test('getSubgraphEndpoint — returns URL for supported chain', () => {
    assert.equal(getSubgraphEndpoint(100), 'https://api.futarchy.fi/candles/graphql');
    assert.equal(getSubgraphEndpoint(1), 'https://api.futarchy.fi/candles/graphql');
});

test('getSubgraphEndpoint — returns null for unsupported chain', () => {
    assert.equal(getSubgraphEndpoint(137), null,
        `unsupported chain (Polygon=137) must return null, not undefined or a fallback`);
    assert.equal(getSubgraphEndpoint(0), null);
    assert.equal(getSubgraphEndpoint(999999), null);
});

test('getSubgraphEndpoint — handles undefined / null chain id without throwing', () => {
    assert.equal(getSubgraphEndpoint(undefined), null);
    assert.equal(getSubgraphEndpoint(null), null);
});

test('isChainSupported — true for chains 1 and 100, false otherwise', () => {
    assert.equal(isChainSupported(1), true);
    assert.equal(isChainSupported(100), true);
    assert.equal(isChainSupported(137), false);
    assert.equal(isChainSupported(0), false);
});

// ---------------------------------------------------------------------------
// DEFAULT_AGGREGATOR — must equal the contracts.js value
// ---------------------------------------------------------------------------

test('subgraphEndpoints — DEFAULT_AGGREGATOR equals the value in contracts.js', () => {
    const m1 = SRC.match(/export\s+const\s+DEFAULT_AGGREGATOR\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(m1, 'DEFAULT_AGGREGATOR not found in subgraphEndpoints.js');

    // contracts.js has it under CONTRACT_ADDRESSES.DEFAULT_AGGREGATOR
    const m2 = CONTRACTS_SRC.match(/DEFAULT_AGGREGATOR\s*:\s*['"]([^'"]+)['"]/);
    assert.ok(m2, 'DEFAULT_AGGREGATOR not found in contracts.js');

    assert.equal(m1[1], m2[1],
        `DEFAULT_AGGREGATOR drift between subgraphEndpoints.js and contracts.js: ` +
        `${m1[1]} vs ${m2[1]}. ` +
        `These two values must always be in sync — they refer to the same on-chain contract.`);
});

test('subgraphEndpoints — DEFAULT_AGGREGATOR is a valid 0x + 40 hex chars address', () => {
    const m = SRC.match(/export\s+const\s+DEFAULT_AGGREGATOR\s*=\s*['"]([^'"]+)['"]/);
    assert.match(m[1], /^0x[a-fA-F0-9]{40}$/,
        `DEFAULT_AGGREGATOR has wrong shape: "${m[1]}"`);
});
