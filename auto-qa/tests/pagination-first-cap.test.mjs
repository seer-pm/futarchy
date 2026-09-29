/**
 * Pagination `first:` cap lint (auto-qa).
 *
 * Pins the family of bugs that landed as PR #44 — the Companies admin
 * UI silently dropped GIP-150 because `getLinkableProposals` queried
 * with `first: 50` against a registry that already had 229 proposals.
 *
 * General class of bug: a hardcoded `first: <small N>` on an entity
 * type whose population can grow past N silently truncates results.
 *
 * What this test does:
 *   Walks every shipped GraphQL query (via the same extractor used by
 *   the schema-compat probe) and flags entity-listing queries that use
 *   `first: <small>` for entities likely to grow past 100. Today's risk
 *   list: organizations, proposals, proposalentities, pools.
 *
 * Per /loop directive: failures here are documented as a baseline of
 * "known small-first usages we accept" — adding a NEW one trips the
 * test, so this is a ratchet against silent-truncation regressions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR = resolve(__dirname, '../tools/extract-graphql.mjs');

// Listing-style queries we audit. Format: `<entity>(... first: <N>)` with N < threshold
const RISKY_ENTITIES = ['proposals', 'proposalentities', 'organizations', 'pools'];

// Threshold: anything under this is suspicious for entities that grow.
// 100 captures the post-PR-#44 change (50 → 1000) — anything below is
// either intentionally narrow or a future PR-#44-style bug.
const FIRST_THRESHOLD = 100;

function loadQueries() {
    const out = execFileSync('node', [EXTRACTOR], {
        encoding: 'utf8',
        cwd: resolve(__dirname, '../..'),
    });
    return JSON.parse(out);
}

function findRiskyFirstUsages(queries) {
    const findings = [];
    for (const q of queries) {
        // Match `<entity>(<args>)` where args contain `first: <num>`.
        // Handle `entity(first: N, …)`, `entity(…, first: N)`, etc.
        for (const entity of RISKY_ENTITIES) {
            const re = new RegExp(
                `\\b${entity}\\s*\\([^)]*first\\s*:\\s*(\\d+)`,
                'gi'
            );
            let m;
            while ((m = re.exec(q.query)) !== null) {
                const n = parseInt(m[1], 10);
                if (n < FIRST_THRESHOLD) {
                    findings.push({
                        file: q.file,
                        line: q.line,
                        entity,
                        first: n,
                        snippet: m[0].slice(0, 80),
                    });
                }
            }
        }
    }
    return findings;
}

// Baseline: known small-first usages we accept today. Exhaustive list as
// of this iteration. If a new entry appears, it's flagged for review.
const ACCEPTED_SMALL_FIRST = [
    // useSearchProposals: search box deliberately shows only top-20.
    { file: 'src/hooks/useSearchProposals.js', entity: 'proposals', first: 20 },
    // usePoolData: single-pool lookup by ID (`pools(where: { id: "0xabc" }, first: 1)`)
    // is intentionally narrow — we want exactly one pool, not many.
    { file: 'src/hooks/usePoolData.js', entity: 'pools', first: 1 },
    // registryAdapter: proposalEntities filtered by one exact proposalAddress —
    // a lookup, not a listing. It was always there; the extractor only started
    // seeing it once it accepted a line break after `proposalEntities(`.
    { file: 'src/adapters/registryAdapter.js', entity: 'proposalentities', first: 5 },
];

function isAccepted(finding) {
    return ACCEPTED_SMALL_FIRST.some(
        a => a.file === finding.file && a.entity === finding.entity && a.first === finding.first
    );
}

test('PR #44 — no NEW small-first usage on listing entities', () => {
    const queries = loadQueries();
    const findings = findRiskyFirstUsages(queries);
    const surprises = findings.filter(f => !isAccepted(f));

    if (surprises.length > 0) {
        const lines = surprises.map(s =>
            `  ${s.file}:${s.line}  ${s.entity}(... first: ${s.first} ...) — ${s.snippet}`
        ).join('\n');
        assert.fail(
            `Found ${surprises.length} new small-first usage(s) on growing entities:\n${lines}\n` +
            `Either bump the limit (PR #44-style fix) or, if intentionally narrow, ` +
            `add to ACCEPTED_SMALL_FIRST in this test file.`
        );
    }
});

test('PR #44 — accepted small-first list still matches reality', () => {
    // Inverse direction: if an accepted entry was removed (e.g. the
    // useSearchProposals query was bumped/reworked), we want to know
    // so the accepted list doesn't grow stale.
    const queries = loadQueries();
    const findings = findRiskyFirstUsages(queries);

    for (const accepted of ACCEPTED_SMALL_FIRST) {
        const stillThere = findings.some(f =>
            f.file === accepted.file &&
            f.entity === accepted.entity &&
            f.first === accepted.first
        );
        assert.ok(stillThere,
            `Accepted small-first usage no longer found in source: ${JSON.stringify(accepted)}. ` +
            `Remove it from ACCEPTED_SMALL_FIRST in this test file.`);
    }
});

test('PR #44 — diagnostic: report all listing-entity first: values', (t) => {
    // Diagnostic-only — emits a count by file:entity:first triple so we
    // can see at a glance what pagination defaults the codebase uses.
    const queries = loadQueries();
    const findings = findRiskyFirstUsages(queries);
    t.diagnostic(`small-first usages found: ${findings.length} (threshold: <${FIRST_THRESHOLD})`);
    for (const f of findings) {
        t.diagnostic(`  ${f.file}:${f.line}  ${f.entity} first=${f.first}`);
    }
    assert.ok(true);
});
