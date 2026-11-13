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
import { categoricalWarnings, wrappedTokenName } from '../../src/utils/proposalOutcomes.js';

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
