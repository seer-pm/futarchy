import React, { useState, useEffect, useRef, useMemo } from "react";
import { CheckIcon, CancelIcon, NewspaperIcon, EyeIcon } from "./Resources";
import Image from 'next/image';
import { createSubgraphPoolFetcher } from "../../../../utils/SubgraphPoolFetcher";
import { generateFallbackImage } from "../../../../utils/imageUtils";
import { getMarketUrl } from "../../../../utils/urlUtils";

// Subgraph-backed pool fetcher (replaces SupabasePoolFetcher)
const poolFetcher = createSubgraphPoolFetcher();

// Simple hook for fetching latest pool prices from the subgraph
const useSimplePoolPrices = (proposalID, poolAddresses, predictionPools, chainId = 100) => {
  const [prices, setPrices] = useState({ yes: null, no: null, eventProbability: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);

      try {
        console.log(`[SIMPLE PRICES] Fetching for proposal ${proposalID}`);

        // Fetch YES/NO prices from conditional pools
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

        // Extract conditional pool prices
        if (yesResult?.status === 'success' && yesResult.data.length > 0) {
          yesPrice = yesResult.data[0].price;
          console.log(`[SIMPLE PRICES] YES conditional price: ${yesPrice}`);
        }

        if (noResult?.status === 'success' && noResult.data.length > 0) {
          noPrice = noResult.data[0].price;
          console.log(`[SIMPLE PRICES] NO conditional price: ${noPrice}`);
        }

        // Fetch event probability from prediction pools
        let eventProbability = null;
        if (predictionPools?.yes?.address && predictionPools?.no?.address) {
          const [predYesResult, predNoResult] = await Promise.all([
            poolFetcher.fetch('pools.price', {
              id: predictionPools.yes.address,
              chainId
            }),
            poolFetcher.fetch('pools.price', {
              id: predictionPools.no.address,
              chainId
            })
          ]);

          if (predYesResult?.status === 'success' && predYesResult.data.length > 0 &&
            predNoResult?.status === 'success' && predNoResult.data.length > 0) {

            const predYesPrice = predYesResult.data[0].price;
            const predNoPrice = predNoResult.data[0].price;

            if (predYesPrice > 0 && predNoPrice > 0) {
              const probValue = (predYesPrice / (predYesPrice + predNoPrice)) * 100;
              eventProbability = `${probValue.toFixed(2)}%`;
              console.log(`[SIMPLE PRICES] Event probability: ${eventProbability}`);
            }
          }
        }

        setPrices({ yes: yesPrice, no: noPrice, eventProbability });

      } catch (error) {
        console.error(`[SIMPLE PRICES] Error fetching prices for ${proposalID}:`, error);
        setPrices({ yes: null, no: null, eventProbability: null });
      } finally {
        setLoading(false);
      }
    };

    if (poolAddresses?.yes || poolAddresses?.no || predictionPools?.yes?.address) {
      fetchPrices();
    } else {
      setLoading(false);
    }
  }, [proposalID, poolAddresses?.yes, poolAddresses?.no, predictionPools?.yes?.address, predictionPools?.no?.address, chainId]);

  return { prices, loading };
};

// Loading Spinner Component (copied from EventHighlightCard, adjusted class if needed)
const LoadingSpinner = ({ className = "h-4 w-4 text-futarchyGray12 dark:text-white" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const statusColors = {
  ongoing: {
    top: {
      border: "border-futarchyBlue5 dark:border-futarchyBlue9 dark:hover:border-futarchyBlue7",
      text: "text-futarchyBlue11 dark:text-futarchyBlue9 dark:hover:text-futarchyBlue7",
      hover: "hover:border-futarchyBlue7 dark:hover:border-futarchyBlue7",
      background: "bg-futarchyBlue4 dark:bg-transparent",
      dividerColor: "bg-futarchyBlue7",
      iconFill: "currentColor"
    },
    bottom: {
      border: "border-futarchyGold5 dark:border-futarchyGold7 dark:hover:border-futarchyGold5",
      text: "text-futarchyGold11 dark:text-futarchyGold7 dark:hover:text-futarchyGold5",
      hover: "hover:border-futarchyGold9 dark:hover:border-futarchyGold9",
      background: "bg-futarchyGold4 dark:bg-transparent",
      dividerColor: "bg-futarchyGold5",
      iconFill: "currentColor"
    },
  },
  approved: {
    top: {
      border: "border-futarchyBlue6",
      text: "text-futarchyBlue11",
      hover: "hover:border-futarchyBlue11",
      background: "bg-futarchyBlue5",
      dividerColor: "bg-futarchyBlue11",
      iconFill: "currentColor"
    },
    bottom: {
      border: "border-futarchyGold4",
      text: "text-futarchyGold7",
      hover: "hover:border-futarchyGold7",
      background: "bg-futarchyGold3",
      dividerColor: "bg-futarchyGold7",
      iconFill: "currentColor"
    },
  },
  refused: {
    top: {
      border: "border-futarchyBlue4",
      text: "text-futarchyBlue7",
      hover: "hover:border-futarchyBlue7",
      background: "bg-futarchyBlue3",
      dividerColor: "bg-futarchyBlue7",
      iconFill: "currentColor"
    },
    bottom: {
      border: "border-futarchyGold6",
      text: "text-futarchyGold11",
      hover: "hover:border-futarchyGold11",
      background: "bg-futarchyGold5",
      dividerColor: "bg-futarchyGold11",
      iconFill: "currentColor"
    },
  },
};

// Timestamp component with countdown and optional mock timestamp
const Timestamp = ({ countdownFinish, timestamp, endTime, resolutionStatus }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const updateRemainingTime = () => {
      const now = Date.now() / 1000; // Current time in seconds

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
      } else if (countdownFinish) {
        // Fallback for ended proposals without a specific end time
        setRemainingTime("Ended");
      }
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [countdownFinish, timestamp, endTime, resolutionStatus]);


  return (
    <div className="select-none text-black dark:text-futarchyGray3 text-sm font-semibold whitespace-nowrap leading-6">
      {remainingTime}
    </div>
  );
};

const Proposals = ({
  proposalID,
  proposalsDoc,
  proposalMarket,
  approvalStatus,
}) => {
  const sampleDocText = "Read Proposal";
  const sampleMarketText = "View Market";

  const statusClasses = statusColors[approvalStatus] || statusColors.ongoing;

  return (
    <div>
      <div className="flex flex-row gap-1 items-center text-sm font-light select-none justify-between">

        <a
          href={getMarketUrl(proposalID)}
          className="border-2 border-futarchyGray4 dark:border-futarchyGray112/40 rounded-xl w-full py-3 px-[14px] text-center flex flex-row justify-center items-center gap-[6px]"
        >
          <EyeIcon className="w-5 h-5 text-futarchyGray11 dark:text-futarchyGray3" />
          <span className="relative z-10 text-base font-semibold text-futarchyGray12 dark:text-futarchyGray3">
            {sampleMarketText}
          </span>
        </a>
      </div>
    </div>
  );
};

// approvalStatus picks the colours; the text is the market status label when
// the caller has one (resolveMarketStatus in utils/proposalLifecycle.js).
const ProposalStatus = ({ approvalStatus, marketStatus }) => {
  const { borderColor, textColor, bgColor, statusText } = (() => {
    switch (approvalStatus) {
      case "approved":
        return {
          borderColor: "border-futarchyBlue6 dark:border-futarchyBlue5",
          textColor: "text-futarchyBlue11 dark:text-futarchyBlue5 dark:font-medium",
          bgColor: "bg-futarchyBlue3 dark:bg-transparent",
          statusText: "Approved",
        };
      case "refused":
        return {
          borderColor: "border-futarchyGold6 dark:border-futarchyGold5",
          textColor: "text-futarchyGold11 dark:text-futarchyGold5 dark:font-medium",
          bgColor: "bg-futarchyGold3 dark:bg-transparent",
          statusText: "Refused",
        };
      case "ongoing":
      default:
        return {
          borderColor: "border-futarchyTeal7 dark:border-futarchyTeal5",
          textColor: "text-futarchyTeal9 dark:text-futarchyTeal5 dark:font-medium",
          bgColor: "bg-futarchyTeal3 dark:bg-transparent",
          statusText: "Ongoing",
        };
    }
  })();

  return (
    <div className="flex">
      <div
        className={`inline-flex items-center justify-center rounded-full py-1 px-[10px] 
                    ${borderColor} ${textColor} ${bgColor} 
                    border font-medium text-xs leading-4 whitespace-nowrap`}
      >
        {marketStatus?.labelWithOutcome || statusText}
      </div>
    </div>
  );
};

// Update the ProposalsPrices component to handle numerical prices and loading state
const ProposalsPrices = ({ approvalPrice, refusalPrice, approvalStatus, isLoading, metadata, chainId }) => {
  const currentColors = statusColors[approvalStatus] || statusColors.ongoing;
  const [dividerColor, setDividerColor] = useState("bg-futarchyGray4 dark:bg-futarchyGray112/20");

  // Extract base token symbol from metadata
  const baseTokenSymbol = metadata?.currencyTokens?.base?.tokenSymbol ||
    metadata?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    (Number(metadata?.chain || chainId) === 1 ? 'USDS' : 'sDAI');

  // Use high precision for inverted prices or small prices
  const shouldUseHighPrecision = metadata?.invertCondPoolPrice === true ||
    (refusalPrice !== null && refusalPrice < 1) ||
    (approvalPrice !== null && approvalPrice < 1);
  const precision = shouldUseHighPrecision ? 4 : 2;

  // Debug logging
  console.log(`[ProposalsPrices] Debug:`, {
    approvalPrice,
    refusalPrice,
    shouldUseHighPrecision,
    precision,
    isLoading,
    smallPriceDetected: (refusalPrice !== null && refusalPrice < 1) || (approvalPrice !== null && approvalPrice < 1),
    baseTokenSymbol
  });

  const displayApproval = isLoading ? <LoadingSpinner /> : (approvalPrice !== null ? `${approvalPrice.toFixed(precision)} ${baseTokenSymbol}` : "N/A");
  const displayRefusal = isLoading ? <LoadingSpinner /> : (refusalPrice !== null ? `${refusalPrice.toFixed(precision)} ${baseTokenSymbol}` : "N/A");

  return (
    <div className="flex relative">
      {/* Top Button */}
      <button
        className={`relative overflow-hidden px-3 py-2 border-2 border-r-0 rounded-l-lg w-1/2 
                    transition-all duration-300
                    ${currentColors.top.border} ${currentColors.top.text} ${currentColors.top.hover}
                    ${currentColors.top.background}`}
        onMouseEnter={() => setDividerColor(currentColors.top.dividerColor)}
        onMouseLeave={() => setDividerColor("bg-futarchyGray4 dark:bg-futarchyGray112/20")}
        disabled={isLoading}
      >
        <div className={`absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300`} />
        <span className="flex items-center gap-2 relative z-10 transition-colors duration-300 justify-between">
          <CheckIcon fill={currentColors.top.iconFill} />
          <span className="font-oxanium text-sm leading-5 min-h-[20px] flex items-center">{displayApproval}</span>
        </span>
      </button>

      <div className={`w-0.5 transition-colors duration-300 relative z-10 ${dividerColor}`}></div>

      {/* Bottom Button */}
      <button
        className={`relative overflow-hidden px-3 py-2 border-2 border-l-0 rounded-r-lg w-1/2 
                    transition-all duration-300
                    ${currentColors.bottom.border} ${currentColors.bottom.text} ${currentColors.bottom.hover}
                    ${currentColors.bottom.background}`}
        onMouseEnter={() => setDividerColor(currentColors.bottom.dividerColor)}
        onMouseLeave={() => setDividerColor("bg-futarchyGray4 dark:bg-futarchyGray112/20")}
        disabled={isLoading}
      >
        <div className={`absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300`} />
        <span className="flex items-center gap-2 relative z-10 transition-colors duration-300 justify-between">
          <CancelIcon fill={currentColors.bottom.iconFill} />
          <span className="font-oxanium text-sm leading-5 min-h-[20px] flex items-center">{displayRefusal}</span>
        </span>
      </button>
    </div>
  );
};

export const ProposalsCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  tags,
  prices: initialPrices,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  impact: initialImpact,
  eventProbability: initialEventProbability,
  predictionPools,
  poolAddresses,
  metadata,
  chainId,
  resolutionStatus,
  marketStatus,
  visibility = 'public',
  isOwner = false,
}) => {
  // ✅ REFACTORED: Determine the appropriate image based on metadata
  const getProposalImage = () => {
    // Priority 1: Check if metadata has a background_image URL
    if (metadata?.background_image) {
      return metadata.background_image;
    }

    // Priority 2: Use provided image prop
    if (image) {
      return image;
    }

    // ❌ NO FALLBACK - Return null if no image
    const companyName = metadata?.companyName || title || 'Company';
    const companyId = metadata?.companyId || 9;
    console.error(`❌ [ProposalsCard] MISSING background_image for: ${companyName} (ID: ${companyId})`);

    return null;
  };

  const proposalImage = getProposalImage();

  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  // Check if prices were passed directly (subgraph path)
  const hasInitialPrices = initialPrices?.yes !== undefined || initialPrices?.no !== undefined;

  // Use simplified hook for fetching pool prices (only if no initial prices passed)
  const { prices: fetchedPrices, loading: isLoadingPrices } = useSimplePoolPrices(
    hasInitialPrices ? null : proposalID, // Skip fetch if we have initial prices
    hasInitialPrices ? null : poolAddresses,
    hasInitialPrices ? null : predictionPools,
    metadata?.chain || 100
  );

  // Use initial prices if provided, otherwise use fetched prices
  const prices = hasInitialPrices ? initialPrices : fetchedPrices;

  // Calculate impact when prices change
  const displayImpact = useMemo(() => {
    if (prices?.yes !== null && prices?.no !== null) {
      const maxPrice = Math.max(prices.yes, prices.no);
      if (maxPrice !== 0) {
        const impactValue = ((prices.yes - prices.no) / maxPrice) * 100;
        return `${impactValue >= 0 ? '+' : ''}${impactValue.toFixed(2)}%`;
      }
    }
    return initialImpact || "N/A";
  }, [prices?.yes, prices?.no, initialImpact]);

  const displayYesPrice = prices?.yes;
  const displayNoPrice = prices?.no;
  const displayEventProbability = prices?.eventProbability || initialEventProbability || "N/A";

  const statusStyles = {
    approved: {
      gradient: "from-futarchyBlue4 to-transparent rounded-t-xl",
      hoverGradient: "from-futarchyBlue7 to-transparent rounded-t-xl",
      border: "border-futarchyBlue3",
    },
    refused: {
      gradient: "from-futarchyGold4 to-transparent rounded-t-xl",
      hoverGradient: "from-futarchyGold7 to-transparent rounded-t-xl",
      border: "border-futarchyGold3",
    },
    ongoing: {
      gradient: "from-futarchyGreen4 to-transparent rounded-t-xl",
      hoverGradient: "from-futarchyGreen7 to-transparent rounded-t-xl",
      border: "border-futarchyGreen3",
    },
  };

  const currentStyle = statusStyles[approvalStatus] || statusStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-[392px] h-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl w-[388px] h-[180px]">
          <div
            className={`absolute inset-0 opacity-100 transition-opacity duration-300 bg-gradient-to-r ${currentStyle.gradient}`}
          />
          <div
            className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r ${currentStyle.hoverGradient}`}
          />
          {/* Image Container */}
          {proposalImage && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image
                  src={proposalImage}
                  alt="Proposal Image"
                  layout="fill"
                  objectFit="cover"
                  className="opacity-100"

                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div className="p-5 bg-futarchyGray2 dark:bg-futarchyDarkGray2  relative z-20 transform transition-all duration-300 hover:-translate-y-2 rounded-b-2xl w-[388px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col border-2 border-futarchyGray4 dark:border-futarchyGray112/40 rounded-xl">
              {/* Timestamp and Icon */}
              <div className="flex flex-row justify-between items-center p-3 bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-t-xl">
                <Timestamp
                  countdownFinish={countdownFinish}
                  timestamp={timestamp}
                  endTime={endTime}
                  resolutionStatus={resolutionStatus}
                />
                <div className="flex items-center gap-2">
                  {visibility === 'hidden' && isOwner && (
                    <span
                      className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30 flex items-center gap-1"
                      title="This proposal is hidden from the public. Only visible to you as owner."
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                      Hidden
                    </span>
                  )}
                  <ProposalStatus approvalStatus={approvalStatus} marketStatus={marketStatus} />
                </div>
              </div>
              <div className="flex flex-col p-3 gap-3">
                {/* Title with data-testid - Larger and more lines */}
                <h3
                  className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray leading-6 line-clamp-3 min-h-[72px]"
                  data-testid={`proposal-card-title-${proposalID}`}
                >
                  {shouldUseSplitTitles ? (
                    <>
                      <span>{displayTitle0}</span>{' '}
                      <span className="text-futarchyViolet7">{displayTitle1}</span>
                    </>
                  ) : (
                    proposalTitle
                  )}
                </h3>

                {/* Prices */}
                <ProposalsPrices
                  approvalPrice={displayYesPrice}
                  refusalPrice={displayNoPrice}
                  approvalStatus={approvalStatus}
                  isLoading={isLoadingPrices}
                  metadata={metadata}
                  chainId={chainId}
                />

                {/* Add Impact and Event Probability */}
                <div className="flex justify-between items-center mt-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-futarchyGray">Impact:</span>
                    {isLoadingPrices ? <LoadingSpinner className="h-4 w-4" /> : (
                      <span className={`font-medium text-lg ${(displayImpact && parseFloat(displayImpact) >= 0) ? 'text-futarchyTeal9' : 'text-futarchyCrimson9'}`}>
                        {displayImpact}
                      </span>
                    )}
                  </div>
                  {/* Only show Event Probability if it has a real value */}
                  {displayEventProbability && displayEventProbability !== "N/A" && (
                    <div className="flex items-center gap-2">
                      <span className="text-futarchyGray">Event Probability:</span>
                      {isLoadingPrices ? <LoadingSpinner className="h-4 w-4" /> : (
                        <span className="font-medium text-futarchyGray12 dark:text-futarchyGray3">
                          {displayEventProbability}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Proposal links */}
            {proposalsDocMarket.map((proposal, index) => (
              <Proposals
                key={index}
                proposalID={proposalID}
                proposalsDoc={proposal.proposalsDoc}
                proposalMarket={proposal.proposalMarket}
                approvalStatus={proposal.approvalStatus || approvalStatus}
              />
            ))}
          </div>
        </div>
      </div>
    </a>
  );
};

export const MobileProposalsCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  tags,
  prices: initialPrices,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  impact: initialImpact,
  eventProbability: initialEventProbability,
  predictionPools,
  poolAddresses,
  metadata,
  chainId,
  resolutionStatus,
  marketStatus,
  visibility = 'public',
  isOwner = false,
}) => {
  // ✅ REFACTORED: Determine the appropriate image based on metadata
  const getProposalImage = () => {
    // Priority 1: Check if metadata has a background_image URL
    if (metadata?.background_image) {
      return metadata.background_image;
    }

    // Priority 2: Use provided image prop
    if (image) {
      return image;
    }

    // ❌ NO FALLBACK - Return null if no image
    const companyName = metadata?.companyName || title || 'Company';
    const companyId = metadata?.companyId || 9;
    console.error(`❌ [ProposalsCard] MISSING background_image for: ${companyName} (ID: ${companyId})`);

    return null;
  };

  const proposalImage = getProposalImage();

  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  // Check if prices were passed directly (subgraph path)
  const hasInitialPrices = initialPrices?.yes !== undefined || initialPrices?.no !== undefined;

  // Use simplified hook for fetching pool prices (only if no initial prices passed)
  const { prices: fetchedPrices, loading: isLoadingPrices } = useSimplePoolPrices(
    hasInitialPrices ? null : proposalID,
    hasInitialPrices ? null : poolAddresses,
    hasInitialPrices ? null : predictionPools,
    metadata?.chain || 100
  );

  // Use initial prices if provided, otherwise use fetched prices
  const prices = hasInitialPrices ? initialPrices : fetchedPrices;

  // Calculate impact when prices change (same as desktop version)
  const displayImpact = useMemo(() => {
    if (prices?.yes !== null && prices?.no !== null) {
      const maxPrice = Math.max(prices.yes, prices.no);
      if (maxPrice !== 0) {
        const impactValue = ((prices.yes - prices.no) / maxPrice) * 100;
        return `${impactValue >= 0 ? '+' : ''}${impactValue.toFixed(2)}%`;
      }
    }
    return initialImpact || "N/A";
  }, [prices?.yes, prices?.no, initialImpact]);

  const displayYesPrice = prices?.yes;
  const displayNoPrice = prices?.no;
  const displayEventProbability = prices?.eventProbability || initialEventProbability || "N/A";

  const gradientStyles = {
    approved: {
      gradient: "from-futarchyBlue4 to-transparent",
      hoverGradient: "from-futarchyBlue7 to-transparent",
    },
    refused: {
      gradient: "from-futarchyGold4 to-transparent",
      hoverGradient: "from-futarchyGold7 to-transparent",
    },
    ongoing: {
      gradient: "from-futarchyGreen4 to-transparent",
      hoverGradient: "from-futarchyGreen7 to-transparent",
    },
  };

  const currentGradient = gradientStyles[approvalStatus] || gradientStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block w-full hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section with image */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl h-[120px]">
          <div className={`absolute inset-0 opacity-100 transition-opacity duration-300 bg-gradient-to-r ${currentGradient.gradient} rounded-t-xl`} />
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r ${currentGradient.hoverGradient} rounded-t-xl`} />
          {proposalImage && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image
                  src={proposalImage}
                  alt="Proposal Image"
                  layout="fill"
                  objectFit="cover"
                  className="opacity-100"

                />
              </div>
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 relative z-20 rounded-b-xl">
          <div className="flex flex-col gap-4">
            {/* Header with timestamp and status */}
            <div className="flex justify-between items-center bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-lg p-2">
              <div className="text-xs">
                <Timestamp
                  countdownFinish={countdownFinish}
                  timestamp={timestamp}
                  endTime={endTime}
                  resolutionStatus={resolutionStatus}
                />
              </div>
              <div className="flex items-center gap-2">
                {visibility === 'hidden' && isOwner && (
                  <span
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30 flex items-center gap-1"
                    title="This proposal is hidden from the public. Only visible to you as owner."
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    Hidden
                  </span>
                )}
                <ProposalStatus approvalStatus={approvalStatus} marketStatus={marketStatus} />
              </div>
            </div>

            {/* Title - Larger and more lines for mobile */}
            <h3
              className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray leading-6 line-clamp-3 min-h-[72px]"
              data-testid={`proposal-card-title-${proposalID}`}
            >
              {shouldUseSplitTitles ? (
                <>
                  <span>{displayTitle0}</span>{' '}
                  <span className="text-futarchyViolet7">{displayTitle1}</span>
                </>
              ) : (
                proposalTitle
              )}
            </h3>

            {/* Prices */}
            <div className="flex flex-col gap-2">
              <ProposalsPrices
                approvalPrice={displayYesPrice}
                refusalPrice={displayNoPrice}
                approvalStatus={approvalStatus}
                isLoading={isLoadingPrices}
                metadata={metadata}
                chainId={chainId}
              />

              {/* Impact and Event Probability - Stacked for mobile */}
              <div className="flex flex-col gap-2 mt-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-futarchyGray11 dark:text-futarchyGray">Impact:</span>
                  {isLoadingPrices ? <LoadingSpinner className="h-3 w-3" /> : (
                    <span className={`font-medium text-sm ${(displayImpact && parseFloat(displayImpact) >= 0) ? 'text-futarchyTeal9' : 'text-futarchyCrimson9'}`}>
                      {displayImpact}
                    </span>
                  )}
                </div>
                {/* Only show Event Probability if it has a real value */}
                {displayEventProbability && displayEventProbability !== "N/A" && (
                  <div className="flex justify-between items-center">
                    <span className="text-futarchyGray11 dark:text-futarchyGray">Event Probability:</span>
                    {isLoadingPrices ? <LoadingSpinner className="h-3 w-3" /> : (
                      <span className="font-medium text-futarchyGray12 dark:text-futarchyGray3">
                        {displayEventProbability}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

// Intermediate Proposal Card - simpler variant
export const IntermediateProposalCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  sharePrice = "$10.00",
  eventProbability = "51%",
  resolutionStatus,
  metadata,
}) => {
  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  const gradientStyles = {
    approved: {
      gradient: "from-futarchyBlue4 to-transparent",
      hoverGradient: "from-futarchyBlue7 to-transparent",
    },
    refused: {
      gradient: "from-futarchyGold4 to-transparent",
      hoverGradient: "from-futarchyGold7 to-transparent",
    },
    ongoing: {
      gradient: "from-futarchyGreen4 to-transparent",
      hoverGradient: "from-futarchyGreen7 to-transparent",
    },
  };
  const currentGradient = gradientStyles[approvalStatus] || gradientStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-[392px] h-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl w-[388px] h-[180px]">
          {image && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image src={image} alt="Proposal Image" layout="fill" objectFit="cover" className="opacity-100" />
              </div>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div className="p-5 bg-futarchyGray2 dark:bg-futarchyDarkGray2 relative z-20 transform transition-all duration-300 hover:-translate-y-2 rounded-b-2xl w-[388px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col border-2 border-futarchyGray4 dark:border-futarchyGray112/40 rounded-xl">
              {/* Timestamp and Status */}
              <div className="flex flex-row justify-between items-center p-3 bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-t-xl">
                <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
                <ProposalStatus approvalStatus={approvalStatus} />
              </div>
              <div className="flex flex-col p-3 gap-3">
                {/* Title - Larger and more lines */}
                <h3 className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray3 leading-6 line-clamp-3 min-h-[72px]" data-testid={`proposal-card-title-${proposalID}`}>
                  {shouldUseSplitTitles ? (
                    <>
                      <span>{displayTitle0}</span>{' '}
                      <span className="text-futarchyViolet7">{displayTitle1}</span>
                    </>
                  ) : (
                    proposalTitle
                  )}
                </h3>
                {/* Share Price and Event Probability */}
                <div className="flex flex-col gap-2 mt-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-futarchyGray11 dark:text-futarchyGray">Share Price:</span>
                    <span className="font-medium text-futarchyGray9 dark:text-futarchyGray3">
                      {sharePrice}
                    </span>
                  </div>
                  {/* Only show Event Probability if it has a real value */}
                  {eventProbability && eventProbability !== "N/A" && (
                    <div className="flex justify-between items-center">
                      <span className="text-futarchyGray11 dark:text-futarchyGray">Event Probability:</span>
                      <span className="font-medium text-futarchyGray12 dark:text-futarchyGray3">{eventProbability}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

// Mobile Intermediate Proposal Card
export const MobileIntermediateProposalCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  sharePrice = "$10.00",
  eventProbability = "51%",
  resolutionStatus,
  metadata,
}) => {
  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  const gradientStyles = {
    approved: {
      gradient: "from-futarchyBlue4 to-transparent",
      hoverGradient: "from-futarchyBlue7 to-transparent",
    },
    refused: {
      gradient: "from-futarchyGold4 to-transparent",
      hoverGradient: "from-futarchyGold7 to-transparent",
    },
    ongoing: {
      gradient: "from-futarchyGreen4 to-transparent",
      hoverGradient: "from-futarchyGreen7 to-transparent",
    },
  };
  const currentGradient = gradientStyles[approvalStatus] || gradientStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block w-full hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl h-[120px]">
          {image && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image src={image} alt="Proposal Image" layout="fill" objectFit="cover" className="opacity-100" />
              </div>
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 relative z-20 rounded-b-xl">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-lg p-2">
              <div className="text-xs">
                <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
              </div>
              <ProposalStatus approvalStatus={approvalStatus} />
            </div>
            {/* Title - Larger and more lines */}
            <h3 className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray3 leading-6 line-clamp-3 min-h-[72px]" data-testid={`proposal-card-title-${proposalID}`}>
              {shouldUseSplitTitles ? (
                <>
                  <span>{displayTitle0}</span>{' '}
                  <span className="text-futarchyViolet7">{displayTitle1}</span>
                </>
              ) : (
                proposalTitle
              )}
            </h3>
            {/* Share Price and Event Probability */}
            <div className="flex flex-col gap-2 mt-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-futarchyGray11 dark:text-futarchyGray">Share Price:</span>
                <span className="font-medium text-futarchyGray9 dark:text-futarchyGray3">
                  {sharePrice}
                </span>
              </div>
              {/* Only show Event Probability if it has a real value */}
              {eventProbability && eventProbability !== "N/A" && (
                <div className="flex justify-between items-center">
                  <span className="text-futarchyGray11 dark:text-futarchyGray">Event Probability:</span>
                  <span className="font-medium text-futarchyGray12 dark:text-futarchyGray3">
                    {eventProbability}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

// Simple Proposal Card - no eventProbability
export const SimpleProposalCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  sharePrice = "$10.00",
  resolutionStatus,
  metadata,
}) => {
  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  const gradientStyles = {
    approved: { gradient: "from-futarchyBlue4 to-transparent", hoverGradient: "from-futarchyBlue7 to-transparent" },
    refused: { gradient: "from-futarchyGold4 to-transparent", hoverGradient: "from-futarchyGold7 to-transparent" },
    ongoing: { gradient: "from-futarchyGreen4 to-transparent", hoverGradient: "from-futarchyGreen7 to-transparent" },
  };
  const currentGradient = gradientStyles[approvalStatus] || gradientStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-[392px] h-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl w-[388px] h-[180px]">
          {image && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image src={image} alt="Proposal Image" layout="fill" objectFit="cover" className="opacity-100" />
              </div>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div className="p-5 bg-futarchyGray2 dark:bg-futarchyDarkGray2 relative z-20 transform transition-all duration-300 hover:-translate-y-2 rounded-b-2xl w-[388px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col border-2 border-futarchyGray4 dark:border-futarchyGray112/40 rounded-xl">
              {/* Timestamp and Status */}
              <div className="flex flex-row justify-between items-center p-3 bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-t-xl">
                <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
                <ProposalStatus approvalStatus={approvalStatus} />
              </div>
              <div className="flex flex-col p-3 gap-3">
                {/* Title - Larger and more lines */}
                <h3 className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray3 leading-6 line-clamp-3 min-h-[72px]" data-testid={`proposal-card-title-${proposalID}`}>
                  {shouldUseSplitTitles ? (
                    <>
                      <span>{displayTitle0}</span>{' '}
                      <span className="text-futarchyViolet7">{displayTitle1}</span>
                    </>
                  ) : (
                    proposalTitle
                  )}
                </h3>
                {/* Share Price */}
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className="text-futarchyGray11 dark:text-futarchyGray">Share Price:</span>
                  <span className="font-medium text-futarchyGray9 dark:text-futarchyGray3">{sharePrice}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

// Mobile Simple Proposal Card - no eventProbability
export const MobileSimpleProposalCard = ({
  proposalID,
  proposalTitle,
  approvalStatus,
  countdownFinish,
  timestamp,
  endTime,
  image,
  useStorybookUrl = false,
  proposalsDocMarket = [{}],
  sharePrice = "$10.00",
  resolutionStatus,
  metadata,
}) => {
  // Extract display titles from metadata (similar to EventHighlightCard)
  const displayTitle0 = metadata?.display_title_0 || null;
  const displayTitle1 = metadata?.display_title_1 || null;

  // If we have both display titles, use them; otherwise fall back to proposalTitle
  const shouldUseSplitTitles = displayTitle0 && displayTitle1;

  const gradientStyles = {
    approved: { gradient: "from-futarchyBlue4 to-transparent", hoverGradient: "from-futarchyBlue7 to-transparent" },
    refused: { gradient: "from-futarchyGold4 to-transparent", hoverGradient: "from-futarchyGold7 to-transparent" },
    ongoing: { gradient: "from-futarchyGreen4 to-transparent", hoverGradient: "from-futarchyGreen7 to-transparent" },
  };
  const currentGradient = gradientStyles[approvalStatus] || gradientStyles.ongoing;

  return (
    <a href={getMarketUrl(proposalID)} className="block w-full hover:opacity-90 transition-opacity">
      <div className="flex flex-col bg-futarchyGray2 dark:bg-transparent border-2 border-futarchyGray3 dark:border-futarchyGray112/40 rounded-2xl group relative w-full shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Top section */}
        <div className="bg-lightGray dark:bg-transparent flex flex-col justify-center relative rounded-t-xl h-[120px]">
          {image && (
            <div className="absolute inset-0 rounded-t-xl overflow-hidden" style={{ backgroundColor: "#151411" }}>
              <div className="w-full h-full scale-90">
                <Image src={image} alt="Proposal Image" layout="fill" objectFit="cover" className="opacity-100" />
              </div>
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 relative z-20 rounded-b-xl">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center bg-futarchyGray3 dark:bg-futarchyGray112/10 rounded-lg p-2">
              <div className="text-xs">
                <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
              </div>
              <ProposalStatus approvalStatus={approvalStatus} />
            </div>
            {/* Title - Larger and more lines */}
            <h3 className="text-base font-bold font-oxanium text-futarchyGray11 dark:text-futarchyGray3 leading-6 line-clamp-3 min-h-[72px]" data-testid={`proposal-card-title-${proposalID}`}>
              {shouldUseSplitTitles ? (
                <>
                  <span>{displayTitle0}</span>{' '}
                  <span className="text-futarchyViolet7">{displayTitle1}</span>
                </>
              ) : (
                proposalTitle
              )}
            </h3>
            {/* Share Price */}
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className="text-futarchyGray11 dark:text-futarchyGray">Share Price:</span>
              <span className="font-medium text-futarchyGray9 dark:text-futarchyGray3">{sharePrice}</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};
