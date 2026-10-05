/**
 * GraphQL schema-compat test (auto-qa).
 *
 * Runs the schema-compat probe against the API the app uses (see
 * auto-qa/tools/api-base.mjs) and asserts
 * the set of failing queries matches the baseline at
 * auto-qa/fixtures/known-graphql-failures.json.
 *
 * Why a baseline rather than a hard "zero failures" assertion:
 *   The /loop directive forbids modifying production code on this branch,
 *   so we can't fix the broken queries we found. We instead pin the
 *   current state — any NEW failure (regression) trips the test, and any
 *   FIXED failure (production PR cleaned it up) also trips the test
 *   (forces baseline update). Both are useful signals.
 *
 * Skip behavior: if the live API is unreachable, skip with a clear message.
 * The probe makes ~32 HTTP calls; this test is heavier than the others.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveApiBase } from '../tools/api-base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROBE = resolve(__dirname, '../tools/probe-graphql.mjs');
const BASELINE = resolve(__dirname, '../fixtures/known-graphql-failures.json');
const REPO_ROOT = resolve(__dirname, '../..');
const API_BASE = resolveApiBase();

async function isApiReachable() {
    try {
        const resp = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        return resp.ok;
    } catch {
        return false;
    }
}

function runProbe() {
    const out = execFileSync('node', [PROBE], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
        maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(out);
}

function loadBaseline() {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

test('GraphQL probe — failure count matches baseline', async (t) => {
    if (!(await isApiReachable())) {
        t.skip(`API at ${API_BASE} not reachable; skipping schema-compat probe`);
        return;
    }
    const probe = runProbe();
    const baseline = loadBaseline();
    const actual = probe.results.filter(r => !r.ok);

    assert.equal(
        actual.length,
        baseline.knownFailureCount,
        `Expected exactly ${baseline.knownFailureCount} failing queries (the known baseline); ` +
        `got ${actual.length}. ` +
        (actual.length > baseline.knownFailureCount
            ? 'NEW FAILURES — likely a regression. Inspect with `npm run auto-qa:probe-graphql -- --summary`.'
            : 'FEWER failures than baseline — a production fix likely landed. Regenerate the baseline file.')
    );
});

test('GraphQL probe — every failure is in the baseline (no surprise new ones)', async (t) => {
    if (!(await isApiReachable())) {
        t.skip(`API at ${API_BASE} not reachable; skipping`);
        return;
    }
    const probe = runProbe();
    const baseline = loadBaseline();
    const actual = probe.results.filter(r => !r.ok);
    const baselineKey = new Set(baseline.failures.map(f => `${f.file}:${f.line}`));

    const surprises = actual.filter(a => !baselineKey.has(`${a.file}:${a.line}`));
    assert.equal(
        surprises.length, 0,
        `New failing queries not in baseline:\n${
            surprises.map(s => `  ${s.file}:${s.line} → ${s.graphqlErrors.join('; ')}`).join('\n')
        }`
    );
});
