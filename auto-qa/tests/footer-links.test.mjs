/**
 * Footer NAV_LINKS structural lint (auto-qa).
 *
 * Pins the structural invariants of the Footer's NAV_LINKS array. Two
 * concerns it catches:
 *
 *   (a) Mis-shaped entries (missing label/href, or `external: true` on
 *       a path-relative href, which would render as a broken absolute
 *       link)
 *   (b) Documentation and Status are currently absent. They pointed at
 *       the upstream project's docs and status sites, which this fork
 *       must not link to, and were commented out pending Seer
 *       equivalents. This pins that absence so the upstream URLs cannot
 *       reappear, and names the accepted values for when they return.
 *
 * Static-grep style — no import, since the Footer is a Next.js JSX file
 * and node:test's strict ESM doesn't resolve extension-less relative
 * imports the way Next does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FOOTER_PATH = new URL('../../src/components/common/Footer.jsx', import.meta.url);

function parseNavLinks() {
    const src = readFileSync(FOOTER_PATH, 'utf8');
    const m = src.match(/const NAV_LINKS = \[([\s\S]*?)\];/);
    assert.ok(m, 'NAV_LINKS array not found in Footer.jsx — has the file been refactored?');

    // Drop `//` comment lines before scanning for object literals: a
    // commented-out entry is not a rendered link, and the naive brace
    // scan below would otherwise treat it as one.
    const body = m[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    // Pull each `{ ... }` object literal out of the array body. Avoids
    // pulling in a JS parser dep — the array shape is small and stable.
    const entries = [];
    const re = /\{\s*([^{}]+?)\s*\}/g;
    let item;
    while ((item = re.exec(body)) !== null) {
        const obj = {};
        // Match key: value pairs. Handles single-quoted strings and bare
        // booleans.
        const pairRe = /(\w+)\s*:\s*('([^']*)'|true|false)/g;
        let p;
        while ((p = pairRe.exec(item[1])) !== null) {
            obj[p[1]] = p[3] !== undefined ? p[3]
                      : p[2] === 'true' ? true
                      : p[2] === 'false' ? false : p[2];
        }
        entries.push(obj);
    }
    return entries;
}

const NAV_LINKS = parseNavLinks();

test('Footer parser — extracts at least one NAV_LINKS entry', () => {
    assert.ok(NAV_LINKS.length > 0,
        'NAV_LINKS parsed as empty — the regex extractor is broken or the array is empty.');
});

test('Footer — every NAV_LINKS entry has a label and an href', () => {
    for (const e of NAV_LINKS) {
        assert.ok(typeof e.label === 'string' && e.label.length > 0,
            `entry missing label: ${JSON.stringify(e)}`);
        assert.ok(typeof e.href === 'string' && e.href.length > 0,
            `entry missing href: ${JSON.stringify(e)}`);
    }
});

test('Footer — `external: true` entries have an absolute http(s) href', () => {
    for (const e of NAV_LINKS) {
        if (e.external === true) {
            assert.ok(/^https?:\/\//.test(e.href),
                `entry "${e.label}" is marked external but href is not absolute: ${e.href}`);
        }
    }
});

test('Footer — non-external entries have a path-relative href', () => {
    for (const e of NAV_LINKS) {
        if (e.external !== true) {
            assert.ok(e.href.startsWith('/'),
                `entry "${e.label}" is not marked external but href is not path-relative: ${e.href}. ` +
                `If the link is external, set external: true.`);
        }
    }
});

test('Documentation and Status do not point at the upstream project', () => {
    // Both entries are commented out in the Footer while this fork has no
    // docs or status site of its own. Linking them at docs.futarchy.fi /
    // status.futarchy.fi would send users to the project we forked from,
    // so the one thing this must never allow is those hosts coming back.
    const FORBIDDEN_HOST = 'futarchy.fi';
    for (const e of NAV_LINKS) {
        assert.ok(!e.href.includes(FORBIDDEN_HOST),
            `NAV_LINKS entry "${e.label}" points at the upstream project: ${e.href}`);
    }

    // When these come back, they must carry a real destination — an entry
    // with an empty href renders as a dead link.
    const ACCEPTED = {
        Documentation: new Set(['/documents', '/docs']),
        Status: new Set([]),
    };
    for (const label of Object.keys(ACCEPTED)) {
        const entry = NAV_LINKS.find(e => e.label === label);
        if (!entry) continue;  // still commented out — that is the expected state
        assert.ok(entry.href, `"${label}" is present but has no href`);
        if (ACCEPTED[label].size) {
            assert.ok(ACCEPTED[label].has(entry.href),
                `"${label}" href "${entry.href}" is not in the accepted set ` +
                `[${[...ACCEPTED[label]].join(', ')}]. Fix the link or widen the set here.`);
        }
    }
});
