/**
 * RPC config spec mirror (auto-qa).
 *
 * Pins src/config/rpcEndpoints.js — since f2b0de2 the single
 * source of truth for which RPC endpoints each chain uses. It replaced the
 * lists that used to be duplicated (and had drifted apart) across
 * utils/getRpcUrl.js (deleted), providers.jsx, getBestRpc.js,
 * getAlgebraPoolPrice.js and activeMarketLiquidity.js. The old version of
 * this test pinned those duplicate lists (>= 3 entries each, overlap
 * between them); that arrangement is gone on purpose.
 *
 * What is pinned now:
 *
 *   1. Each chain has at least one public fallback, HTTPS-only and
 *      deduplicated — a regression that empties a list would throw
 *      "No RPC endpoints configured" on every read.
 *
 *   2. Priority: the configured endpoint (NEXT_PUBLIC_GNOSIS_RPC_URL /
 *      NEXT_PUBLIC_MAINNET_RPC_URL) comes first, the public endpoint stays
 *      behind it, and an unset variable is dropped rather than left as
 *      `undefined` at the head of the list.
 *
 *   3. Consumers read the shared config instead of carrying their own list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const CONFIG_SRC = read('src/config/rpcEndpoints.js');

// Evaluate the module with a controlled environment. The env vars are read at
// module load (they are inlined at build time in the app), so each variant is
// a separate module instance — the trailing comment keeps the data: URLs apart.
async function loadConfig(env, tag) {
    const keys = ['NEXT_PUBLIC_GNOSIS_RPC_URL', 'NEXT_PUBLIC_MAINNET_RPC_URL'];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) {
        if (env[k] === undefined) delete process.env[k];
        else process.env[k] = env[k];
    }
    try {
        return await import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(`${CONFIG_SRC}\n// ${tag}`)}`
        );
    } finally {
        for (const k of keys) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    }
}

const PUBLIC = await loadConfig({}, 'no-env');
const PRIVATE = await loadConfig({
    NEXT_PUBLIC_GNOSIS_RPC_URL: 'https://private-gnosis.example',
    NEXT_PUBLIC_MAINNET_RPC_URL: 'https://private-mainnet.example',
}, 'with-env');

// ---------------------------------------------------------------------------
// Public fallbacks: non-empty, HTTPS-only, deduplicated
// ---------------------------------------------------------------------------

for (const chainId of [1, 100]) {
    test(`rpc — chain ${chainId} has at least one public fallback`, () => {
        const list = PUBLIC.RPC_ENDPOINTS[chainId];
        assert.ok(Array.isArray(list) && list.length >= 1,
            `chain ${chainId} has no endpoints without an env var — every read would throw`);
    });

    test(`rpc — chain ${chainId} entries are all HTTPS`, () => {
        for (const url of PRIVATE.RPC_ENDPOINTS[chainId]) {
            assert.match(url, /^https:\/\//,
                `chain ${chainId} contains non-HTTPS URL: "${url}". HTTP would leak request headers.`);
        }
    });

    test(`rpc — chain ${chainId} entries are deduplicated`, () => {
        const list = PRIVATE.RPC_ENDPOINTS[chainId];
        assert.equal(new Set(list).size, list.length, `chain ${chainId} has duplicates`);
    });
}

test('rpc — chain 100 keeps the canonical rpc.gnosischain.com as a fallback', () => {
    // The chain's own endpoint survives any third-party outage.
    assert.ok(PUBLIC.RPC_ENDPOINTS[100].includes('https://rpc.gnosischain.com'));
});

// ---------------------------------------------------------------------------
// Priority: configured endpoint first, public behind it
// ---------------------------------------------------------------------------

test('rpc — a configured endpoint is tried first, public endpoints stay behind it', () => {
    assert.equal(PRIVATE.RPC_ENDPOINTS[100][0], 'https://private-gnosis.example');
    assert.equal(PRIVATE.RPC_ENDPOINTS[1][0], 'https://private-mainnet.example');
    for (const chainId of [1, 100]) {
        assert.deepEqual(PRIVATE.RPC_ENDPOINTS[chainId].slice(1), PUBLIC.RPC_ENDPOINTS[chainId],
            `chain ${chainId} lost its public fallback when an env var is set`);
    }
});

test('rpc — an unset env var is dropped, not left as undefined', () => {
    for (const chainId of [1, 100]) {
        assert.ok(PUBLIC.RPC_ENDPOINTS[chainId].every(Boolean),
            `chain ${chainId} list contains an empty entry`);
    }
});

test('getPrimaryRpcUrl — returns the head of the list, undefined for unknown chains', () => {
    assert.equal(PRIVATE.getPrimaryRpcUrl(100), 'https://private-gnosis.example');
    assert.equal(PUBLIC.getPrimaryRpcUrl(1), PUBLIC.RPC_ENDPOINTS[1][0]);
    assert.equal(PUBLIC.getPrimaryRpcUrl(137), undefined);
});

test('RPC_NETWORKS — chain ids are stated explicitly (no detection round trip)', () => {
    assert.deepEqual(PUBLIC.RPC_NETWORKS[1], { chainId: 1, name: 'homestead' });
    assert.deepEqual(PUBLIC.RPC_NETWORKS[100], { chainId: 100, name: 'xdai' });
});

// ---------------------------------------------------------------------------
// Consumers read the shared config instead of their own list
// ---------------------------------------------------------------------------

const CONSUMERS = [
    'src/providers/providers.jsx',
    'src/utils/getBestRpc.js',
    'src/utils/getAlgebraPoolPrice.js',
    'src/utils/activeMarketLiquidity.js',
];

for (const path of CONSUMERS) {
    test(`rpc — ${path} imports config/rpcEndpoints and has no inline RPC list`, () => {
        const src = read(path);
        assert.match(src, /from ['"]\.\.\/config\/rpcEndpoints['"]/,
            `${path} no longer reads config/rpcEndpoints.js`);
        assert.doesNotMatch(src, /\w+_RPCS\s*=\s*\[/,
            `${path} declares its own RPC list again — lists drift apart; use RPC_ENDPOINTS`);
    });
}
