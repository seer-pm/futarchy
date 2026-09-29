/**
 * Sanity test for auto-qa/tools/extract-graphql.mjs (auto-qa).
 *
 * This is the foundation for the schema-compat checker (highest-leverage
 * tool in our backlog). The extractor will only be useful if it actually
 * pulls every shipped GraphQL query out of src/. This test asserts that:
 *
 *   1. The extractor runs without crashing.
 *   2. It finds at least N queries (we know we ship many).
 *   3. It picks up *known* queries we authored in this session — these are
 *      checkpoints against accidentally narrowing the heuristic later.
 *
 * If the extractor regresses (e.g. someone tightens looksLikeGraphQL and
 * loses entries), this test fails clearly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR = resolve(__dirname, '../tools/extract-graphql.mjs');

function runExtractor() {
    const out = execFileSync('node', [EXTRACTOR], {
        encoding: 'utf8',
        cwd: resolve(__dirname, '../..'),
    });
    return JSON.parse(out);
}

test('extractor runs and emits an array of query records', () => {
    const queries = runExtractor();
    assert.ok(Array.isArray(queries), 'output should be an array');
    assert.ok(queries.length > 10,
        `expected >10 queries (we ship many); got ${queries.length}`);
});

test('every record has the expected shape', () => {
    const queries = runExtractor();
    for (const q of queries) {
        assert.equal(typeof q.file, 'string', 'file is string');
        assert.equal(typeof q.line, 'number', 'line is number');
        assert.ok(q.line >= 1, 'line is 1-indexed');
        assert.equal(typeof q.query, 'string', 'query is string');
        assert.ok(q.query.length > 0, 'query is non-empty');
    }
});

test('finds known queries authored in this session', () => {
    const queries = runExtractor();
    const files = new Set(queries.map(q => q.file));

    // Files we know contain GraphQL strings (rewritten in PRs #62, #63, #65).
    const expected = [
        // useSubgraphData.js's candle query moved to src/utils/candleWindowQuery.js,
        // which composes it from per-pool alias fragments that no static extractor
        // can see; auto-qa/tests/candle-window-query.test.mjs pins its shape instead.
        'src/hooks/usePoolData.js',             // PR #65
        'src/utils/subgraphTradesClient.js',    // PR #63
        // The proposal query from subgraphConfigAdapter.js (PR #62) moved
        // here in 0240c3d, shared with usePoolData.
        'src/services/proposalMarketData.js',
        'src/hooks/useAggregatorProposals.js',  // PR #64 area
        'src/utils/SubgraphBulkPriceFetcher.js',// PR #64 area
    ];

    for (const f of expected) {
        assert.ok(files.has(f),
            `extractor missed ${f} — heuristic may have regressed`);
    }
});

test('finds at least one anonymous-shorthand query (no "query" keyword)', () => {
    const queries = runExtractor();
    // Many queries are written as `{ pools(where: …) { … } }` — no keyword.
    // The looksLikeGraphQL heuristic must keep handling this shape.
    const anonymous = queries.filter(q =>
        q.query.startsWith('{') && !/^\{\s*query\b/.test(q.query)
    );
    assert.ok(anonymous.length > 0,
        'expected at least one anonymous-shorthand query like `{ pools(...) { ... } }`');
});
