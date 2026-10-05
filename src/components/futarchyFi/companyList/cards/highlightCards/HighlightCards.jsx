import React, { useState, useEffect, useMemo } from "react";
import CircularProgressBar from "../../components/CircularProgressBar";
import { createSubgraphPoolFetcher } from "../../../../../utils/SubgraphPoolFetcher";
import { generateMarketUrl } from "../../constants/staticPaths";
import ChainBadge from "../../components/ChainBadge";
import { SHOW_DATA_DEBUG } from "../../../../../config/featureFlags";

// Subgraph-backed pool fetcher (replaces SupabasePoolFetcher)
const poolFetcher = createSubgraphPoolFetcher();

// Simple hook for fetching latest pool prices from the subgraph (same shape as EventHighlightCard).
// Accepts optional prefetchedPrices to skip the per-pool fetch when bulk-fetched prices are available.
const useLatestPoolPrices = (poolAddresses, eventId, metadata, prefetchedPrices = null) => {
  const [prices, setPrices] = useState({ yes: null, no: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If we have prefetched prices from bulk subgraph query, use them directly
    if (prefetchedPrices && (prefetchedPrices.yes !== null || prefetchedPrices.no !== null)) {
      console.log(`[PREFETCHED] Using bulk-fetched prices for resolved event ${eventId}:`, prefetchedPrices);
      setPrices({
        yes: prefetchedPrices.yes,
        no: prefetchedPrices.no
      });
      setLoading(false);
      return;
    }

    const fetchLatestPrices = async () => {
      setLoading(true);

      try {
        console.log(`[SIMPLE FETCH] Getting latest pool prices for event ${eventId}`);

        const chainId = metadata?.chain || 100;

        // Fetch latest pool prices in parallel
        const [yesResult, noResult] = await Promise.all([
          poolAddresses?.yes ? poolFetcher.fetch('pools.price', {
            id: poolAddresses.yes,
            chainId
          }) : Promise.resolve(null),
          poolAddresses?.no ? poolFetcher.fetch('pools.price', {
            id: poolAddresses.no,
            chainId
          }) : Promise.resolve(null)
        ]);

        let yesPrice = null;
        let noPrice = null;

        // Extract prices from latest candles
        if (yesResult?.status === 'success' && yesResult.data.length > 0) {
          yesPrice = yesResult.data[0].price;
          console.log(`[SIMPLE FETCH] YES price from latest candle: ${yesPrice}`);
        }

        if (noResult?.status === 'success' && noResult.data.length > 0) {
          noPrice = noResult.data[0].price;
          console.log(`[SIMPLE FETCH] NO price from latest candle: ${noPrice}`);
        }

        setPrices({ yes: yesPrice, no: noPrice });

      } catch (error) {
        console.error(`[SIMPLE FETCH] Error fetching latest prices:`, error);
        setPrices({ yes: null, no: null });
      } finally {
        setLoading(false);
      }
    };

    if (poolAddresses?.yes || poolAddresses?.no) {
      fetchLatestPrices();
    } else {
      setLoading(false);
    }
  }, [poolAddresses?.yes, poolAddresses?.no, eventId, prefetchedPrices]);

  return { prices, loading };
};

// Loading Spinner Component
const LoadingSpinner = ({ className = "h-5 w-5 text-futarchyGray12 dark:text-white" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      strokeOpacity="0.2"
    />
    <path
      d="M4 12a8 8 0 018-8"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

// Timestamp component adapted for endTime
const Timestamp = ({ endTime }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const updateRemainingTime = () => {
      const now = Date.now() / 1000; // Current time in seconds

      if (endTime) {
        const timeLeft = endTime - now;

        if (timeLeft <= 0) {
          const endDate = new Date(endTime * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          setRemainingTime(`Ended on: ${endDate}`);
        } else {
          const days = Math.floor(timeLeft / 86400);
          const hours = Math.floor((timeLeft % 86400) / 3600);
          const minutes = Math.floor((timeLeft % 3600) / 60);

          let timeString = '';
          if (days > 0) {
            timeString += `${days}d `;
          }
          if (hours > 0 || days > 0) {
            timeString += `${hours}h `;
          }
          timeString += `${minutes}m`;

          setRemainingTime(`Remaining Time: ${timeString}`);
        }
      } else {
        setRemainingTime("No end time specified");
      }
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [endTime]);

  return remainingTime ? (
    <div className="w-fit px-2 py-0.5 text-start rounded-full text-xs bg-futarchyGold9/35 border border-futarchyGold9 text-futarchyGold11 dark:border-futarchyGold6 dark:bg-futarchyGold7/15 dark:text-futarchyGold6 font-medium mt-1">
      {remainingTime}
    </div>
  ) : null;
};

// Component to show completed status badge
const CompletedStatusBadge = ({ marketStatus }) => (
  <div className={`w-fit px-2 py-0.5 text-start rounded-full text-xs font-medium mt-1 ${marketStatus.state === 'resolved'
    ? 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
    : 'bg-futarchyGold9/35 border border-futarchyGold9 text-futarchyGold11 dark:border-futarchyGold6 dark:bg-futarchyGold7/15 dark:text-futarchyGold6'
    }`}>
    {marketStatus.state === 'resolved' ? `✓ ${marketStatus.label}` : marketStatus.label}
  </div>
);

const parsePrice = (price) => {
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const num = parseFloat(price.replace(/[^\\d.-]/g, ''));
    return isNaN(num) ? null : num;
  }
  return null;
};

const HighlightCard = ({
  marketName: marketNameProp,
  endTime: endTimeProp,
  proposalCreationTimestamp: proposalCreationTimestampProp,
  companyLogoUrl: companyLogoUrlProp,
  priceYes: priceYesProp,
  priceNo: priceNoProp,
  priceSpot: priceSpotProp,
  eventProbability: eventProbabilityProp,
  status: statusProp, // "Loading", "Done", "Error"
  marketId: marketIdProp,
  useMockData = false,
  // resolveMarketStatus() result for ended or resolved events
  marketStatus = null,
  impact: impactProp,
  companySymbol = 'GNO',
  currencySymbol,
  // Pool addresses for price fetching
  poolAddresses,
  metadata,
  chainId,
  prefetchedPrices = null, // NEW: Pre-fetched prices from bulk subgraph query
  // Edit Owner functionality
  isOwner = false,
  isEditor = false,
  fromSubgraph = false,
  proposalMetadataAddress = null,
  onEditProposal = null,
  visibility = 'public',
}) => {
  const mockData = {
    marketName: "Will NVIDIA's stock price exceed $1,000 by the end of 2024?",
    proposalCreationTimestamp: 1749888000, // June 20th, 2025
    endTime: 1766649600, // December 25th, 2025
    companyLogoUrl: "/assets/gnosis-dao-logo.svg",
    priceYes: 125.67,
    priceNo: 89.34,
    priceSpot: 100.00,
    eventProbability: 0.58,
    status: "Done",
    marketId: "mock-market-1",
  };

  const data = useMockData ? mockData : {
    marketName: marketNameProp,
    endTime: endTimeProp,
    proposalCreationTimestamp: proposalCreationTimestampProp,
    companyLogoUrl: companyLogoUrlProp,
    priceYes: priceYesProp,
    priceNo: priceNoProp,
    priceSpot: priceSpotProp,
    eventProbability: eventProbabilityProp,
    status: statusProp,
    marketId: marketIdProp,
  };

  const { marketName, endTime, proposalCreationTimestamp, companyLogoUrl, status, marketId } = data;
  const isComplete = !!marketStatus && marketStatus.state !== 'active';

  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to marketName
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const calculateProgress = () => {
      const now = Date.now() / 1000;
      if (!proposalCreationTimestamp || !endTime || now >= endTime) {
        setProgress(100);
        return;
      }
      if (now <= proposalCreationTimestamp) {
        setProgress(0);
        return;
      }
      const totalDuration = endTime - proposalCreationTimestamp;
      const elapsedTime = now - proposalCreationTimestamp;
      setProgress((elapsedTime / totalDuration) * 100);
    };

    calculateProgress();
    const timer = setInterval(calculateProgress, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [proposalCreationTimestamp, endTime]);

  // Use dynamic price fetching for resolved events if poolAddresses are provided
  // Pass prefetchedPrices to skip Supabase fetch when available
  const { prices: fetchedPrices, loading: isPriceLoading } = useLatestPoolPrices(
    isComplete && poolAddresses ? poolAddresses : null,
    marketId,
    metadata,
    prefetchedPrices
  );

  // Determine data source for badge display
  const priceSource = (prefetchedPrices?.yes !== null || prefetchedPrices?.no !== null)
    ? 'subgraph'
    : 'supabase';

  // Determine which prices to use - fetched for resolved events or props for active events
  const priceYes = isComplete && fetchedPrices.yes !== null ? fetchedPrices.yes : parsePrice(data.priceYes);
  const priceNo = isComplete && fetchedPrices.no !== null ? fetchedPrices.no : parsePrice(data.priceNo);
  const priceSpot = parsePrice(data.priceSpot);
  const eventProbability = parsePrice(data.eventProbability);

  const isLoading = status === "Loading" || (isComplete && isPriceLoading);
  const isError = status === "Error";

  const impact = useMemo(() => {
    // For both resolved and active events, calculate impact from yes/no prices if available
    if (priceYes !== null && priceNo !== null) {
      // Use the same calculation as EventHighlightCard
      const maxPrice = Math.max(priceYes, priceNo);
      if (maxPrice !== 0) {
        const impactValue = ((priceYes - priceNo) / maxPrice) * 100;
        return impactValue >= 0 ? `+${impactValue.toFixed(2)}%` : `${impactValue.toFixed(2)}%`;
      }
    }

    // Fallback for completed events: use provided impact value if no prices available
    if (isComplete && impactProp !== undefined && impactProp !== null) {
      const numericImpact = typeof impactProp === 'string' ? parseFloat(impactProp) : impactProp;
      if (typeof numericImpact === 'number' && !isNaN(numericImpact)) {
        return numericImpact >= 0 ? `+${numericImpact.toFixed(2)}%` : `${numericImpact.toFixed(2)}%`;
      }
    }

    // Legacy calculation for active events with spot price
    if (priceYes !== null && priceNo !== null && priceSpot !== null && priceSpot !== 0) {
      const impactValue = ((priceYes - priceNo) / priceSpot) * 100;
      return impactValue >= 0 ? `+${impactValue.toFixed(2)}%` : `${impactValue.toFixed(2)}%`;
    }

    return "N/A";
  }, [priceYes, priceNo, priceSpot, isComplete, impactProp]);

  const isImpactPositive = impact !== "N/A" && !impact.startsWith("-");
  const impactTextColorClass = isImpactPositive ? "text-futarchyTeal9 dark:text-futarchyTeal9" : "text-futarchyCrimson9 dark:text-futarchyCrimson9";

  // Extract base token symbol from metadata
  const baseTokenSymbol = metadata?.currencyTokens?.base?.tokenSymbol ||
    metadata?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    currencySymbol ||
    (Number(metadata?.chain || chainId) === 1 ? 'USDS' : 'sDAI');

  const renderValue = (value, format) => {
    if (isLoading) return <LoadingSpinner />;
    if (isError) return <span className="text-sm font-semibold text-red-500">Error</span>;
    // A missing price (indexer down or no trades yet) is unknown, not zero.
    if (value === null || value === undefined) return '—';
    if (typeof format !== 'function') return value;
    return format(value);
  };

  const formattedYesPrice = renderValue(priceYes, (v) => `${v.toFixed(2)} ${baseTokenSymbol}`);
  const formattedNoPrice = renderValue(priceNo, (v) => `${v.toFixed(2)} ${baseTokenSymbol}`);
  const formattedEventProbability = renderValue(eventProbability, (v) => `${(v * 100).toFixed(0)}%`);
  const impactDisplay = renderValue(impact);

  const statItems = isComplete ? [
    // For completed events, show the outcome when it is known; otherwise the status.
    {
      label: marketStatus.outcomeLabel ? "Outcome" : "Status",
      value: marketStatus.outcomeLabel || marketStatus.shortLabel,
      colorClass: marketStatus.outcome === 'yes' ? "text-futarchyBlue9 dark:text-futarchyBlue9" : "text-futarchyGold8 dark:text-futarchyGold8",
    },
    {
      label: "Impact",
      value: impactDisplay,
      colorClass: impactTextColorClass,
    },
  ] : [
    // For active events, show yes/no prices and impact
    {
      label: "YES<br/>Price",
      value: formattedYesPrice,
      colorClass: "text-futarchyBlue9 dark:text-futarchyBlue9",
    },
    {
      label: "NO<br/>Price",
      value: formattedNoPrice,
      colorClass: "text-futarchyGold8 dark:text-futarchyGold8",
    },
    {
      label: "Impact",
      value: impactDisplay,
      colorClass: impactTextColorClass,
    },
  ];

  return (
    <a href={generateMarketUrl(marketId)} className="group flex flex-col h-full border-2 border-futarchyGray62 dark:border-futarchyGray11/70 rounded-3xl relative cursor-pointer md:w-[340px] w-full shadow-lg hover:shadow-2xl dark:shadow-md dark:hover:shadow-lg dark:hover:shadow-futarchyBlue9/20 transition-all duration-300 overflow-hidden">

      {/* Shine Effect Layer */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-700 ease-in-out z-20 pointer-events-none"></div>

      {/* Top Section */}
      <div className="p-5 bg-futarchyGray2 dark:bg-transparent flex flex-col min-h-[280px]">
        <div className="flex flex-col gap-4 flex-grow">
          {/* Logo and Chain Badge Row */}
          <div className="flex flex-row items-center justify-between">
            <div className="w-[72px] h-[72px] flex-shrink-0 relative">
              <CircularProgressBar
                currentProgress={progress}
                totalProgress={100}
                radius={36}
                strokeWidth={3}
              />
              {companyLogoUrl && (
                <div className="absolute inset-[8px] rounded-full overflow-hidden bg-futarchyGray3">
                  <img src={companyLogoUrl} alt="Company Logo" className="w-full h-full object-cover rounded-full" />
                </div>
              )}
            </div>
            {/* Badges Row */}
            <div className="flex flex-row items-center gap-2">
              {/* Hidden/Visibility Badge - Show eye icon for hidden proposals */}
              {visibility === 'hidden' && (isOwner || isEditor) && (
                <span
                  className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30 flex items-center gap-1"
                  title="This proposal is hidden from public. Only visible to you as owner/editor."
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  Hidden
                </span>
              )}
              {/* Owner Badge */}
              {isOwner && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  👤 Owner
                </span>
              )}
              {/* Editor Badge (org owner but not proposal owner) */}
              {isEditor && !isOwner && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  ✏️ Editor
                </span>
              )}
              {/* Edit Button for Owners/Editors */}
              {(isOwner || isEditor) && fromSubgraph && proposalMetadataAddress && onEditProposal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onEditProposal(proposalMetadataAddress, chainId);
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors cursor-pointer"
                >
                  ✏️ Edit
                </button>
              )}
              {/* Data Source Badge */}
              {SHOW_DATA_DEBUG && <span className={`px-2 py-1 rounded-lg text-xs font-medium ${priceSource === 'subgraph'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}>
                {priceSource === 'subgraph' ? '📊 Subgraph' : '📊 Subgraph (per-pool)'}
              </span>}
              {chainId && <ChainBadge chainId={chainId} size="sm" />}
            </div>
          </div>

          {/* Title Section - Full width, more lines */}
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold font-oxanium text-futarchyGray12 dark:text-white leading-7 line-clamp-4">
              {shouldUseSplitTitles ? (
                <>
                  <span>{displayTitle0}</span>{' '}
                  <span className="text-futarchyViolet7">{displayTitle1}</span>
                </>
              ) : (
                marketName || "Untitled Market"
              )}
            </h3>
            {isComplete ? <CompletedStatusBadge marketStatus={marketStatus} /> : <Timestamp endTime={endTime} />}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t-2 border-futarchyGray62 dark:border-futarchyGray11/70"></div>

      {/* Bottom Section - grows to fill space */}
      <div className="p-4 bg-futarchyGray3 dark:bg-futarchyDarkGray3 flex-grow flex items-end">
        <div className={`grid ${isComplete ? 'grid-cols-2' : 'grid-cols-3'} md:gap-1 gap-3 w-full`}>
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center flex-1 p-1 md:p-3 rounded-2xl border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 transition-colors duration-300"
            >
              <span
                className="text-xs text-futarchyGray11 leading-4 dark:text-white/70 font-medium text-center h-8 flex items-center justify-center transition-colors duration-300 whitespace-nowrap"
                dangerouslySetInnerHTML={{ __html: item.label }}
              />
              <span className={`text-sm font-semibold ${item.colorClass}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
};

export default HighlightCard;
