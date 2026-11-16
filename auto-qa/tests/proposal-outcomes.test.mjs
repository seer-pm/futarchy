/**
 * Outcome tokens and warnings of futarchy proposals (auto-qa).
 *
 * src/utils/proposalOutcomes.js reads binary (FutarchyFactory) and categorical
 * (FutarchyCategoricalFactory) proposals. The categorical factory takes outcome
 * and token names as given, so the market page warns when the Reality question
 * lists other answers than the proposal's slots, or two tokens share a name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex, concat, pad } from 'viem';
import { answerByToken, categoricalPoolList, categoricalTotals, categoricalWarnings, mergeableAmount, outcomeRows, poolPrice, realityText, winningRow, wrappedTokenName } from '../../src/utils/proposalOutcomes.js';
import { buildCategoricalProposal, defaultTokenName, MAX_CATEGORICAL_OUTCOMES } from '../../src/utils/categoricalProposal.mjs';

const SEP = '\u241f';
const question = (answers) => `Who will win?${SEP}${answers}${SEP}politics${SEP}en_US`;

// FutarchyFactory.toString31: name left-aligned, byte length * 2 in the last byte.
const toString31 = (name) => {
    const bytes = stringToHex(name, { size: 32 });
    return `${bytes.slice(0, 64)}${(name.length * 2).toString(16).padStart(2, '0')}`;
};
const tokenData = (name) => concat([toString31(name), toString31(name), pad('0x12', { size: 1 })]);

test('wrappedTokenName reads the name the factories wrap tokens with', () => {
    assert.equal(wrappedTokenName(tokenData('CAND_A_PNK')), 'CAND_A_PNK');
    assert.equal(wrappedTokenName(tokenData('INVALID_sDAI')), 'INVALID_sDAI');
    // 31 bytes is the longest name toString31 accepts.
    const longest = 'A'.repeat(27) + '_PNK';
    assert.equal(wrappedTokenName(tokenData(longest)), longest);
    assert.equal(wrappedTokenName('0x'), null);
});

test('a well-formed categorical proposal has no warnings', () => {
    assert.deepEqual(categoricalWarnings({
        encodedQuestion: question('"Candidate A","Candidate B","Candidate C"'),
        outcomes: ['Candidate A', 'Candidate B', 'Candidate C'],
        tokenNames: ['CAND_A_PNK', 'CAND_B_PNK', 'CAND_C_PNK', 'CAND_A_sDAI', 'CAND_B_sDAI', 'CAND_C_sDAI', 'INVALID_PNK', 'INVALID_sDAI'],
    }), []);
});

test('an outcome with quotes makes Reality list other answers than the slots', () => {
    // Two slots on-chain, three answers on Reality: answer 2 (Candidate C) would pay INVALID.
    const warnings = categoricalWarnings({
        encodedQuestion: question('"Candidate A","Candidate B","Candidate C"'),
        outcomes: ['Candidate A","Candidate B', 'Candidate C'],
        tokenNames: ['CAND_A_PNK', 'CAND_C_PNK', 'CAND_A_sDAI', 'CAND_C_sDAI', 'INVALID_PNK', 'INVALID_sDAI'],
    });
    assert.deepEqual(warnings.map((w) => w.code), ['question-mismatch']);
});

test('a separator inside an outcome or answers in another order are a mismatch', () => {
    const names = ['A_PNK', 'B_PNK', 'A_sDAI', 'B_sDAI', 'INVALID_PNK', 'INVALID_sDAI'];
    for (const [encodedQuestion, outcomes] of [
        [question(`"A${SEP}x","B"`), [`A${SEP}x`, 'B']],
        [question('"B","A"'), ['A', 'B']],
        [question('"A","B","C"'), ['A', 'B']],
        [question('"A","B"'), ['A', 'B', 'C']],
        [question('not json'), ['A', 'B']],
    ]) {
        assert.deepEqual(
            categoricalWarnings({ encodedQuestion, outcomes, tokenNames: names }).map((w) => w.code),
            ['question-mismatch'],
            encodedQuestion,
        );
    }
});

test('two tokens with the same name are flagged, including an answer named INVALID', () => {
    const warnings = categoricalWarnings({
        encodedQuestion: question('"Invalid","Other"'),
        outcomes: ['Invalid', 'Other'],
        tokenNames: ['INVALID_PNK', 'OTHER_PNK', 'INVALID_sDAI', 'OTHER_sDAI', 'INVALID_PNK', 'INVALID_sDAI'],
    });
    assert.deepEqual(warnings.map((w) => w.code), ['duplicate-token-names']);
});

// A categorical proposal from fetchProposalOutcomes: 3 answers plus INVALID.
const token = (address, name) => ({ address, name });
const CATEGORICAL = {
    kind: 'categorical',
    companyToken: '0xC1', currencyToken: '0xC2',
    outcomes: ['A', 'B', 'C'].map((label, i) => ({
        label, company: token(`0xA${i}`, `${label}_PNK`), currency: token(`0xB${i}`, `${label}_sDAI`),
    })),
    invalid: { company: token('0xAF', 'INVALID_PNK'), currency: token('0xBF', 'INVALID_sDAI') },
};

test('outcome rows list the answers in slot order with INVALID last', () => {
    assert.deepEqual(outcomeRows(CATEGORICAL).map((row) => [row.key, row.label, row.isInvalid, row.company.name]), [
        ['0', 'A', false, 'A_PNK'], ['1', 'B', false, 'B_PNK'], ['2', 'C', false, 'C_PNK'], ['invalid', 'Invalid', true, 'INVALID_PNK'],
    ]);
});

test('the winning row is the answer index, or INVALID; nothing wins before resolution', () => {
    assert.equal(winningRow(CATEGORICAL, { resolved: true, outcome: null, outcomeIndex: 2 }).label, 'C');
    assert.equal(winningRow(CATEGORICAL, { resolved: true, outcome: null, outcomeIndex: 0 }).label, 'A');
    assert.equal(winningRow(CATEGORICAL, { resolved: true, outcome: 'invalid', outcomeIndex: null }).key, 'invalid');
    assert.equal(winningRow(CATEGORICAL, { resolved: false, outcome: null }), null);
    assert.equal(winningRow(CATEGORICAL, null), null);
    // A binary proposal's YES/NO resolution never maps onto these rows.
    assert.equal(winningRow({ ...CATEGORICAL, kind: 'binary' }, { resolved: true, outcome: 'yes' }), null);
});

test('mergeable is the smallest balance among every outcome token of a collateral, INVALID included', () => {
    const balances = new Map([
        ['0xa0', 10n], ['0xa1', 7n], ['0xa2', 9n], ['0xaf', 3n],
        ['0xb0', 5n], ['0xb1', 5n], ['0xb2', 5n], ['0xbf', 8n],
    ]);
    assert.equal(mergeableAmount(CATEGORICAL, balances, 'company'), 3n);
    assert.equal(mergeableAmount(CATEGORICAL, balances, 'currency'), 5n);
    balances.delete('0xb1');
    assert.equal(mergeableAmount(CATEGORICAL, balances, 'currency'), 0n);
});

test('pool price is the base token in the other token, whichever side of the pool it is', () => {
    const A = '0x00000000000000000000000000000000000000aA';
    const B = '0x00000000000000000000000000000000000000Bb';
    // sqrt(4) * 2^96: 4 of token1 per token0.
    const sqrtPriceX96 = 2n * 2n ** 96n;
    assert.equal(poolPrice(sqrtPriceX96, A, A), 4);
    assert.equal(poolPrice(sqrtPriceX96, A, B), 0.25);
    assert.equal(poolPrice(sqrtPriceX96, A.toLowerCase(), A), 4);
    assert.equal(poolPrice(0n, A, A), null);
});

// --- creating categorical proposals (utils/categoricalProposal.mjs) ---------

const CREATE = {
    marketName: 'Who will win the “2027” election?',
    outcomes: ['Javier Milei', 'Sergio "Massa"', 'Patricia Bullrich'],
    companyToken: '0x37b60f4e9a31a64ccc0024dce7d0fd07eaa0f7b3',
    currencyToken: '0xaf204776c7245bF4147c2612BF6e5972Ee483701',
    companySymbol: 'PNK',
    currencySymbol: 'sDAI',
    category: 'politics',
    language: 'en_US',
    minBond: '1000000000000000000',
    openingTime: 1_800_000_000,
};

test('answers with quotes are escaped on creation and read back as the same answers', () => {
    const { errors, params } = buildCategoricalProposal(CREATE);
    assert.deepEqual(errors, []);
    const [marketName, outcomes, tokenNames] = params;
    // The question is shown as stored, so it is stored as written.
    assert.equal(marketName, CREATE.marketName);
    assert.deepEqual(outcomes, ['Javier Milei', 'Sergio \\"Massa\\"', 'Patricia Bullrich']);
    assert.deepEqual(tokenNames, ['JAVIER_MILEI', 'SERGIO_MASSA', 'PATRICIA_BULLRICH']);
    // FutarchyCategoricalFactory.encodeRealityQuestion quotes the stored answers.
    const encodedQuestion = question(outcomes.map((answer) => `"${answer}"`).join(','));
    const labels = outcomes.map(realityText);
    assert.deepEqual(labels, CREATE.outcomes);
    assert.deepEqual(categoricalWarnings({ encodedQuestion, outcomes: labels, tokenNames: ['A', 'B', 'C'] }), []);
});

test('token names default from the answers and must fit 31 bytes with each collateral symbol', () => {
    assert.equal(defaultTokenName('Señor Ñandú-2'), 'SENOR_NANDU_2');
    // 26 + "_sDAI" = 31 bytes fits; 27 does not.
    const fits = buildCategoricalProposal({ ...CREATE, outcomes: ['a', 'b'], tokenNames: ['A'.repeat(26), 'B'] });
    assert.deepEqual(fits.errors, []);
    const tooLong = buildCategoricalProposal({ ...CREATE, outcomes: ['a', 'b'], tokenNames: ['A'.repeat(27), 'B'] });
    assert.equal(tooLong.params, null);
    assert.match(tooLong.errors.join(' '), /_sDAI.*A{27}/);
});

test('a categorical proposal refuses what would create slots that do not mean their answers', () => {
    const errorsOf = (input) => buildCategoricalProposal({ ...CREATE, ...input }).errors;
    assert.equal(errorsOf({ outcomes: ['Only one'] }).length, 1);
    assert.equal(errorsOf({ outcomes: ['A', 'a'] }).length, 2, 'same answer, so same token name too');
    assert.equal(errorsOf({ outcomes: ['A', ' '] }).length, 2, 'blank answer and no token name');
    assert.equal(errorsOf({ outcomes: ['Invalid', 'Other'] }).length, 1, 'INVALID_* are the Invalid outcome tokens');
    assert.equal(errorsOf({ outcomes: ['A', 'B'], tokenNames: ['SAME', 'same'] }).length, 1);
    assert.equal(errorsOf({ outcomes: Array.from({ length: MAX_CATEGORICAL_OUTCOMES + 1 }, (_, i) => `A${i}`) }).length, 1);
    assert.equal(errorsOf({ openingTime: 0 }).length, 1);
    // What Reality's JSON template or field separator would misread.
    assert.equal(errorsOf({ marketName: 'Who wins "the" vote?' }).length, 1);
    assert.equal(errorsOf({ marketName: 'Who wins\\?' }).length, 1);
    assert.equal(errorsOf({ outcomes: ['A\u241fB', 'C'] }).length, 1);
});

test('categorical header totals add up each answer\'s conditional pool and measure impact across answers', () => {
    const e18 = 10n ** 18n;
    const pool = (address, price, base, quote) => ({ address, price, liquidity: 1n, reserves: { base: base * e18, quote: quote * e18 } });
    const pools = [
        { label: 'A', conditional: pool('0xAAaa', 2, 3n, 4n), prediction: pool('0x01', 0.5, 1n, 1n) },
        { label: 'B', conditional: pool('0xBBbb', 1.5, 2n, 1n), prediction: null },
        { label: 'C', conditional: null, prediction: null },
    ];
    // TVL: currency at face value plus company tokens at the pool price; prediction pools left out.
    const totals = categoricalTotals(pools, new Map([['0xaaaa', 7], ['0x01', 100]]));
    assert.equal(totals.tvl, 4 + 3 * 2 + 1 + 2 * 1.5);
    assert.equal(totals.volume, 7);
    assert.equal(totals.impact, 25);
    assert.deepEqual(totals.breakdown.map((row) => [row.label, row.volume]), [['A', 7], ['B', 0]]);
    // Without the indexer the volume is unknown, not zero.
    assert.equal(categoricalTotals(pools, null).volume, null);
    // One priced answer has nothing to compare with.
    assert.equal(categoricalTotals(pools.slice(0, 1), null).impact, null);
});

test('categorical pool list has a conditional and a prediction pool per answer, priced token first, none for INVALID', () => {
    const token = (address, name) => ({ address, name });
    const pools = [
        { key: '0', label: 'A', company: token('0xA1', 'A_WETH'), currency: token('0xA2', 'A_sDAI'), conditional: { address: '0xPA' }, prediction: null },
        { key: '1', label: 'B', company: token('0xB1', null), currency: token('0xB2', 'B_sDAI'), conditional: null, prediction: { address: '0xPB' } },
    ];
    const list = categoricalPoolList(pools, token('0xC', 'sDAI'));
    assert.deepEqual(list.map((p) => [p.key, `${p.token0.name}/${p.token1.name}`, p.address]), [
        ['0-conditional', 'A_WETH/A_sDAI', '0xPA'],
        ['0-prediction', 'A_sDAI/sDAI', null],
        ['1-conditional', 'B company/B_sDAI', null],
        ['1-prediction', 'B_sDAI/sDAI', '0xPB'],
    ]);
});

test('trades find their answer by either outcome token, whatever its case; INVALID and the collaterals have none', () => {
    const token = (address) => ({ address, name: null });
    const proposal = {
        outcomes: [
            { label: 'A', company: token('0xA1'), currency: token('0xa2') },
            { label: 'B', company: token('0xB1'), currency: token('0xB2') },
        ],
        invalid: { company: token('0xC1'), currency: token('0xC2') },
    };
    const answers = answerByToken(proposal);
    assert.deepEqual(answers.get('0xa1'), { index: 0, label: 'A' });
    assert.deepEqual(answers.get('0xa2'), { index: 0, label: 'A' });
    assert.deepEqual(answers.get('0xb2'), { index: 1, label: 'B' });
    assert.equal(answers.get('0xc1'), undefined);
    assert.equal(answers.size, 4);
});
