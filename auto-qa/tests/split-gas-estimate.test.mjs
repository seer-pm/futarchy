/**
 * Collateral split and merge: gas comes from the wallet's estimate (auto-qa).
 *
 * The trade dialog's split (FutarchyRouter.splitPosition) used a fixed
 * 2,000,000 gas limit. Wallets priced the transaction at that limit, so
 * MetaMask showed about 5x the real fee (a mainnet split used 360,368 gas, tx
 * 0xc7211923…fc8d5d52),
 * and a wallet whose ETH covered the split but not 2M gas could be blocked.
 *
 * Split and merge now live in src/utils/collateralActions.js, which both
 * dialogs call; collateral-actions.test.mjs checks the requests it sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const ACTIONS = read('utils/collateralActions.js');
const TRADE_DIALOG = read('components/futarchyFi/marketPage/ConfirmSwapModal.jsx');
const COLLATERAL_DIALOG = read('components/futarchyFi/marketPage/collateralModal/CollateralModal.jsx');

test('split — no fixed gas limit or fee anywhere on the path', () => {
    for (const source of [ACTIONS, TRADE_DIALOG, COLLATERAL_DIALOG]) {
        assert.doesNotMatch(source, /gasLimit:\s*2000000/);
        assert.doesNotMatch(source, /gas:\s*2000000n/);
    }
    assert.doesNotMatch(ACTIONS, /\bgas(Limit|Price)?\s*:|maxFeePerGas|maxPriorityFeePerGas/);
});

test('split — both dialogs send it through collateralActions, not their own copy', () => {
    assert.match(TRADE_DIALOG, /await splitCollateral\(\{/);
    assert.match(COLLATERAL_DIALOG, /await splitCollateral\(\{/);
    assert.match(COLLATERAL_DIALOG, /await mergeCollateral\(\{/);
    for (const source of [TRADE_DIALOG, COLLATERAL_DIALOG]) {
        assert.doesNotMatch(source, /\.splitPosition\(|\.mergePositions\(|functionName: '(splitPosition|mergePositions)'/);
        assert.doesNotMatch(source, /handleTokenApproval/);
    }
});
