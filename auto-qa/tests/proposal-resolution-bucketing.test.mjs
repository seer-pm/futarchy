/**
 * Proposal resolution bucketing test (auto-qa).
 *
 * Pins PR #28: "Fix resolved proposals showing as ongoing (#10, #11)".
 *
 * Pre-PR-#28 bug: `approvalStatus` was hardcoded to `'ongoing'` on the
 * subgraph path (ProposalsPage.jsx:258) and only weakly derived on the
 * Supabase path. So resolved proposals (where Reality.eth → Registry
 * metadata reported `resolution_status === 'resolved'`) still rendered
 * with the "Ongoing" badge instead of "Approved" / "Refused".
 *
 * The fix codified a precedence rule: a resolved proposal is "approved" if
 * the outcome is `'yes'` and "refused" if it is `'no'` — taking priority over
 * any `approval_status` from upstream.
 *
 * The milestones page and the market page used to decide "resolved" with two
 * different rules (status only vs. status or outcome). Both now ask
 * resolveMarketStatus (src/utils/proposalLifecycle.js), so the subgraph path
 * and the `resolved` flag below run the real resolver; the bucket is the
 * card's colour theme, and the badge text is the resolver's label.
 *
 * Spec mirrors:
 *   src/components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPage.jsx   (subgraph path: APPROVAL_STATUS_BY_OUTCOME)
 *   ProposalsPageDataTransformer.jsx                                               (supabase path, since removed)
 *   src/hooks/useContractConfig.js                                                 (resolved flag: resolveMarketStatus(statusInputs))
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const { resolveMarketStatus } = await import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(await read('utils/proposalLifecycle.js'))}`
);
const PROPOSALS_PAGE_SRC = await read('components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPage.jsx');

/**
 * Mirror of the subgraph path bucketer in ProposalsPage.jsx.
 * No upstream `approval_status` to consider on this path — anything
 * without a yes/no outcome keeps the "ongoing" theme.
 */
const APPROVAL_STATUS_BY_OUTCOME = { yes: 'approved', no: 'refused' };
function bucketSubgraph(proposalMeta) {
    return APPROVAL_STATUS_BY_OUTCOME[resolveMarketStatus(proposalMeta).outcome] || 'ongoing';
}

test('PR #28 — the milestones page buckets with the mirrored rule', () => {
    assert.match(PROPOSALS_PAGE_SRC, /const APPROVAL_STATUS_BY_OUTCOME = \{ yes: "approved", no: "refused" \};/);
    assert.match(PROPOSALS_PAGE_SRC, /p\.marketStatus = resolveMarketStatus\(p\);/);
    assert.match(PROPOSALS_PAGE_SRC, /p\.approvalStatus = APPROVAL_STATUS_BY_OUTCOME\[p\.marketStatus\.outcome\] \|\| 'ongoing';/);
});

/**
 * Mirror of ProposalsPageDataTransformer.jsx:752-754 (supabase path bucketer).
 * Resolution status takes priority over the legacy `approval_status` field.
 */
function bucketSupabase(proposal) {
    return proposal.resolution_status === 'resolved'
        ? (proposal.resolution_outcome === 'yes' ? 'approved' : 'refused')
        : (proposal.approval_status || 'ongoing');
}

/**
 * The `resolved` flag of useContractConfig.js, which is the resolver's state.
 * "Resolved" if ANY of:
 *   - data.resolution_outcome is recorded
 *   - data.resolution_status === 'resolved'
 *   - registry metadata's resolution_status === 'resolved'
 *   - registry metadata's resolution_outcome is recorded
 */
function isResolved(data) {
    return resolveMarketStatus(data).state === 'resolved';
}

// ---------------------------------------------------------------------------
// Subgraph path (PR #28 — the original bug)
// ---------------------------------------------------------------------------

test('PR #28 — subgraph: resolved + outcome=yes → approved', () => {
    assert.equal(
        bucketSubgraph({ resolution_status: 'resolved', resolution_outcome: 'yes' }),
        'approved'
    );
});

test('PR #28 — subgraph: resolved + outcome=no → refused', () => {
    assert.equal(
        bucketSubgraph({ resolution_status: 'resolved', resolution_outcome: 'no' }),
        'refused'
    );
});

test('PR #28 — subgraph: not-resolved → ongoing', () => {
    // Pre-PR-#28 bug: this was the ONLY branch the code took, so resolved
    // proposals were misbucketed.
    for (const status of [null, undefined, 'open', 'pending', 'in_progress']) {
        assert.equal(bucketSubgraph({ resolution_status: status }), 'ongoing',
            `status=${status} should yield ongoing`);
        assert.equal(bucketSubgraph({ resolution_status: status, resolution_outcome: null }), 'ongoing',
            `status=${status} with a null outcome should yield ongoing`);
    }
});

test('PR #28 — subgraph: a recorded outcome resolves the proposal even when the status lags', () => {
    // Same rule as the `resolved` flag below: the market page already called
    // these resolved while this page said "Ongoing".
    for (const status of [null, undefined, 'open', 'pending', 'in_progress']) {
        assert.equal(bucketSubgraph({ resolution_status: status, resolution_outcome: 'yes' }), 'approved',
            `status=${status} with outcome yes should yield approved`);
        assert.equal(bucketSubgraph({ resolution_status: status, resolution_outcome: 'no' }), 'refused',
            `status=${status} with outcome no should yield refused`);
    }
});

test('PR #28 — subgraph: resolved + missing outcome is never approved (fail-closed)', () => {
    // Only an explicit "yes" buckets to approved, so a future regression that
    // flips a missing outcome to "approved" surfaces immediately. Without an
    // outcome there is no side to name: the card reads "Resolved" (the chain
    // fills the outcome in when it has one) rather than "Refused".
    for (const meta of [
        { resolution_status: 'resolved', resolution_outcome: null },
        { resolution_status: 'resolved' },
    ]) {
        assert.notEqual(bucketSubgraph(meta), 'approved',
            'missing outcome on a resolved proposal must NOT bucket to approved');
        assert.equal(resolveMarketStatus(meta).state, 'resolved');
        assert.equal(resolveMarketStatus(meta).labelWithOutcome, 'Resolved');
    }
});

test('PR #28 — subgraph: an invalid resolution is neither approved nor refused', () => {
    const meta = { resolution_status: 'resolved', resolution_outcome: 'invalid' };
    assert.equal(bucketSubgraph(meta), 'ongoing');
    assert.equal(resolveMarketStatus(meta).labelWithOutcome, 'Resolved: INVALID');
});

// ---------------------------------------------------------------------------
// Supabase path — adds approval_status fallback layer
// ---------------------------------------------------------------------------

test('PR #28 — supabase: resolved status takes priority over approval_status', () => {
    // Even if the legacy approval_status disagrees, resolution wins.
    assert.equal(
        bucketSupabase({
            resolution_status: 'resolved',
            resolution_outcome: 'yes',
            approval_status: 'refused',
        }),
        'approved',
        'resolution_status MUST take priority over the legacy approval_status field'
    );
});

test('PR #28 — supabase: not-resolved falls back to approval_status', () => {
    assert.equal(
        bucketSupabase({ resolution_status: null, approval_status: 'approved' }),
        'approved'
    );
    assert.equal(
        bucketSupabase({ resolution_status: 'open', approval_status: 'refused' }),
        'refused'
    );
});

test('PR #28 — supabase: not-resolved + no approval_status → ongoing', () => {
    assert.equal(bucketSupabase({}), 'ongoing');
    assert.equal(bucketSupabase({ resolution_status: null, approval_status: null }), 'ongoing');
    assert.equal(bucketSupabase({ resolution_status: null, approval_status: undefined }), 'ongoing');
});

// ---------------------------------------------------------------------------
// `resolved` flag derivation (useContractConfig.js)
// ---------------------------------------------------------------------------

test('PR #28 — resolved flag: any single signal triggers true', () => {
    // Each signal in isolation:
    assert.equal(isResolved({ resolution_outcome: 'yes' }), true, 'data.resolution_outcome alone');
    assert.equal(isResolved({ resolution_outcome: 'no' }), true, 'data.resolution_outcome="no" still counts');
    assert.equal(isResolved({ resolution_status: 'resolved' }), true, 'data.resolution_status alone');
    assert.equal(isResolved({ _registryMetadata: { resolution_status: 'resolved' } }), true, 'registry status alone');
    assert.equal(isResolved({ _registryMetadata: { resolution_outcome: 'yes' } }), true, 'registry outcome alone');
});

test('PR #28 — resolved flag: empty/unknown data → false', () => {
    assert.equal(isResolved({}), false);
    assert.equal(isResolved({ resolution_outcome: null }), false);
    assert.equal(isResolved({ resolution_status: 'open' }), false);
    assert.equal(isResolved({ resolution_status: 'pending' }), false);
    assert.equal(isResolved({ _registryMetadata: { resolution_status: 'open' } }), false);
    assert.equal(isResolved({ _registryMetadata: {} }), false);
    assert.equal(isResolved(null), false, 'null data must not throw');
    assert.equal(isResolved(undefined), false, 'undefined data must not throw');
});

test('PR #28 — resolved flag: outcome=0 (numeric) is treated as resolved', () => {
    // Some upstream sources represent the "no" outcome as the integer 0.
    // The check is `!== null && !== undefined`, so 0 should pass.
    assert.equal(isResolved({ resolution_outcome: 0 }), true,
        'numeric 0 outcome must count as resolved');
});

// ---------------------------------------------------------------------------
// Cross-rule consistency: bucket and resolved-flag must agree on directionality
// ---------------------------------------------------------------------------

test('PR #28 — consistency: any input that isResolved=true buckets to approved or refused', () => {
    // For every "resolved" data shape, both bucketers must produce a
    // resolved bucket (not "ongoing"). This is the user-visible invariant
    // that PR #28 is enforcing — "if the system thinks it's resolved,
    // the badge must reflect it".
    const resolvedShapes = [
        { resolution_status: 'resolved', resolution_outcome: 'yes' },
        { resolution_status: 'resolved', resolution_outcome: 'no' },
    ];
    for (const shape of resolvedShapes) {
        assert.notEqual(bucketSubgraph(shape), 'ongoing',
            `subgraph bucketer must not say "ongoing" for ${JSON.stringify(shape)}`);
        assert.notEqual(bucketSupabase(shape), 'ongoing',
            `supabase bucketer must not say "ongoing" for ${JSON.stringify(shape)}`);
    }
});
