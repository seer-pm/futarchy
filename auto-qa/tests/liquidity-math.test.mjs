/**
 * Real-reserve liquidity display tests (auto-qa).
 *
 * Concentrated-liquidity L is virtual and must not be presented as deposited
 * reserves. Production reads both ERC20 balances held by each pool and values
 * the company-token side at the pool's current currency price.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const POOL_DATA_SRC = readFileSync(
    new URL('../../src/hooks/usePoolData.js', import.meta.url),
    'utf8',
);
const MARKET_PAGE_SRC = readFileSync(
    new URL('../../src/components/futarchyFi/marketPage/MarketPageShowcase.jsx', import.meta.url),
    'utf8',
);
const LIQUIDITY_SUMMARY_SRC = readFileSync(
    new URL('../../src/components/futarchyFi/marketPage/showcase/useLiquiditySummary.js', import.meta.url),
    'utf8',
);

const valueRealReserves = ({ currencyAmount, companyAmount, companyPrice }) =>
    currencyAmount + (companyAmount * companyPrice);

test('real reserves are valued as currency + company × current pool price', () => {
    assert.equal(valueRealReserves({
        currencyAmount: 100_000,
        companyAmount: 100_000,
        companyPrice: 0.5205,
    }), 152_050);
});

test('valuation is independent of pool token ordering', () => {
    const token0Currency = valueRealReserves({
        currencyAmount: 85_000,
        companyAmount: 42_000,
        companyPrice: 1.25,
    });
    const token1Currency = valueRealReserves({
        companyAmount: 42_000,
        currencyAmount: 85_000,
        companyPrice: 1.25,
    });
    assert.equal(token0Currency, token1Currency);
});

test('pool data reads both real ERC20 balances and formats token decimals', () => {
    const balanceReads = POOL_DATA_SRC.match(/\.balanceOf\(poolAddress\)/g) || [];
    assert.equal(balanceReads.length, 2);
    assert.match(POOL_DATA_SRC, /formatUnits\(balance0, Number\(t0\.decimals \?\? 18\)\)/);
    assert.match(POOL_DATA_SRC, /formatUnits\(balance1, Number\(t1\.decimals \?\? 18\)\)/);
});

test('virtual-liquidity reserve approximation is absent', () => {
    assert.doesNotMatch(POOL_DATA_SRC, /liquidityScaled|adjustedLiquidity|sqrtPrice/);
});

test('market stat classifies reserve sides and applies the pool price', () => {
    assert.match(LIQUIDITY_SUMMARY_SRC, /entry\.kind === 'currency'/);
    assert.match(LIQUIDITY_SUMMARY_SRC, /entry\.kind === 'company'/);
    assert.match(LIQUIDITY_SUMMARY_SRC, /companyTokenAmount \* price/);
    // Reserves across all ranges are TVL, not tradable depth near the price:
    // the stat is labelled TVL and its tooltip says so.
    assert.match(MARKET_PAGE_SRC, /label="TVL"/);
    assert.match(MARKET_PAGE_SRC, /tooltipNote="[^"]*not tradable depth/);
});
