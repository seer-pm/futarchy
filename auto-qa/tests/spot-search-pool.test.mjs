// pickSearchPool must honour pair orientation: GeckoTerminal ranks reversed
// pairs (USDC / WETH) alongside the requested one (WETH / USDC), and their
// candles are the reciprocal price.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSearchPool } from '../../src/spotPriceUtils/searchPoolMatch.mjs';

const token = (id, symbol) => ({ id, type: 'token', attributes: { symbol } });
const pool = (address, baseId, quoteId) => ({
    id: `eth_${address}`,
    attributes: { address, name: 'ignored' },
    relationships: {
        base_token: { data: { id: baseId } },
        quote_token: { data: { id: quoteId } },
    },
});
const included = [token('eth_weth', 'WETH'), token('eth_usdc', 'USDC')];

test('prefers a pool in the requested orientation even when ranked lower', () => {
    const data = {
        data: [pool('0xrev1', 'eth_usdc', 'eth_weth'), pool('0xrev2', 'eth_usdc', 'eth_weth'), pool('0xdirect', 'eth_weth', 'eth_usdc')],
        included,
    };
    const m = pickSearchPool(data, 'WETH', 'USDC');
    assert.equal(m.pool.attributes.address, '0xdirect');
    assert.equal(m.reversed, false);
});

test('falls back to a reversed pool and flags it', () => {
    const data = { data: [pool('0xrev', 'eth_usdc', 'eth_weth')], included };
    const m = pickSearchPool(data, 'weth', 'usdc');
    assert.equal(m.pool.attributes.address, '0xrev');
    assert.equal(m.reversed, true);
});

test('keeps the API ranking among same-orientation pools', () => {
    const data = { data: [pool('0xa', 'eth_weth', 'eth_usdc'), pool('0xb', 'eth_weth', 'eth_usdc')], included };
    assert.equal(pickSearchPool(data, 'WETH', 'USDC').pool.attributes.address, '0xa');
});

test('returns null when no pool pairs the two symbols', () => {
    const data = { data: [pool('0xa', 'eth_weth', 'eth_weth')], included };
    assert.equal(pickSearchPool(data, 'WETH', 'USDC'), null);
    assert.equal(pickSearchPool({}, 'WETH', 'USDC'), null);
});
