/**
 * Market page helpers (auto-qa).
 *
 * Imports the real src/utils/marketPageUtils.mjs (no spec mirror): the
 * impact formatter shared by the header / chart table / TWAP panel, the
 * Reality.eth link builder, trade execution price, and which proposal a
 * market page loads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeImpactPercent,
    formatImpactPercent,
    buildRealityQuestionUrl,
    normalizeRealityQuestionUrl,
    computeExecutionPrice,
    resolveProposalId,
} from '../../src/utils/marketPageUtils.mjs';

// --- impact -------------------------------------------------------------

test('computeImpactPercent is (YES - NO) / max(YES, NO) * 100', () => {
    assert.equal(computeImpactPercent(110, 100), (10 / 110) * 100);
    assert.equal(computeImpactPercent(100, 110), (-10 / 110) * 100);
    assert.equal(computeImpactPercent(5, 5), 0);
});

test('computeImpactPercent returns null for missing or unusable prices', () => {
    assert.equal(computeImpactPercent(null, 1), null);
    assert.equal(computeImpactPercent(1, undefined), null);
    assert.equal(computeImpactPercent('abc', 1), null);
    assert.equal(computeImpactPercent(0, 0), null);
});

test('formatImpactPercent: two decimals with explicit sign', () => {
    assert.equal(formatImpactPercent(-0.3569), '-0.36%');
    assert.equal(formatImpactPercent(-0.99), '-0.99%');
    assert.equal(formatImpactPercent(0.3569), '+0.36%');
    assert.equal(formatImpactPercent(12.345), '+12.35%');
    assert.equal(formatImpactPercent('1.5'), '+1.50%');
});

test('formatImpactPercent: tiny non-zero values read "<0.01%", not 0.00% or 0.00004146%', () => {
    assert.equal(formatImpactPercent(0.00004146), '<0.01%');
    assert.equal(formatImpactPercent(-0.004), '<0.01%');
    assert.equal(formatImpactPercent(0.005), '+0.01%');
    assert.equal(formatImpactPercent(0), '0.00%');
});

test('formatImpactPercent: missing input uses the fallback', () => {
    assert.equal(formatImpactPercent(null), 'N/A');
    assert.equal(formatImpactPercent(undefined, '—'), '—');
    assert.equal(formatImpactPercent(NaN), 'N/A');
});

// --- Reality.eth --------------------------------------------------------

const QID = '0xe1ef37c96013f3a1e4a9cb00bdb1bf158ecd91be210077316933bb9d5ba5738d';
const GNOSIS_REALITY = '0xE78996A233895bE74a66F451f1019cA9734205cc';

test('buildRealityQuestionUrl uses the deep-link form that opens the question', () => {
    assert.equal(
        buildRealityQuestionUrl(100, GNOSIS_REALITY, QID),
        `https://reality.eth.limo/#!/network/100/question/${GNOSIS_REALITY.toLowerCase()}-${QID}`
    );
    const mainnet = buildRealityQuestionUrl(1, '0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c', QID);
    assert.ok(mainnet.startsWith('https://reality.eth.limo/#!/network/1/question/0x5b7dd1e8'));
    assert.ok(!mainnet.includes('/app/'));
    assert.ok(!mainnet.includes('/token/'));
});

test('buildRealityQuestionUrl returns null when a part is missing', () => {
    assert.equal(buildRealityQuestionUrl(100, GNOSIS_REALITY, null), null);
    assert.equal(buildRealityQuestionUrl(null, GNOSIS_REALITY, QID), null);
});

test('normalizeRealityQuestionUrl rewrites the old /app/ + /token/ links', () => {
    const want = `https://reality.eth.limo/#!/network/100/question/${GNOSIS_REALITY.toLowerCase()}-${QID}`;
    assert.equal(
        normalizeRealityQuestionUrl(`https://reality.eth.limo/app/#!/network/100/token/XDAI/question/${GNOSIS_REALITY}-${QID}`),
        want
    );
    assert.equal(
        normalizeRealityQuestionUrl(`https://reality.eth.limo/app/#!/network/100/question/${GNOSIS_REALITY}-${QID}/token/XDAI`),
        want
    );
    assert.equal(normalizeRealityQuestionUrl(want), want);
});

test('normalizeRealityQuestionUrl uses the fallback chain only when the link has none', () => {
    assert.equal(
        normalizeRealityQuestionUrl(`https://reality.eth.limo/app/#!/question/${GNOSIS_REALITY}-${QID}`, 100),
        `https://reality.eth.limo/#!/network/100/question/${GNOSIS_REALITY.toLowerCase()}-${QID}`
    );
    assert.ok(
        normalizeRealityQuestionUrl(`https://reality.eth.limo/app/#!/network/1/question/${GNOSIS_REALITY}-${QID}`, 100)
            .includes('/network/1/')
    );
});

test('normalizeRealityQuestionUrl leaves non-Reality links and empty values alone', () => {
    assert.equal(normalizeRealityQuestionUrl('https://snapshot.box/#/s:gnosis.eth/proposal/0x1'), 'https://snapshot.box/#/s:gnosis.eth/proposal/0x1');
    assert.equal(normalizeRealityQuestionUrl(null), null);
    assert.equal(normalizeRealityQuestionUrl(''), '');
});

// --- execution price ----------------------------------------------------

test('computeExecutionPrice: buy = currency paid / company received', () => {
    const swap = {
        amountIn: '103.31', amountOut: '1',
        tokenIn: { role: 'YES_CURRENCY' }, tokenOut: { role: 'YES_COMPANY' },
    };
    assert.equal(computeExecutionPrice(swap), 103.31);
});

test('computeExecutionPrice: sell = currency received / company paid', () => {
    const swap = {
        amountIn: '2', amountOut: '206.62',
        tokenIn: { role: 'NO_COMPANY' }, tokenOut: { role: 'NO_CURRENCY' },
    };
    assert.equal(computeExecutionPrice(swap), 103.31);
});

test('computeExecutionPrice returns null when it cannot tell the sides apart', () => {
    assert.equal(computeExecutionPrice({ amountIn: '1', amountOut: '2', tokenIn: {}, tokenOut: {} }), null);
    assert.equal(computeExecutionPrice({ amountIn: '0', amountOut: '2', tokenIn: { role: 'YES_CURRENCY' }, tokenOut: { role: 'YES_COMPANY' } }), null);
    assert.equal(computeExecutionPrice(null), null);
});

// --- proposal resolution ------------------------------------------------

const A = '0x84412fe9d088c1d8dd676a7be9a3d5d0291ab1cf';
const B = '0xece80208cb8376be311ce0f5ea4ef73850a0dcf0';

test('resolveProposalId: the prop wins over ?proposalId=', () => {
    assert.equal(resolveProposalId(A, { pathname: `/markets/${A}`, search: `?proposalId=${B}` }), A);
    assert.equal(resolveProposalId(A, { pathname: '/market', search: `?proposalId=${B}` }), A);
});

test('resolveProposalId: /markets/<address> ignores ?proposalId=', () => {
    assert.equal(resolveProposalId(null, { pathname: `/markets/${A}`, search: `?proposalId=${B}` }), A);
    assert.equal(resolveProposalId(null, { pathname: `/markets/${A}/`, search: '' }), A);
});

test('resolveProposalId: ?proposalId= is only read on the /market route', () => {
    assert.equal(resolveProposalId(null, { pathname: '/market', search: `?proposalId=${B}` }), B);
    assert.equal(resolveProposalId(null, { pathname: '/companies', search: `?proposalId=${B}` }), null);
    assert.equal(resolveProposalId(null, null), null);
});
