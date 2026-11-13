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
import { categoricalWarnings, mergeableAmount, outcomeRows, winningRow, wrappedTokenName } from '../../src/utils/proposalOutcomes.js';

const SEP = '\u241f';
const question = (answers) => `Who will win?${SEP}${answers}${SEP}politics${SEP}en_US`;

// FutarchyFactory.toString31: name left-aligned, byte length * 2 in the last byte.
const toString31 = (name) => {
    const bytes = stringToHex(name, { size: 32 });
    return `${bytes.slice(0, 64)}${(name.length * 2).toString(16).padStart(2, '0')}`;
};
const tokenData = (name) => concat([toString31(name), toString31(name), pad('0x12', { size: 1 })]);

test('wrappedTokenName reads the name the factories wrap tokens with', () => {
    assert.equal(wrappedTokenName(tokenData('MILEI_PNK')), 'MILEI_PNK');
    assert.equal(wrappedTokenName(tokenData('INVALID_sDAI')), 'INVALID_sDAI');
    // 31 bytes is the longest name toString31 accepts.
    const longest = 'A'.repeat(27) + '_PNK';
    assert.equal(wrappedTokenName(tokenData(longest)), longest);
    assert.equal(wrappedTokenName('0x'), null);
});

test('a well-formed categorical proposal has no warnings', () => {
    assert.deepEqual(categoricalWarnings({
        encodedQuestion: question('"Milei","Massa","Bullrich"'),
        outcomes: ['Milei', 'Massa', 'Bullrich'],
        tokenNames: ['MILEI_PNK', 'MASSA_PNK', 'BULL_PNK', 'MILEI_sDAI', 'MASSA_sDAI', 'BULL_sDAI', 'INVALID_PNK', 'INVALID_sDAI'],
    }), []);
});

test('an outcome with quotes makes Reality list other answers than the slots', () => {
    // Two slots on-chain, three answers on Reality: answer 2 (Bullrich) would pay INVALID.
    const warnings = categoricalWarnings({
        encodedQuestion: question('"Milei","Massa","Bullrich"'),
        outcomes: ['Milei","Massa', 'Bullrich'],
        tokenNames: ['MILEI_PNK', 'BULL_PNK', 'MILEI_sDAI', 'BULL_sDAI', 'INVALID_PNK', 'INVALID_sDAI'],
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
