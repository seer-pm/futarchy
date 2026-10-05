import { StatDisplay, AggregatedStatDisplay, formatVolume, formatLiquidity } from '../page/Formatter';
import ImpactIcon from '../page/icons/ImpactIcon';
import LiquidityIcon from '../page/icons/LiquidityIcon';
import StatusIcon from '../page/icons/StatusIcon';
import TimeIcon from '../page/icons/TimeIcon';
import VolumeIcon from '../page/icons/VolumeIcon';
import MarketBadgeList from '../components/MarketBadgeList';
import { computeImpactPercent, formatImpactPercent } from '../../../../utils/marketPageUtils.mjs';
import { TwapCountdown } from './TwapCountdown';
import { SnapshotWidget } from './SnapshotWidget';

const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the \u201cpass\u201d (yes) outcome over the final 24 hours of the Issuance KIP\u2019s voting period is greater than or equal to that of the \u201cfail\u201d (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";

const MarketHero = ({
  attachHeroRef,
  isScrolled,
  marketData,
  config,
  configLoading,
  currencySymbol,
  isProposalOwner,
  prices,
  pool,
  liquiditySummary,
  timing,
  snapshot,
  badgeModals
}) => {
  const { newYesPrice, newNoPrice, pricesUnavailable } = prices;
  const { poolData, poolDataLoading, poolDataError } = pool;
  const { marketEndTime, resolutionTime } = timing;
  const {
    loading: snapshotLoading,
    data: snapshotData,
    source: snapshotSource,
    highestResult: snapshotHighestResult,
    snapshotProposalId
  } = snapshot;
  const {
    setIsPredictionMarketModalOpen,
    setIsAddLiquidityModalOpen,
    setIsCreatePoolModalOpen,
    setIsEditProposalModalOpen
  } = badgeModals;

  return (
    <div ref={attachHeroRef} className={`relative bg-futarchyDarkGray2/90 dark:bg-futarchyDarkGray2/70  dark:border-futarchyGray112/40 backdrop-blur-sm font-oxanium flex flex-col border-b-2 border-futarchyDarkGray42 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:h-20' : ''
      }`}>
      <div className="container mx-auto px-5 flex-grow flex flex-col justify-center">
        <div className={`grid grid-cols-1 lg:grid-cols-3 transition-all duration-300 ease-in-out ${isScrolled ? 'py-8 lg:py-3' : 'py-4 lg:py-6'
          }`}>
          <div className={`lg:col-span-2 min-w-0 space-y-2 py-2 lg:space-y-3 border-b-2 border-futarchyDarkGray42 lg:border-b-0 lg:border-r lg:pr-6 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:py-0' : 'lg:py-3'
            }`}>
            <h1 className={`font-semibold text-white leading-tight min-h-[1.5rem] transition-all duration-300 ease-in-out ${isScrolled ? 'text-sm lg:text-base' : 'text-sm lg:text-xl'
              }`}>
              {marketData.isLoading && (
                <span className="block h-5 lg:h-6 w-3/4 max-w-xl rounded bg-white/10 animate-pulse" aria-label="Loading market title" />
              )}
              {!marketData.isLoading && !marketData.error && (
                <>
                  <span className={marketData.display_title_1 ? 'lg:whitespace-nowrap' : ''}>{marketData.display_title_0}</span>{' '}
                  <span className="text-futarchyViolet7">{marketData.display_title_1}</span>
                </>
              )}
              {!marketData.isLoading && marketData.error && (
                <span className="text-red-400/80">Market data unavailable</span>
              )}
            </h1>

            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-y-4 text-left transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              <StatDisplay
                label="Impact (spot)"
                // After resolution the losing side's tokens are worthless, so the
                // gap between the two pools no longer measures anything.
                value={config?.marketInfo?.resolved ? '—' : formatImpactPercent(computeImpactPercent(newYesPrice, newNoPrice), pricesUnavailable ? '—' : 'N/A')}
                valueClassName={config?.marketInfo?.resolved ? 'text-white' : ((computeImpactPercent(newYesPrice, newNoPrice) ?? 0) >= 0 ? 'text-futarchyTeal7' : 'text-futarchyCrimson11')}
                Icon={ImpactIcon}
                isLoading={!config?.marketInfo?.resolved && !pricesUnavailable && (newYesPrice === null || newNoPrice === null)}
              />

              <StatDisplay
                label="Status"
                value={config?.marketInfo?.resolved ? 'Resolved' : 'Active'}
                valueClassName="text-futarchyEmerald11"
                Icon={StatusIcon}
                isLoading={configLoading}
              />

              <AggregatedStatDisplay
                label={`Volume (Total; ${currencySymbol})`}
                yesValue={poolData?.yesPool?.volume ?? null}
                noValue={poolData?.noPool?.volume ?? null}
                Icon={VolumeIcon}
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
                Icon={LiquidityIcon}
                isLoading={poolDataLoading || configLoading}
                formatFunction={formatLiquidity}
                tooltipLabels={{ yes: 'YES TVL', no: 'NO TVL' }}
                tooltipBreakdown={liquiditySummary.breakdown}
                tooltipNote="Total value locked in the YES/NO pools across all price ranges. This is not tradable depth: liquidity parked far from the current price doesn't absorb trades, so check the price impact in the trade panel before sizing a trade."
                normalize={poolData?.source !== 'subgraph'}
                unavailable={!!poolDataError}
              />

              <StatDisplay
                label={(() => {
                  // Check if market is resolved
                  if (config?.marketInfo?.resolved) {
                    return "Resolution Date";
                  }

                  // Check if end time has passed but not resolved
                  if (config?.marketInfo?.endTime || marketEndTime) {
                    const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                    // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                    const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                    const now = new Date().getTime();
                    const end = endTimeMs;
                    if (end <= now) {
                      return "Ended";
                    }
                    return "Remaining Time";
                  }
                  return "Trading Ends";
                })()}
                value={(() => {
                  // If resolved, show resolution time
                  if (config?.marketInfo?.resolved && config?.marketInfo?.resolvedTime) {
                    return new Date(config.marketInfo.resolvedTime).toLocaleDateString();
                  }
                  if (config?.marketInfo?.resolved && resolutionTime) {
                    return new Date(resolutionTime * 1000).toLocaleDateString();
                  }

                  // Check if we have end time
                  if (config?.marketInfo?.endTime || marketEndTime) {
                    const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                    // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                    const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                    const now = new Date().getTime();
                    const end = endTimeMs;
                    const diff = end - now;

                    // If time has passed but not resolved, show opening time 
                    if (diff <= 0) {
                      return new Date(endTimeMs).toLocaleDateString();
                    }

                    // Still active, show remaining time
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return `${days}d ${hours}h ${minutes}m`;
                  }
                  return 'Unknown';
                })()}
                valueClassName="text-futarchyGold8"
                Icon={TimeIcon}
                isLoading={configLoading}
              />
            </div>

            <div className={`flex flex-wrap items-center gap-3 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              {marketData.isLoading && (
                <span className="flex gap-2" aria-label="Loading badges">
                  <span className="h-7 w-24 rounded-lg bg-white/10 animate-pulse" />
                  <span className="h-7 w-32 rounded-lg bg-white/10 animate-pulse" />
                  <span className="h-7 w-28 rounded-lg bg-white/10 animate-pulse" />
                </span>
              )}
              {!marketData.isLoading && !marketData.error && (
                <MarketBadgeList badges={(() => {
                  const badges = [];

                  // Only show time badge if market is active
                  if (!config?.marketInfo?.resolved) {
                    // Check if end time has passed but not resolved
                    if (config?.marketInfo?.endTime || marketEndTime) {
                      const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                      // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                      const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                      const now = new Date().getTime();
                      const end = endTimeMs;
                      const diff = end - now;

                      if (diff <= 0) {
                        // Show Awaiting Resolution at the end
                        // Don't add it here, add it after other badges
                      } else {
                        // Show Active status only
                        badges.push({ text: 'Active', colorScheme: 'emerald' });
                      }
                    } else {
                      badges.push({ text: 'Active', colorScheme: 'emerald' });
                    }
                  } else {
                    // Market is resolved - use appropriate color based on outcome
                    const outcome = config.marketInfo.finalOutcome;
                    let colorScheme = 'gray';
                    let text = `Resolved: ${outcome || 'Unknown'}`;

                    if (outcome === 'YES' || outcome === 'Yes' || outcome === 'yes') {
                      colorScheme = 'blue';  // Blue for YES
                      text = 'Resolved: YES';
                    } else if (outcome === 'NO' || outcome === 'No' || outcome === 'no') {
                      colorScheme = 'gold';  // Gold/yellow for NO
                      text = 'Resolved: NO';
                    }

                    badges.push({ text, colorScheme });
                  }

                  // Market Summary badge
                  if (config?.marketInfo?.trackProgressLink) {
                    badges.push({
                      text: 'Market Summary',
                      colorScheme: 'default',
                      link: config.marketInfo.trackProgressLink
                    });
                  }

                  // Prediction Market badge — opt-in via metadata flag (default off).
                  if (
                    config?.marketInfo?.showPredictionMarket === true &&
                    config?.BASE_TOKENS_CONFIG?.currency?.address && (
                      config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress ||
                      config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
                    )
                  ) {
                    badges.push({
                      text: 'Prediction Market',
                      colorScheme: 'default',
                      onClick: () => setIsPredictionMarketModalOpen(true)
                    });
                  }

                  // Arbitrage Contract badge — links to Gnosisscan when set in metadata.
                  if (config?.marketInfo?.arbitrageContractAddress) {
                    badges.push({
                      text: 'Arbitrage Contract',
                      colorScheme: 'default',
                      link: `https://gnosisscan.io/address/${config.marketInfo.arbitrageContractAddress}`
                    });
                  }

                  // Reality.eth question badge. It is a link, not an action, so it
                  // stops saying "Resolve" once the market is resolved.
                  if (marketData.question_link) {
                    badges.push({
                      text: config?.marketInfo?.resolved ? 'Resolution Question' : 'Resolve Question',
                      colorScheme: 'violet',
                      link: marketData.question_link
                    });
                  }

                  // Snapshot Vote badge - link to Snapshot proposal
                  {
                    const effectiveSnapshotId = snapshotProposalId || config?._registryMetadata?.snapshot_id;
                    if (effectiveSnapshotId) {
                      const spaceId = snapshotData?.spaceId || 'gnosis.eth';
                      badges.push({
                        text: 'Snapshot Vote',
                        colorScheme: 'default',
                        link: `https://snapshot.box/#/s:${spaceId}/proposal/${effectiveSnapshotId}`
                      });
                    }
                  }

                  // Add Liquidity badge
                  badges.push({
                    text: 'Add Liquidity',
                    colorScheme: 'teal',
                    onClick: () => setIsAddLiquidityModalOpen(true)
                  });

                  // Create Pool badge - show when pools are missing (subgraph mode)
                  if (!config?.POOL_CONFIG_YES?.address || !config?.POOL_CONFIG_NO?.address) {
                    badges.push({
                      text: '+ Create Pool',
                      colorScheme: 'violet',
                      onClick: () => setIsCreatePoolModalOpen(true)
                    });
                  }

                  // Edit badge - show only for proposal owners
                  if (isProposalOwner && config?.proposalMetadataAddress) {
                    badges.push({
                      text: '✏️ Edit',
                      colorScheme: 'gray',
                      onClick: () => setIsEditProposalModalOpen(true)
                    });
                  }

                  return badges;
                })()} />
              )}
              {!marketData.isLoading && marketData.error && (
                <span className="text-xs text-red-400/80">Badges unavailable</span>
              )}
              {/* Snapshot result - part of the badge row instead of a floating pill */}
              <SnapshotWidget
                snapshotData={snapshotData}
                snapshotLoading={snapshotLoading}
                snapshotSource={snapshotSource}
                snapshotProposalId={snapshotProposalId}
                snapshotHighestResult={snapshotHighestResult}
              />
            </div>
          </div>

          <div className={`lg:col-span-1 min-w-0 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:py-2 lg:pl-6' : 'py-2 lg:py-3 lg:pl-6'
            }`}>
            {/* Description - hides on scroll */}
            <div className={`transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              {marketData.isLoading && (
                <div className="space-y-2" aria-label="Loading description">
                  <span className="block h-3 w-full rounded bg-white/10 animate-pulse" />
                  <span className="block h-3 w-5/6 rounded bg-white/10 animate-pulse" />
                  <span className="block h-3 w-2/3 rounded bg-white/10 animate-pulse" />
                </div>
              )}
              {!marketData.isLoading && !marketData.error && marketData.description && (
                <p className="text-xs lg:text-sm text-white/70 leading-relaxed break-words [overflow-wrap:anywhere]">{marketData.description}</p>
              )}
              {!marketData.isLoading && marketData.error && (
                <p className="text-xs lg:text-sm text-red-400/80">Description unavailable</p>
              )}
            </div>

            {/* TWAP Countdown Widget - always visible */}
            {!marketData.isLoading && config?.marketInfo?.twapStartTimestamp && (
              <TwapCountdown
                twapStartTimestamp={config.marketInfo.twapStartTimestamp}
                twapDurationHours={config.marketInfo.twapDurationHours || 24}
                twapDescription={config.marketInfo.twapDescription || DEFAULT_TWAP_DESCRIPTION}
                isScrolled={isScrolled}
                yesPoolConfig={config.POOL_CONFIG_YES}
                noPoolConfig={config.POOL_CONFIG_NO}
                invertTwapPoolYes={config.marketInfo.invertTwapPoolYes || false}
                invertTwapPoolNo={config.marketInfo.invertTwapPoolNo || config.marketInfo.invertTwapPoolNO || false}
                yesCompanyTokenAddress={config.metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress || null}
                noCompanyTokenAddress={config.metadata?.companyTokens?.no?.wrappedCollateralTokenAddress || null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { MarketHero };
