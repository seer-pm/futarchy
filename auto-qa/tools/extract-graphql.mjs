#!/usr/bin/env node
/**
 * GraphQL query extractor (auto-qa).
 *
 * Walks `src/**` and pulls out every GraphQL query string we ship to the
 * Checkpoint indexer. Used as the foundation for the schema-compat checker
 * (highest-leverage tool in our backlog — would have caught PRs #62, #63, #65).
 *
 * Detects:
 *   - Tagged template literals: gql`{ … }`
 *   - Plain template literals containing GraphQL keywords (query/mutation/{):
 *       const Q = `query Foo { ... }`
 *       const Q = `{ pools(...) { id } }`
 *       body: JSON.stringify({ query: `{ ... }` })
 *
 * Heuristic: a string counts as GraphQL if it matches /\b(query|mutation|subscription)\s+\w*\s*[({]/
 * OR opens with `\s*\{\s*\w` and contains `(where:` or `(id:` or `(first:`
 * (whitespace allowed after the parenthesis).
 *
 * Output: JSON to stdout — array of {file, line, source, query, length}.
 * `source` is the raw matched template body (for debugging); `query` is the
 * trimmed/normalized form a downstream validator would feed to graphql-js.
 *
 * Usage:
 *   node auto-qa/tools/extract-graphql.mjs            # JSON to stdout
 *   node auto-qa/tools/extract-graphql.mjs --summary  # human-readable count
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL#pathname: on Windows the pathname is "/D:/..." and
// every readdirSync under it fails, so the walk silently finds nothing.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCAN_DIRS = ['src'];
const EXTS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'storybook-static', 'coverage']);

function* walk(dir) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch { return; }
    for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) yield* walk(full);
        else if (st.isFile() && EXTS.has(extname(name))) yield full;
    }
}

// Match any backtick template literal. Conservative: greedy across lines, but
// stops at unescaped backticks. We allow ${...} interpolations inside.
const TEMPLATE_RE = /`((?:\\.|\$\{[\s\S]*?\}|[^`\\])*)`/g;

// A template counts as a GraphQL query if it looks like one. Two shapes:
//   (a) declares a named operation: "query Foo {", "mutation Bar(", etc.
//   (b) anonymous-shorthand query: opens with `{` then a field selection
//       and contains a GraphQL filter idiom (e.g. `(where: ` or `(id: `).
function looksLikeGraphQL(body) {
    const trimmed = body.trim();
    if (/\b(query|mutation|subscription)\s+\w*\s*[({]/.test(trimmed)) return true;
    // Allow whitespace after `(` so multi-line argument lists count too:
    // `candles(` followed by `first: 1,` on the next line.
    if (/^\{\s*\w/.test(trimmed) &&
        /\(\s*(where|id|first|orderBy|skip|after)\s*:/.test(trimmed)) return true;
    return false;
}

// Compute 1-indexed line number for a regex match's index.
function lineForIndex(text, idx) {
    let line = 1;
    for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
}

// Strip leading/trailing whitespace and collapse interior whitespace runs to
// single spaces, but preserve the structure enough that graphql-js can parse.
function normalize(body) {
    return body.replace(/\s+/g, ' ').trim();
}

const queries = [];
for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
        let text;
        try { text = readFileSync(file, 'utf8'); } catch { continue; }
        TEMPLATE_RE.lastIndex = 0;
        let m;
        while ((m = TEMPLATE_RE.exec(text)) !== null) {
            const body = m[1];
            if (!looksLikeGraphQL(body)) continue;
            queries.push({
                // POSIX-style paths so callers can match 'src/hooks/foo.js'
                // regardless of the host OS.
                file: relative(ROOT, file).split(sep).join('/'),
                line: lineForIndex(text, m.index),
                length: body.length,
                source: body,
                query: normalize(body),
            });
        }
    }
}

if (process.argv.includes('--summary')) {
    console.log(`Found ${queries.length} GraphQL queries across ${
        new Set(queries.map(q => q.file)).size
    } files.`);
    const byFile = {};
    for (const q of queries) byFile[q.file] = (byFile[q.file] || 0) + 1;
    for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(3)}  ${f}`);
    }
} else {
    process.stdout.write(JSON.stringify(queries, null, 2) + '\n');
}
