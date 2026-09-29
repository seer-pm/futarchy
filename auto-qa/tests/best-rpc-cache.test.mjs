/**
 * getBestRpc spec (auto-qa).
 *
 * Pins src/utils/getBestRpc.js. Until f2b0de2 this module probed every
 * endpoint with eth_blockNumber on each call, ranked them by latency and kept
 * the top three in a 5-minute cache; the old version of this test pinned that
 * cache (CACHE_DURATION_MS, MAX_CACHED_RPC_COUNT, normalizeCacheEntry, the LRU
 * rotation). f2b0de2 replaced the probe on purpose — a market page spent 39
 * eth_chainId requests before doing any work — with one shared provider per
 * chain plus failover. This file now pins that design:
 *
 *   1. One provider per chain, built once and reused; the endpoint list is
 *      config/rpcEndpoints.js (covered by rpc-config.test.mjs).
 *   2. Failover — a failing call advances to the next endpoint and is
 *      retried once; two concurrent failures advance only one step; an
 *      exhausted list rethrows the original error.
 *   3. clearRpcCache resets to the primary endpoint.
 *   4. The latency probe survives only in diagnoseRpcs (the diagnostics
 *      page) and never runs on the getBestRpc path.
 *
 * The module is evaluated for real, with its two imports replaced by stubs.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/getBestRpc.js', import.meta.url),
    'utf8',
);

// --- stubs for config/rpcEndpoints and utils/staticBatchProvider ---
const harness = {
    lists: {},
    built: [],          // every provider constructed, in order
    failing: new Set(), // urls whose send() rejects
};
globalThis.__bestRpcHarness = harness;

function makeProvider(url, network) {
    const provider = {
        url,
        network,
        async send(method) {
            if (harness.failing.has(url)) throw new Error(`down: ${url}`);
            return `${method}@${url}`;
        },
    };
    harness.built.push(provider);
    return provider;
}
harness.make = makeProvider;

const IMPORTS = [
    [
        "import { RPC_ENDPOINTS as RPC_LISTS, RPC_NETWORKS as NETWORKS } from '../config/rpcEndpoints';",
        'const RPC_LISTS = globalThis.__bestRpcHarness.lists;\n' +
        'const NETWORKS = { 1: { chainId: 1 }, 100: { chainId: 100 }, 5: { chainId: 5 } };',
    ],
    [
        "import { createStaticBatchProvider } from './staticBatchProvider';",
        'const createStaticBatchProvider = (url, network) => globalThis.__bestRpcHarness.make(url, network);',
    ],
];

let testable = SRC;
for (const [from, to] of IMPORTS) {
    assert.ok(testable.includes(from), `getBestRpc.js import changed: ${from}`);
    testable = testable.replace(from, to);
}
const rpc = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(testable)}`);

const quiet = () => {};
console.log = quiet;
console.warn = quiet;

beforeEach(() => {
    rpc.clearRpcCache();
    harness.lists[100] = ['https://a.example', 'https://b.example'];
    harness.lists[5] = ['https://p.example', 'https://q.example', 'https://r.example'];
    harness.built.length = 0;
    harness.failing.clear();
});

// ---------------------------------------------------------------------------
// One provider per chain
// ---------------------------------------------------------------------------

test('getRpcProvider — builds one provider per chain and reuses it', async () => {
    const first = rpc.getRpcProvider(100);
    assert.equal(rpc.getRpcProvider(100), first);
    assert.equal(await rpc.getBestRpcProvider(100), first);
    assert.equal(harness.built.length, 1, 'provider rebuilt on a repeat call');
});

test('getRpcProvider — passes the network explicitly (no detection round trip)', () => {
    assert.deepEqual(rpc.getRpcProvider(100).network, { chainId: 100 });
});

test('getBestRpc — returns the primary endpoint without probing', async () => {
    assert.equal(await rpc.getBestRpc(100), 'https://a.example');
});

test('getRpcProvider — a chain with no endpoints throws', () => {
    assert.throws(() => rpc.getRpcProvider(137), /No RPC endpoints configured for chain 137/);
});

// ---------------------------------------------------------------------------
// Failover
// ---------------------------------------------------------------------------

test('failover — a failed call moves to the next endpoint and is retried', async () => {
    harness.failing.add('https://a.example');
    const provider = rpc.getRpcProvider(100);
    assert.equal(await provider.send('eth_call', []), 'eth_call@https://b.example');
    assert.equal(await rpc.getBestRpc(100), 'https://b.example',
        'the chain should stay on the endpoint that worked');
});

test('failover — an exhausted list rethrows the original error', async () => {
    harness.failing.add('https://a.example');
    harness.failing.add('https://b.example');
    const provider = rpc.getRpcProvider(100);
    await assert.rejects(provider.send('eth_call', []), /down: https:\/\/b\.example/);
    // Nothing past the end: the chain stays on the last endpoint.
    assert.equal(await rpc.getBestRpc(100), 'https://b.example');
});

test('failover — two concurrent failures advance one endpoint, not two', async () => {
    harness.failing.add('https://p.example');
    const provider = rpc.getRpcProvider(5);
    await Promise.all([provider.send('eth_call', []), provider.send('eth_call', [])]);
    assert.equal(await rpc.getBestRpc(5), 'https://q.example',
        'a second failure on the same provider skipped a healthy endpoint');
});

test('clearRpcCache — the next call starts again from the primary endpoint', async () => {
    harness.failing.add('https://a.example');
    await rpc.getRpcProvider(100).send('eth_call', []);
    rpc.clearRpcCache();
    assert.equal(await rpc.getBestRpc(100), 'https://a.example');
});

test('getRpcCacheStatus — reports the endpoint in use per chain', () => {
    rpc.getRpcProvider(100);
    const status = rpc.getRpcCacheStatus();
    assert.deepEqual(status['chain-100'].urls, ['https://a.example']);
});

// ---------------------------------------------------------------------------
// The probe lives on only in diagnoseRpcs
// ---------------------------------------------------------------------------

test('diagnoseRpcs probe — POST + eth_blockNumber, jsonrpc 2.0', () => {
    assert.match(SRC, /method:\s*['"]POST['"]/);
    assert.match(SRC, /method:\s*['"]eth_blockNumber['"]/);
    assert.match(SRC, /jsonrpc:\s*['"]2\.0['"]/);
});

test('diagnoseRpcs probe — AbortController timeout at RPC_TIMEOUT_MS = 5000', () => {
    // A setTimeout-only timeout would race the request without freeing it.
    assert.match(SRC, /AbortController/);
    assert.match(SRC, /controller\.abort\(\)/);
    assert.match(SRC, /signal:\s*controller\.signal/);
    const m = SRC.match(/RPC_TIMEOUT_MS\s*=\s*(\d+)/);
    assert.ok(m, 'RPC_TIMEOUT_MS not found');
    assert.equal(parseInt(m[1], 10), 5000);
});

test('getBestRpc path never probes — testRpc is only called from diagnoseRpcs', () => {
    const calls = [...SRC.matchAll(/\btestRpc\b/g)].length;
    // One definition plus the single `rpcList.map(testRpc)` in diagnoseRpcs.
    assert.equal(calls, 2, 'testRpc is referenced outside diagnoseRpcs — page loads would probe again');
    assert.match(SRC, /rpcList\.map\(testRpc\)/);
});

test('exports — the API the app and the diagnostics page use', () => {
    for (const name of ['getBestRpc', 'getBestRpcProvider', 'getRpcProvider',
        'clearRpcCache', 'diagnoseRpcs', 'getRpcCacheStatus']) {
        assert.equal(typeof rpc[name], 'function', `${name} is no longer exported`);
    }
});
