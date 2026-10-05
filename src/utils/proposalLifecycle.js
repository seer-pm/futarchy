export function normalizeUnixTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value > 10000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
        return normalizeUnixTimestamp(numeric);
    }

    const parsedMs = Date.parse(trimmed);
    if (Number.isFinite(parsedMs)) {
        return Math.floor(parsedMs / 1000);
    }

    return null;
}

export function isProposalArchived(metadata = {}) {
    return metadata.archived === true || metadata.archived === 'true';
}

export function isProposalHidden(metadata = {}) {
    return metadata.visibility === 'hidden';
}

// label is the wording every page shows for a state; shortLabel is for cells
// too narrow for it (the stats of a homepage card and of the market header).
const STATE_LABELS = {
    active: { label: 'Active', shortLabel: 'Active' },
    awaiting_resolution: { label: 'Awaiting Resolution', shortLabel: 'Awaiting' },
    resolved: { label: 'Resolved', shortLabel: 'Resolved' },
};

const OUTCOME_LABELS = { yes: 'YES', no: 'NO', invalid: 'INVALID' };

const isPresent = (value) => value !== null && value !== undefined && value !== '';

function normalizeOutcome(value) {
    const outcome = String(value ?? '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(OUTCOME_LABELS, outcome) ? outcome : null;
}

/**
 * The wording for a state and outcome, for labels that name a status without
 * a market at hand (a filter option, a legend).
 *
 * @param {'active'|'awaiting_resolution'|'resolved'} state
 * @param {'yes'|'no'|'invalid'|null} [outcome]
 */
export function describeMarketStatus(state, outcome = null) {
    const { label, shortLabel } = STATE_LABELS[state];
    const outcomeLabel = state === 'resolved' && outcome ? OUTCOME_LABELS[outcome] : null;
    return {
        label,
        shortLabel,
        outcomeLabel,
        labelWithOutcome: outcomeLabel ? `${label}: ${outcomeLabel}` : label,
    };
}

/**
 * The status of a market: the one place that decides it and words it.
 *
 * Reads whichever of these the caller has, top-level or nested under
 * `_registryMetadata` (market page) or `metadata` (list cards):
 *   - resolution_status / resolution_outcome (also resolutionStatus,
 *     resolutionOutcome, finalOutcome): what the registry recorded
 *   - onChainResolution: { resolved, outcome } from utils/onChainResolution.js
 *   - closeTimestamp / endTime (also end_time, endDate, closeDate), in
 *     seconds, milliseconds or as a date string
 *
 * A market is resolved when the registry says so, records an outcome, or its
 * condition is reported on-chain. Otherwise it is active until its close time
 * and awaiting resolution after it; with no close time it stays active.
 *
 * @param {Object} market
 * @param {number} [nowSeconds]
 * @returns {{
 *   state: 'active'|'awaiting_resolution'|'resolved',
 *   outcome: 'yes'|'no'|'invalid'|null,
 *   outcomeLabel: 'YES'|'NO'|'INVALID'|null,
 *   label: string,
 *   shortLabel: string,
 *   labelWithOutcome: string,
 *   closeTime: number|null,
 *   showCountdown: boolean,
 * }} outcome is null while unresolved and when a resolved market's outcome is
 *   unknown; labelWithOutcome is "Resolved: YES" when it is known, else label;
 *   closeTime is in Unix seconds.
 */
export function resolveMarketStatus(market = {}, nowSeconds = Date.now() / 1000) {
    const sources = [market, market?._registryMetadata, market?.metadata].filter(Boolean);

    const recordedOutcome = sources
        .flatMap((s) => [s.resolution_outcome, s.resolutionOutcome, s.finalOutcome])
        .find(isPresent);
    const recordedResolved = market?.status === 'resolved'
        || sources.some((s) => s.resolution_status === 'resolved' || s.resolutionStatus === 'resolved');
    const onChain = market?.onChainResolution?.resolved ? market.onChainResolution : null;

    const closeTime = normalizeUnixTimestamp(
        sources
            .flatMap((s) => [s.closeTimestamp, s.endTime, s.end_time, s.endDate, s.closeDate])
            .find(isPresent)
    );

    let state = 'active';
    if (recordedResolved || isPresent(recordedOutcome) || onChain) {
        state = 'resolved';
    } else if (closeTime !== null && closeTime <= nowSeconds) {
        state = 'awaiting_resolution';
    }

    // The registry's outcome is kept when it has one; the chain fills it in
    // when the registry is silent.
    const outcome = state === 'resolved'
        ? (normalizeOutcome(recordedOutcome) ?? normalizeOutcome(onChain?.outcome))
        : null;

    return {
        state,
        outcome,
        ...describeMarketStatus(state, outcome),
        closeTime,
        showCountdown: state === 'active' && closeTime !== null,
    };
}

/**
 * Whether the on-chain payout state is still worth reading for a market:
 * true until what is already known gives both "resolved" and its outcome.
 */
export function needsOnChainResolution(market = {}) {
    const { state, outcome } = resolveMarketStatus(market);
    return state !== 'resolved' || outcome === null;
}

export function isProposalActive(metadata = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    return !isProposalArchived(metadata)
        && !isProposalHidden(metadata)
        && resolveMarketStatus(metadata, nowSeconds).state === 'active';
}
