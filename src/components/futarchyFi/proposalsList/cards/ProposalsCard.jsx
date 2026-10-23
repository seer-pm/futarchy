import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from 'next/image';
import Badge from "../../../ui/Badge";
import ChainBadge from "../../companyList/components/ChainBadge";
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
const LoadingSpinner = ({ className = "h-4 w-4 text-seer-muted" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="status" aria-label="Loading">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

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




  // Nothing to say (no end time known): render nothing, so the card's footer row can collapse.
  if (!remainingTime) return null;

  return (
    <p className="select-none text-[13px] text-seer-muted tabular-nums whitespace-nowrap">
      {remainingTime}
    </p>
  );
};

// The card's market link, shown as text at its foot. The whole card also leads to the market
// through the title's stretched link, so this one sits above that overlay.
const Proposals = ({
  proposalID,
  proposalsDoc,
  proposalMarket,
  approvalStatus,
}) => {
  const sampleDocText = "Read Proposal";
  const sampleMarketText = "View Market";

  return (
    <a
      href={getMarketUrl(proposalID)}
      className="relative z-10 ml-auto shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-seer-accent-text hover:underline underline-offset-4"
    >
      <span>{sampleMarketText}</span>
      <span aria-hidden="true">&rarr;</span>
    </a>
  );
};

// approvalStatus picks the tone; the text is the market status label when
// the caller has one (resolveMarketStatus in utils/proposalLifecycle.js).
const ProposalStatus = ({ approvalStatus, marketStatus }) => {
  const { tone, statusText } = (() => {
    switch (approvalStatus) {
      case "approved":
        return { tone: "pass", statusText: "Approved" };
      case "refused":
        return { tone: "fail", statusText: "Refused" };
      case "ongoing":
      default:
        // An open market and one waiting for its answer read differently, as on the home page.
        if (marketStatus?.state === "awaiting_resolution") return { tone: "warning", statusText: "Ongoing" };
        if (marketStatus?.state === "resolved") return { tone: "neutral", statusText: "Ongoing" };
        return { tone: "accent", statusText: "Ongoing" };
    }
  })();

  return (
    <Badge tone={tone}>
      {marketStatus?.labelWithOutcome || statusText}
    </Badge>
  );
};

// The two conditional prices, in the outcomes' colours. They are read side by side; the labels
// say which world each one is.
const ProposalsPrices = ({ approvalPrice, refusalPrice, approvalStatus, isLoading, metadata, chainId }) => {
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
    <>
      <Figure label="If it passes" valueClassName="text-pass-text">{displayApproval}</Figure>
      <Figure label="If it fails" valueClassName="text-fail-text">{displayRefusal}</Figure>
    </>
  );
};

/** One labelled figure: a muted label over the number. */
const Figure = ({ label, valueClassName = "text-seer-text", children }) => (
  <div className="min-w-0">
    <p className="text-seer-muted">{label}</p>
    <div className={`mt-0.5 min-h-[20px] flex items-center font-semibold tabular-nums break-words ${valueClassName}`}>{children}</div>
  </div>
);

/** Impact is a status, so its sign carries it as well as its colour. "N/A" stays neutral. */
const impactClassName = (displayImpact) => {
  const value = parseFloat(displayImpact);
  if (!Number.isFinite(value)) return "text-seer-text";
  return value >= 0 ? "text-seer-positive" : "text-seer-negative";
};

const HiddenBadge = () => (
  <Badge
    className="relative z-10"
    title="This proposal is hidden from the public. Only visible to you as owner."
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
    Hidden
  </Badge>
);

/**
 * A milestone card on the kit's surface, laid out like the home page's tiles: who asks and the
 * state, the question with its second half in the accent, the figures, then the time and the link.
 * The title's link stretches over the whole card, so the card stays one click target without
 * nesting the footer's link inside another.
 */
const CardFrame = ({
  proposalID,
  compact = false,
  logo,
  organizationName,
  chainId,
  status,
  title,
  figures,
  footer,
}) => (
  <article
    className={`relative flex flex-col gap-4 h-full w-full min-w-0 bg-seer-surface border border-seer-border rounded-surface transition-colors hover:border-seer-accent-text/50 focus-within:border-seer-accent-text ${compact ? 'p-4' : 'p-5'}`}
  >
    <div className="flex items-center gap-2 min-w-0">
      {logo && (
        <span className="relative w-6 h-6 shrink-0 rounded-full overflow-hidden bg-seer-surface-raised">
          <Image src={logo} alt="" fill sizes="24px" className="object-cover" />
        </span>
      )}
      {organizationName && (
        <span className="text-[13px] font-semibold text-seer-text truncate">{organizationName}</span>
      )}
      {chainId && <ChainBadge chainId={Number(chainId)} size="xs" />}
      <span className="ml-auto flex shrink-0 items-center gap-2">{status}</span>
    </div>

    <h3
      className={`${compact ? 'text-base' : 'text-[17px]'} font-semibold leading-snug tracking-tight text-seer-text [text-wrap:balance] line-clamp-3 break-words`}
      data-testid={`proposal-card-title-${proposalID}`}
    >
      <a href={getMarketUrl(proposalID)} className="after:absolute after:inset-0 after:rounded-surface focus-visible:outline-none">
        {title}
      </a>
    </h3>

    <div className="mt-auto flex flex-col gap-3 text-[13px]">
      {figures}
    </div>

    {/* Collapses when it has nothing in it (no end time and no link, as on the phone card). */}
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-seer-border empty:hidden">
      {footer}
    </div>
  </article>
);

/** The question, its second half in the accent when the registry splits it. */
const CardTitle = ({ shouldUseSplitTitles, displayTitle0, displayTitle1, proposalTitle }) => (
  shouldUseSplitTitles ? (
    <>
      <span>{displayTitle0}</span>{' '}
      <span className="text-seer-accent-text">{displayTitle1}</span>
    </>
  ) : (
    proposalTitle
  )
);

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
  organizationName,
  organizationLogo,
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={false}
      logo={organizationLogo || proposalImage}
      organizationName={organizationName}
      chainId={chainId || metadata?.chain || 100}
      status={
        <>
          {visibility === 'hidden' && isOwner && <HiddenBadge />}
          <ProposalStatus approvalStatus={approvalStatus} marketStatus={marketStatus} />
        </>
      }
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="grid grid-cols-3 gap-3">
            <ProposalsPrices
              approvalPrice={displayYesPrice}
              refusalPrice={displayNoPrice}
              approvalStatus={approvalStatus}
              isLoading={isLoadingPrices}
              metadata={metadata}
              chainId={chainId}
            />
            <Figure label="Impact" valueClassName={impactClassName(displayImpact)}>
              {isLoadingPrices ? <LoadingSpinner /> : displayImpact}
            </Figure>
          </div>
          {/* Only show Event Probability if it has a real value */}
          {displayEventProbability && displayEventProbability !== "N/A" && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-seer-muted">Event Probability</span>
              {isLoadingPrices ? <LoadingSpinner /> : (
                <span className="font-semibold tabular-nums text-seer-text">
                  {displayEventProbability}
                </span>
              )}
            </div>
          )}
        </>
      }
      footer={
        <>
          <Timestamp
            countdownFinish={countdownFinish}
            timestamp={timestamp}
            endTime={endTime}
            resolutionStatus={resolutionStatus}
          />
          {proposalsDocMarket.map((proposal, index) => (
            <Proposals
              key={index}
              proposalID={proposalID}
              proposalsDoc={proposal.proposalsDoc}
              proposalMarket={proposal.proposalMarket}
              approvalStatus={proposal.approvalStatus || approvalStatus}
            />
          ))}
        </>
      }
    />
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
  organizationName,
  organizationLogo,
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={true}
      logo={organizationLogo || proposalImage}
      organizationName={organizationName}
      chainId={chainId || metadata?.chain || 100}
      status={
        <>
          {visibility === 'hidden' && isOwner && <HiddenBadge />}
          <ProposalStatus approvalStatus={approvalStatus} marketStatus={marketStatus} />
        </>
      }
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="grid grid-cols-3 gap-3">
            <ProposalsPrices
              approvalPrice={displayYesPrice}
              refusalPrice={displayNoPrice}
              approvalStatus={approvalStatus}
              isLoading={isLoadingPrices}
              metadata={metadata}
              chainId={chainId}
            />
            <Figure label="Impact" valueClassName={impactClassName(displayImpact)}>
              {isLoadingPrices ? <LoadingSpinner /> : displayImpact}
            </Figure>
          </div>
          {/* Only show Event Probability if it has a real value */}
          {displayEventProbability && displayEventProbability !== "N/A" && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-seer-muted">Event Probability</span>
              {isLoadingPrices ? <LoadingSpinner /> : (
                <span className="font-semibold tabular-nums text-seer-text">
                  {displayEventProbability}
                </span>
              )}
            </div>
          )}
        </>
      }
      footer={
        <>
          <Timestamp
            countdownFinish={countdownFinish}
            timestamp={timestamp}
            endTime={endTime}
            resolutionStatus={resolutionStatus}
          />
        </>
      }
    />
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={false}
      logo={image}
      chainId={metadata?.chain}
      status={<ProposalStatus approvalStatus={approvalStatus} />}
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-seer-muted">Share Price</span>
            <span className="font-semibold tabular-nums text-seer-text">{sharePrice}</span>
          </div>
          {/* Only show Event Probability if it has a real value */}
          {eventProbability && eventProbability !== "N/A" && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-seer-muted">Event Probability</span>
              <span className="font-semibold tabular-nums text-seer-text">{eventProbability}</span>
            </div>
          )}
        </>
      }
      footer={
        <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
      }
    />
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={true}
      logo={image}
      chainId={metadata?.chain}
      status={<ProposalStatus approvalStatus={approvalStatus} />}
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-seer-muted">Share Price</span>
            <span className="font-semibold tabular-nums text-seer-text">{sharePrice}</span>
          </div>
          {/* Only show Event Probability if it has a real value */}
          {eventProbability && eventProbability !== "N/A" && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-seer-muted">Event Probability</span>
              <span className="font-semibold tabular-nums text-seer-text">{eventProbability}</span>
            </div>
          )}
        </>
      }
      footer={
        <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
      }
    />
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={false}
      logo={image}
      chainId={metadata?.chain}
      status={<ProposalStatus approvalStatus={approvalStatus} />}
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-seer-muted">Share Price</span>
            <span className="font-semibold tabular-nums text-seer-text">{sharePrice}</span>
          </div>
        </>
      }
      footer={
        <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
      }
    />
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

  return (
    <CardFrame
      proposalID={proposalID}
      compact={true}
      logo={image}
      chainId={metadata?.chain}
      status={<ProposalStatus approvalStatus={approvalStatus} />}
      title={
        <CardTitle
          shouldUseSplitTitles={shouldUseSplitTitles}
          displayTitle0={displayTitle0}
          displayTitle1={displayTitle1}
          proposalTitle={proposalTitle}
        />
      }
      figures={
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-seer-muted">Share Price</span>
            <span className="font-semibold tabular-nums text-seer-text">{sharePrice}</span>
          </div>
        </>
      }
      footer={
        <Timestamp countdownFinish={countdownFinish} timestamp={timestamp} endTime={endTime} resolutionStatus={resolutionStatus} />
      }
    />
  );
};
