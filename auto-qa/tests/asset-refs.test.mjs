/**
 * Asset reference baseline test (auto-qa).
 *
 * Walks src/ for `/assets/...` references and asserts each one
 * resolves to a file in public/. Catches a class of "broken image"
 * deploys where someone renames an asset without updating callers.
 *
 * Per the auto-qa directive (do not fix production bugs in this loop),
 * the 4 currently-broken refs are pinned in BASELINE_BROKEN_REFS.
 * Any NEW broken ref fails the test loudly. Any time someone fixes
 * one from the baseline, the test prompts them to remove it from the
 * baseline (so the count keeps ratcheting down).
 *
 * Excluded callers (Storybook / docs / template):
 *   - src/stories/Configure.mdx
 *   - src/config/README.md
 *   - src/config/markets-example.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = new URL('../../', import.meta.url);
const SRC_DIR    = fileURLToPath(new URL('src', REPO_ROOT));
const PUBLIC_DIR = fileURLToPath(new URL('public', REPO_ROOT));

const EXCLUDED_CALLERS = new Set([
    'src/stories/Configure.mdx',         // Storybook welcome page (not shipped)
    'src/config/README.md',              // documentation
    'src/config/markets-example.js',     // example template, not imported
]);

// Refs that are broken today but cannot be fixed in this loop (production
// is off-limits). When a fix lands and one of these refs starts resolving,
// remove it from the baseline so the count keeps ratcheting down.
const BASELINE_BROKEN_REFS = new Set([
    '/assets/default-company-logo.png',     // src/utils/imageUtils.js
    '/assets/default-logo.png',             // EventHighlightCard.jsx
    '/assets/fallback-company.png',         // ResolvedEventsDataTransformer.jsx + 2 more
    '/assets/market-logo.svg',              // MarketPage.jsx
]);

function walk(dir, results = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, results);
        else if (/\.(jsx?|tsx?|mdx?|json)$/.test(name)) results.push(full);
    }
    return results;
}

function extractAssetRefs() {
    const refs = new Map(); // ref -> Set<callerFile>
    const re = /\/assets\/[a-zA-Z0-9._\-/]+\.(png|jpg|jpeg|webp|svg|gif|ico)/g;
    for (const file of walk(SRC_DIR)) {
        // POSIX-style so EXCLUDED_CALLERS also matches on Windows.
        const rel = relative(fileURLToPath(REPO_ROOT), file).split(sep).join('/');
        if (EXCLUDED_CALLERS.has(rel)) continue;
        const src = readFileSync(file, 'utf8');
        const matches = src.match(re) || [];
        for (const m of matches) {
            if (!refs.has(m)) refs.set(m, new Set());
            refs.get(m).add(rel);
        }
    }
    return refs;
}

function assetExists(ref) {
    // ref looks like "/assets/foo/bar.png"; strip leading slash.
    const rel = ref.replace(/^\//, '');
    try {
        statSync(join(fileURLToPath(REPO_ROOT), 'public', rel));
        return true;
    } catch { return false; }
}

const ALL_REFS = extractAssetRefs();
const BROKEN_REFS = [...ALL_REFS.keys()].filter(r => !assetExists(r));
const NEW_BROKEN = BROKEN_REFS.filter(r => !BASELINE_BROKEN_REFS.has(r));
const FIXED_FROM_BASELINE = [...BASELINE_BROKEN_REFS].filter(r => assetExists(r));

test('asset-refs — extractor finds at least 30 asset refs in production code', () => {
    // Sanity check: if this number drops to 0 the regex is broken.
    assert.ok(ALL_REFS.size >= 30,
        `extractor found only ${ALL_REFS.size} refs — regex / walker likely broken`);
});

test('asset-refs — public/assets directory exists and is populated', () => {
    const items = readdirSync(PUBLIC_DIR + '/assets');
    assert.ok(items.length > 50,
        `public/assets has ${items.length} items — directory likely truncated`);
});

test('asset-refs — no NEW broken /assets/ refs since baseline', () => {
    if (NEW_BROKEN.length === 0) return;
    const lines = NEW_BROKEN.map(r => {
        const callers = [...ALL_REFS.get(r)].slice(0, 3).join(', ');
        return `  ${r}  ← ${callers}`;
    }).join('\n');
    assert.fail(
        `${NEW_BROKEN.length} new broken /assets/ ref(s) found beyond the baseline:\n${lines}\n\n` +
        `Either add the missing file under public/ OR update the calling code.\n` +
        `If genuinely intentional, add the ref to BASELINE_BROKEN_REFS in this test ` +
        `(but please leave a comment explaining why).`
    );
});

test('asset-refs — every BASELINE_BROKEN_REFS entry is still actually broken', () => {
    if (FIXED_FROM_BASELINE.length === 0) return;
    assert.fail(
        `${FIXED_FROM_BASELINE.length} BASELINE_BROKEN_REFS entries now resolve in public/:\n` +
        FIXED_FROM_BASELINE.map(r => `  ${r}`).join('\n') +
        `\n\nNice — please REMOVE these from BASELINE_BROKEN_REFS in this test ` +
        `so the ratchet keeps tightening.`
    );
});

test('asset-refs — baseline broken count is exactly what we expect', () => {
    // Snapshot ratchet — surfaces if the baseline gets edited without
    // updating this number (the dual-test above would catch removals,
    // but this catches manual baseline-list additions).
    assert.equal(BASELINE_BROKEN_REFS.size, 4,
        `BASELINE_BROKEN_REFS size changed from 4 to ${BASELINE_BROKEN_REFS.size}. ` +
        `If you added entries, also bump this number; if you removed entries (a fix landed), bump down.`);
});
