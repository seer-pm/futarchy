/**
 * Balancer spot fallback: "no pool" is an empty result, not an error (auto-qa).
 *
 * Pins src/hooks/useLatestPrices.js:fetchBalancerSpotPrice. Most markets
 * have no Balancer pool for the base company/currency pair, so the lookup
 * used to throw and log console.error on every market page load and every
 * 30 s poll. Production keeps console.error/warn (next.config removeConsole
 * excludes them), so that showed up as error noise on every page.
 *
 * Now a missing pool returns null (the caller already handles null via
 * `balancerSpotPrice?.price`), and real fetch failures are logged once, by
 * the caller, as warnings.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../src/hooks/useLatestPrices.js', import.meta.url), 'utf8');
const fnBody = src.slice(
  src.indexOf('const fetchBalancerSpotPrice'),
  src.indexOf('const useLatestPrices'),
);

test('source — a missing Balancer pool returns null instead of throwing', () => {
  assert.doesNotMatch(fnBody, /throw new Error\(['"]No Balancer pool/);
  assert.match(fnBody, /if \(!matchingPool\) \{[\s\S]*?return null;/);
});

test('source — fetchBalancerSpotPrice does not console.error (caller logs once)', () => {
  assert.doesNotMatch(fnBody, /console\.error/);
});

test('source — spot fetch failures are warnings, not errors', () => {
  assert.doesNotMatch(src, /console\.error\('\[SPOT\] (Primary spot price fetch failed|Balancer fallback also failed)/);
  assert.match(src, /console\.warn\('\[SPOT\] Primary spot price fetch failed/);
});

test('source — the caller tolerates a null Balancer result', () => {
  assert.match(src, /balancerSpotPrice\?\.price/);
});
