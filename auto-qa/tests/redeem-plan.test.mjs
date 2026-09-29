/**
 * Redeem tab decision helpers (auto-qa).
 *
 * Pins src/utils/redeemPlan.js — the pure logic behind RedeemTokens and
 * RedemptionModal:
 *   getRedeemSide      — only an explicit Yes/No picks a side (Invalid → null)
 *   outcomeFromPayouts — ConditionalTokens payouts → Yes / No / Invalid
 *   getRedeemAmounts   — redeem wrapped ERC20 balances only; the router's
 *                        redeemProposal never pulls unwrapped ERC1155
 *   describeRedeemError — readable failure reason, rejection → cancelled
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/utils/redeemPlan.js', import.meta.url), 'utf8');
const {
    getRedeemSide,
    outcomeFromPayouts,
    getRedeemAmounts,
    isPositiveAmount,
    describeRedeemError,
} = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);

// ---------------------------------------------------------------------------
// getRedeemSide
// ---------------------------------------------------------------------------

test('getRedeemSide — Yes/No in any case pick that side', () => {
    assert.equal(getRedeemSide('Yes'), 'yes');
    assert.equal(getRedeemSide('YES'), 'yes');
    assert.equal(getRedeemSide(' no '), 'no');
    assert.equal(getRedeemSide('No'), 'no');
});

test('getRedeemSide — Invalid and other outcomes pick no side (not NO)', () => {
    assert.equal(getRedeemSide('Invalid'), null);
    assert.equal(getRedeemSide('INVALID'), null);
    assert.equal(getRedeemSide('Unknown'), null);
    assert.equal(getRedeemSide(''), null);
    assert.equal(getRedeemSide(null), null);
    assert.equal(getRedeemSide(undefined), null);
});

// ---------------------------------------------------------------------------
// outcomeFromPayouts (slot 0 = Yes, slot 1 = No)
// ---------------------------------------------------------------------------

test('outcomeFromPayouts — single paying slot is the winner', () => {
    assert.equal(outcomeFromPayouts(1n, 0n), 'Yes');
    assert.equal(outcomeFromPayouts(0n, 1n), 'No');
});

test('outcomeFromPayouts — both slots paying is Invalid, not Yes', () => {
    assert.equal(outcomeFromPayouts(1n, 1n), 'Invalid');
});

test('outcomeFromPayouts — accepts ethers BigNumber-like values', () => {
    const bn = (v) => ({ toString: () => String(v) });
    assert.equal(outcomeFromPayouts(bn(0), bn(1)), 'No');
    assert.equal(outcomeFromPayouts(bn(0), bn(0)), null);
});

// ---------------------------------------------------------------------------
// getRedeemAmounts
// ---------------------------------------------------------------------------

const positions = {
    currencyYes: { unwrapped: '2.0', wrapped: '5.5', total: '7.5' },
    currencyNo: { unwrapped: '0.0', wrapped: '1.25', total: '1.25' },
    companyYes: { unwrapped: '0.0', wrapped: '0.000000000000000001', total: '0.000000000000000001' },
    companyNo: { unwrapped: '3.0', wrapped: '0.0', total: '3.0' },
};

test('getRedeemAmounts — YES side redeems wrapped balances, not totals', () => {
    assert.deepEqual(getRedeemAmounts(positions, 'yes'), {
        currencyAmount: '5.5',
        companyAmount: '0.000000000000000001',
        unwrappedCurrencyAmount: '2.0',
        unwrappedCompanyAmount: '0.0',
    });
});

test('getRedeemAmounts — NO side reports unwrapped separately', () => {
    const amounts = getRedeemAmounts(positions, 'no');
    assert.equal(amounts.currencyAmount, '1.25');
    assert.equal(amounts.companyAmount, '0.0');
    assert.equal(amounts.unwrappedCompanyAmount, '3.0');
    assert.equal(isPositiveAmount(amounts.companyAmount), false);
});

test('getRedeemAmounts — missing / not-yet-loaded balances become "0"', () => {
    assert.deepEqual(getRedeemAmounts({ currencyYes: { wrapped: null } }, 'yes'), {
        currencyAmount: '0',
        companyAmount: '0',
        unwrappedCurrencyAmount: '0',
        unwrappedCompanyAmount: '0',
    });
    assert.equal(getRedeemAmounts(undefined, 'no').currencyAmount, '0');
});

// ---------------------------------------------------------------------------
// describeRedeemError
// ---------------------------------------------------------------------------

test('describeRedeemError — wallet rejection reads as cancelled', () => {
    assert.equal(describeRedeemError({ code: 4001, message: 'x' }), 'Transaction cancelled');
    assert.equal(describeRedeemError({ code: 'ACTION_REJECTED' }), 'Transaction cancelled');
    assert.equal(
        describeRedeemError(new Error('User rejected the request.\n\nRequest Arguments: ...')),
        'Transaction cancelled',
    );
    assert.equal(describeRedeemError('MetaMask Tx Signature: User denied transaction signature.'), 'Transaction cancelled');
});

test('describeRedeemError — keeps the first line of the real reason', () => {
    assert.equal(
        describeRedeemError(new Error('Insufficient token 1 balance. Need 2, have 1')),
        'Insufficient token 1 balance. Need 2, have 1',
    );
    assert.equal(
        describeRedeemError(new Error('The contract function "redeemProposal" reverted.\n\nContract Call: ...')),
        'The contract function "redeemProposal" reverted.',
    );
});

test('describeRedeemError — Safe hand-off and empty errors', () => {
    assert.match(describeRedeemError(new Error('SAFE_TRANSACTION_SENT')), /Safe/);
    assert.equal(describeRedeemError(undefined), 'Unknown error occurred.');
    assert.equal(describeRedeemError(new Error('')), 'Unknown error occurred.');
});
