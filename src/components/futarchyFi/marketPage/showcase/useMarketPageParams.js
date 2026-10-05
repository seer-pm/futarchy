import { useSearchParams } from 'next/navigation';
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS, DEBUG_MODE } from '../../../../config/featureFlags';

// Proposals that default to Subgraph Trades
const PROPOSALS_USING_SUBGRAPH_TRADES = [
  '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC',
  '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa'  // AAVE proposal
];

// Proposal-specific config for SubgraphChart and spot price
const PROPOSAL_DEFAULTS = {
  '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC': {
    useSubgraph: 'only',
    useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
  },
  '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa': {
    useSubgraph: 'only',
    useSpotPrice: 'composite::0xaa7a70070e7495fe86c67225329dbd39baa2f63b+0xc8cf54b0b70899ea846b70361e62f3f5b22b1f4binvert+0x3de27efa2f1aa663ae5d458857e731c129069f29invert-hour-100-eth'  // AAVE/GHO composite: USDC/GHO * AAVE/USDC(inv) * AAVE/GHO(inv)
  },
  '0xeCe80208CB8376Be311cE0f5Ea4eF73850a0dcF0': {
    useSubgraph: 'only',
    useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
  }
};

const useMarketPageParams = ({ proposal, debugMode }) => {
  const searchParams = useSearchParams();

  // Get proposal ID from URL path (/markets/[address]) or query param (?proposalId=)
  // Use pathname for /markets/[address] format
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const pathMatch = pathname.match(/\/markets?\/([^/?]+)/i);
  const proposalIdFromPath = pathMatch?.[1] || null;

  // Get proposal ID early for defaults lookup
  const proposalIdForDefaults = proposalIdFromPath || proposal?.address || proposal?.id || searchParams.get('proposalId');
  const normalizedProposalIdForDefaults = proposalIdForDefaults?.toLowerCase?.();
  const proposalDefaults = Object.entries(PROPOSAL_DEFAULTS).find(
    ([address]) => address.toLowerCase() === normalizedProposalIdForDefaults
  )?.[1] || {};

  // Read useSubgraph query parameter for chart display control
  // - No param or not set: Show only TripleChart (original behavior)
  // - useSubgraph=true: Show both TripleChart AND SubgraphChart
  // - useSubgraph=only: Show ONLY SubgraphChart (don't mount TripleChart)
  // Apply defaults: URL params override proposal defaults
  // If global toggle is enabled, force subgraph for all proposals
  const useSubgraphParam = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS
    ? 'only'  // Force SubgraphChart only
    : (searchParams.get('useSubgraph') || proposalDefaults.useSubgraph);
  const showTripleChart = useSubgraphParam !== 'only'; // Show unless 'only'
  const showSubgraphChart = useSubgraphParam === 'true' || useSubgraphParam === 'only';

  // External spot price from GeckoTerminal via spotClient
  // Priority: 1) URL param, 2) proposal defaults, 3) config.marketInfo.coingecko_ticker
  const useSpotPriceParam = searchParams.get('useSpotPrice') || proposalDefaults.useSpotPrice;

  // Check for tradeSource parameter to switch between Supabase and Subgraph for trades
  // - No param: Default to Supabase UNLESS in whitelist
  // - tradeSource=subgraph: Use Subgraph (SubgraphTradesDataLayer)
  // - tradeSource=supabase: Use Supabase (RecentTradesDataLayer)
  const tradeSourceParam = searchParams.get('tradeSource');

  const contractAddress = searchParams.get('contractAddress');

  // Prioritize URL query parameters over props/connected wallet
  const debugModeParam = searchParams.get('debugMode');
  const normalizedDebugParam = debugModeParam?.toLowerCase?.();
  const isDebugMode =
    normalizedDebugParam === 'true' ||
    normalizedDebugParam === '1' ||
    normalizedDebugParam === 'yes' ||
    normalizedDebugParam === 'on' ||
    normalizedDebugParam === 't' ||
    debugMode;
  // ?debugAddress= shows another wallet's positions as if it were connected;
  // developer builds only.
  const debugAddress = DEBUG_MODE ? searchParams.get('debugAddress') : null;

  return {
    proposalIdForDefaults,
    showTripleChart,
    showSubgraphChart,
    useSpotPriceParam,
    tradeSourceParam,
    contractAddress,
    isDebugMode,
    debugAddress
  };
};

export { PROPOSALS_USING_SUBGRAPH_TRADES, useMarketPageParams };
