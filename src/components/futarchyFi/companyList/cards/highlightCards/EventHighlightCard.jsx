import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import CircularProgressBar from "../../components/CircularProgressBar";
import { createSubgraphPoolFetcher } from "../../../../../utils/SubgraphPoolFetcher";
import ChainBadge from "../../components/ChainBadge";
import { USE_QUERY_PARAM_URLS } from "../../../../../config/featureFlags";

// Subgraph-backed pool fetcher (replaces SupabasePoolFetcher)
const poolFetcher = createSubgraphPoolFetcher();

// Simple hook for fetching latest pool prices from the subgraph including event probability.
// Accepts optional prefetchedPrices to skip the per-pool fetch when bulk-fetched prices are available.
const useLatestPoolPrices = (poolAddresses, eventId, metadata, prefetchedPrices = null) => {
  const [prices, setPrices] = useState({ yes: null, no: null, eventProbability: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If we have prefetched prices from bulk subgraph query, use them directly
    if (prefetchedPrices && (prefetchedPrices.yes !== null || prefetchedPrices.no !== null)) {
      console.log(`[PREFETCHED] Using bulk-fetched prices for event ${eventId}:`, prefetchedPrices);
      setPrices({
        yes: prefetchedPrices.yes,
        no: prefetchedPrices.no,
        eventProbability: null // Will be fetched separately if needed
      });
      setLoading(false);
      return;
    }

    const fetchLatestPrices = async () => {
      setLoading(true);

      try {
        console.log(`[SIMPLE FETCH] Getting latest pool prices for event ${eventId}`);

        const chainId = metadata?.chain || 100;

        // Fetch conditional pool prices in parallel
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

        // Fetch event probability from prediction pools
        // Use the YES prediction pool price directly as event probability (same as MarketPageShowcase)
        let eventProbability = null;
        const predictionPools = metadata?.prediction_pools;

        console.log(`[PREDICTION POOLS DEBUG] Event ${eventId}:`, {
          hasPredictionPools: !!predictionPools,
          yesAddress: predictionPools?.yes?.address,
          noAddress: predictionPools?.no?.address
        });

        if (predictionPools?.yes?.address) {
          console.log(`[PREDICTION POOLS DEBUG] Fetching YES prediction pool for ${eventId}:`, predictionPools.yes.address);

          const predYesResult = await poolFetcher.fetch('pools.price', {
            id: predictionPools.yes.address,
            chainId
          });

          console.log(`[PREDICTION POOLS DEBUG] Fetch result for ${eventId}:`, {
            status: predYesResult?.status,
            dataLength: predYesResult?.data?.length,
            data: predYesResult?.data
          });

          if (predYesResult?.status === 'success' && predYesResult.data.length > 0) {
            const predYesPrice = predYesResult.data[0].price;

            console.log(`[PREDICTION POOLS DEBUG] YES prediction price for ${eventId}:`, predYesPrice);

            if (predYesPrice > 0) {
              // Convert to percentage and cap at 100%
              const probValue = Math.min(predYesPrice * 100, 100);
              eventProbability = `${probValue.toFixed(2)}%`;
              console.log(`[PREDICTION POOLS DEBUG] Calculated event probability for ${eventId}: ${eventProbability}`);
            } else {
              console.log(`[PREDICTION POOLS DEBUG] Price is zero or invalid for ${eventId}`);
            }
          } else {
            console.log(`[PREDICTION POOLS DEBUG] No data or failed fetch for ${eventId}`);
          }
        } else {
          console.log(`[PREDICTION POOLS DEBUG] Missing YES prediction pool address for ${eventId}`);
        }

        setPrices({ yes: yesPrice, no: noPrice, eventProbability });

      } catch (error) {
        console.error(`[SIMPLE FETCH] Error fetching latest prices:`, error);
        setPrices({ yes: null, no: null, eventProbability: null });
      } finally {
        setLoading(false);
      }
    };

    if (poolAddresses?.yes || poolAddresses?.no || metadata?.prediction_pools) {
      fetchLatestPrices();
    } else {
      setLoading(false);
    }
  }, [poolAddresses?.yes, poolAddresses?.no, metadata?.prediction_pools?.yes?.address, metadata?.prediction_pools?.no?.address, eventId, prefetchedPrices]);

  return { prices, loading };
};

// Loading Spinner Component (inspired by CollateralModal)
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

// Add Timestamp component similar to ProposalsCard
const EventTimestamp = ({ countdownFinish, timestamp, endTime, resolutionStatus }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const updateRemainingTime = () => {
      const now = Date.now() / 1000; // Current time in seconds

      console.log(`[EventTimestamp] Debug values:`, {
        countdownFinish,
        timestamp,
        endTime,
        resolutionStatus,
        now,
        endTimeType: typeof endTime,
        endTimeAsDate: endTime ? new Date(endTime * 1000) : null
      });

      if (endTime) {
        const timeLeft = endTime - now;
        const endDate = new Date(endTime * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        if (timeLeft <= 0) {
          // End time has passed
          if (resolutionStatus !== 'open') {
            // Market is actually ended/resolved
            setRemainingTime(`Ended on: ${endDate}`);
          } else {
            // Market is still open for submissions despite deadline
            setRemainingTime(`Open: ${endDate}`);
          }
        } else {
          // End time hasn't passed yet - show countdown
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

          setRemainingTime(`Open until: ${timeString}`);
        }
      } else {
        // Fallback to start date if no end time
        const startDate = new Date(timestamp * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        setRemainingTime(`Started: ${startDate}`);
      }
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [countdownFinish, timestamp, endTime, resolutionStatus]);

  return remainingTime ? (
    <div className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-medium mt-1">
      {remainingTime}
    </div>
  ) : null;
};

const EventHighlightCard = ({
  companyLogo,
  proposalTitle,
  poolAddresses,
  timeProgress,
  startTime,
  endTime,
  countdownFinish,
  eventId,
  status,
  approvalStatus,
  metadata,
  resolutionStatus,
  chainId,
  hideEventProbability = true,
  prefetchedPrices = null, // Pre-fetched prices from bulk subgraph query
  isOwner = false,         // True if connected wallet owns this proposal
  isEditor = false,        // True if connected wallet owns the organization
  fromSubgraph = false,    // True if this proposal came from subgraph
  proposalMetadataAddress = null, // Registry metadata contract address for edit
  onEditProposal = null,   // Callback to open edit modal
  visibility = 'public',   // 'public' or 'hidden' - hidden shows eye icon
}) => {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debugMode') === 'true';

  const currentStatus = status || approvalStatus;

  console.log('[EventHighlight Open]', { eventId, resolutionStatus });

  // Use the simplified hook instead of complex price fetching
  // Pass prefetchedPrices to hook - if available, it will skip Supabase fetch
  const { prices, loading: isLoadingPrices } = useLatestPoolPrices(poolAddresses, eventId, metadata, prefetchedPrices);
  const [calculatedImpact, setCalculatedImpact] = useState("N/A");

  // Determine data source for badge display
  const priceSource = (prefetchedPrices?.yes !== null || prefetchedPrices?.no !== null)
    ? 'subgraph'
    : 'supabase';

  // Calculate impact when prices change
  useEffect(() => {
    if (prices.yes !== null && prices.no !== null) {
      const maxPrice = Math.max(prices.yes, prices.no);
      if (maxPrice !== 0) {
        const impact = ((prices.yes - prices.no) / maxPrice) * 100;
        setCalculatedImpact(impact >= 0 ? `+${impact.toFixed(2)}%` : `${impact.toFixed(2)}%`);
      } else {
        setCalculatedImpact("N/A");
      }
    } else {
      setCalculatedImpact("N/A");
    }
  }, [prices.yes, prices.no]);

  // Hidden until approved; the early return must come after every hook call
  // so the hook order stays stable when status or debugMode changes.
  if (currentStatus === 'pending_review' && !debugMode) {
    return null;
  }

  // Extract display titles from metadata (similar to MarketPageShowcase)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  // Extract base token symbol from metadata
  const baseTokenSymbol = metadata?.currencyTokens?.base?.tokenSymbol ||
    metadata?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    (Number(metadata?.chain || chainId) === 1 ? 'USDS' : 'sDAI');

  // Use high precision for small prices
  const shouldUseHighPrecision = (prices.no !== null && prices.no < 1) ||
    (prices.yes !== null && prices.yes < 1);
  const precision = shouldUseHighPrecision ? 4 : 2;

  const formattedYesPrice = isLoadingPrices ? <LoadingSpinner /> : (prices.yes !== null ? `${prices.yes.toFixed(precision)} ${baseTokenSymbol}` : `0.00 ${baseTokenSymbol}`);
  const formattedNoPrice = isLoadingPrices ? <LoadingSpinner /> : (prices.no !== null ? `${prices.no.toFixed(precision)} ${baseTokenSymbol}` : `0.00 ${baseTokenSymbol}`);
  const impactDisplay = isLoadingPrices ? <LoadingSpinner /> : calculatedImpact;

  // Determine the link URL based on feature flag
  const marketUrl = USE_QUERY_PARAM_URLS
    ? `/market?proposalId=${eventId}`
    : `/markets/${eventId}`;

  return (
    <div className="flex flex-col h-full bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray11/70 rounded-3xl group relative cursor-pointer md:w-[380px] w-full shadow-sm hover:shadow-xl transition-all duration-300">
      <a href={marketUrl} className="p-5 bg-futarchyGray2 dark:bg-transparent relative z-20 rounded-3xl flex flex-col h-full">
        <div className="flex flex-col gap-4 min-h-[240px]">
          {/* Logo and Chain Badge Row */}
          <div className="flex flex-row items-center justify-between">
            <div className="w-20 h-20 relative flex-shrink-0">
              <div className="absolute inset-0">
                <CircularProgressBar
                  currentProgress={timeProgress}
                  totalProgress={100}
                  radius={40}
                  strokeWidth={3}
                />
              </div>
              <div className="absolute inset-[8px] rounded-full overflow-hidden bg-futarchyGray3">
                <Image
                  src={companyLogo || "/assets/default-logo.png"}
                  alt="Company Logo"
                  layout="fill"
                  objectFit="cover"
                  className="rounded-full"
                />
              </div>
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
              {/* Chain Badge */}
              {chainId && <ChainBadge chainId={chainId} size="sm" />}
            </div>
          </div>

          {/* Title Section - Full width, more prominent */}
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold font-oxanium text-futarchyGray12 dark:text-white leading-7 line-clamp-3">
              {shouldUseSplitTitles ? (
                <>
                  <span>{displayTitle0}</span>{' '}
                  <span className="text-futarchyViolet7">{displayTitle1}</span>
                </>
              ) : (
                proposalTitle || "Untitled Event"
              )}
            </h3>
            <EventTimestamp
              countdownFinish={countdownFinish}
              timestamp={startTime}
              endTime={endTime}
              resolutionStatus={resolutionStatus}
            />
          </div>
        </div>

        {/* Spacer to push stats to bottom */}
        <div className="flex-grow"></div>

        {/* Stats Section */}
        <div className="flex flex-col gap-2 mt-4">
          {/* First Row: YES Price, NO Price, Impact */}
          <div className="flex flex-col border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray3 dark:bg-transparent rounded-xl">
            <div className="flex flex-row">
              <div className="flex flex-col items-center flex-1 p-2">
                <span className="text-xs text-futarchyGray11 leading-4 dark:text-white/70 font-medium">YES Price</span>
                <span className="text-sm font-semibold text-futarchyBlue9 dark:text-futarchyBlue9">
                  {formattedYesPrice}
                </span>
              </div>
              <div className="flex flex-col items-center flex-1 border-l border-futarchyGray62 dark:border-futarchyGray112/40 p-2">
                <span className="text-xs text-futarchyGray11 leading-4 dark:text-white/70 font-medium">NO Price</span>
                <span className="text-sm font-semibold text-futarchyGold8 dark:text-futarchyGold8">
                  {formattedNoPrice}
                </span>
              </div>
              <div className="flex flex-col items-center flex-1 border-l border-futarchyGray62 dark:border-futarchyGray112/40 p-2">
                <span className="text-xs text-futarchyGray11 leading-4 dark:text-white/70 font-medium">Impact</span>
                <span className={`text-sm font-semibold ${calculatedImpact.startsWith('+') ? 'text-futarchyTeal9 dark:text-futarchyTeal9' : calculatedImpact.startsWith('-') ? 'text-futarchyCrimson9 dark:text-futarchyCrimson9' : 'text-futarchyGray12 dark:text-white'}`}>
                  {impactDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Second Row: Event Probability (if available) */}
          {!hideEventProbability && prices.eventProbability && (
            <div className="flex flex-col border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray3 dark:bg-transparent rounded-xl p-2">
              <div className="flex flex-row items-center justify-between px-2">
                <span className="text-xs text-futarchyGray11 dark:text-white/70 font-medium">Event Probability</span>
                <span className="text-sm font-semibold text-futarchyViolet7 dark:text-futarchyViolet7">
                  {isLoadingPrices ? <LoadingSpinner className="h-4 w-4" /> : prices.eventProbability}
                </span>
              </div>
            </div>
          )}
        </div>
      </a>
    </div>
  );
};

export default EventHighlightCard; 
