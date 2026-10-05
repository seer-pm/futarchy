import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../../src/utils/proposalLifecycle.js');
const source = await readFile(sourcePath, 'utf8');
const lifecycle = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);

const {
    isProposalActive,
    normalizeUnixTimestamp,
    resolveMarketStatus,
} = lifecycle;

// The lifecycle predicates the lists used to call one by one are all read off
// resolveMarketStatus now; these keep the same questions.
const stateOf = (proposal, now = NOW) => resolveMarketStatus(proposal, now).state;
const isResolved = (proposal) => stateOf(proposal) === 'resolved';
// "Recently Closed" takes everything that is not active: ended or resolved.
const isClosedOrResolved = (proposal, now = NOW) => stateOf(proposal, now) !== 'active';

const NOW = 1_780_000_000;
const FUTURE = NOW + 86_400;
const PAST = NOW - 60;

test('normalizeUnixTimestamp accepts seconds, milliseconds, numeric strings, and dates', () => {
    assert.equal(normalizeUnixTimestamp(1_700_000_000), 1_700_000_000);
    assert.equal(normalizeUnixTimestamp(1_700_000_000_123), 1_700_000_000);
    assert.equal(normalizeUnixTimestamp('1700000000'), 1_700_000_000);
    assert.equal(normalizeUnixTimestamp('2026-06-30T00:00:00.000Z'), 1_782_777_600);
});

test('normalizeUnixTimestamp rejects empty, invalid, and non-positive values', () => {
    for (const value of [null, undefined, '', 'not a date', 0, -1, Number.POSITIVE_INFINITY]) {
        assert.equal(normalizeUnixTimestamp(value), null, `${String(value)} should normalize to null`);
    }
});

test('active metadata excludes archived, hidden, resolved, and already-ended proposals', () => {
    assert.equal(isProposalActive({ closeTimestamp: FUTURE }, NOW), true);
    assert.equal(isProposalActive({ archived: true, closeTimestamp: FUTURE }, NOW), false);
    assert.equal(isProposalActive({ archived: 'true', closeTimestamp: FUTURE }, NOW), false);
    assert.equal(isProposalActive({ visibility: 'hidden', closeTimestamp: FUTURE }, NOW), false);
    assert.equal(isProposalActive({ resolution_status: 'resolved', closeTimestamp: FUTURE }, NOW), false);
    assert.equal(isProposalActive({ resolution_outcome: 'yes', closeTimestamp: FUTURE }, NOW), false);
    assert.equal(isProposalActive({ closeTimestamp: PAST }, NOW), false);
});

test('ended but unresolved metadata is not active and is closed', () => {
    const staleMetadata = {
        resolution_status: 'pending',
        resolution_outcome: '',
        closeTimestamp: PAST,
    };

    assert.equal(isResolved(staleMetadata), false);
    assert.equal(stateOf(staleMetadata), 'awaiting_resolution');
    assert.equal(isProposalActive(staleMetadata, NOW), false);
});

test('recently closed predicate includes ended proposals even without resolution metadata', () => {
    const staleEndedProposal = {
        proposalAddress: '0xeCe80208CB8376Be311cE0f5Ea4eF73850a0dcF0',
        resolution_status: 'pending',
        metadata: {
            title: 'GIP-151 stale metadata regression shape',
            closeTimestamp: PAST,
        },
    };

    assert.equal(isResolved(staleEndedProposal), false);
    assert.equal(stateOf(staleEndedProposal), 'awaiting_resolution');
    assert.equal(
        isClosedOrResolved(staleEndedProposal),
        true,
        'ended proposals with stale resolution metadata must route to Recently Closed'
    );
});

test('active and recently closed predicates do not overlap for ended or resolved proposals', () => {
    const cases = [
        { metadata: { closeTimestamp: PAST }, proposal: { metadata: { closeTimestamp: PAST } } },
        {
            metadata: { closeTimestamp: FUTURE, resolution_status: 'resolved', resolution_outcome: 'yes' },
            proposal: { closeTimestamp: FUTURE, resolution_status: 'resolved', resolution_outcome: 'yes' },
        },
        {
            metadata: { closeTimestamp: FUTURE, finalOutcome: 'no' },
            proposal: { closeTimestamp: FUTURE, finalOutcome: 'no' },
        },
    ];

    for (const { metadata, proposal } of cases) {
        assert.equal(isProposalActive(metadata, NOW), false);
        assert.equal(isClosedOrResolved(proposal), true);
    }
});

test('proposal end time supports top-level and nested metadata shapes', () => {
    const endTimeOf = (proposal) => resolveMarketStatus(proposal, NOW).closeTime;
    assert.equal(endTimeOf({ endTime: FUTURE }), FUTURE);
    assert.equal(endTimeOf({ closeTimestamp: FUTURE }), FUTURE);
    assert.equal(endTimeOf({ end_time: FUTURE }), FUTURE);
    assert.equal(endTimeOf({ metadata: { endTime: FUTURE } }), FUTURE);
    assert.equal(endTimeOf({ metadata: { closeTimestamp: FUTURE } }), FUTURE);
    assert.equal(endTimeOf({}), null);
});

test('resolved proposal predicate supports status and outcome aliases', () => {
    assert.equal(isResolved({ resolution_status: 'resolved' }), true);
    assert.equal(isResolved({ resolutionStatus: 'resolved' }), true);
    assert.equal(isResolved({ status: 'resolved' }), true);
    assert.equal(isResolved({ resolution_outcome: 'yes' }), true);
    assert.equal(isResolved({ resolutionOutcome: 'no' }), true);
    assert.equal(isResolved({ finalOutcome: 0 }), true);
    assert.equal(isResolved({ metadata: { resolution_status: 'resolved' } }), true);
    assert.equal(isResolved({ metadata: { finalOutcome: 'yes' } }), true);
    assert.equal(isResolved({ resolution_status: 'pending', resolution_outcome: '' }), false);
});

test('a recorded outcome treats null, undefined, and empty string as missing only', () => {
    assert.equal(isResolved({ resolution_outcome: null }), false);
    assert.equal(isResolved({ resolution_outcome: undefined }), false);
    assert.equal(isResolved({ resolution_outcome: '' }), false);
    assert.equal(isResolved({ resolution_outcome: 0 }), true);
    assert.equal(isResolved({ metadata: { finalOutcome: 'no' } }), true);
    assert.equal(resolveMarketStatus({ metadata: { finalOutcome: 'no' } }).outcome, 'no');
});

test('an on-chain resolution marks a metadata-unresolved proposal resolved with its outcome', () => {
    const proposal = {
        resolutionStatus: 'unresolved',
        resolution_status: null,
        endTime: null,
        onChainResolution: { resolved: true, outcome: 'no' },
    };

    assert.equal(isResolved(proposal), true);
    assert.equal(isClosedOrResolved(proposal), true);
    assert.equal(resolveMarketStatus(proposal, NOW).outcome, 'no');
    assert.equal(resolveMarketStatus(proposal, NOW).outcomeLabel, 'NO');
});

test('an on-chain resolution keeps an outcome metadata already recorded, and unresolved results change nothing', () => {
    const recorded = {
        resolution_status: 'closed',
        resolutionOutcome: 'yes',
        resolution_outcome: 'yes',
        onChainResolution: { resolved: true, outcome: 'no' },
    };
    assert.equal(resolveMarketStatus(recorded, NOW).outcome, 'yes');
    assert.equal(stateOf(recorded), 'resolved');

    for (const result of [{ resolved: false, outcome: null }, null, undefined]) {
        const open = { endTime: FUTURE, onChainResolution: result };
        assert.equal(isResolved(open), false);
        assert.equal(isClosedOrResolved(open), false);
    }
});

test('a proposal with no close time is never closed by time alone', () => {
    assert.equal(isClosedOrResolved({ endTime: null }), false);
    assert.equal(stateOf({ endTime: null }), 'active');
});
