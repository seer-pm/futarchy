/**
 * Required chain while the market config loads (auto-qa).
 *
 * The swap, collateral and redemption modals each load the market config
 * themselves. They used to call useRequiredChain(config?.chainId || 100), so
 * until the config arrived a mainnet market was treated as a Gnosis market:
 * the modal said "This market is on Gnosis Chain" and offered "Switch to
 * Gnosis Chain". Now the chain is unknown (isWrongChain → false) until the
 * config loads, and submit handlers refuse to send while it is unknown.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const HOOK = read('hooks/useChainValidation.js');
const MODALS = {
    ConfirmSwapModal: read('components/futarchyFi/marketPage/ConfirmSwapModal.jsx'),
    CollateralModal: read('components/futarchyFi/marketPage/collateralModal/CollateralModal.jsx'),
    RedemptionModal: read('components/futarchyFi/marketPage/redeemTokens/RedemptionModal.jsx'),
};

test('useRequiredChain has no default chain and exposes isChainUnknown', () => {
    assert.match(HOOK, /export const useRequiredChain = \(requiredChainId\) =>/);
    assert.match(HOOK, /isChainUnknown: !requiredChainId/);
});

for (const [name, src] of Object.entries(MODALS)) {
    test(`${name} — passes the config chain without a Gnosis fallback`, () => {
        assert.match(src, /useRequiredChain\(config\?\.chainId\)/);
        assert.doesNotMatch(src, /useRequiredChain\([^)]*\|\|/);
    });

    test(`${name} — submit refuses while the chain is unknown, before the wrong-chain check`, () => {
        const unknown = src.indexOf('if (requiredChain.isChainUnknown) {');
        const wrong = src.indexOf('if (requiredChain.isWrongChain) {');
        assert.ok(unknown > 0 && wrong > unknown);
    });
}
