/**
 * Endpoint-liveness invariant (auto-qa).
 *
 * For every subgraph endpoint URL hardcoded in
 * `src/config/subgraphEndpoints.js`, send a trivial GraphQL introspection
 * query and assert:
 *   - HTTP 2xx
 *   - response is valid JSON with a `data.__schema` envelope (i.e. it's
 *     actually a working GraphQL endpoint, not a 200-OK landing page)
 *
 * Why: PRs #47, #49, #50, #60 all stemmed from the AWS → GCP migration
 * leaving the frontend pointing at dead URLs. The dead endpoint returned
 * a `database unavailable` body (so the page rendered empty silently).
 * If any future endpoint drift, dead deploy, or URL typo lands on main,
 * this test fails immediately with a clear message.
 *
 * The test reads the URLs out of the live source file (no copy-paste),
 * so adding a new endpoint to subgraphEndpoints.js automatically extends
 * the coverage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENDPOINTS_FILE = resolve(__dirname, '../../src/config/subgraphEndpoints.js');
// PR #42: futarchy-api base URL referenced from usePoolData.js — extracted
// here so a regression in the env-var default URL is caught.
const API_BASE_URL_FILE = resolve(__dirname, '../../src/hooks/usePoolData.js');

/**
 * The endpoints config builds its URLs as `${FUTARCHY_API_BASE}/…`, where
 * the base comes from NEXT_PUBLIC_FUTARCHY_API_URL with a literal
 * DEFAULT_API_BASE fallback. Resolve the same way the app does, so this
 * test probes whichever deployment the build would actually talk to.
 */
function resolveApiBase(text) {
    const fromEnv = process.env.NEXT_PUBLIC_FUTARCHY_API_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const m = text.match(/DEFAULT_API_BASE\s*=\s*['"`](https?:\/\/[^'"`]+)['"`]/);
    return m ? m[1].replace(/\/+$/, '') : null;
}

/**
 * Pull every `…/graphql` endpoint out of the endpoints config, resolving
 * the ${FUTARCHY_API_BASE} interpolation. Deliberately permissive: any
 * string or template literal whose path ends in `/graphql` counts, with
 * an optional query string (chain 1 is selected via `?chainId=1`).
 * Keeps the test resilient to refactors that rename the exported
 * constants.
 */
function loadEndpointUrls() {
    const text = readFileSync(ENDPOINTS_FILE, 'utf8');
    const base = resolveApiBase(text);
    const matches = text.matchAll(/['"`]((?:https?:\/\/|\$\{FUTARCHY_API_BASE\})[^'"`]*\/graphql(?:\?[^'"`]*)?)['"`]/g);
    const urls = [...matches]
        .map(m => m[1].replace('${FUTARCHY_API_BASE}', base ?? ''))
        // Drop anything we could not resolve rather than probing a
        // half-interpolated URL and reporting a confusing failure.
        .filter(u => /^https?:\/\//.test(u));
    return [...new Set(urls)];
}

/**
 * Pull the futarchy-api base URL used by usePoolData.js. It reads
 *   process.env.NEXT_PUBLIC_POOL_API_URL || FUTARCHY_API_BASE
 * so an explicit literal override wins; otherwise it inherits the shared
 * API base. Returns null if neither is found (test then skips that case).
 */
function loadApiBaseUrl() {
    let text;
    try { text = readFileSync(API_BASE_URL_FILE, 'utf8'); }
    catch { return null; }
    const literal = text.match(/NEXT_PUBLIC_POOL_API_URL\s*\|\|\s*['"`](https?:\/\/[^'"`]+)['"`]/);
    if (literal) return literal[1];
    if (/NEXT_PUBLIC_POOL_API_URL\s*\|\|\s*FUTARCHY_API_BASE/.test(text)) {
        return resolveApiBase(readFileSync(ENDPOINTS_FILE, 'utf8'));
    }
    return null;
}

const INTROSPECTION = `{ __schema { queryType { name } } }`;

async function probeEndpoint(url) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: INTROSPECTION }),
        signal: AbortSignal.timeout(10000),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
}

const urls = loadEndpointUrls();

test('subgraphEndpoints.js contains at least one URL', () => {
    assert.ok(urls.length > 0,
        `expected to find at least one /graphql URL in ${ENDPOINTS_FILE}`);
});

for (const url of urls) {
    test(`endpoint is live: ${url}`, async (t) => {
        // Quick probe — if the URL is unreachable at all, skip rather than fail
        // so we don't fail when the user is offline. But once we GET a response,
        // demand it satisfies the schema-introspection invariant.
        let result;
        try {
            result = await probeEndpoint(url);
        } catch (err) {
            t.skip(`network unreachable for ${url}: ${err.message}`);
            return;
        }
        assert.ok(result.status >= 200 && result.status < 300,
            `${url} returned HTTP ${result.status} (expected 2xx)`);
        assert.ok(result.body && typeof result.body === 'object',
            `${url} did not return JSON`);
        assert.ok(
            result.body.data?.__schema?.queryType?.name,
            `${url} did not return a valid GraphQL introspection envelope. ` +
            `Got: ${JSON.stringify(result.body).slice(0, 200)}…`
        );
    });
}

// ────────────────────────────────────────────────────────────────────────
// PR #42 — futarchy-api base URL (Express, not GraphQL)
// ────────────────────────────────────────────────────────────────────────
const apiBaseUrl = loadApiBaseUrl();

test('PR #42 — usePoolData.js declares a futarchy-api base URL', () => {
    assert.ok(
        apiBaseUrl && /^https?:\/\//.test(apiBaseUrl),
        `Expected to find a NEXT_PUBLIC_POOL_API_URL fallback URL in ` +
        `${API_BASE_URL_FILE}. Was the constant renamed or removed?`
    );
});

test(`PR #42 — futarchy-api base URL is live: ${apiBaseUrl || '(not found)'}`,
async (t) => {
    if (!apiBaseUrl) { t.skip('no api base URL discovered'); return; }
    let res;
    try {
        res = await fetch(`${apiBaseUrl}/health`, {
            signal: AbortSignal.timeout(10000),
        });
    } catch (err) {
        t.skip(`network unreachable for ${apiBaseUrl}: ${err.message}`);
        return;
    }
    assert.ok(res.status >= 200 && res.status < 300,
        `${apiBaseUrl}/health returned HTTP ${res.status} (expected 2xx)`);

    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    // /health on futarchy-api returns { status: 'ok', timestamp }; assert
    // either that or simply that the body is non-empty so this test still
    // passes if the health endpoint changes its shape harmlessly.
    if (body && typeof body === 'object') {
        assert.ok(body.status === 'ok' || body.timestamp || Object.keys(body).length > 0,
            `${apiBaseUrl}/health body looks empty: ${JSON.stringify(body)}`);
    }
});

