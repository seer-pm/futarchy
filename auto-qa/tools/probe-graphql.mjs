#!/usr/bin/env node
/**
 * Runtime GraphQL schema-compat probe (auto-qa).
 *
 * Sends every extracted GraphQL query (from extract-graphql.mjs) to the
 * live `/candles/graphql` and `/registry/graphql` endpoints and reports
 * any GraphQL errors. The live upstream IS the validator — we don't
 * need graphql-js here.
 *
 * What this catches (= the bugs from this session):
 *   - Unknown type "BigInt" (PR #65)
 *   - Field "X" must not have a selection since type "Y!" has no subfields
 *     (PRs #62, #63, #65 — nested entity refs on String scalars)
 *   - Cannot query field "X" on type "Y" (renamed/missing fields)
 *   - Filter operators not supported on a field (e.g. legacy _gte/_lte)
 *
 * What it does NOT catch:
 *   - Logic bugs (query is well-formed but returns wrong data)
 *   - Variable shape bugs (we feed dummy values so anything that needed
 *     a real value just returns empty data, no error)
 *
 * Heuristic for which endpoint to probe: queries that mention `aggregator`,
 * `organization`, `proposalentity`, or `metadataentry` go to the registry
 * indexer. Everything else (pools, candles, swaps, proposal-as-trading-
 * contract, whitelistedtokens) goes to the candles indexer.
 *
 * Usage:
 *   node auto-qa/tools/probe-graphql.mjs            # JSON report to stdout
 *   node auto-qa/tools/probe-graphql.mjs --summary  # human-readable
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveApiBase } from './api-base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR = resolve(__dirname, 'extract-graphql.mjs');

const API_BASE = resolveApiBase();
const CANDLES_URL  = `${API_BASE}/candles/graphql`;
const REGISTRY_URL = `${API_BASE}/registry/graphql`;

// Dummy variables for queries that declare variables. We feed plausible
// shapes so the upstream can parse + validate; data comes back empty when
// the value doesn't match anything. Type-check failures still surface.
const DUMMY_VARS = {
    proposalId: '0x0000000000000000000000000000000000000000',
    poolId:     '0x0000000000000000000000000000000000000000',
    yesPoolId:  '0x0000000000000000000000000000000000000000',
    noPoolId:   '0x0000000000000000000000000000000000000000',
    id:         '0x0000000000000000000000000000000000000000',
    ids:        ['0x0000000000000000000000000000000000000000'],
    poolIds:    ['0x0000000000000000000000000000000000000000'],
    proposalIds: ['0x0000000000000000000000000000000000000000'],
    aggregatorId: '0x0000000000000000000000000000000000000000',
    searchTerm: 'auto-qa',
    chainId:    100,
    limit:      1,
    first:      1,
    skip:       0,
    period:     '3600',
    closeTimestamp: '1778342400',
    timestamp24hAgo: '1777737600',
    minTimestamp: 1777737600,
    maxTimestamp: 1778342400,
};

function pickEndpoint(query) {
    const REGISTRY_HINTS = /\b(aggregator|organization|proposalentity|metadataentry|aggregators|organizations)\b/i;
    return REGISTRY_HINTS.test(query) ? REGISTRY_URL : CANDLES_URL;
}

// Files whose GraphQL queries target external subgraphs (Snapshot Hub,
// Balancer, Algebra/Swapr) — not our Checkpoint indexers. Skip them; the
// probe targets the app's own API only.
const EXTERNAL_GRAPHQL_FILES = new Set([
    'src/utils/snapshotApi.js',         // hub.snapshot.org
    'src/spotPriceUtils/balancerHopClient.js', // balancer subgraph
    'src/hooks/useLatestPrices.js',     // api-v3.balancer.fi
]);

// Heuristic: a "Row not found: …" response means the query parsed and
// validated, the upstream just couldn't find the placeholder data we sent.
// That's not a real bug and shouldn't count as a failure.
function isPlaceholderDataMiss(errors) {
    return errors.length > 0 && errors.every(msg =>
        /Row not found:/i.test(msg) ||
        /No data:/i.test(msg) ||
        /not found/i.test(msg) && !/field|type/i.test(msg)
    );
}

// Detect declared variable names so we send only what each query asks for.
function declaredVars(query) {
    const m = query.match(/^\s*(?:query|mutation|subscription)\s+\w*\s*\(([^)]*)\)/);
    if (!m) return [];
    return [...m[1].matchAll(/\$(\w+)\s*:/g)].map(x => x[1]);
}

// Substitute JS template-literal `${expr}` placeholders the extractor can't
// evaluate. Heuristic: assume any interpolation is a value, never a field
// name or operator, and pick a literal from where it sits:
//   `"${x}"`        → a zero address (the quotes are already there)
//   `[${ids}]`      → an empty list
//   `where: ${w}`   → an empty filter object
//   anything else   → 1 (the API rejects `first: 0`)
// Expressions are matched by brace depth, so one that contains its own
// braces or template literal (`${ids.map(a => `"${a}"`).join(', ')}`) is
// replaced whole.
function substituteInterpolations(query) {
    let out = '';
    let i = 0;
    while (i < query.length) {
        const start = query.indexOf('${', i);
        if (start === -1) { out += query.slice(i); break; }
        let depth = 1;
        let end = start + 2;
        while (end < query.length && depth > 0) {
            if (query[end] === '{') depth++;
            else if (query[end] === '}') depth--;
            end++;
        }
        const before = out + query.slice(i, start);
        const after = query.slice(end);
        let literal = '1';
        if (/"$/.test(before) && /^"/.test(after)) literal = '0x0000000000000000000000000000000000000000';
        else if (/\[\s*$/.test(before) && /^\s*\]/.test(after)) literal = '';
        else if (/\bwhere:\s*$/.test(before)) literal = '{}';
        out = before + literal;
        i = end;
    }
    return out;
}

async function tryEndpoint(url, query, variables) {
    let res, body;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(15000),
        });
        body = await res.json().catch(() => null);
    } catch (err) {
        return { httpStatus: null, errors: [err.message] };
    }
    return {
        httpStatus: res.status,
        errors: (body?.errors || []).map(e => e.message),
    };
}

async function probeOne(record) {
    if (EXTERNAL_GRAPHQL_FILES.has(record.file)) {
        return {
            file: record.file, line: record.line,
            endpoint: 'external', httpStatus: null,
            graphqlErrors: [], skipped: 'external-subgraph', ok: true,
        };
    }
    const probedQuery = substituteInterpolations(record.query);
    const want = declaredVars(probedQuery);
    const variables = {};
    for (const name of want) variables[name] = DUMMY_VARS[name] ?? null;

    // Try the heuristic-picked endpoint first.
    const primary = pickEndpoint(probedQuery);
    let attempt = await tryEndpoint(primary, probedQuery, variables);
    let usedEndpoint = primary;

    // If that failed with a "Cannot query field … on type Query" error, try
    // the other endpoint — the heuristic may have mis-routed.
    const looksMisrouted =
        attempt.errors.some(e => /Cannot query field .* on type "Query"/.test(e));
    if (looksMisrouted) {
        const fallback = primary === CANDLES_URL ? REGISTRY_URL : CANDLES_URL;
        const second = await tryEndpoint(fallback, probedQuery, variables);
        if (second.errors.length < attempt.errors.length) {
            attempt = second;
            usedEndpoint = fallback;
        }
    }

    const placeholderMiss = isPlaceholderDataMiss(attempt.errors);
    return {
        file: record.file,
        line: record.line,
        endpoint: usedEndpoint,
        httpStatus: attempt.httpStatus,
        graphqlErrors: placeholderMiss ? [] : attempt.errors,
        // ok if: HTTP 200 OR errors are only "no data for placeholder address"
        ok: (attempt.httpStatus >= 200 && attempt.httpStatus < 300 && attempt.errors.length === 0)
            || placeholderMiss,
    };
}

const queries = JSON.parse(execFileSync('node', [EXTRACTOR], {
    encoding: 'utf8',
    cwd: resolve(__dirname, '../..'),
}));

const results = [];
for (const q of queries) {
    results.push(await probeOne(q));
}

const failures = results.filter(r => !r.ok);

if (process.argv.includes('--summary')) {
    console.log(`Probed ${results.length} queries against ${API_BASE}`);
    console.log(`  ✔ ok:       ${results.length - failures.length}`);
    console.log(`  ✖ failed:   ${failures.length}`);
    if (failures.length) {
        console.log('\nFailures:');
        for (const f of failures) {
            console.log(`  ${f.file}:${f.line}  HTTP ${f.httpStatus ?? '-'}`);
            const errs = f.graphqlErrors || [f.error || '(unknown)'];
            for (const e of errs) console.log(`    → ${e}`);
        }
    }
    process.exit(failures.length ? 1 : 0);
} else {
    process.stdout.write(JSON.stringify({
        baseUrl: API_BASE,
        totalQueries: results.length,
        failed: failures.length,
        results,
    }, null, 2) + '\n');
}
