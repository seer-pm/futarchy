/**
 * Families of chained categorical proposals (auto-qa).
 *
 * src/utils/proposalFamily.js shows a categorical proposal and the proposals
 * chained to its answers (FutarchyCategoricalFactory parentMarket /
 * parentOutcome) as one market. The fixture is the "Other" chain: a root
 * question A, B, Other, and a follow-up question D, Other on the root's Other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    attachFamilyPools, buildFamily, familyLeaves, familyMergeable, familyMergePlan, familyNodes,
    familyRedeemPlan, familyResolution, familySplitPlan, tradeSplitPlan,
} from '../../src/utils/proposalFamily.js';

const PNK = '0xC1';
const SDAI = '0xC2';
const token = (address, name) => ({ address, name });
// A fetchProposalOutcomes result: answers' tokens are <prefix><i>1 (PNK) and <prefix><i>2 (sDAI).
const proposal = (address, prefix, labels, extra = {}) => ({
    address,
    kind: 'categorical',
    companyToken: PNK,
    currencyToken: SDAI,
    parentMarket: null,
    parentOutcome: 0,
    outcomes: labels.map((label, i) => ({
        label,
        company: token(`${prefix}${i}1`, `${label}_PNK`),
        currency: token(`${prefix}${i}2`, `${label}_sDAI`),
    })),
    invalid: { company: token(`${prefix}F1`, 'INVALID_PNK'), currency: token(`${prefix}F2`, 'INVALID_sDAI') },
    warnings: [],
    ...extra,
});

const ROOT = proposal('0xR00T', '0xa', ['A', 'B', 'Other']);
const CHILD = proposal('0xC41D', '0xc', ['D', 'Other'], { parentMarket: ROOT.address, parentOutcome: 2 });
const byAddress = (...list) => new Map(list.map((p) => [p.address.toLowerCase(), p]));
const family = () => buildFamily(ROOT, new Map([[ROOT.address.toLowerCase(), [{ address: CHILD.address, parentOutcome: 2 }]]]), byAddress(ROOT, CHILD));
const balances = (entries) => new Map(entries.map(([address, value]) => [address.toLowerCase(), value]));

test('the market shows the root\'s answers with the chained one replaced by the follow-up question\'s', () => {
    const leaves = familyLeaves(family());
    assert.deepEqual(leaves.map((leaf) => [leaf.label, leaf.company.address, leaf.path.length]), [
        ['A', '0xa01', 0], ['B', '0xa11', 0], ['D', '0xc01', 1], ['Other', '0xc11', 1],
    ]);
    // Keys tell the root's Other from the follow-up question's.
    assert.equal(new Set(leaves.map((leaf) => leaf.key)).size, 4);
});

test('only the first proposal chained to an answer is followed, and the rest are a warning; others are ignored', () => {
    const second = proposal('0xSEC0', '0xe', ['E', 'Other'], { parentMarket: ROOT.address, parentOutcome: 2 });
    const otherCollateral = { ...proposal('0xBAD1', '0xf', ['F', 'Other']), currencyToken: '0xC3' };
    const outOfRange = proposal('0xBAD2', '0x9', ['G', 'Other']);
    const result = buildFamily(ROOT, new Map([[ROOT.address.toLowerCase(), [
        { address: otherCollateral.address, parentOutcome: 0 },
        { address: CHILD.address, parentOutcome: 2 },
        { address: second.address, parentOutcome: 2 },
        { address: outOfRange.address, parentOutcome: 3 },
    ]]]), byAddress(ROOT, CHILD, second, otherCollateral, outOfRange));
    assert.deepEqual(familyNodes(result).map((node) => node.proposal.address), [ROOT.address, CHILD.address]);
    assert.deepEqual(result.warnings.map((warning) => warning.code), ['several-chained-proposals']);
});

test('only the chained proposals the root lists are followed, ahead of earlier unlisted ones', () => {
    // A stranger chained 0xBAD3 on the root's Other before our CHILD.
    const stranger = proposal('0xBAD3', '0xb', ['Mallory', 'Other'], { parentMarket: ROOT.address, parentOutcome: 2 });
    const chained = new Map([[ROOT.address.toLowerCase(), [
        { address: stranger.address, parentOutcome: 2 },
        { address: CHILD.address, parentOutcome: 2 },
    ]]]);
    const proposals = byAddress(ROOT, CHILD, stranger);
    const shown = (listed) => familyLeaves(buildFamily(ROOT, chained, proposals, listed)).map((leaf) => leaf.label);
    assert.deepEqual(shown(new Set([CHILD.address.toLowerCase()])), ['A', 'B', 'D', 'Other']);
    // Nothing listed: the root alone, its Other a plain answer.
    assert.deepEqual(shown(new Set()), ['A', 'B', 'Other']);
    // Without a list, the first created wins, as before.
    assert.deepEqual(shown(null), ['A', 'B', 'Mallory', 'Other']);
});

test('every answer\'s chance is its own prediction price, and the Others without pools get what the rest leaves', () => {
    const pool = (price) => ({ address: `0xP${price}`, price });
    const f = family();
    const [root, child] = familyNodes(f);
    const chances = (rootPrices, childPrices) => {
        const rows = (labels, prices) => labels.map((label, i) => ({ label, prediction: prices[i] === null ? null : pool(prices[i]) }));
        return attachFamilyPools(f, new Map([
            [root, rows(['A', 'B', 'Other'], rootPrices)],
            [child, rows(['D', 'Other'], childPrices)],
        ]));
    };
    const rounded = (leaves) => leaves.map((leaf) => (leaf.chance === null ? null : Number(leaf.chance.toFixed(6))));

    // Prediction pools all quote in sDAI: the follow-up answers' prices are already their chance.
    // The last Other gets the root's Other (1 - .35 - .25 = .40) less D, not 1 less D.
    const { leaves, all } = chances([0.35, 0.25, null], [0.1, null]);
    assert.deepEqual(rounded(leaves), [0.35, 0.25, 0.1, 0.3]);
    // The liquidity screens list every answer; the root's Other the follow-up question splits is
    // marked chained, the last Other residual: neither needs pools.
    assert.deepEqual(all.map((row) => [row.label, row.chained, row.residual]), [
        ['A', false, false], ['B', false, false], ['Other', true, true], ['D (Other)', false, false], ['Other (Other)', false, true],
    ]);

    // Unknown when an answer above it has no price, or the others already take more than the whole.
    assert.deepEqual(rounded(chances([0.35, null, null], [0.1, null]).leaves), [0.35, null, 0.1, null]);
    assert.deepEqual(rounded(chances([0.35, 0.25, null], [0.5, null]).leaves), [0.35, 0.25, 0.5, null]);
    // Only the last answer is a residual: a candidate without a pool stays unknown.
    assert.deepEqual(rounded(chances([null, 0.25, 0.4], [0.1, null]).leaves), [null, 0.25, 0.1, 0.3]);
});

test('merging can take a chained answer\'s tokens from merging the follow-up question first', () => {
    const f = family();
    const held = balances([
        ['0xa01', 10n], ['0xa11', 10n], ['0xa21', 1n], ['0xaF1', 10n], // root: Other only 1
        ['0xc01', 5n], ['0xc11', 4n], ['0xcF1', 6n], // follow-up: 4 mergeable
    ]);
    assert.equal(familyMergeable(f, held, 'company'), 5n);
    assert.equal(familyMergeable(f, held, 'currency'), 0n);

    const plan = familyMergePlan(f, 'company', 5n, held);
    assert.deepEqual(plan.map((step) => [step.proposal, step.amount, step.collateralToken, step.outcomeTokens.join()]), [
        [CHILD.address, 4n, PNK, '0xc01,0xc11,0xcF1'],
        [ROOT.address, 5n, PNK, '0xa01,0xa11,0xa21,0xaF1'],
    ]);
    // Holding enough of Other, nothing below the root is merged.
    assert.deepEqual(familyMergePlan(f, 'company', 1n, held).map((step) => step.proposal), [ROOT.address]);
});

test('a split goes down through every question, each spending the token of the answer above it', () => {
    const plan = familySplitPlan(family(), 'currency', 3n);
    assert.deepEqual(plan.map((step) => [step.proposal, step.collateralToken, step.sourceToken.address, step.amount]), [
        [ROOT.address, SDAI, SDAI, 3n],
        [CHILD.address, SDAI, '0xa22', 3n],
    ]);
});

test('a trade splits only what is missing, from the closest token held up to the collateral', () => {
    const [a, , d] = familyLeaves(family());
    const held = balances([['0xc02', 1n], ['0xa22', 2n], [SDAI, 10n], ['0xa02', 1n]]);

    // Spend 6 D_sDAI holding 1: split 5 in the follow-up question, which needs 5 Other_sDAI; 2 are held, 3 come from sDAI.
    const deep = tradeSplitPlan(d, 'currency', 6n, held);
    assert.deepEqual(deep.steps.map((step) => [step.proposal, step.sourceToken.address, step.amount]), [
        [ROOT.address, SDAI, 3n],
        [CHILD.address, '0xa22', 5n],
    ]);
    assert.equal(deep.available, 13n);

    // Holding enough Other_sDAI, the collateral is not touched.
    assert.deepEqual(tradeSplitPlan(d, 'currency', 3n, held).steps.map((step) => [step.proposal, step.amount]), [[CHILD.address, 2n]]);
    // An answer of the root splits the collateral only.
    assert.deepEqual(tradeSplitPlan(a, 'currency', 4n, held).steps.map((step) => [step.proposal, step.amount]), [[ROOT.address, 3n]]);
    assert.equal(tradeSplitPlan(a, 'currency', 1n, held).steps.length, 0);
});

const resolved = (index) => ({ resolved: true, outcome: index === 'invalid' ? 'invalid' : null, outcomeIndex: index === 'invalid' ? null : index });
const resolutionOf = (rootResolution, childResolution) => (node) => (node.parent ? childResolution : rootResolution);
const HOLDINGS = balances([
    ['0xa01', 1n], ['0xa02', 2n], // A
    ['0xa21', 3n], ['0xa22', 4n], // root Other
    ['0xc01', 5n], ['0xc02', 6n], // D
    ['0xcF1', 7n], ['0xcF2', 8n], // follow-up INVALID
]);

test('a follow-up answer wins when the root resolves to the chained answer and the follow-up to it', () => {
    const f = family();
    const resolution = familyResolution(f, resolutionOf(resolved(2), resolved(0)));
    assert.equal(resolution.resolved, true);
    assert.equal(resolution.winner.label, 'D');
    // D pays Other tokens, which pay the collateral with the Other tokens already held.
    assert.deepEqual(familyRedeemPlan(resolution, HOLDINGS).map((step) => [step.proposal, step.company.address, step.amounts.company, step.amounts.currency]), [
        [CHILD.address, '0xc01', 5n, 6n],
        [ROOT.address, '0xa21', 8n, 10n],
    ]);
});

test('while the follow-up question is open the Other tokens held can be redeemed, and nothing has won yet', () => {
    const resolution = familyResolution(family(), resolutionOf(resolved(2), { resolved: false }));
    assert.equal(resolution.resolved, false);
    assert.equal(resolution.pending.proposal.address, CHILD.address);
    assert.deepEqual(familyRedeemPlan(resolution, HOLDINGS).map((step) => [step.proposal, step.amounts.company]), [[ROOT.address, 3n]]);
});

test('a root answer, or an Invalid follow-up question, pays like any other slot', () => {
    const rootWins = familyResolution(family(), resolutionOf(resolved(0), { resolved: false }));
    assert.equal(rootWins.winner.label, 'A');
    assert.deepEqual(familyRedeemPlan(rootWins, HOLDINGS).map((step) => [step.proposal, step.amounts.company, step.amounts.currency]), [[ROOT.address, 1n, 2n]]);

    const invalidBelow = familyResolution(family(), resolutionOf(resolved(2), resolved('invalid')));
    assert.equal(invalidBelow.winner.isInvalid, true);
    assert.equal(invalidBelow.winner.node.proposal.address, CHILD.address);
    assert.deepEqual(familyRedeemPlan(invalidBelow, HOLDINGS).map((step) => [step.company.address, step.amounts.company]), [
        ['0xcF1', 7n], ['0xa21', 10n],
    ]);

    assert.equal(familyResolution(family(), () => ({ resolved: false })).pending, null);
});

