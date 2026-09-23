/**
 * Footer SOCIAL_LINKS structural lint (auto-qa).
 *
 * This file used to lint NAV_LINKS, which held Companies, Documentation
 * and Status. Documentation and Status pointed at the upstream project
 * and were dropped when this fork was rebranded; Companies then became
 * the homepage, so the whole "Navigate" column went with it. SOCIAL_LINKS
 * is what is left, and it carries the same two concerns:
 *
 *   (a) Mis-shaped entries (missing src/alt/href, or a non-absolute href
 *       on a link that renders with target="_blank")
 *   (b) No link may point back at the project this repo was forked from.
 *       That is the invariant the rebrand exists to protect, so it is
 *       pinned here rather than left to review.
 *
 * Also checks that each icon actually exists under public/ — a broken
 * src renders as an empty 40x40 box in the footer.
 *
 * Static-grep style — no import, since the Footer is a Next.js JSX file
 * and node:test's strict ESM doesn't resolve extension-less relative
 * imports the way Next does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const FOOTER_PATH = new URL('../../src/components/common/Footer.jsx', import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseSocialLinks() {
    const src = readFileSync(FOOTER_PATH, 'utf8');
    const m = src.match(/const SOCIAL_LINKS = \[([\s\S]*?)\];/);
    assert.ok(m, 'SOCIAL_LINKS array not found in Footer.jsx — has the file been refactored?');

    // Drop `//` comment lines before scanning for object literals: a
    // commented-out entry is not a rendered link, and the naive brace
    // scan below would otherwise treat it as one.
    const body = m[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    const entries = [];
    const re = /\{\s*([^{}]+?)\s*\}/g;
    let item;
    while ((item = re.exec(body)) !== null) {
        const obj = {};
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

const SOCIAL_LINKS = parseSocialLinks();

test('Footer parser — extracts at least one SOCIAL_LINKS entry', () => {
    assert.ok(SOCIAL_LINKS.length > 0,
        'parsed zero SOCIAL_LINKS entries — the parser or the array shape drifted');
});

test('Footer — every SOCIAL_LINKS entry has src, alt and href', () => {
    for (const e of SOCIAL_LINKS) {
        assert.ok(e.src, `entry missing src: ${JSON.stringify(e)}`);
        assert.ok(e.alt, `entry missing alt: ${JSON.stringify(e)}`);
        assert.ok(e.href, `entry missing href: ${JSON.stringify(e)}`);
    }
});

test('Footer — every social href is an absolute http(s) URL', () => {
    // These render with target="_blank"; a path-relative href would open
    // a dead tab on our own origin.
    for (const e of SOCIAL_LINKS) {
        assert.match(e.href, /^https?:\/\//,
            `entry "${e.alt}" href is not absolute: ${e.href}`);
    }
});

test('Footer — no link points at the upstream project', () => {
    // The whole point of the rebrand: this fork must not send users to
    // futarchy.fi. Cheap ratchet against a copy-paste regression.
    for (const e of SOCIAL_LINKS) {
        assert.ok(!e.href.includes('futarchy.fi'),
            `social entry "${e.alt}" points at the upstream project: ${e.href}`);
    }
});

test('Footer — every social icon exists under public/', () => {
    for (const e of SOCIAL_LINKS) {
        const expected = resolve(REPO_ROOT, 'public', e.src.replace(/^\//, ''));
        assert.ok(existsSync(expected),
            `icon for "${e.alt}" does not exist at ${expected}`);
    }
});
