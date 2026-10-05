import { collectAndFetchPoolPrices, attachPrefetchedPrices } from "../../../../utils/SubgraphBulkPriceFetcher";
import { fetchProposalsFromAggregator } from "../../../../hooks/useAggregatorProposals";
import { DEFAULT_AGGREGATOR } from "../../../../config/subgraphEndpoints";
import { resolveMarketStatus } from "../../../../utils/proposalLifecycle";
import {
  filterEventsByMinimumLiquidity,
  MIN_ACTIVE_MARKET_LIQUIDITY_USD,
} from "../../../../utils/activeMarketLiquidity";

// Main function to fetch active milestones from the registry subgraph aggregator.
// Returns proposals filtered by visibility (hidden visible only to owner/editor)
// and by lifecycle (resolved or ended proposals belong in Recently Closed).
export const fetchEventHighlightData = async (_companyId = "all", options = {}) => {
  const { connectedWallet, aggregatorAddress: requestedAggregatorAddress } = options;
  const aggregatorAddress = requestedAggregatorAddress || DEFAULT_AGGREGATOR;

  try {
    let subgraphEvents = [];

    try {
      console.log(`[🔗 REGISTRY-FETCH] Fetching proposals from aggregator: ${aggregatorAddress}`);
      const { proposals } = await fetchProposalsFromAggregator(aggregatorAddress, connectedWallet);

      // Only include proposals linked to an actual market contract
      const validProposals = proposals.filter(p =>
        p.proposalAddress && p.proposalAddress !== '0x0000000000000000000000000000000000000000'
      );

      // Visibility filter:
      //   - org-level archived/hidden takes precedence (no proposals from a
      //     dead org should appear)
      //   - then the per-proposal 'visibility' flag ('public' default; 'hidden'
      //     only to its own owner/editor)
      subgraphEvents = validProposals.filter(p => {
        const orgMeta = p.orgMetadata || {};
        if (orgMeta.archived === true) return false;
        if (orgMeta.visibility === 'hidden' && !p.isEditor) return false;

        const visibility = p.visibility || 'public';
        if (visibility === 'hidden') {
          return p.isOwner || p.isEditor;
        }
        return true;
      });

      console.log(`[🔗 REGISTRY-FETCH] Found ${subgraphEvents.length} visible proposals (${validProposals.length - subgraphEvents.length} hidden)`);
    } catch (subgraphError) {
      console.warn("[🔗 REGISTRY-FETCH] Failed to fetch from aggregator:", subgraphError.message);
      // Let the carousel tell "registry down" apart from "no events"
      subgraphError.isRegistryError = true;
      throw subgraphError;
    }

    const nowSeconds = Date.now() / 1000;

    // Filter out resolved and ended proposals. Ended proposals may still have
    // stale/missing resolution metadata, but they should not disappear from the
    // homepage; Recently Closed owns that state.
    const lifecycleActiveEvents = subgraphEvents.filter(p =>
      resolveMarketStatus(p, nowSeconds).state === 'active'
    );

    // "Active" means economically usable, not merely unresolved. Read real
    // ERC-20 reserves from both conditional pools and fail closed when the
    // indexer/RPC cannot prove at least the configured stable-dollar floor.
    const activeSubgraphEvents = await filterEventsByMinimumLiquidity(lifecycleActiveEvents);
    console.log(
      `[Active Milestones] ${activeSubgraphEvents.length}/${lifecycleActiveEvents.length} markets meet the $${MIN_ACTIVE_MARKET_LIQUIDITY_USD} real-liquidity floor`
    );

    // Bulk fetch prices for the remaining events
    if (activeSubgraphEvents.length > 0) {
      const priceMap = await collectAndFetchPoolPrices(activeSubgraphEvents);
      attachPrefetchedPrices(activeSubgraphEvents, priceMap);
    }

    return activeSubgraphEvents;
  } catch (error) {
    if (error?.isRegistryError) throw error;
    console.error("Error fetching event highlights:", error);
    return [];
  }
};
