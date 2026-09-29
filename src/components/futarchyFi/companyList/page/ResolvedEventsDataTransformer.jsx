import { collectAndFetchPoolPrices, attachPrefetchedPrices } from "../../../../utils/SubgraphBulkPriceFetcher";
import { fetchProposalsFromAggregator } from "../../../../hooks/useAggregatorProposals";
import { DEFAULT_AGGREGATOR } from "../../../../config/subgraphEndpoints";
import { getProposalEndTime, hasResolutionOutcome, isClosedProposal, isResolvedProposal } from "../../../../utils/proposalLifecycle";

const filterRecentClosedEvents = (events) => {
  // Bypassing the recent filter so all closed markets are shown permanently
  return events;
};

// Fetch recently closed proposals from the registry subgraph aggregator.
// A proposal is closed when its metadata marks it resolved or when its close
// timestamp has passed, even if resolution metadata has not been repaired yet.
export const fetchResolvedEventHighlightData = async (_companyId = "all", limit = 10, options = {}) => {
  const { connectedWallet, aggregatorAddress: requestedAggregatorAddress } = options;
  const aggregatorAddress = requestedAggregatorAddress || DEFAULT_AGGREGATOR;

  // A registry failure propagates so the carousel can offer a retry
  // instead of claiming there are no closed markets.
  const { proposals } = await fetchProposalsFromAggregator(aggregatorAddress, connectedWallet);

  try {

    const nowSeconds = Date.now() / 1000;

    const closedProposals = proposals.filter(p => {
      // Skip proposals from archived/hidden orgs (same rule as Active Milestones)
      const orgMeta = p.orgMetadata || {};
      if (orgMeta.archived === true) return false;
      if (orgMeta.visibility === 'hidden' && !p.isEditor) return false;

      const visibility = p.visibility || 'public';
      if (visibility === 'hidden') {
        return p.isOwner || p.isEditor;
      }

      return isResolvedProposal(p) || isClosedProposal(p, nowSeconds);
    });

    console.log(`[ResolvedEventsDataTransformer] Found ${closedProposals.length} closed proposals from subgraph (of ${proposals.length} total)`);
    if (closedProposals.length === 0) return [];

    const closedEvents = closedProposals.map(proposal => {
      const endTime = getProposalEndTime(proposal);
      const hasOutcome = hasResolutionOutcome(proposal);
      const isResolved = isResolvedProposal(proposal);
      const isClosed = isClosedProposal(proposal, nowSeconds);
      const resolutionOutcome = proposal.resolutionOutcome ?? proposal.resolution_outcome ?? null;

      return {
        eventId: proposal.eventId || proposal.proposalAddress,
        eventTitle: proposal.eventTitle || proposal.proposalTitle || 'Unknown Proposal',
        companyLogo: proposal.companyLogo || '/assets/fallback-company.png',
        authorName: proposal.authorName || 'Unknown Organization',
        resolutionStatus: isResolved && hasOutcome
          ? 'resolved'
          : (isClosed ? 'closed' : (proposal.resolutionStatus || proposal.resolution_status)),
        resolutionOutcome,
        finalOutcome: proposal.finalOutcome ?? resolutionOutcome,
        impact: typeof proposal.metadata?.impact === 'number'
          ? proposal.metadata.impact
          : (typeof proposal.metadata?.impact === 'string' ? parseFloat(proposal.metadata.impact) : 0),
        poolAddresses: proposal.poolAddresses || { yes: null, no: null },
        endTime,
        endDate: endTime ? new Date(endTime * 1000).toISOString() : null,
        metadata: proposal.metadata,
        companyId: proposal.companyId,
        companySymbol: proposal.metadata?.companyTokens?.base?.tokenSymbol || 'GNO',
        currencySymbol: proposal.metadata?.currencyTokens?.base?.tokenSymbol ||
          (Number(proposal.chainId) === 1 ? 'USDS' : 'sDAI'),
        displayTitle0: proposal.metadata?.display_title_0,
        displayTitle1: proposal.metadata?.display_title_1,
        description: proposal.description || 'No description available',
        chainId: proposal.chainId || 100,
        isOwner: proposal.isOwner,
        isEditor: proposal.isEditor,
        fromSubgraph: proposal.fromSubgraph,
        proposalMetadataAddress: proposal.proposalMetadataAddress,
        visibility: proposal.visibility,
        isResolved,
        isClosed: isClosed || isResolved
      };
    });

    const recentClosed = filterRecentClosedEvents(closedEvents);
    if (recentClosed.length === 0) return [];

    recentClosed.sort((a, b) => {
      const aTime = a.endTime ? a.endTime * 1000 : 0;
      const bTime = b.endTime ? b.endTime * 1000 : 0;
      return bTime - aTime;
    });

    const limitedResults = recentClosed.slice(0, limit);

    const priceMap = await collectAndFetchPoolPrices(limitedResults);
    attachPrefetchedPrices(limitedResults, priceMap);

    return limitedResults;
  } catch (error) {
    console.error("Error fetching closed event highlights:", error);
    return [];
  }
};
