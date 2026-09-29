/**
 * readGraphqlData + cachedOnce failure spec (auto-qa).
 *
 * Pins src/utils/graphqlResponse.js — every futarchy GraphQL producer
 * (proposal market data, registry snapshot, bulk pool prices, pool data)
 * reads responses through it — and the contract it relies on in
 * src/services/requestCache.js: a producer that throws is not cached.
 *
 * Together they make an API outage (502 with `{ errors }`) surface as an
 * error the UI can show, instead of an empty result cached for 30s and
 * rendered as zeros.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { readGraphqlData, GraphqlRequestError } = await import(
    new URL('../../src/utils/graphqlResponse.js', import.meta.url)
);
const { cachedOnce, invalidateCache } = await import(
    new URL('../../src/services/requestCache.js', import.meta.url)
);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// readGraphqlData
// ---------------------------------------------------------------------------

test('readGraphqlData — 200 with data returns data', async () => {
    const data = await readGraphqlData(json({ data: { pools: [{ id: '0x1' }] } }));
    assert.deepEqual(data, { pools: [{ id: '0x1' }] });
});

test('readGraphqlData — 200 with empty results is data, not an error', async () => {
    const data = await readGraphqlData(json({ data: { pools: [] } }));
    assert.deepEqual(data, { pools: [] });
});

test('readGraphqlData — 502 with { errors } throws with the status and message', async () => {
    await assert.rejects(
        readGraphqlData(json({ errors: [{ message: 'upstream unavailable' }] }, 502), 'Registry request'),
        (err) => err instanceof GraphqlRequestError
            && err.status === 502
            && /Registry request failed with HTTP 502: upstream unavailable/.test(err.message),
    );
});

test('readGraphqlData — 200 with { errors } throws (GraphQL-level failure)', async () => {
    await assert.rejects(
        readGraphqlData(json({ data: null, errors: [{ message: 'Type `Query` has no field `foo`' }] })),
        (err) => err instanceof GraphqlRequestError && /has no field/.test(err.message),
    );
});

test('readGraphqlData — partial data with errors still throws', async () => {
    await assert.rejects(
        readGraphqlData(json({ data: { pools: [] }, errors: [{ message: 'timeout' }] })),
        GraphqlRequestError,
    );
});

test('readGraphqlData — non-JSON 5xx body throws', async () => {
    await assert.rejects(
        readGraphqlData(new Response('<html>Bad Gateway</html>', { status: 502 })),
        (err) => err instanceof GraphqlRequestError && err.status === 502,
    );
});

test('readGraphqlData — 200 without data throws', async () => {
    await assert.rejects(readGraphqlData(json({})), /returned no data/);
});

test('readGraphqlData — empty errors array is not an error', async () => {
    const data = await readGraphqlData(json({ data: { a: 1 }, errors: [] }));
    assert.deepEqual(data, { a: 1 });
});

// ---------------------------------------------------------------------------
// cachedOnce — failures are not cached
// ---------------------------------------------------------------------------

test('cachedOnce — a rejected producer is not cached; the next call retries', async () => {
    invalidateCache();
    let calls = 0;
    const producer = async () => {
        calls += 1;
        if (calls === 1) throw new Error('502');
        return 'ok';
    };
    await assert.rejects(cachedOnce('test:reject', producer), /502/);
    assert.equal(await cachedOnce('test:reject', producer), 'ok');
    assert.equal(calls, 2);
    // ...and the success is cached.
    assert.equal(await cachedOnce('test:reject', producer), 'ok');
    assert.equal(calls, 2);
});

test('cachedOnce — a producer failing through readGraphqlData is not cached', async () => {
    invalidateCache();
    let status = 502;
    let calls = 0;
    const producer = async () => {
        calls += 1;
        const body = status === 502 ? { errors: [{ message: 'down' }] } : { data: { pools: [] } };
        return readGraphqlData(json(body, status));
    };
    await assert.rejects(cachedOnce('test:gql', producer), GraphqlRequestError);
    status = 200;
    assert.deepEqual(await cachedOnce('test:gql', producer), { pools: [] });
    assert.equal(calls, 2);
});

test('cachedOnce — concurrent callers share one in-flight failure', async () => {
    invalidateCache();
    let calls = 0;
    const producer = async () => { calls += 1; throw new Error('down'); };
    const results = await Promise.allSettled([
        cachedOnce('test:shared', producer),
        cachedOnce('test:shared', producer),
    ]);
    assert.equal(calls, 1);
    assert.ok(results.every(r => r.status === 'rejected'));
});

// ---------------------------------------------------------------------------
// Producers: no catch-and-return-null around the request
// ---------------------------------------------------------------------------

const src = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

test('source — proposalMarketData reads through readGraphqlData and does not swallow failures', () => {
    const SRC = src('services/proposalMarketData.js');
    assert.match(SRC, /await readGraphqlData\(response,/);
    assert.doesNotMatch(SRC, /catch\s*\(/,
        'a catch here would turn an outage into a cached null');
});

test('source — registrySnapshot reads through readGraphqlData', () => {
    assert.match(src('services/registrySnapshot.js'), /await readGraphqlData\(response,/);
});

test('source — usePoolData checks GraphQL errors on every candles request', () => {
    const SRC = src('hooks/usePoolData.js');
    assert.equal([...SRC.matchAll(/readGraphqlData\(/g)].length, 2,
        'candle-price and single-pool queries must both go through readGraphqlData');
    assert.doesNotMatch(SRC, /await\s+(resp|response)\.json\(\)[\s\S]{0,80}candles/,
        'raw .json() on a candles response ignores GraphQL errors');
});

test('source — subgraphConfigAdapter falls back to the chain when market data is unavailable', () => {
    const SRC = src('adapters/subgraphConfigAdapter.js');
    assert.match(SRC,
        /try\s*\{\s*data = await fetchProposalMarketData\(chainId,\s*proposalAddress\);\s*\}\s*catch\s*\(error\)\s*\{[\s\S]*?return null;/,
        'fetchProposalFromSubgraph must catch and return null so fetchMarketEventData tries the chain');
});
