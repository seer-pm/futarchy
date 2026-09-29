/**
 * Candle window query test (auto-qa).
 *
 * Pins the closed-market chart fix. The chart used to ask for the newest
 * 500 candles across BOTH pools with the upper bound at `now`. Trading
 * continues after close, so for a closed market every returned candle was
 * post-close and the chart (which drops candles after closeTimestamp)
 * rendered blank — GIP-151, GIP-149.
 *
 * Now the query is bounded to [startCandleUnix .. closeTimestamp], each
 * pool has its own alias and `first:`, and a pool that fills its page is
 * paged backwards until the window is covered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../../src/utils/candleWindowQuery.js');
const source = await readFile(sourcePath, 'utf8');
const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);

const {
    CANDLE_PAGE_MAX,
    resolveCandleWindow,
    clampPageSize,
    buildWindowedCandlesQuery,
    nextCandlePages,
    fetchCandlesInWindow,
} = mod;

const HOUR = 3600;
const NOW = 1_790_000_000;

// GIP-151 registry metadata
const GIP151 = { startUnix: 1782298800, closeUnix: 1782486884 };

test('resolveCandleWindow bounds a closed market to [start .. close]', () => {
    assert.deepEqual(
        resolveCandleWindow({ ...GIP151, nowUnix: NOW }),
        { fromUnix: 1782298800, toUnix: 1782486884 },
    );
});

test('resolveCandleWindow caps an open market at now', () => {
    assert.deepEqual(
        resolveCandleWindow({ startUnix: NOW - 10 * HOUR, closeUnix: NOW + 86_400, nowUnix: NOW }),
        { fromUnix: NOW - 10 * HOUR, toUnix: NOW },
    );
});

test('resolveCandleWindow falls back to full history and now when metadata is missing', () => {
    assert.deepEqual(resolveCandleWindow({ startUnix: null, closeUnix: null, nowUnix: NOW }), { fromUnix: 0, toUnix: NOW });
    assert.deepEqual(resolveCandleWindow({ startUnix: 'x', closeUnix: undefined, nowUnix: NOW }), { fromUnix: 0, toUnix: NOW });
});

test('resolveCandleWindow accepts numeric strings', () => {
    assert.deepEqual(
        resolveCandleWindow({ startUnix: '1782298800', closeUnix: '1782486884', nowUnix: NOW }),
        { fromUnix: 1782298800, toUnix: 1782486884 },
    );
});

test('resolveCandleWindow ignores a start after the end', () => {
    assert.deepEqual(
        resolveCandleWindow({ startUnix: NOW + HOUR, closeUnix: null, nowUnix: NOW }),
        { fromUnix: 0, toUnix: NOW },
    );
});

test('clampPageSize keeps the page within the indexer max', () => {
    assert.equal(clampPageSize(500), 500);
    assert.equal(clampPageSize(5000), CANDLE_PAGE_MAX);
    assert.equal(clampPageSize(undefined), CANDLE_PAGE_MAX);
    assert.equal(clampPageSize(0), CANDLE_PAGE_MAX);
});

test('buildWindowedCandlesQuery gives each pool its own alias, limit and bounds', () => {
    const query = buildWindowedCandlesQuery(
        [
            { alias: 'yes', id: '0xaaa', toUnix: 200 },
            { alias: 'no', id: '0xbbb', toUnix: 150 },
        ],
        { fromUnix: 100, pageSize: 1000 },
    );
    assert.match(query, /yes: candles\(\s*first: 1000,[\s\S]*?pool: "0xaaa", period: 3600, periodStartUnix_gte: 100, periodStartUnix_lte: 200/);
    assert.match(query, /no: candles\(\s*first: 1000,[\s\S]*?pool: "0xbbb", period: 3600, periodStartUnix_gte: 100, periodStartUnix_lte: 150/);
    assert.equal((query.match(/candles\(/g) || []).length, 2);
    assert.doesNotMatch(query, /pool_in/);
});

test('nextCandlePages pages only pools that filled their page', () => {
    const pools = [
        { alias: 'yes', id: '0xa', toUnix: 1000 },
        { alias: 'no', id: '0xb', toUnix: 1000 },
    ];
    const data = {
        yes: [{ periodStartUnix: '900' }, { periodStartUnix: '800' }],
        no: [{ periodStartUnix: '900' }],
    };
    assert.deepEqual(
        nextCandlePages(pools, data, { fromUnix: 0, pageSize: 2 }),
        [{ alias: 'yes', id: '0xa', toUnix: 799 }],
    );
});

test('nextCandlePages stops once the page reaches the window start', () => {
    const pools = [{ alias: 'yes', id: '0xa', toUnix: 1000 }];
    const data = { yes: [{ periodStartUnix: '900' }, { periodStartUnix: '800' }] };
    assert.deepEqual(nextCandlePages(pools, data, { fromUnix: 800, pageSize: 2 }), []);
});

// Fake indexer: serves hourly candles for each pool, honouring the
// per-alias bounds and `first:` parsed out of the query.
function fakeIndexer(seriesByPool) {
    const queries = [];
    const execute = async (query) => {
        queries.push(query);
        const data = {};
        const re = /(\w+): candles\(\s*first: (\d+),[\s\S]*?pool: "([^"]+)", period: 3600, periodStartUnix_gte: (\d+), periodStartUnix_lte: (\d+)/g;
        for (const [, alias, first, pool, gte, lte] of query.matchAll(re)) {
            data[alias] = (seriesByPool[pool] || [])
                .filter(t => t >= Number(gte) && t <= Number(lte))
                .sort((a, b) => b - a)
                .slice(0, Number(first))
                .map(t => ({ periodStartUnix: String(t), close: '1' }));
        }
        return data;
    };
    return { execute, queries };
}

const hours = (from, count) => Array.from({ length: count }, (_, i) => from + i * HOUR);

test('closed market: post-close trading does not crowd out pre-close candles', async () => {
    const start = 1_700_000_000 - (1_700_000_000 % HOUR);
    const close = start + 50 * HOUR;
    // 51 candles inside the window, then 2000 hours of post-close trading.
    const yes = hours(start, 2051);
    const no = hours(start, 60);
    const { execute, queries } = fakeIndexer({ '0xyes': yes, '0xno': no });

    const out = await fetchCandlesInWindow(
        execute,
        [{ alias: 'yes', id: '0xyes' }, { alias: 'no', id: '0xno' }],
        { fromUnix: start, toUnix: close },
        { pageSize: 1000 },
    );

    assert.equal(queries.length, 1);
    assert.equal(out.yes.length, 51);
    assert.equal(out.no.length, 51);
    assert.equal(Math.min(...out.yes.map(c => Number(c.periodStartUnix))), start);
    assert.equal(Math.max(...out.yes.map(c => Number(c.periodStartUnix))), close - (close % HOUR));
});

test('a busy pool pages independently and returns the full window', async () => {
    const start = 1_700_000_000 - (1_700_000_000 % HOUR);
    const yes = hours(start, 2500);
    const no = hours(start, 10);
    const { execute, queries } = fakeIndexer({ '0xyes': yes, '0xno': no });

    const out = await fetchCandlesInWindow(
        execute,
        [{ alias: 'yes', id: '0xyes' }, { alias: 'no', id: '0xno' }],
        { fromUnix: 0, toUnix: start + 3000 * HOUR },
        { pageSize: 1000 },
    );

    assert.equal(out.yes.length, 2500);
    assert.equal(new Set(out.yes.map(c => c.periodStartUnix)).size, 2500);
    assert.equal(out.no.length, 10);
    assert.equal(queries.length, 3);
    // Later pages only ask for the pool that still has more.
    assert.doesNotMatch(queries[1], /no: candles/);
    assert.doesNotMatch(queries[2], /no: candles/);
});

test('paging stops at maxPages', async () => {
    const { execute, queries } = fakeIndexer({ '0xyes': hours(HOUR, 50) });
    const out = await fetchCandlesInWindow(
        execute,
        [{ alias: 'yes', id: '0xyes' }],
        { fromUnix: 0, toUnix: 100 * HOUR },
        { pageSize: 10, maxPages: 2 },
    );
    assert.equal(queries.length, 2);
    assert.equal(out.yes.length, 20);
});
