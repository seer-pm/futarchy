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

export function getProposalCloseTimestamp(metadata = {}) {
    return normalizeUnixTimestamp(metadata.closeTimestamp ?? metadata.endTime);
}

export function isProposalArchived(metadata = {}) {
    return metadata.archived === true || metadata.archived === 'true';
}

export function isProposalHidden(metadata = {}) {
    return metadata.visibility === 'hidden';
}

export function isProposalResolved(metadata = {}) {
    const outcome = metadata.resolution_outcome ?? metadata.finalOutcome;
    return metadata.resolution_status === 'resolved' || (outcome !== null && outcome !== undefined && outcome !== '');
}

export function isProposalClosed(metadata = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    const closeTimestamp = getProposalCloseTimestamp(metadata);
    return closeTimestamp !== null && closeTimestamp <= nowSeconds;
}

export function isProposalActive(metadata = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    return !isProposalArchived(metadata)
        && !isProposalHidden(metadata)
        && !isProposalResolved(metadata)
        && !isProposalClosed(metadata, nowSeconds);
}

export function getProposalEndTime(proposal = {}) {
    return normalizeUnixTimestamp(
        proposal.endTime ??
        proposal.closeTimestamp ??
        proposal.end_time ??
        proposal.endDate ??
        proposal.closeDate ??
        proposal.metadata?.closeTimestamp ??
        proposal.metadata?.endTime ??
        proposal.metadata?.end_time
    );
}

export function hasResolutionOutcome(proposal = {}) {
    const outcome =
        proposal.resolution_outcome ??
        proposal.resolutionOutcome ??
        proposal.finalOutcome ??
        proposal.metadata?.resolution_outcome ??
        proposal.metadata?.resolutionOutcome ??
        proposal.metadata?.finalOutcome;

    return outcome !== null && outcome !== undefined && outcome !== '';
}

export function isResolvedProposal(proposal = {}) {
    const status =
        proposal.resolution_status ??
        proposal.resolutionStatus ??
        proposal.status ??
        proposal.metadata?.resolution_status ??
        proposal.metadata?.resolutionStatus;

    return status === 'resolved' || hasResolutionOutcome(proposal);
}

export function isClosedProposal(proposal = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (proposal.isClosed === true) return true;

    const endTime = getProposalEndTime(proposal);
    return endTime !== null && endTime <= nowSeconds;
}

/**
 * Fold an on-chain resolution (utils/onChainResolution.js) into a proposal
 * built from registry metadata, which can lag the chain indefinitely.
 * Mutates and returns the proposal; an unresolved result changes nothing.
 */
export function applyOnChainResolution(proposal, result) {
    if (!proposal || !result?.resolved) return proposal;

    const outcome = result.outcome ?? null;
    proposal.status = 'resolved';
    proposal.resolutionStatus = 'resolved';
    proposal.resolution_status = 'resolved';
    if (!hasResolutionOutcome(proposal) && outcome) {
        proposal.resolutionOutcome = outcome;
        proposal.resolution_outcome = outcome;
        proposal.finalOutcome = outcome;
    }
    proposal.isClosed = true;
    proposal.resolvedOnChain = true;
    return proposal;
}
