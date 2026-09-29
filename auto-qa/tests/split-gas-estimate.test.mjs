/**
 * Collateral split in the trade dialog: gas comes from the wallet's estimate (auto-qa).
 *
 * Pins src/components/futarchyFi/marketPage/ConfirmSwapModal.jsx. The split
 * (FutarchyRouter.splitPosition) used a fixed 2,000,000 gas limit on both the
 * ethers and the viem path. Wallets priced the transaction at that limit, so
 * MetaMask showed about 5x the real fee (a mainnet split used 360,368 gas, tx
 * 0xc7211923…fc8d5d52),
 * and a wallet whose ETH covered the split but not 2M gas could be blocked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MODAL = readFileSync(
    new URL('../../src/components/futarchyFi/marketPage/ConfirmSwapModal.jsx', import.meta.url),
    'utf8',
);

test('split — no fixed 2,000,000 gas limit on either path', () => {
    assert.doesNotMatch(MODAL, /gasLimit:\s*2000000/);
    assert.doesNotMatch(MODAL, /gas:\s*2000000n/);
});

test('split — splitPosition is sent without gas overrides', () => {
    assert.match(MODAL, /routerContract\.splitPosition\(\s*marketAddress,\s*baseToken\.address,\s*amountInWei\s*\)/);
    assert.match(MODAL, /functionName: 'splitPosition',\s*args: \[marketAddress, baseToken\.address, amountInWei\],\s*account\s*\}\)/);
});
