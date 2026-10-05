/**
 * The API host the live auto-qa tier talks to: the same one the app uses.
 *
 * Order: AUTO_QA_API_BASE (explicit override for a run), then the build's
 * NEXT_PUBLIC_FUTARCHY_API_URL, then the DEFAULT_API_BASE literal in
 * src/config/subgraphEndpoints.js. Reading the literal keeps the probes on
 * whichever deployment a default build would query, instead of a host name
 * copied here that can fall behind.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ENDPOINTS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/config/subgraphEndpoints.js');

export function resolveApiBase() {
    const fromEnv = process.env.AUTO_QA_API_BASE || process.env.NEXT_PUBLIC_FUTARCHY_API_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const text = readFileSync(ENDPOINTS_FILE, 'utf8');
    const m = text.match(/DEFAULT_API_BASE\s*=\s*['"`](https?:\/\/[^'"`]+)['"`]/);
    if (!m) throw new Error(`DEFAULT_API_BASE not found in ${ENDPOINTS_FILE}`);
    return m[1].replace(/\/+$/, '');
}
