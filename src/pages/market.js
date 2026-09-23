import { useAccount } from 'wagmi';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { DEFAULT_PROPOSAL_ID } from '../components/futarchyFi/marketPage/constants/contracts';
import { getStaticMarketAddresses } from '../config/markets';

// This route almost always redirects to /markets/:address — it only renders
// the showcase for a market that is not in the static config. Loading the
// showcase lazily keeps that redirect from pulling the whole market bundle,
// matching what /markets/[address] already does.
const MarketPageShowcase = dynamic(
  () => import('../components/futarchyFi/marketPage/MarketPageShowcase'),
  { ssr: false }
);

const CONFIGURED_MARKETS = new Set(
  getStaticMarketAddresses().map((address) => (address || '').toLowerCase())
);

const SUPERSEDED_MARKETS = {
  '0x1d1f3b43f3c61b815041e9092b1ba7ca37c63262': '0x4120de9931fd29c8a6effea4df57a7c8760c1677',
};

const normalizeQueryValue = (value) => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const isConfiguredMarket = (proposalId) => (
  Boolean(proposalId) && CONFIGURED_MARKETS.has(String(proposalId).toLowerCase())
);

const getProposalIdFromQuery = (query) => (
  normalizeQueryValue(
    query.proposalId || query.marketId || query.address || query.proposal || query.market
  )
);

const stripQueryAliases = (query, removeKeys) => {
  const nextQuery = { ...query };

  for (const key of removeKeys) {
    delete nextQuery[key];
  }

  for (const [key, value] of Object.entries(nextQuery)) {
    if (value === undefined || value === null) {
      delete nextQuery[key];
      continue;
    }

    const normalized = normalizeQueryValue(value);
    if (typeof normalized === 'string') {
      nextQuery[key] = normalized;
      continue;
    }

    if (typeof normalized === 'number' || typeof normalized === 'boolean') {
      nextQuery[key] = String(normalized);
      continue;
    }

    delete nextQuery[key];
  }

  return nextQuery;
};

const MarketPage = () => {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const proposalIdFromQuery = router.query
    ? getProposalIdFromQuery(router.query)
    : null;
  
  useEffect(() => {
    // Check if no query parameters are provided
    if (!router.isReady) return;

    const hasQueryParams = Object.keys(router.query || {}).length > 0;
    const proposalId = proposalIdFromQuery ? String(proposalIdFromQuery).trim() : '';
    const canonicalProposalId = SUPERSEDED_MARKETS[proposalId.toLowerCase()] || proposalId;

    if (!hasQueryParams) {
      // Redirect to market page with default proposal ID
      router.replace(`/markets/${DEFAULT_PROPOSAL_ID}`);
      return;
    }

    // Normalize legacy query-based links to canonical /markets/:address
    // when the market exists in the generated static market configuration.
    if (canonicalProposalId && isConfiguredMarket(canonicalProposalId)) {
      const normalizedQuery = stripQueryAliases(router.query, ['proposalId', 'marketId', 'address', 'proposal', 'market']);
      router.replace(
        {
          pathname: `/markets/${canonicalProposalId}`,
          query: normalizedQuery
        },
        undefined,
        { shallow: false }
      );
    }
  }, [router, proposalIdFromQuery]);
  
  // Don't render the component if we're redirecting
  if (!router.isReady || Object.keys(router.query || {}).length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-futarchyLavender"></div>
      </div>
    );
  }
  
  return (
    <MarketPageShowcase 
      isWalletConnected={isConnected}
      connectedWalletAddress={address}
      proposal={proposalIdFromQuery}
    />
  );
};

export default MarketPage; 
