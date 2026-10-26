import { StatDisplay, AggregatedStatDisplay, formatVolume, formatLiquidity } from '../page/Formatter';
import MarketBadgeList from '../components/MarketBadgeList';
import Badge from '../../../ui/Badge';
import Surface from '../../../ui/Surface';
import { formatWith } from '../../../../utils/precisionFormatter';
import { computeImpactPercent, formatImpactPercent } from '../../../../utils/marketPageUtils.mjs';
import { resolveMarketStatus } from '../../../../utils/proposalLifecycle';
import { TwapCountdown } from './TwapCountdown';
import { SnapshotWidget } from './SnapshotWidget';

// The market page reads as a briefing for the people deciding: the question and the market's
// answer first, then what is being decided, where the binding test stands and how much money is
// behind the prices. The trade rail sits beside it (MarketPageShowcase).

const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the “pass” (yes) outcome over the final 24 hours of the Issuance KIP’s voting period is greater than or equal to that of the “fail” (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";

const STATUS_BADGE_COLORS = { active: 'emerald', awaiting_resolution: 'orange', resolved: 'gray' };
const OUTCOME_BADGE_COLORS = { yes: 'blue', no: 'gold' };

const statusOf = (config, marketEndTime) => resolveMarketStatus({
  ...config?.marketInfo,
  endTime: config?.marketInfo?.endTime || marketEndTime
});

/** One briefing section: a heading on a hairline, then its content. */
export const BriefingSection = ({ id, title, children, className = '' }) => (
  <section aria-labelledby={id} className={`border-t border-seer-border pt-8 mt-10 ${className}`}>
    <h2 id={id} className="text-lg font-semibold tracking-tight text-seer-text mb-5">{title}</h2>
    {children}
  </section>
);

const timeStat = (marketStatus, isResolved, config, resolutionTime) => {
  const label = isResolved
    ? "Resolution Date"
    : marketStatus.state === 'awaiting_resolution'
      ? "Ended"
      : marketStatus.showCountdown ? "Remaining Time" : "Trading Ends";

  let value;
  if (isResolved && config?.marketInfo?.resolvedTime) {
    value = new Date(config.marketInfo.resolvedTime).toLocaleDateString();
  } else if (isResolved && resolutionTime) {
    value = new Date(resolutionTime * 1000).toLocaleDateString();
  } else if (marketStatus.closeTime === null) {
    value = 'Unknown';
  } else {
    const endTimeMs = marketStatus.closeTime * 1000;
    if (marketStatus.showCountdown) {
      const diff = endTimeMs - Date.now();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      value = `${days}d ${hours}h ${minutes}m`;
    } else {
      // Ended (or resolved with no resolution time known): the end date. A resolved market never
      // shows a countdown.
      value = endTimeMs <= Date.now() ? new Date(endTimeMs).toLocaleDateString() : 'Unknown';
    }
  }
  return { label, value };
};

/** The answer, in words, for someone who will not read the chart. */
const AnswerLine = ({ marketStatus, yes, no, company, currency }) => {
  if (marketStatus.state === 'resolved' && marketStatus.outcomeLabel) {
    return (
      <>
        The question resolved <strong className={marketStatus.outcome === 'no' ? 'text-fail-text' : 'text-pass-text'}>{marketStatus.outcomeLabel}</strong>.
        {' '}Tokens of the winning outcome can now be redeemed.
      </>
    );
  }
  if (yes === null || no === null) return null;
  const prices = (
    <>
      the market prices {company} at <strong className="text-pass-text tabular-nums">{yes} {currency}</strong> if the proposal passes
      {' '}and at <strong className="text-fail-text tabular-nums">{no} {currency}</strong> if it fails.
    </>
  );
  if (marketStatus.state === 'awaiting_resolution') {
    return <>Trading has ended and the question awaits resolution. At the close, {prices}</>;
  }
  return <>Today, {prices}</>;
};

const MarketHero = ({
  marketData,
  config,
  configLoading,
  currencySymbol,
  isProposalOwner,
  prices,
  timing,
  snapshot,
  badgeModals
}) => {
  const { newYesPrice, newNoPrice, pricesUnavailable } = prices;
  const { marketEndTime, resolutionTime } = timing;
  const { data: snapshotData, snapshotProposalId } = snapshot;
  const {
    setIsPredictionMarketModalOpen,
    setIsCreatePoolModalOpen,
    setIsEditProposalModalOpen
  } = badgeModals;

  const marketStatus = statusOf(config, marketEndTime);
  const isResolved = marketStatus.state === 'resolved';
  const precisionConfig = config?.PRECISION_CONFIG;
  const company = config?.BASE_TOKENS_CONFIG?.company?.symbol || 'the token';
  const organization = config?._registryMetadata?.organization?.name;
  const pricesLoading = !pricesUnavailable && (newYesPrice === null || newNoPrice === null);
  const formatPrice = (value) => (value === null || value === undefined ? null : formatWith(Number(value), 'price', precisionConfig));
  const impact = computeImpactPercent(newYesPrice, newNoPrice);
  const time = timeStat(marketStatus, isResolved, config, resolutionTime);

  const statusBadge = {
    text: marketStatus.labelWithOutcome,
    colorScheme: OUTCOME_BADGE_COLORS[marketStatus.outcome] || STATUS_BADGE_COLORS[marketStatus.state]
  };

  // Where to read more: every link here leaves the app.
  const links = [];
  if (marketData.question_link) {
    links.push({ text: isResolved ? 'Resolution Question' : 'Resolve Question', link: marketData.question_link });
  }
  const effectiveSnapshotId = snapshotProposalId || config?._registryMetadata?.snapshot_id;
  if (effectiveSnapshotId) {
    const spaceId = snapshotData?.spaceId || 'gnosis.eth';
    links.push({ text: 'Snapshot Vote', link: `https://snapshot.box/#/s:${spaceId}/proposal/${effectiveSnapshotId}` });
  }
  if (config?.marketInfo?.trackProgressLink) {
    links.push({ text: 'Market Summary', link: config.marketInfo.trackProgressLink });
  }
  if (config?.marketInfo?.arbitrageContractAddress) {
    links.push({
      text: 'Arbitrage Contract',
      link: `https://${config?.chainId === 1 ? 'etherscan.io' : 'gnosisscan.io'}/address/${config.marketInfo.arbitrageContractAddress}`
    });
  }
  // Prediction Market: opt-in via metadata flag (default off).
  if (
    config?.marketInfo?.showPredictionMarket === true &&
    config?.BASE_TOKENS_CONFIG?.currency?.address && (
      config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress ||
      config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
    )
  ) {
    links.push({ text: 'Prediction Market', onClick: () => setIsPredictionMarketModalOpen(true) });
  }
  if (!config?.POOL_CONFIG_YES?.address || !config?.POOL_CONFIG_NO?.address) {
    links.push({ text: 'Create Pool', onClick: () => setIsCreatePoolModalOpen(true) });
  }
  if (isProposalOwner && config?.proposalMetadataAddress) {
    links.push({ text: 'Edit proposal', onClick: () => setIsEditProposalModalOpen(true) });
  }

  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-seer-muted">
        {organization && (
          <span>
            Asked by <span className="font-semibold text-seer-text">{organization}</span>
          </span>
        )}
        {!marketData.isLoading && !marketData.error && <MarketBadgeList badges={[statusBadge]} />}
      </div>

      <h1 className="mt-3 text-[26px] md:text-[32px] leading-[1.15] font-semibold tracking-tight text-seer-text [text-wrap:balance]">
        {marketData.isLoading && (
          <span className="block h-8 w-3/4 max-w-xl rounded-control bg-seer-surface-raised animate-pulse" aria-label="Loading market title" />
        )}
        {!marketData.isLoading && !marketData.error && (
          <>
            {marketData.display_title_0}{' '}
            <span className="text-seer-accent-text">{marketData.display_title_1}</span>
          </>
        )}
        {!marketData.isLoading && marketData.error && (
          <span className="text-seer-negative">Market data unavailable</span>
        )}
      </h1>

      <p className="mt-4 text-[17px] leading-relaxed text-seer-text max-w-[62ch]">
        {pricesLoading && !isResolved ? (
          <span className="block h-5 w-2/3 rounded-control bg-seer-surface-raised animate-pulse" aria-label="Loading prices" />
        ) : (
          <AnswerLine
            marketStatus={marketStatus}
            yes={formatPrice(newYesPrice)}
            no={formatPrice(newNoPrice)}
            company={company}
            currency={currencySymbol}
          />
        )}
      </p>

      {/* Hairlines between the cells come from the 1px gaps over the border colour. */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-surface border border-seer-border bg-seer-border [&>div]:bg-seer-surface [&>div]:p-4">
        <div>
          <StatDisplay
            label="If it passes"
            value={formatPrice(newYesPrice) ? `${formatPrice(newYesPrice)} ${currencySymbol}` : '—'}
            valueClassName="text-pass-text"
            isLoading={!isResolved && pricesLoading}
          />
        </div>
        <div>
          <StatDisplay
            label="If it fails"
            value={formatPrice(newNoPrice) ? `${formatPrice(newNoPrice)} ${currencySymbol}` : '—'}
            valueClassName="text-fail-text"
            isLoading={!isResolved && pricesLoading}
          />
        </div>
        <div>
          <StatDisplay
            label="Impact (spot)"
            // After resolution the losing side's tokens are worthless, so the gap between the two
            // pools no longer measures anything.
            value={isResolved ? '—' : formatImpactPercent(impact, pricesUnavailable ? '—' : 'N/A')}
            valueClassName={isResolved ? 'text-seer-text' : ((impact ?? 0) >= 0 ? 'text-seer-positive' : 'text-seer-negative')}
            isLoading={!isResolved && pricesLoading}
          />
        </div>
        <div>
          <StatDisplay label={time.label} value={time.value} isLoading={configLoading} />
        </div>
      </div>

      {links.length > 0 && !marketData.isLoading && !marketData.error && (
        <MarketBadgeList badges={links} className="mt-5" />
      )}
    </header>
  );
};

/** What is being decided: the proposal's own description. */
const MarketDecisionSection = ({ marketData }) => {
  if (marketData.isLoading) {
    return (
      <BriefingSection id="briefing-decision" title="What is being decided">
        <div className="space-y-2" aria-label="Loading description">
          <span className="block h-3 w-full rounded-control bg-seer-surface-raised animate-pulse" />
          <span className="block h-3 w-5/6 rounded-control bg-seer-surface-raised animate-pulse" />
        </div>
      </BriefingSection>
    );
  }
  if (marketData.error || !marketData.description) return null;
  return (
    <BriefingSection id="briefing-decision" title="What is being decided">
      <p className="text-[15px] leading-relaxed text-seer-text max-w-[68ch] break-words [overflow-wrap:anywhere]">
        {marketData.description}
      </p>
    </BriefingSection>
  );
};

/** Where the binding test stands: the TWAP window and, beside it, the DAO's own vote. */
const MarketTestSection = ({ config, marketData, snapshot }) => {
  const { loading: snapshotLoading, data: snapshotData, source: snapshotSource, snapshotProposalId } = snapshot;
  const hasTwap = !marketData.isLoading && config?.marketInfo?.twapStartTimestamp;

  return (
    <BriefingSection id="briefing-test" title="Where the test stands">
      <Surface as="div" className="divide-y divide-seer-border">
        <div className="p-5">
          {hasTwap ? (
            <TwapCountdown
              twapStartTimestamp={config.marketInfo.twapStartTimestamp}
              twapDurationHours={config.marketInfo.twapDurationHours || 24}
              twapDescription={config.marketInfo.twapDescription || DEFAULT_TWAP_DESCRIPTION}
              yesPoolConfig={config.POOL_CONFIG_YES}
              noPoolConfig={config.POOL_CONFIG_NO}
              invertTwapPoolYes={config.marketInfo.invertTwapPoolYes || false}
              invertTwapPoolNo={config.marketInfo.invertTwapPoolNo || config.marketInfo.invertTwapPoolNO || false}
              yesCompanyTokenAddress={config.metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress || null}
              noCompanyTokenAddress={config.metadata?.companyTokens?.no?.wrappedCollateralTokenAddress || null}
              chainId={config?.chainId || 100}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Window not scheduled</Badge>
              <p className="text-sm text-seer-muted">
                This market has no test window configured yet. Its rule and dates appear here once they are.
              </p>
            </div>
          )}
        </div>
        {snapshotData?.items && (
          <div className="p-5">
            <SnapshotWidget
              snapshotData={snapshotData}
              snapshotLoading={snapshotLoading}
              snapshotSource={snapshotSource}
              snapshotProposalId={snapshotProposalId}
            />
          </div>
        )}
      </Surface>
    </BriefingSection>
  );
};

/** How much money stands behind the prices, and the way to add more. */
const MarketMoneySection = ({ config, configLoading, currencySymbol, pool, liquiditySummary, timing, badgeModals }) => {
  const { poolData, poolDataLoading, poolDataError } = pool;
  const marketStatus = statusOf(config, timing.marketEndTime);
  const { setIsAddLiquidityModalOpen } = badgeModals;

  return (
    <BriefingSection id="briefing-money" title="Money behind it">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
        <AggregatedStatDisplay
          label={`Volume (Total; ${currencySymbol})`}
          yesValue={poolData?.yesPool?.volume ?? null}
          noValue={poolData?.noPool?.volume ?? null}
          isLoading={poolDataLoading || configLoading}
          formatFunction={formatVolume}
          tooltipLabels={{ yes: 'YES Volume', no: 'NO Volume' }}
          normalize={poolData?.source !== 'subgraph'}
          unavailable={!!poolDataError}
        />

        <AggregatedStatDisplay
          label="TVL"
          yesValue={liquiditySummary.yes?.total ?? null}
          noValue={liquiditySummary.no?.total ?? null}
          isLoading={poolDataLoading || configLoading}
          formatFunction={formatLiquidity}
          tooltipLabels={{ yes: 'YES TVL', no: 'NO TVL' }}
          tooltipBreakdown={liquiditySummary.breakdown}
          tooltipNote="Total value locked in the YES/NO pools across all price ranges. This is not tradable depth: liquidity parked far from the current price doesn't absorb trades, so check the price impact in the trade panel before sizing a trade."
          normalize={poolData?.source !== 'subgraph'}
          unavailable={!!poolDataError}
        />

        <StatDisplay
          label="Status"
          value={marketStatus.shortLabel}
          isLoading={configLoading}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <MarketBadgeList badges={[{ text: 'Add Liquidity', onClick: () => setIsAddLiquidityModalOpen(true) }]} />
        <p className="text-[13px] text-seer-muted">Every trade is listed under Activity below.</p>
      </div>
    </BriefingSection>
  );
};

export { MarketHero, MarketDecisionSection, MarketTestSection, MarketMoneySection };
