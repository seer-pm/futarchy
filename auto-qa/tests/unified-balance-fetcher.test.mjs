/**
 * unifiedBalanceFetcher spec mirror (auto-qa).
 *
 * Pins src/utils/unifiedBalanceFetcher.js — the wallet's balance +
 * position fetcher used by every page that displays user holdings.
 * Six concerns + one critical safety ratchet + one hazard.
 *
 * Six concerns:
 *
 *   1. ABIs — ERC20 (balanceOf + allowance), ERC1155 (balanceOf +
 *      balanceOfBatch). Drift in either silently breaks every fetch.
 *
 *   2. formatBalanceSafely — a failed read (null) / NaN / throw all map
 *      to null, never '0': a zero balance on an RPC hiccup looks like
 *      the user's funds are gone. NEVER throws.
 *
 *   3. calculateTotal — BigNumber.add of unwrapped + wrapped, formatted
 *      back to ether. null (unknown) if either part failed to load.
 *
 *   4. safeContractCall — wraps every contract call via readOrNull; on
 *      error resolves to null (NOT throw, NOT 0) and records the read in
 *      failedReads, which the result returns so the hook can show an error.
 *
 *   5. balanceOfBatch fallback — if the batch call result is NOT an
 *      array (the read failed), provides 4 null defaults.
 *      Otherwise destructuring positionBalances[0..3] would crash.
 *
 *   6. Defensive config validation — throws on missing config / address
 *      / required config fields (BASE_TOKENS_CONFIG, MERGE_CONFIG,
 *      CONDITIONAL_TOKENS_ADDRESS).
 *
 * SAFETY RATCHET:
 *
 *   R1. SIMULATE_RPC_FAILURE = false — CRITICAL pin. Shipping with
 *       true makes EVERY balance fetch throw / return zeros. Same
 *       pattern as MOCK_MODE in getAlgebraPoolPrice.
 *
 * HAZARD:
 *
 *   H1. UNIFIED-BALANCE log spam — multiple console.log calls per
 *       balance fetch. Pinned via count so a cleanup is deliberate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
    new URL('../../src/utils/unifiedBalanceFetcher.js', import.meta.url),
    'utf8',
);

// --- spec mirror of formatBalanceSafely (null on any failure) ---
function formatBalanceSafelyMirror(balance, formatEther) {
    try {
        if (balance === null || balance === undefined) return null;
        const formatted = formatEther(balance);
        return formatted === 'NaN' ? null : formatted;
    } catch {
        return null;
    }
}

// --- spec mirror of calculateTotal (BigInt-safe to test without ethers) ---
function calculateTotalMirror(unwrapped, wrapped) {
    if (unwrapped === null || wrapped === null) return null;
    try {
        const u = BigInt(unwrapped || '0');
        const w = BigInt(wrapped || '0');
        return (u + w).toString();
    } catch {
        return '0';
    }
}

// ---------------------------------------------------------------------------
// SAFETY RATCHET R1 — SIMULATE_RPC_FAILURE must be false in source
// ---------------------------------------------------------------------------

test('CRITICAL — SIMULATE_RPC_FAILURE is FALSE in production source', () => {
    // Pinned: this flag, when true, makes EVERY balance fetch throw
    // OR return zeros. Same hazard pattern as MOCK_MODE in
    // getAlgebraPoolPrice.js. A regression that flips this true
    // breaks the entire wallet display silently.
    assert.match(SRC,
        /const SIMULATE_RPC_FAILURE\s*=\s*false/,
        `SIMULATE_RPC_FAILURE drifted from false. Setting to true breaks every wallet display ` +
        `with simulated errors. Pinned-as-is per /loop directive.`);
});

test('SHOW_REALISTIC_ERROR pinned at true (when SIMULATE is on, surfaces real-looking errors)', () => {
    // Documents current state. This flag only matters when
    // SIMULATE_RPC_FAILURE is true, but pinning it ensures the test
    // setup intent is preserved.
    assert.match(SRC,
        /const SHOW_REALISTIC_ERROR\s*=\s*true/,
        `SHOW_REALISTIC_ERROR flag drifted from true (debug mode preference)`);
});

test('REALISTIC_ERROR_TYPE pinned at "all_failed" (default debug scenario)', () => {
    assert.match(SRC,
        /const REALISTIC_ERROR_TYPE\s*=\s*['"]all_failed['"]/,
        `REALISTIC_ERROR_TYPE drifted from 'all_failed' (default scenario)`);
});

// ---------------------------------------------------------------------------
// REALISTIC_ERRORS map — 6 documented scenarios
// ---------------------------------------------------------------------------

test('REALISTIC_ERRORS map has 6 documented scenarios (timeout/network/all_failed/invalid_response/rate_limit/chain_mismatch)', () => {
    // Pinned: the map keys must match the 'options' in REALISTIC_ERROR_TYPE
    // jsdoc. A regression that drops a key would yield undefined when
    // that scenario is selected.
    const m = SRC.match(/REALISTIC_ERRORS\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(m, 'REALISTIC_ERRORS map not found');
    const keys = [...m[1].matchAll(/(\w+):\s*['"]/g)].map(x => x[1]);
    const expected = ['timeout', 'network', 'all_failed', 'invalid_response', 'rate_limit', 'chain_mismatch'];
    assert.deepEqual(keys.sort(), expected.sort(),
        `REALISTIC_ERRORS keys drifted from canonical 6 scenarios`);
});

test('REALISTIC_ERRORS map "all_failed" message references "chain 100" (Gnosis hardcode)', () => {
    // Pinned the chain-100 reference. A regression to a different
    // chain in the message would surface as misleading error in UI.
    assert.match(SRC,
        /all_failed:\s*['"]All RPC endpoints failed for chain 100['"]/,
        `all_failed error message drifted from "All RPC endpoints failed for chain 100"`);
});

test('REALISTIC_ERRORS map "chain_mismatch" message references "expected 100, got 1"', () => {
    assert.match(SRC,
        /chain_mismatch:\s*['"]chainId mismatch:\s*expected 100,\s*got 1['"]/,
        `chain_mismatch error message drifted`);
});

// ---------------------------------------------------------------------------
// ABIs — ERC20 + ERC1155
// ---------------------------------------------------------------------------

test('ERC20_ABI — has balanceOf(address) + allowance(owner, spender)', () => {
    assert.match(SRC,
        /ERC20_ABI\s*=\s*\[[\s\S]*?function balanceOf\(address owner\) view returns \(uint256\)[\s\S]*?function allowance\(address owner, address spender\) view returns \(uint256\)/,
        `ERC20_ABI shape drifted from balanceOf + allowance only`);
});

test('ERC1155_ABI — has balanceOf(account, id) + balanceOfBatch(accounts[], ids[])', () => {
    assert.match(SRC,
        /ERC1155_ABI\s*=\s*\[[\s\S]*?function balanceOf\(address account, uint256 id\) view returns \(uint256\)[\s\S]*?function balanceOfBatch\(address\[\] accounts, uint256\[\] ids\) view returns \(uint256\[\]\)/,
        `ERC1155_ABI shape drifted from balanceOf(account,id) + balanceOfBatch`);
});

// ---------------------------------------------------------------------------
// formatBalanceSafely — failed read/NaN/throw all map to null (never '0')
// ---------------------------------------------------------------------------

test('formatBalanceSafely spec mirror — failed read (null) stays null, not "0"', () => {
    assert.equal(formatBalanceSafelyMirror(null, () => 'should not be called'), null);
});

test('formatBalanceSafely spec mirror — undefined balance returns null', () => {
    assert.equal(formatBalanceSafelyMirror(undefined, () => 'should not be called'), null);
});

test('formatBalanceSafely spec mirror — throwing formatter returns null (try/catch)', () => {
    assert.equal(
        formatBalanceSafelyMirror('1000', () => { throw new Error('parse fail'); }),
        null
    );
});

test('formatBalanceSafely spec mirror — formatter returning "NaN" string maps to null', () => {
    // Pinned: a regression that drops the explicit `=== 'NaN'` check
    // would surface "NaN" in the UI.
    assert.equal(
        formatBalanceSafelyMirror('1000', () => 'NaN'),
        null
    );
});

test('formatBalanceSafely spec mirror — a real zero balance still formats', () => {
    assert.equal(formatBalanceSafelyMirror(0n, () => '0.0'), '0.0');
});

test('formatBalanceSafely spec mirror — valid balance passes through formatter', () => {
    assert.equal(
        formatBalanceSafelyMirror('1000', () => '1.5'),
        '1.5'
    );
});

test('source — formatBalanceSafely guards on null + "NaN" string (BOTH paths)', () => {
    // Pinned both guard branches.
    assert.match(SRC,
        /if\s*\(balance\s*===\s*null\s*\|\|\s*balance\s*===\s*undefined\)\s*return\s+null/,
        `formatBalanceSafely null guard shape drifted`);
    assert.match(SRC,
        /formatted\s*===\s*['"]NaN['"]\s*\?\s*null\s*:\s*formatted/,
        `formatBalanceSafely NaN-string guard shape drifted`);
});

// ---------------------------------------------------------------------------
// calculateTotal — sum unwrapped + wrapped
// ---------------------------------------------------------------------------

test('calculateTotal spec mirror — sums unwrapped + wrapped', () => {
    assert.equal(calculateTotalMirror('100', '50'), '150');
});

test('calculateTotal spec mirror — a failed part (null) makes the total unknown', () => {
    assert.equal(calculateTotalMirror(null, '50'), null);
    assert.equal(calculateTotalMirror('100', null), null);
});

test('calculateTotal spec mirror — empty/undefined inputs treated as 0', () => {
    assert.equal(calculateTotalMirror('', ''), '0');
    assert.equal(calculateTotalMirror(undefined, undefined), '0');
});

test('calculateTotal spec mirror — invalid input returns "0" (try/catch)', () => {
    // BigInt('not a number') throws; the catch returns '0'.
    assert.equal(calculateTotalMirror('not a number', '0'), '0');
});

test('source — calculateTotal uses parseUnits/formatUnits with 18 decimals (ether scale)', () => {
    // Pinned: 18 decimals is the canonical ether scale. Drift would
    // silently over/under-count by orders of magnitude.
    assert.match(SRC,
        /parseUnits\(unwrapped\s*\|\|\s*['"]0['"],\s*18\)/,
        `calculateTotal unwrapped parseUnits decimal drifted from 18`);
    assert.match(SRC,
        /parseUnits\(wrapped\s*\|\|\s*['"]0['"],\s*18\)/,
        `calculateTotal wrapped parseUnits decimal drifted from 18`);
    assert.match(SRC,
        /formatUnits\(totalBN,\s*18\)/,
        `calculateTotal formatUnits decimal drifted from 18`);
});

// ---------------------------------------------------------------------------
// safeContractCall — wraps every call; resolves to null on error
// ---------------------------------------------------------------------------

test('source — safeContractCall goes through readOrNull (null + failedReads, NOT 0, NOT throw)', () => {
    // Pinned: a failed read must neither throw (one failed call would sink
    // the whole fetch) nor come back as 0 (looks like the funds are gone).
    assert.match(SRC,
        /async function safeContractCall\(contractCall,\s*description,\s*failed\)\s*\{\s*return readOrNull\(/,
        `safeContractCall must delegate to readOrNull`);
    assert.doesNotMatch(SRC, /BigNumber\.from\(0\)/,
        `no read may fall back to BigNumber.from(0)`);
    assert.match(SRC,
        /return\s*\{\s*\.\.\.formattedBalances,\s*failedReads,\s*totalReads:\s*8\s*\}/,
        `fetchAllBalancesAndPositions must report failedReads/totalReads`);
});

test('source — safeContractCall has the SIMULATE_RPC_FAILURE branch (testing-only)', () => {
    // Pinned: the testing simulation branch lives inside safeContractCall
    // (in addition to a separate one in fetchAllBalancesAndPositions).
    // A regression that consolidates these would change the surface
    // of where simulation failures fire from.
    assert.match(SRC,
        /async function safeContractCall[\s\S]*?if\s*\(SIMULATE_RPC_FAILURE\)\s*\{[\s\S]*?throw new Error/,
        `safeContractCall must contain its own SIMULATE_RPC_FAILURE throw branch`);
});

// ---------------------------------------------------------------------------
// balanceOfBatch fallback — if not array, default to 4 zeros
// ---------------------------------------------------------------------------

test('source — balanceOfBatch result coerced to 4-null array if not array', () => {
    // Pinned: the .then(result => Array.isArray(result) ? result : [4 nulls])
    // pattern. Without this, destructuring positionBalances[0..3] would
    // throw if the batch call failed (safeContractCall resolves to null).
    // Nulls, not zeros: the positions are unknown, not empty.
    assert.match(SRC,
        /\.then\(result\s*=>\s*Array\.isArray\(result\)\s*\?\s*result\s*:\s*\[\s*null,\s*null,\s*null,\s*null\s*\]\)/,
        `balanceOfBatch non-array fallback shape drifted (must default to 4 nulls)`);
});

// ---------------------------------------------------------------------------
// Defensive config validation
// ---------------------------------------------------------------------------

test('source — fetchAllBalancesAndPositions throws when config OR address missing', () => {
    assert.match(SRC,
        /if\s*\(!config\s*\|\|\s*!address\)\s*\{[\s\S]*?throw new Error\(['"]Config and address are required['"]\)/,
        `missing-config/address guard shape drifted`);
});

test('source — fetchAllBalancesAndPositions throws when required config fields missing', () => {
    // Pinned: BASE_TOKENS_CONFIG, MERGE_CONFIG, CONDITIONAL_TOKENS_ADDRESS
    // are all required. A regression that drops the check would surface
    // as a confusing TypeError deeper in the function.
    assert.match(SRC,
        /if\s*\(!BASE_TOKENS_CONFIG\s*\|\|\s*!MERGE_CONFIG\s*\|\|\s*!CONDITIONAL_TOKENS_ADDRESS\)\s*\{[\s\S]*?throw new Error\(['"]Invalid config: missing required fields['"]\)/,
        `required-fields guard shape drifted`);
});

test('source — fetchAllowances throws when config / owner / spender missing', () => {
    assert.match(SRC,
        /if\s*\(!config\s*\|\|\s*!ownerAddress\s*\|\|\s*!spenderAddress\)\s*\{[\s\S]*?throw new Error\(['"]Config, owner, and spender addresses are required['"]\)/,
        `fetchAllowances missing-args guard shape drifted`);
});

// ---------------------------------------------------------------------------
// Default chainId = 100 (Gnosis) at both exports
// ---------------------------------------------------------------------------

test('source — both exports default chainId to 100 (Gnosis)', () => {
    // Pinned: drift to 1 silently routes balance queries to wrong chain.
    assert.match(SRC,
        /export async function fetchAllBalancesAndPositions\(config,\s*address,\s*chainId\s*=\s*100\)/,
        `fetchAllBalancesAndPositions default chainId drifted from 100`);
    assert.match(SRC,
        /export async function fetchAllowances\(config,\s*ownerAddress,\s*spenderAddress,\s*chainId\s*=\s*100\)/,
        `fetchAllowances default chainId drifted from 100`);
});

// ---------------------------------------------------------------------------
// Position IDs batched as 4-tuple (currencyYes/No, companyYes/No)
// ---------------------------------------------------------------------------

test('source — positionIds batch is 4-tuple in canonical order: currencyYes, currencyNo, companyYes, companyNo', () => {
    // Pinned: the destructure later (positionBalances[0..3]) maps
    // back to currencyYes/currencyNo/companyYes/companyNo in this exact
    // order. A regression that re-orders the IDs silently swaps the
    // displayed balances.
    assert.match(SRC,
        /positionIds\s*=\s*\[\s*MERGE_CONFIG\.currencyPositions\.yes\.positionId,\s*MERGE_CONFIG\.currencyPositions\.no\.positionId,\s*MERGE_CONFIG\.companyPositions\.yes\.positionId,\s*MERGE_CONFIG\.companyPositions\.no\.positionId\s*\]/,
        `positionIds order drifted from [currencyYes, currencyNo, companyYes, companyNo]`);
});

test('source — positionBalances destructured in same order as positionIds (mapping invariant)', () => {
    // Pinned: positionBalances[0]=currencyYes, [1]=currencyNo, [2]=companyYes,
    // [3]=companyNo. Drift here silently swaps balances.
    assert.match(SRC,
        /currencyYes:\s*formatBalanceSafely\(positionBalances\[0\]\),\s*currencyNo:\s*formatBalanceSafely\(positionBalances\[1\]\),\s*companyYes:\s*formatBalanceSafely\(positionBalances\[2\]\),\s*companyNo:\s*formatBalanceSafely\(positionBalances\[3\]\)/,
        `positionBalances destructure order drifted from [currencyYes, currencyNo, companyYes, companyNo]`);
});

test('source — balanceOfBatch passes Array(positionIds.length).fill(address) (same address replicated)', () => {
    // Pinned: ERC1155 balanceOfBatch requires accounts[] AND ids[] of
    // SAME length. A regression that passes [address] (length 1)
    // would fail the ABI's "length mismatch" check.
    assert.match(SRC,
        /balanceOfBatch\(\s*Array\(positionIds\.length\)\.fill\(address\),\s*positionIds\s*\)/,
        `balanceOfBatch accounts-array shape drifted (must replicate address positionIds.length times)`);
});

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

test('source — uses getBestRpcProvider (NOT direct ethers.JsonRpcProvider)', () => {
    // Pinned: the file delegates RPC selection to getBestRpc.js's
    // proven RPC-rotation logic. A regression that hardcodes a
    // provider would lose the multi-RPC fallback.
    assert.match(SRC,
        /import\s*\{\s*getBestRpcProvider\s*\}\s*from\s*['"]\.\/getBestRpc['"]/,
        `must import getBestRpcProvider (NOT direct ethers.JsonRpcProvider)`);
    assert.match(SRC,
        /provider\s*=\s*await\s+getBestRpcProvider\(chainId\)/,
        `must call getBestRpcProvider(chainId) for the provider`);
});

// ---------------------------------------------------------------------------
// HAZARD H1 — UNIFIED-BALANCE log spam
// ---------------------------------------------------------------------------

test('hazard H1 — UNIFIED-BALANCE log spam (count pinned for cleanup tracking)', () => {
    // PINNED HAZARD: many console.log calls per balance fetch fire on
    // every page load. Pinned via count assertion so a cleanup pass
    // flags the test for deletion.
    const matches = [...SRC.matchAll(/\[UNIFIED-BALANCE\]/g)];
    assert.ok(matches.length >= 15,
        `UNIFIED-BALANCE log count dropped below 15 — likely a cleanup pass; ` +
        `update the count in this test (or delete it if all logs gone)`);
});

// ---------------------------------------------------------------------------
// Native balance via provider.getBalance (NOT a contract call)
// ---------------------------------------------------------------------------

test('source — native balance fetched via provider.getBalance (NOT ERC20 balanceOf)', () => {
    // Pinned: ETH/xDAI native balance comes from the RPC's getBalance
    // method, not from a token contract. A regression that wraps it
    // as an ERC20 contract call would always return 0 (no contract
    // at address(0)).
    assert.match(SRC,
        /provider\.getBalance\(address\)/,
        `native balance must use provider.getBalance(address) — NOT a contract balanceOf call`);
});
