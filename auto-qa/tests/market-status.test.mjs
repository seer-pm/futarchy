/**
 * Market status resolver (auto-qa).
 *
 * Pins resolveMarketStatus in src/utils/proposalLifecycle.js — the one
 * function the homepage, the organisation pages and the market page all ask
 * for a market's state, outcome and wording:
 *   state    — active / awaiting_resolution / resolved
 *   outcome  — yes / no / invalid, from the registry or the chain
 *   labels   — the same words on every page
 *   closeTime / showCountdown — only an active market with a deadline counts down
 * and that the pages do go through it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');

const {
    describeMarketStatus,
    needsOnChainResolution,
    resolveMarketStatus,
} = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(await read('utils/proposalLifecycle.js'))}`);

const NOW = 1_780_000_000;
const FUTURE = NOW + 86_400;
const PAST = NOW - 60;

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

test('state — active before the close time, awaiting resolution after it', () => {
    assert.equal(resolveMarketStatus({ closeTimestamp: FUTURE }, NOW).state, 'active');
    assert.equal(resolveMarketStatus({ closeTimestamp: PAST }, NOW).state, 'awaiting_resolution');
    assert.equal(resolveMarketStatus({ closeTimestamp: NOW }, NOW).state, 'awaiting_resolution');
});

test('state — a market with no close time stays active', () => {
    for (const market of [{}, { closeTimestamp: null }, { endTime: '' }, undefined, null]) {
        const status = resolveMarketStatus(market, NOW);
        assert.equal(status.state, 'active');
        assert.equal(status.closeTime, null);
    }
});

test('state — resolved by registry status, registry outcome or the chain, whatever the clock says', () => {
    const resolvedShapes = [
        { resolution_status: 'resolved' },
        { resolution_outcome: 'no' },
        { _registryMetadata: { resolution_status: 'resolved' } },
        { _registryMetadata: { resolution_outcome: 'yes' } },
        { onChainResolution: { resolved: true, outcome: 'yes' } },
        { onChainResolution: { resolved: true, outcome: null } },
    ];
    for (const shape of resolvedShapes) {
        for (const closeTimestamp of [FUTURE, PAST, null]) {
            assert.equal(
                resolveMarketStatus({ ...shape, closeTimestamp }, NOW).state,
                'resolved',
                `${JSON.stringify(shape)} with close time ${closeTimestamp}`
            );
        }
    }
});

test('state — unresolved registry values and unresolved chain reads do not resolve a market', () => {
    const unresolvedShapes = [
        { resolution_status: 'unresolved' },
        { resolution_status: 'open' },
        { resolution_status: 'closed' },
        { resolution_status: 'pending', resolution_outcome: '' },
        { resolution_outcome: null, _registryMetadata: { resolution_status: null, resolution_outcome: null } },
        { onChainResolution: { resolved: false, outcome: null } },
        { onChainResolution: null },
    ];
    for (const shape of unresolvedShapes) {
        assert.equal(resolveMarketStatus({ ...shape, closeTimestamp: FUTURE }, NOW).state, 'active', JSON.stringify(shape));
        assert.equal(resolveMarketStatus({ ...shape, closeTimestamp: PAST }, NOW).state, 'awaiting_resolution', JSON.stringify(shape));
    }
});

// ---------------------------------------------------------------------------
// outcome
// ---------------------------------------------------------------------------

test('outcome — yes / no / invalid in any case, from the registry or the chain', () => {
    assert.equal(resolveMarketStatus({ resolution_outcome: 'yes' }).outcome, 'yes');
    assert.equal(resolveMarketStatus({ resolution_outcome: 'No' }).outcome, 'no');
    assert.equal(resolveMarketStatus({ resolution_outcome: ' INVALID ' }).outcome, 'invalid');
    assert.equal(resolveMarketStatus({ _registryMetadata: { resolution_outcome: 'YES' } }).outcome, 'yes');
    assert.equal(resolveMarketStatus({ onChainResolution: { resolved: true, outcome: 'no' } }).outcome, 'no');
    // fetchOnChainResolution (single market) capitalises its outcome
    assert.equal(resolveMarketStatus({ onChainResolution: { resolved: true, outcome: 'Invalid' } }).outcome, 'invalid');
});

test('outcome — invalid never collapses into yes or no', () => {
    for (const market of [
        { resolution_status: 'resolved', resolution_outcome: 'invalid' },
        { onChainResolution: { resolved: true, outcome: 'invalid' } },
    ]) {
        const status = resolveMarketStatus(market);
        assert.equal(status.state, 'resolved');
        assert.equal(status.outcome, 'invalid');
        assert.equal(status.outcomeLabel, 'INVALID');
        assert.equal(status.labelWithOutcome, 'Resolved: INVALID');
    }
});

test('outcome — the registry outcome is kept, the chain fills in when the registry has none', () => {
    const chain = { resolved: true, outcome: 'no' };
    assert.equal(resolveMarketStatus({ resolution_outcome: 'yes', onChainResolution: chain }).outcome, 'yes');
    assert.equal(resolveMarketStatus({ resolution_status: 'resolved', onChainResolution: chain }).outcome, 'no');
    assert.equal(resolveMarketStatus({ resolution_status: 'resolved', resolution_outcome: '', onChainResolution: chain }).outcome, 'no');
    // an outcome the registry spells in a way nobody recognises is not a side
    assert.equal(resolveMarketStatus({ resolution_outcome: 'approved', onChainResolution: chain }).outcome, 'no');
});

test('outcome — null while unresolved and when a resolved market records none', () => {
    assert.equal(resolveMarketStatus({ closeTimestamp: FUTURE }, NOW).outcome, null);
    assert.equal(resolveMarketStatus({ closeTimestamp: PAST }, NOW).outcome, null);
    assert.equal(resolveMarketStatus({ onChainResolution: { resolved: false, outcome: 'yes' } }).outcome, null);

    const unknown = resolveMarketStatus({ resolution_status: 'resolved' });
    assert.equal(unknown.outcome, null);
    assert.equal(unknown.outcomeLabel, null);
    assert.equal(unknown.labelWithOutcome, 'Resolved');
});

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------

test('labels — one wording per state, with a short form for narrow cells', () => {
    const active = resolveMarketStatus({ closeTimestamp: FUTURE }, NOW);
    assert.deepEqual(
        [active.label, active.shortLabel, active.labelWithOutcome, active.outcomeLabel],
        ['Active', 'Active', 'Active', null]
    );

    const awaiting = resolveMarketStatus({ closeTimestamp: PAST }, NOW);
    assert.deepEqual(
        [awaiting.label, awaiting.shortLabel, awaiting.labelWithOutcome, awaiting.outcomeLabel],
        ['Awaiting Resolution', 'Awaiting', 'Awaiting Resolution', null]
    );

    const yes = resolveMarketStatus({ resolution_status: 'resolved', resolution_outcome: 'yes' });
    assert.deepEqual(
        [yes.label, yes.shortLabel, yes.labelWithOutcome, yes.outcomeLabel],
        ['Resolved', 'Resolved', 'Resolved: YES', 'YES']
    );
    assert.equal(resolveMarketStatus({ resolution_outcome: 'no' }).labelWithOutcome, 'Resolved: NO');
});

test('labels — describeMarketStatus words a status exactly as the resolver does', () => {
    const cases = [
        [{ closeTimestamp: FUTURE }, ['active', null]],
        [{ closeTimestamp: PAST }, ['awaiting_resolution', null]],
        [{ resolution_status: 'resolved' }, ['resolved', null]],
        [{ resolution_outcome: 'yes' }, ['resolved', 'yes']],
        [{ resolution_outcome: 'no' }, ['resolved', 'no']],
        [{ resolution_outcome: 'invalid' }, ['resolved', 'invalid']],
    ];
    for (const [market, [state, outcome]] of cases) {
        const status = resolveMarketStatus(market, NOW);
        const described = describeMarketStatus(state, outcome);
        for (const key of ['label', 'shortLabel', 'outcomeLabel', 'labelWithOutcome']) {
            assert.equal(described[key], status[key], `${state}/${outcome} ${key}`);
        }
    }
    // an outcome only words a resolved market
    assert.equal(describeMarketStatus('active', 'yes').labelWithOutcome, 'Active');
});

// ---------------------------------------------------------------------------
// closeTime / showCountdown
// ---------------------------------------------------------------------------

test('closeTime — seconds, milliseconds and date strings normalise to Unix seconds', () => {
    assert.equal(resolveMarketStatus({ closeTimestamp: FUTURE }, NOW).closeTime, FUTURE);
    assert.equal(resolveMarketStatus({ endTime: FUTURE * 1000 }, NOW).closeTime, FUTURE);
    assert.equal(resolveMarketStatus({ closeTimestamp: String(FUTURE) }, NOW).closeTime, FUTURE);
    assert.equal(resolveMarketStatus({ endTime: '2026-06-30T00:00:00.000Z' }, NOW).closeTime, 1_782_777_600);
    assert.equal(resolveMarketStatus({ _registryMetadata: { closeTimestamp: FUTURE } }, NOW).closeTime, FUTURE);
    assert.equal(resolveMarketStatus({ closeTimestamp: 'not a date' }, NOW).closeTime, null);
});

test('showCountdown — only an active market with a close time counts down', () => {
    assert.equal(resolveMarketStatus({ closeTimestamp: FUTURE }, NOW).showCountdown, true);
    assert.equal(resolveMarketStatus({}, NOW).showCountdown, false);
    assert.equal(resolveMarketStatus({ closeTimestamp: PAST }, NOW).showCountdown, false);
    // resolved before its deadline: no countdown, though the close time is still ahead
    const resolvedEarly = resolveMarketStatus(
        { closeTimestamp: FUTURE, onChainResolution: { resolved: true, outcome: 'yes' } },
        NOW
    );
    assert.equal(resolvedEarly.showCountdown, false);
    assert.equal(resolvedEarly.closeTime, FUTURE);
});

// ---------------------------------------------------------------------------
// needsOnChainResolution
// ---------------------------------------------------------------------------

test('needsOnChainResolution — true until both "resolved" and the outcome are known', () => {
    assert.equal(needsOnChainResolution({}), true);
    assert.equal(needsOnChainResolution({ closeTimestamp: 1 }), true);
    assert.equal(needsOnChainResolution({ resolution_status: 'resolved' }), true);
    assert.equal(needsOnChainResolution({ resolution_status: 'resolved', resolution_outcome: 'maybe' }), true);
    assert.equal(needsOnChainResolution({ resolution_status: 'resolved', resolution_outcome: 'no' }), false);
    assert.equal(needsOnChainResolution({ resolution_outcome: 'invalid' }), false);
    assert.equal(needsOnChainResolution({ onChainResolution: { resolved: true, outcome: 'yes' } }), false);
});

// ---------------------------------------------------------------------------
// The same market, as each page holds it, gets the same status
// ---------------------------------------------------------------------------

test('one market in the shapes the pages hold resolves to one status', () => {
    const registryMeta = { closeTimestamp: PAST, resolution_status: 'unresolved' };
    const chain = { resolved: true, outcome: 'yes' };
    const shapes = [
        // list card (useAggregatorProposals / ProposalsPage)
        { resolution_status: 'unresolved', resolution_outcome: null, closeTimestamp: PAST, endTime: PAST, metadata: registryMeta, onChainResolution: chain },
        // market page inputs (useContractConfig); the single-market read capitalises
        { resolution_status: null, resolution_outcome: null, _registryMetadata: registryMeta, metadata: { finalOutcome: undefined }, endTime: PAST, onChainResolution: { resolved: true, outcome: 'Yes' } },
        // market page marketInfo (MarketHero)
        { resolved: true, resolutionStatus: 'resolved', finalOutcome: 'Yes', endTime: PAST, closeTimestamp: PAST },
    ];
    for (const shape of shapes) {
        const { state, outcome, labelWithOutcome, closeTime } = resolveMarketStatus(shape, NOW);
        assert.deepEqual({ state, outcome, labelWithOutcome, closeTime }, {
            state: 'resolved', outcome: 'yes', labelWithOutcome: 'Resolved: YES', closeTime: PAST,
        });
    }
});

// ---------------------------------------------------------------------------
// The pages go through the resolver
// ---------------------------------------------------------------------------

test('every status call site derives it from resolveMarketStatus', async () => {
    const callSites = [
        'hooks/useAggregatorProposals.js',
        'hooks/useContractConfig.js',
        'components/futarchyFi/companyList/page/EventsHighlightDataTransformer.jsx',
        'components/futarchyFi/companyList/page/ResolvedEventsDataTransformer.jsx',
        'components/futarchyFi/companyList/cards/highlightCards/EventHighlightCard.jsx',
        'components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPage.jsx',
        'components/futarchyFi/marketPage/showcase/MarketHero.jsx',
        'components/futarchyFi/marketPage/showcase/MarketChartSection.jsx',
        'components/chart/SubgraphChart.jsx',
    ];
    for (const path of callSites) {
        const source = await read(path);
        assert.match(source, /utils\/proposalLifecycle['"]/, `${path} imports the resolver module`);
        assert.match(source, /resolveMarketStatus\(/, `${path} calls resolveMarketStatus`);
    }
});

test('the market page config builds resolved / finalOutcome from the resolver, Invalid kept apart', async () => {
    const source = await read('hooks/useContractConfig.js');
    assert.match(source, /const marketStatus = resolveMarketStatus\(statusInputs\)/);
    assert.match(source, /resolved: isMarketResolved,/);
    assert.match(source, /finalOutcome: FINAL_OUTCOME_BY_OUTCOME\[marketStatus\.outcome\] \|\| null/);
    assert.match(source, /FINAL_OUTCOME_BY_OUTCOME = \{ yes: 'Yes', no: 'No', invalid: 'Invalid' \}/);
    assert.doesNotMatch(source, /metadataResolved/);
});

test('the hero, the cards and the milestone badge print the resolver\'s wording', async () => {
    const hero = await read('components/futarchyFi/marketPage/showcase/MarketHero.jsx');
    assert.match(hero, /label="Status"\s+value=\{marketStatus\.shortLabel\}/);
    assert.match(hero, /text: marketStatus\.labelWithOutcome/);
    assert.doesNotMatch(hero, /'Active'|'Resolved'|Resolved: /);

    const chart = await read('components/chart/SubgraphChart.jsx');
    assert.doesNotMatch(chart, /Market Closed/);
    // The spot line and the Spot / Status cell follow the resolver's state,
    // so a market resolved before its close time stops showing spot.
    assert.doesNotMatch(chart, /Date\.now\(\) \/ 1000\) > c/);
    assert.match(chart, /marketStatus\.state !== 'active' \?/);

    const tradePanel = await read('components/futarchyFi/marketPage/ShowcaseSwapComponent.jsx');
    assert.match(tradePanel, /resolveMarketStatus\(config\?\.marketInfo\)\.labelWithOutcome/);
    assert.doesNotMatch(tradePanel, /Market Closed/);

    const closedCard = await read('components/futarchyFi/companyList/cards/highlightCards/HighlightCards.jsx');
    assert.match(closedCard, /marketStatus\.outcomeLabel \|\| marketStatus\.shortLabel/);
    assert.doesNotMatch(closedCard, /'Closed'|'Resolved'/);

    const milestoneCard = await read('components/futarchyFi/proposalsList/cards/ProposalsCard.jsx');
    assert.match(milestoneCard, /\{marketStatus\?\.labelWithOutcome \|\| statusText\}/);
});
