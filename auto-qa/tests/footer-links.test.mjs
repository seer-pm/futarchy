/**
 * Footer links structural lint (auto-qa).
 *
 * The footer is the kit's EcosystemFooter: its Ecosystem and Resources columns and the social
 * links come from @seer-pm/ui-kit, and Futarchy adds one column of its own, FUTARCHY_LINKS in
 * common/Footer.jsx. Two concerns are pinned for both sets:
 *
 *   (a) Mis-shaped entries (missing name/url), and external links that are not absolute URLs.
 *       External links open in a new tab, where a path-relative URL lands on a dead page.
 *   (b) No link may point at futarchy.fi, the project this repo was forked from.
 *
 * Futarchy's own links are read from the source (static grep, since node:test's strict ESM does
 * not resolve the extension-less JSX imports Next does); the kit's links are imported.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seerFooterGroups, seerSocialLinks } from '@seer-pm/ui-kit';

const FOOTER_PATH = new URL('../../src/components/common/Footer.jsx', import.meta.url);
const FOOTER_SRC = readFileSync(FOOTER_PATH, 'utf8');

function parseFutarchyLinks() {
    const m = FOOTER_SRC.match(/const FUTARCHY_LINKS = \[([\s\S]*?)\];/);
    assert.ok(m, 'FUTARCHY_LINKS array not found in Footer.jsx. Has the file been refactored?');
    const body = m[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const entries = [];
    const re = /\{\s*([^{}]+?)\s*\}/g;
    let item;
    while ((item = re.exec(body)) !== null) {
        const obj = {};
        const pairRe = /(\w+)\s*:\s*'([^']*)'/g;
        let p;
        while ((p = pairRe.exec(item[1])) !== null) obj[p[1]] = p[2];
        entries.push(obj);
    }
    return entries;
}

const FUTARCHY_LINKS = parseFutarchyLinks();
const KIT_LINKS = [...seerFooterGroups.flatMap(group => group.links), ...seerSocialLinks];

test('Footer renders the kit EcosystemFooter', () => {
    assert.match(FOOTER_SRC, /from "@seer-pm\/ui-kit\/react"/);
    assert.match(FOOTER_SRC, /<EcosystemFooter/);
});

test('Footer parser extracts at least one FUTARCHY_LINKS entry', () => {
    assert.ok(FUTARCHY_LINKS.length > 0,
        'parsed zero FUTARCHY_LINKS entries: the parser or the array shape drifted');
});

test('Footer: every link has a name and a url', () => {
    for (const e of [...FUTARCHY_LINKS, ...KIT_LINKS]) {
        assert.ok(e.name, `entry missing name: ${JSON.stringify(e)}`);
        assert.ok(e.url, `entry missing url: ${JSON.stringify(e)}`);
    }
});

test('Footer: links are app paths or absolute http(s) URLs', () => {
    for (const e of [...FUTARCHY_LINKS, ...KIT_LINKS]) {
        assert.match(e.url, /^(\/|https?:\/\/)/, `entry "${e.name}" url is neither: ${e.url}`);
    }
});

test('Footer: no link points at the upstream project', () => {
    for (const e of [...FUTARCHY_LINKS, ...KIT_LINKS]) {
        assert.ok(!e.url.includes('futarchy.fi'),
            `footer entry "${e.name}" points at the upstream project: ${e.url}`);
    }
});
