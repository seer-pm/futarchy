// components/futarchyFi/companyList/forkWall/ForkTile.jsx
//
// One proposal on the home page's wall: who asks, the question, its fork since the market opened,
// and the figures under it. An open proposal shows today's two prices and the impact; a decided
// one shows its outcome and the impact the registry recorded at close.

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ForkSpark from './ForkSpark';
import Badge from '../../../ui/Badge';
import ChainBadge from '../components/ChainBadge';
import { useLatestPoolPrices } from '../cards/highlightCards/EventHighlightCard';
import { useSubgraphData } from '../../../../hooks/useSubgraphData';
import { resolveMarketStatus } from '../../../../utils/proposalLifecycle';
import { computeImpactPercent, formatImpactPercent } from '../../../../utils/marketPageUtils.mjs';
import { USE_QUERY_PARAM_URLS } from '../../../../config/featureFlags';

// Candles are one subgraph round trip per tile, so a tile asks for them only once it nears the
// viewport.
const useNearViewport = () => {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNear(true);
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near];
};

const timeLeft = (closeTime) => {
  const seconds = closeTime - Date.now() / 1000;
  if (!(seconds > 0)) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
};

const formatPrice = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return number.toFixed(number < 1 ? 4 : 2);
};

/** The proposal's data: the shape the home page's two fetchers return. */
const ForkTileBody = ({ event, variant, wide, chartRef, chartVisible, onEditProposal }) => {
  const isOpen = variant === 'open';
  const metadata = event.metadata || {};
  const marketStatus = event.marketStatus || resolveMarketStatus(event, Date.now() / 1000);
  const currency = event.currencySymbol || metadata?.currencyTokens?.base?.tokenSymbol || (Number(event.chainId) === 1 ? 'USDS' : 'sDAI');
  const title0 = event.displayTitle0 || metadata.display_title_0;
  const title1 = event.displayTitle1 || metadata.display_title_1;
  const href = USE_QUERY_PARAM_URLS ? `/market?proposalId=${event.eventId}` : `/markets/${event.eventId}`;

  const { prices } = useLatestPoolPrices(event.poolAddresses, event.eventId, metadata, event.prefetchedPrices || null);
  const candles = useSubgraphData(
    chartVisible ? event.eventId : null,
    event.chainId || 100,
    1000,
    event.closeTimestamp || event.endTime || null,
    metadata.startCandleUnix || null
  );

  const yes = prices.yes ?? candles.yesPrice;
  const no = prices.no ?? candles.noPrice;
  const liveImpact = computeImpactPercent(yes, no);
  // The closed-list fetcher turns a missing registry impact into 0; only a recorded one is shown.
  const hasRecordedImpact = metadata.impact !== undefined && metadata.impact !== null && metadata.impact !== '';
  const recordedImpact = hasRecordedImpact && Number.isFinite(Number(event.impact)) ? Number(event.impact) : null;
  const impact = isOpen ? liveImpact : recordedImpact;
  const remaining = isOpen && marketStatus.closeTime ? timeLeft(marketStatus.closeTime) : null;

  const stateBadge = marketStatus.state === 'resolved' && marketStatus.outcomeLabel
    ? <Badge tone={marketStatus.outcome === 'no' ? 'fail' : marketStatus.outcome === 'yes' ? 'pass' : 'neutral'}>{marketStatus.labelWithOutcome}</Badge>
    : marketStatus.state === 'awaiting_resolution'
      ? <Badge tone="warning">{marketStatus.shortLabel}</Badge>
      : <Badge tone="accent">{remaining ? `Open, ${remaining} left` : marketStatus.label}</Badge>;

  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative w-6 h-6 shrink-0 rounded-full overflow-hidden bg-seer-surface-raised">
          <Image src={event.companyLogo || '/assets/fallback-company.png'} alt="" fill sizes="24px" className="object-cover" />
        </span>
        <span className="text-[13px] font-semibold text-seer-text truncate">{event.authorName}</span>
        <ChainBadge chainId={event.chainId || 100} size="xs" />
        <span className="ml-auto shrink-0">{stateBadge}</span>
        {(event.isOwner || event.isEditor) && event.proposalMetadataAddress && onEditProposal && (
          <button
            type="button"
            onClick={() => onEditProposal(event.proposalMetadataAddress)}
            className="relative z-10 seer-button seer-button-ghost seer-button-sm"
          >
            Edit
          </button>
        )}
      </div>

      <h3 className={`${isOpen ? 'text-lg' : 'text-[15px]'} font-semibold leading-snug tracking-tight text-seer-text [text-wrap:balance] line-clamp-3`}>
        <a href={href} className="after:absolute after:inset-0 after:rounded-surface focus-visible:outline-none">
          {title0 && title1 ? (
            <>
              {title0} <span className="text-seer-accent-text">{title1}</span>
            </>
          ) : (
            event.eventTitle
          )}
        </a>
      </h3>

      <div ref={chartRef} className="mt-auto">
        <ForkSpark
          yesData={candles.yesData}
          noData={candles.noData}
          height={wide ? 180 : isOpen ? 120 : 64}
          loading={!chartVisible || candles.loading}
          label={`Price of the token if the proposal passes and if it fails, since the market opened`}
        />
      </div>

      {isOpen ? (
        <div className={`grid grid-cols-3 gap-3 pt-1 ${wide ? 'text-sm sm:max-w-xl' : 'text-[13px]'}`}>
          <div>
            <p className="text-seer-muted">If it passes</p>
            <p className="font-semibold tabular-nums text-pass-text">{formatPrice(yes)} {currency}</p>
          </div>
          <div>
            <p className="text-seer-muted">If it fails</p>
            <p className="font-semibold tabular-nums text-fail-text">{formatPrice(no)} {currency}</p>
          </div>
          <div>
            <p className="text-seer-muted">Impact</p>
            <p className={`font-semibold tabular-nums ${impact === null ? 'text-seer-text' : impact >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`}>
              {formatImpactPercent(impact, '—')}
            </p>
          </div>
        </div>
      ) : (
        // After resolution the losing token trades towards zero, so today's prices no longer measure
        // anything. A decided tile shows the impact the registry recorded, or else when it closed.
        <div className="flex items-baseline justify-between gap-3 pt-1 text-[13px]">
          {impact !== null ? (
            <>
              <span className="text-seer-muted">Impact at close</span>
              <span className={`font-semibold tabular-nums ${impact >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`}>
                {formatImpactPercent(impact, '—')}
              </span>
            </>
          ) : (
            <>
              <span className="text-seer-muted">Closed</span>
              <span className="font-semibold tabular-nums text-seer-text">
                {marketStatus.closeTime ? new Date(marketStatus.closeTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
};

const ForkTile = ({ event, variant = 'open', wide = false, onEditProposal = null }) => {
  const [chartRef, chartVisible] = useNearViewport();
  return (
    <article
      className={`relative flex flex-col gap-4 h-full bg-seer-surface border border-seer-border rounded-surface transition-colors hover:border-seer-accent-text/50 focus-within:border-seer-accent-text ${variant === 'open' ? 'p-5' : 'p-4'}`}
    >
      <ForkTileBody event={event} variant={variant} wide={wide} chartRef={chartRef} chartVisible={chartVisible} onEditProposal={onEditProposal} />
    </article>
  );
};

/** A tile's shape while the list loads, so the wall does not jump when it arrives. */
export const ForkTileSkeleton = ({ variant = 'open' }) => (
  <div className={`flex flex-col gap-4 bg-seer-surface border border-seer-border rounded-surface ${variant === 'open' ? 'p-5 min-h-[300px]' : 'p-4 min-h-[200px]'}`} aria-hidden="true">
    <span className="h-4 w-1/3 rounded-control bg-seer-surface-raised animate-pulse" />
    <span className="h-5 w-5/6 rounded-control bg-seer-surface-raised animate-pulse" />
    <span className="mt-auto h-16 w-full rounded-control bg-seer-surface-raised animate-pulse" />
  </div>
);

export default ForkTile;
