/**
 * proposalDocumentationStore spec mirror (auto-qa).
 *
 * Pins src/utils/proposalDocumentationStore.js — a singleton
 * module-level store for "user-created proposal" demo data with an
 * HTML→markdown converter. Currently has ZERO importers in the
 * codebase (dead module). Pinned because:
 *
 *   1. Each call to setProposalDocumentationData triggers SEVEN
 *      module-level console.log lines (raw topics + per-topic before/
 *      after + final combined + final stored). If anyone ever imports
 *      and uses this in production, the logs flood. Pinned as a
 *      hazard ratchet.
 *   2. The convertToMarkdown rules are non-obvious (strips <ul>/<ol>,
 *      replaces <li> with "- ", &nbsp; with space, etc.). A regression
 *      that drops a rule would silently produce malformed markdown.
 *   3. Hardcoded asset paths (/assets/seer-logo.svg,
 *      /assets/protocol-upgrade-banner.png) — must exist in public/
 *      or any rendering caller would 404 on those images.
 *   4. Module-level mutable state pattern (`let proposalDocumentationData = null`).
 *      Initial getter call returns null. Singleton pinned.
 *
 * Per the /loop directive: dead module is left as-is. The test
 * documents the hazards so a future cleanup is deliberate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = readFileSync(
    new URL('../../src/utils/proposalDocumentationStore.js', import.meta.url),
    'utf8',
);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// --- spec mirror of the inner convertToMarkdown function ---
function convertToMarkdown(htmlContent, topicNumber) {
    const sectionHeader = `### Section ${topicNumber}\n`;
    const converted = htmlContent
        .replace(/<h[1-6]>/g, '')
        .replace(/<\/h[1-6]>/g, '\n')
        .replace(/<ul>/g, '')
        .replace(/<\/ul>/g, '')
        .replace(/<ol>/g, '')
        .replace(/<\/ol>/g, '')
        .replace(/<li>/g, '- ')
        .replace(/<\/li>/g, '\n')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n\n')
        .replace(/&nbsp;/g, ' ')
        .trim();
    return `${sectionHeader}${converted}`;
}

// ---------------------------------------------------------------------------
// convertToMarkdown — section header is always present
// ---------------------------------------------------------------------------

test('convertToMarkdown — emits "### Section N" header before content', () => {
    const r = convertToMarkdown('<p>Hello</p>', 3);
    assert.match(r, /^### Section 3\n/,
        `each topic must be prefixed with "### Section <n>\\n"`);
});

test('convertToMarkdown — empty input still emits the section header', () => {
    const r = convertToMarkdown('', 1);
    assert.equal(r, '### Section 1\n',
        `empty content must still produce a header (no orphan content lines)`);
});

// ---------------------------------------------------------------------------
// convertToMarkdown — HTML tag stripping rules
// ---------------------------------------------------------------------------

test('convertToMarkdown — <h1>..<h6> open tags stripped, close → newline', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
        // Use h<level>Title</h<level>><p>x</p> so the \n after </h>
        // sits BEFORE non-whitespace and survives trim().
        const r = convertToMarkdown(`<h${level}>Title</h${level}><p>x</p>`, 1);
        assert.match(r, /Title\n/,
            `h${level} close must emit "Title\\n" before subsequent content`);
        assert.doesNotMatch(r, new RegExp(`<h${level}>`),
            `h${level} open tag must be stripped`);
    }
});

test('convertToMarkdown — <ul>/<ol> wrappers stripped entirely (open + close)', () => {
    const r = convertToMarkdown('<ul><li>One</li><li>Two</li></ul>', 1);
    assert.doesNotMatch(r, /<\/?ul>/,
        `<ul></ul> wrappers must be stripped`);
    const r2 = convertToMarkdown('<ol><li>One</li></ol>', 1);
    assert.doesNotMatch(r2, /<\/?ol>/,
        `<ol></ol> wrappers must be stripped`);
});

test('convertToMarkdown — <li> opens with "- ", closes with newline', () => {
    const r = convertToMarkdown('<li>Item A</li><li>Item B</li>', 1);
    assert.match(r, /- Item A\n/);
    // Last </li> -> "\n" but trim() strips it. Match end-of-string.
    assert.match(r, /- Item B$/);
    assert.doesNotMatch(r, /<\/?li>/);
});

test('convertToMarkdown — <p> stripped on open, </p> → "\\n\\n"', () => {
    const r = convertToMarkdown('<p>First</p><p>Second</p>', 1);
    assert.match(r, /First\n\n/);
    // After trim, trailing \n\n on the LAST </p> is consumed.
    assert.doesNotMatch(r, /<\/?p>/);
});

test('convertToMarkdown — &nbsp; replaced with single space', () => {
    const r = convertToMarkdown('<p>foo&nbsp;bar&nbsp;baz</p>', 1);
    assert.match(r, /foo bar baz/);
    assert.doesNotMatch(r, /&nbsp;/);
});

test('convertToMarkdown — output is trimmed (no leading/trailing whitespace on body)', () => {
    // The trim() applies to `converted`, BEFORE the section header is
    // prepended. So the section header may sit alone, but no surrounding
    // whitespace on the body itself.
    const r = convertToMarkdown('   <p>X</p>   ', 1);
    // Header is always "### Section 1\n", then the trimmed body.
    // Body after replacements: "   X\n\n   " → trim → "X"
    assert.equal(r, '### Section 1\nX',
        `whitespace must be trimmed AFTER tag conversion`);
});

// ---------------------------------------------------------------------------
// convertToMarkdown — what it does NOT handle (silent corruption surface)
// ---------------------------------------------------------------------------

test('convertToMarkdown — DOES NOT escape <script>/<style>/<iframe> tags (XSS surface)', () => {
    // PINNED HAZARD: the converter strips a small whitelist of tags
    // (h1-6, ul, ol, li, p) but passes everything else through. If this
    // module were ever wired into a renderer that uses dangerouslySet
    // InnerHTML on the output, a <script> tag in topic content would
    // execute. Per the /loop directive: leave the bug, pin the surface.
    const r = convertToMarkdown('<script>alert(1)</script>', 1);
    assert.match(r, /<script>alert\(1\)<\/script>/,
        `script tag passes through verbatim — XSS hazard if rendered as HTML`);
});

test('convertToMarkdown — DOES NOT handle <h1 class="foo"> (only bare <h1>)', () => {
    // The regex /<h[1-6]>/g requires the tag to have NO attributes.
    // <h1 class="..."> would survive. Pinned because real rich-text
    // editors output attributes (class, style, id).
    const r = convertToMarkdown('<h1 class="foo">Title</h1>', 1);
    assert.match(r, /<h1 class="foo">Title/,
        `<h1> with attributes is NOT stripped — silent rendering corruption`);
});

test('convertToMarkdown — DOES NOT handle <ul> with attributes', () => {
    const r = convertToMarkdown('<ul class="bullet"><li>x</li></ul>', 1);
    assert.match(r, /<ul class="bullet">/,
        `<ul> with attributes is NOT stripped`);
});

// ---------------------------------------------------------------------------
// Multiple topics — joined with "\n\n"
// ---------------------------------------------------------------------------

test('multi-topic — topics joined with "\\n\\n" separator', () => {
    // Spec mirror of the .map(...).join('\n\n') inside the setter.
    function multi(topics) {
        return topics.map((t, i) => convertToMarkdown(t.content, i + 1)).join('\n\n');
    }
    const r = multi([{ content: '<p>A</p>' }, { content: '<p>B</p>' }]);
    assert.match(r, /### Section 1\nA\n\n### Section 2\nB/,
        `multiple topics must be joined with "\\n\\n"`);
});

// ---------------------------------------------------------------------------
// Hardcoded asset paths — must exist in public/
// ---------------------------------------------------------------------------

test('hardcoded assets — /assets/seer-logo.svg exists in public/', () => {
    // If this dead module is ever revived, the asset paths it bakes
    // in must still resolve. Cross-checks against the asset-refs
    // baseline ratchet pattern.
    assert.match(SRC, /\/assets\/seer-logo\.svg/,
        `hardcoded company.logo path drifted`);
    const expected = resolve(REPO_ROOT, 'public/assets/seer-logo.svg');
    assert.ok(existsSync(expected),
        `hardcoded /assets/seer-logo.svg does not exist at ${expected}`);
});

test('hardcoded assets — /assets/protocol-upgrade-banner.png exists in public/', () => {
    assert.match(SRC, /\/assets\/protocol-upgrade-banner\.png/,
        `hardcoded heroContent.image path drifted`);
    const expected = resolve(REPO_ROOT, 'public/assets/protocol-upgrade-banner.png');
    assert.ok(existsSync(expected),
        `hardcoded /assets/protocol-upgrade-banner.png does not exist at ${expected}`);
});

// ---------------------------------------------------------------------------
// Singleton state shape — initial null, fields after set
// ---------------------------------------------------------------------------

test('singleton — getter returns null when no setter has been called', async () => {
    // Fresh module load: pre-set state must be null. Importing the
    // module re-runs the `let proposalDocumentationData = null;`
    // initializer.
    const mod = await import(`../../src/utils/proposalDocumentationStore.js?singleton-${Date.now()}`);
    assert.equal(mod.getProposalDocumentationData(), null,
        `getter must return null before any set`);
});

// ---------------------------------------------------------------------------
// Hardcoded "USER-1" / "Draft" defaults — pin to catch silent rename
// ---------------------------------------------------------------------------

test('singleton — proposalId is hardcoded to "USER-1" in the stored shape', () => {
    // Pinned because a renderer keying on this id (or filtering it out)
    // would break if the constant ever changed.
    assert.match(SRC, /proposalId:\s*["']USER-1["']/,
        `proposalId hardcoded to "USER-1" — drift would break any consumer keying on it`);
});

test('singleton — endTime defaults to NOW + 5 days (86400 * 5 seconds)', () => {
    // Pinned because the duration affects whether the demo proposal
    // appears "active" or "ended" in any renderer.
    assert.match(SRC, /Date\.now\(\)\s*\/\s*1000\s*\+\s*86400\s*\*\s*5/,
        `endTime drifted from "now + 5 days" — affects active/ended determination`);
});

// ---------------------------------------------------------------------------
// Dead-module + console.log hazard pin
// ---------------------------------------------------------------------------

test('hazard pin — setProposalDocumentationData has multiple console.log statements', () => {
    // PINNED HAZARD: the setter logs at SEVEN places (raw topics, per-
    // topic conversion before/after, per-topic post-conversion preview,
    // final combined markdown, final stored object). If the module is
    // ever imported into a real code path, every set call floods the
    // browser console / Next.js terminal. Per /loop directive: leave
    // the noise, pin the surface so a cleanup is deliberate.
    const logs = [...SRC.matchAll(/console\.log\(/g)];
    assert.ok(logs.length >= 6,
        `expected >=6 console.log calls in proposalDocumentationStore.js (hazard pin); got ${logs.length}. ` +
        `If they were cleaned up, that's progress — adjust this test (or delete if module is gone).`);
});

test('hazard pin — module is currently DEAD CODE (zero importers in src/)', async () => {
    // Pinned because the console.log hazard is contained ONLY by the
    // module having no importers. If it ever gets imported, the hazard
    // becomes real.
    //
    // Reverse-engineered grep: scan src/ for any non-self reference.
    const { execSync } = await import('node:child_process');
    const cmd = `grep -r "proposalDocumentationStore\\|setProposalDocumentationData\\|getProposalDocumentationData" --include="*.js" --include="*.jsx" ${REPO_ROOT}/src/ 2>/dev/null || true`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const refs = out.split('\n').filter(line => {
        if (!line.trim()) return false;
        // Exclude self (the module itself defining these names).
        if (line.includes('src/utils/proposalDocumentationStore.js')) return false;
        return true;
    });
    assert.equal(refs.length, 0,
        `proposalDocumentationStore.js is no longer dead code — it now has importers:\n` +
        `${refs.join('\n')}\n` +
        `Either the hazard is now real (verify console.log noise is acceptable) ` +
        `or this test should be updated to reflect the new state.`);
});
