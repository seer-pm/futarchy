/**
 * isWrongChain spec (auto-qa).
 *
 * Pins src/utils/chainGuard.js:isWrongChain — the check the swap,
 * collateral (split/merge) and redemption modals use to refuse
 * submitting a market's transactions from a wallet on another chain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isWrongChain } = await import(new URL('../../src/utils/chainGuard.js', import.meta.url));

test('isWrongChain — connected on the market chain → false', () => {
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 100, requiredChainId: 100 }), false);
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 1, requiredChainId: 1 }), false);
});

test('isWrongChain — connected on another chain → true', () => {
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 1, requiredChainId: 100 }), true);
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 100, requiredChainId: 1 }), true);
});

test('isWrongChain — wallet on a chain the app does not configure → true', () => {
    // wagmi's useAccount().chain is undefined for unconfigured chains, but
    // chainId is still set; either way the wallet is not on the market chain.
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 137, requiredChainId: 100 }), true);
    assert.equal(isWrongChain({ isConnected: true, walletChainId: undefined, requiredChainId: 100 }), true);
});

test('isWrongChain — not connected → false (connect flow handles it)', () => {
    assert.equal(isWrongChain({ isConnected: false, walletChainId: 1, requiredChainId: 100 }), false);
    assert.equal(isWrongChain({ isConnected: false, walletChainId: undefined, requiredChainId: 100 }), false);
});

test('isWrongChain — no required chain known yet → false', () => {
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 1, requiredChainId: undefined }), false);
});

test('isWrongChain — string chain ids compare by value', () => {
    // Market metadata can carry the chain as a string.
    assert.equal(isWrongChain({ isConnected: true, walletChainId: 100, requiredChainId: '100' }), false);
});
