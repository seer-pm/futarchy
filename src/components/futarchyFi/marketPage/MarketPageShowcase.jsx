import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import RootLayout from '../../../components/layout/RootLayout';
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS, SHOW_DATA_DEBUG } from '../../../config/featureFlags';
import { StatDisplay, AggregatedStatDisplay, formatVolume, formatLiquidity } from './page/Formatter';
import ImpactIcon from './page/icons/ImpactIcon';
import LiquidityIcon from './page/icons/LiquidityIcon';
import StatusIcon from './page/icons/StatusIcon';
import TimeIcon from './page/icons/TimeIcon';
import VolumeIcon from './page/icons/VolumeIcon';
import MarketBadgeList from './components/MarketBadgeList';
import PageLayout from '../../layout/PageLayout';
import ShowcaseSwapComponent from './ShowcaseSwapComponent';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { AnimatePresence } from 'framer-motion';
import RedeemTokens from './redeemTokens/RedeemTokens';
import MarketStatsDebugToast from './MarketStatsDebugToast';
import PositionsTable from './PositionsTable';
import { useSnapshotData } from '../../../hooks/useSnapshotData';
import MarketBalancePanel from './MarketBalancePanel';
import SubgraphTradesDataLayer from './SubgraphTradesDataLayer';
import { useYesNoPoolData } from '../../../hooks/usePoolData';
import { FUTARCHY_ROUTER_ADDRESS as DEFAULT_FUTARCHY_ROUTER_ADDRESS } from './constants/contracts';
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from '../../../constants/addresses';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { useChainValidation } from '../../../hooks/useChainValidation';
import { computeImpactPercent, formatImpactPercent } from '../../../utils/marketPageUtils.mjs';
import WrongNetworkModal from '../../common/WrongNetworkModal';
import CreatePoolModal from './CreatePoolModal';
import TripleChart from '@components/chart/TripleChart';
import ChartParameters from './tripleChart/chartParameters/ChartParameters';
import useLatestPrices from '../../../hooks/useLatestPrices';
import { useCurrency, useUpdateCurrencyFromConfig } from '../../../contexts/CurrencyContext';
import { useSdaiRate } from '../../../hooks/useSdaiRate';
import AddLiquidityModal from './AddLiquidityModal';
import { PendingOrderToast, ProcessingToast, SafeTransactionToast } from './showcase/toasts';
import { TwapCountdown } from './showcase/TwapCountdown';
import { TradeHistoryTable } from './showcase/TradeHistoryTable';
import { YourViewCard } from './showcase/YourViewCard';
import { PredictionMarketModal } from './showcase/PredictionMarketModal';
import { SnapshotWidget } from './showcase/SnapshotWidget';
import { PROPOSALS_USING_SUBGRAPH_TRADES, useMarketPageParams } from './showcase/useMarketPageParams';
import { useHeroCollapse } from './showcase/useHeroCollapse';
import { useChartFilters } from './showcase/useChartFilters';
import { useMarketSpotPrice } from './showcase/useMarketSpotPrice';
import { useMarketTabs } from './showcase/useMarketTabs';
import { useTokenImages } from './showcase/useTokenImages';
import { useLivePoolPrices } from './showcase/useLivePoolPrices';
import { useLiquiditySummary } from './showcase/useLiquiditySummary';
import { useMarketBalances } from './showcase/useMarketBalances';
import { useCollateralFlow } from './showcase/useCollateralFlow';
import { useMarketData } from './showcase/useMarketData';
import { useConfirmSwapState } from './showcase/useConfirmSwapState';
import { useMarketTiming } from './showcase/useMarketTiming';
import { usePendingCowOrders } from './showcase/usePendingCowOrders';

const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the \u201cpass\u201d (yes) outcome over the final 24 hours of the Issuance KIP\u2019s voting period is greater than or equal to that of the \u201cfail\u201d (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";

// Opens only on user action, and it is one of the heaviest components in
// the market bundle — load it on demand.
const ConfirmSwapModal = dynamic(() => import('./ConfirmSwapModal'), { ssr: false });

// Opens only from the collateral actions — load it on demand.
const CollateralModal = dynamic(() => import("./collateralModal/CollateralModal"), { ssr: false });

// Opens only from the native-swap action — load it on demand.
const SwapNativeToCurrencyModal = dynamic(() => import("./SwapNativeToCurrencyModal"), { ssr: false });

// Debug-only editor, opened from the proposal menu — load it on demand.
const EditProposalModal = dynamic(() => import('../../debug/EditProposalModal'), { ssr: false });

// Renders only when the useSubgraph query param asks for it.
const SubgraphChart = dynamic(() => import("@components/chart/SubgraphChart"), { ssr: false });

const MarketPageShowcase = ({ hidden = false, debugMode = false, proposal = null }) => {
  const [safeToastVisible, setSafeToastVisible] = useState(false);

  const {
    proposalIdForDefaults,
    useSpotPriceParam,
    tradeSourceParam,
    showTripleChart,
    showSubgraphChart,
    isDebugMode,
    debugAddress
  } = useMarketPageParams({ proposal, debugMode });

  const handleSafeTransaction = useCallback(() => {
    setSafeToastVisible(true);
    // Auto-hide after 10 seconds
    setTimeout(() => setSafeToastVisible(false), 10000);
  }, []);
  const [isPredictionMarketModalOpen, setIsPredictionMarketModalOpen] = useState(false);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isCreatePoolModalOpen, setIsCreatePoolModalOpen] = useState(false);
  const [isEditProposalModalOpen, setIsEditProposalModalOpen] = useState(false);

  const { isScrolled, attachHeroRef, heroReserve } = useHeroCollapse();
  const { chartFilters, handleChartFilterClick } = useChartFilters();

  const { address: connectedAddress, isConnected: walletConnected } = useAccount();
  const { selectedCurrency } = useCurrency(); // Get selected currency from context
  const { rate: sdaiRate, isLoading: isLoadingRate, error: rateError } = useSdaiRate(); // Get sDAI rate
  const address = useMemo(() => debugAddress || connectedAddress, [debugAddress, connectedAddress]);
  const isConnected = useMemo(() => debugAddress ? true : walletConnected, [debugAddress, walletConnected]);

  // Add flag to force test pools - set to true to test with specific pool addresses
  const FORCE_TEST_POOLS = false; // Change to true to enable test pools

  // Use the new contract config hook - pass proposal prop if available, otherwise gets from URL parameters or path
  console.log('[MarketPageShowcase] DEBUG inputs:', { proposal, proposalIdForDefaults });
  const { config, loading: configLoading, error: configError, refetch: refetchConfig } = useContractConfig(proposal || proposalIdForDefaults, FORCE_TEST_POOLS);
  console.log('[MarketPageShowcase] DEBUG hook result:', { config, configLoading, configError });

  // DETERMINE TRADE SOURCE (Hybrid Default)
  // 1. If global toggle is enabled, always use subgraph.
  // 2. If param is explicit ('subgraph' or 'supabase'), respect it.
  // 3. If no param, check whitelist.
  const marketAddressForWhitelist = config?.MARKET_ADDRESS || config?.proposalId;
  const isWhitelisted = marketAddressForWhitelist && PROPOSALS_USING_SUBGRAPH_TRADES.some(addr => addr.toLowerCase() === marketAddressForWhitelist.toLowerCase());

  const useSubgraphTrades = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS
    ? true  // Force subgraph trades when global toggle is enabled
    : (tradeSourceParam === 'subgraph' || (tradeSourceParam !== 'supabase' && isWhitelisted));

  // Update currency context based on this market's config
  useUpdateCurrencyFromConfig(config);

  // Validate user is on correct chain for this market (pass configLoading to wait for config)
  const chainValidation = useChainValidation(config, configLoading);

  // Get currency symbol from config (used for display throughout component)
  const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    config?.metadata?.currencyTokens?.base?.tokenSymbol ||
    (Number(config?.chainId || proposal?.chainId) === 1 ? 'USDS' : 'sDAI');
  const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG?.company?.symbol || 'GNO';

  // Check if connected user is the proposal owner (for edit permissions)
  const isProposalOwner = useMemo(() => {
    if (!connectedAddress || !config?.owner) return false;
    return connectedAddress.toLowerCase() === config.owner.toLowerCase();
  }, [connectedAddress, config?.owner]);

  // Get pool data for volume and liquidity
  const { data: poolData, loading: poolDataLoading, error: poolDataError } = useYesNoPoolData(config);

  const latestPrices = useLatestPrices(30000, config);

  const {
    effectiveSpotPriceParam,
    configSpotError,
    stableSpotData,
    finalSpotPrice,
    refetchConfigSpot
  } = useMarketSpotPrice(config, useSpotPriceParam);

  // Extract proposalId from config for passing to child components
  const proposalId = config?.proposalId;

  const { marketHasClosed, activeTab, setActiveTab, tradesLimit, setTradesLimit } = useMarketTabs(config);
  const tokenImages = useTokenImages(config);

  // Extract config values from useContractConfig (with fallbacks only for essential router addresses)
  const MARKET_ADDRESS = config?.MARKET_ADDRESS; // This comes from the extracted proposal ID
  const FUTARCHY_ROUTER_ADDRESS = config?.FUTARCHY_ROUTER_ADDRESS || DEFAULT_FUTARCHY_ROUTER_ADDRESS;
  const MERGE_CONFIG = config?.MERGE_CONFIG; // This comes from Supabase metadata
  const POOL_CONFIG_YES = config?.POOL_CONFIG_YES; // This comes from Supabase metadata
  const POOL_CONFIG_NO = config?.POOL_CONFIG_NO; // This comes from Supabase metadata
  const POOL_CONFIG_THIRD = config?.POOL_CONFIG_THIRD; // This comes from Supabase metadata
  // Check if spot pool is explicitly disabled in metadata (via spotPool: "0x00")
  // otherwise fallback to checking if a base pool config exists (which might come from defaults)
  const hasSpot = !!config?.BASE_POOL_CONFIG?.address && config?.BASE_POOL_CONFIG?.address !== "0x00";

  // Snapshot integration - fetch Snapshot proposal ID from Supabase using MARKET_ADDRESS
  const useMockSnapshot = process.env.NEXT_PUBLIC_USE_MOCK_SNAPSHOT === 'true';

  const {
    loading: snapshotLoading,
    data: snapshotData,
    error: snapshotError,
    source: snapshotSource,
    highestResult: snapshotHighestResult,
    snapshotProposalId,
  } = useSnapshotData(config?._registryMetadata?.snapshot_id || null, {
    useMock: useMockSnapshot,
    autoFetch: true,
    refreshInterval: 60000, // Refresh every 60 seconds
  });

  // Process the market title with regex to extract components
  const rawMarketTitle = config?.marketInfo?.title || "";
  // Updated regex to match everything after "if" regardless of what comes before it
  const titleMatch = rawMarketTitle.match(/.*if\s+(.*)/i);

  // Extract title components for display
  const marketTitlePrefix = titleMatch ? rawMarketTitle.slice(0, rawMarketTitle.length - titleMatch[1].length).trim() : rawMarketTitle;
  const marketEvent = titleMatch ? titleMatch[1] : "";

  // Get the full description for the smaller text
  const marketDescription = config?.marketInfo?.description || "";
  const marketOutcomes = config?.marketInfo?.outcomes || ["Yes", "No"];

  // Log the loaded configuration
  useEffect(() => {
    if (config) {
      console.log('🌐 Contract config loaded from API:', {
        marketAddress: MARKET_ADDRESS,
        routerAddress: FUTARCHY_ROUTER_ADDRESS,
        mergeConfigLoaded: !!MERGE_CONFIG,
        marketInfo: config.marketInfo,
        parsedTitle: { prefix: marketTitlePrefix, event: marketEvent }
      });
    }
  }, [config]);

  const {
    newYesPrice,
    newNoPrice,
    newThirdPrice,
    thirdCandles,
    newBasePrice,
    livePriceError,
    pricesUnavailable
  } = useLivePoolPrices({ config, configLoading, poolData, poolDataLoading, poolDataError });
  const liquiditySummary = useLiquiditySummary({ config, poolData, newYesPrice, newNoPrice, latestPrices });

  const {
    rawBalances,
    positions,
    isLoadingPositions,
    balanceError,
    refetchBalances
  } = useMarketBalances(config, address, isConnected);
  const {
    isCollateralModalOpen,
    collateralModalType,
    showProcessingToast,
    processingStep,
    handleOpenCollateralModal,
    handleCloseCollateralModal,
    handleBackdropClick,
    handleToastClick
  } = useCollateralFlow(refetchBalances);

  const [showEventDetails, setShowEventDetails] = useState(false);

  const { marketData, marketSubject } = useMarketData({ config, configLoading, configError });

  const [selectedToken, setSelectedToken] = useState('currency');

  // Open the RainbowKit wallet picker; the chain guard switches networks once
  // connected. (This used to call window.ethereum directly, which reaches
  // whichever extension won the injection race, and set an undefined state.)
  const { openConnectModal } = useConnectModal();
  const handleConnectWallet = () => openConnectModal?.();

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', () => { });
      }
    };
  }, []);

  const {
    isConfirmModalOpen,
    setIsConfirmModalOpen,
    currentTransactionData,
    setCurrentTransactionData,
    handleTransactionComplete,
    selectedAction,
    selectedOutcome,
    amount
  } = useConfirmSwapState(refetchBalances);

  // Add debugging for latestPrices
  useEffect(() => {
    console.log('[SPOT] latestPrices updated:', {
      loading: latestPrices.loading,
      error: latestPrices.error,
      spotPriceSDAI: latestPrices.spotPriceSDAI,
      yes: latestPrices.yes,
      no: latestPrices.no,
      base: latestPrices.base,
      source: latestPrices.source,
      timestamp: latestPrices.timestamp
    });
  }, [latestPrices]);

  const { marketEndTime, resolutionTime } = useMarketTiming(config);
  const { pendingOrderCount } = usePendingCowOrders(address, isConnected);

  // <-- Add state for the new modal -->
  const [isSwapNativeModalOpen, setIsSwapNativeModalOpen] = useState(false);

  // <-- Add functions to control the new modal -->
  const openSwapNativeModal = () => {
    setIsSwapNativeModalOpen(true);
  };

  const closeSwapNativeModal = () => {
    setIsSwapNativeModalOpen(false);
    // Optional: Refresh balances after closing the swap modal
    refetchBalances();
  };

  // Extract hero content for RootLayout
  const marketHero = (
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

  return (
    <>
      {/* Wrong Network Modal */}
      <WrongNetworkModal
        requiredChainId={chainValidation.requiredChainId}
        isOpen={chainValidation.showModal}
        onClose={() => chainValidation.setShowModal(false)}
      />

      <RootLayout headerConfig="app" footerConfig="main" useSnapScroll={false} heroContent={marketHero}>
        <PageLayout>
          {/* Holds the height the sticky hero gives up when it collapses */}
          <div aria-hidden="true" style={{ height: heroReserve }} />
          {/* Main Content Area - Split Design */}
          <div className="relative flex-1">
            {/* Dark top half */}
            <div id="black-section-boundary" className="bg-black">
              <div className="absolute inset-0 background-gradient opacity-20" />
            </div>

            {/* White bottom half */}
            <div className="bg-white dark:bg-futarchyDarkGray2 w-full relative">
              {/* Content */}
              <div className="relative z-10">
                <div className="container mx-auto pt-10 pb-20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left side - Market iframe */}
                    <div className="md:col-span-2">
                      {/* Title */}


                      {/* Market Container - Only shows if TripleChart is enabled */}
                      {showTripleChart && (
                        <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden flex flex-col h-[550px]">
                          {/* Market Stats Header */}
                          <div className="h-16 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
                            <ChartParameters
                              tradingPair={`${config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG.company.symbol}/${selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}`}
                              spotPrice={(() => {
                                const value = Number(newBasePrice !== null ? newBasePrice : (latestPrices.spotPriceSDAI || 0));
                                const displayValue = selectedCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              yesPrice={(newYesPrice === null || typeof newYesPrice === 'undefined') ? null : (() => {
                                const value = Number(newYesPrice);
                                const displayCurrency = selectedCurrency;
                                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              noPrice={(newNoPrice === null || typeof newNoPrice === 'undefined') ? null : (() => {
                                const value = Number(newNoPrice);
                                const displayCurrency = selectedCurrency;
                                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              eventProbability={(newThirdPrice === null || typeof newThirdPrice === 'undefined') ? null : typeof newThirdPrice === 'number' ? Math.min((Number(newThirdPrice)), 1) : 0}
                              currency={selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}
                              precision={config?.precisions?.main || 4}
                              showSpot={hasSpot}
                              chartFilters={chartFilters}
                              onFilterClick={handleChartFilterClick}
                              predictionMarketLink={config?.BASE_TOKENS_CONFIG?.currency?.address && config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
                                ? (config?.chainId === 1
                                  ? `https://app.uniswap.org/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`
                                  : `https://v3.swapr.eth.limo/#/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`)
                                : null}
                              config={config}
                              resolutionDetails={(() => {
                                if (config?.marketInfo?.resolved && config?.marketInfo?.finalOutcome) {
                                  return {
                                    label: 'OUTCOME',
                                    value: config.marketInfo.finalOutcome.toUpperCase(),
                                    link: config.marketInfo.trackProgressLink
                                  };
                                }
                                return null;
                              })()}
                            />
                          </div>

                          {/* Chart Area */}
                          <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 flex-grow overflow-hidden">
                            <div className="w-full h-full flex flex-col">
                              <TripleChart
                                propYesData={latestPrices.yesData}
                                propNoData={latestPrices.noData}
                                propBaseData={latestPrices.baseData}
                                propEventProbabilityData={thirdCandles}
                                shouldFetchData={false}
                                // Pass down currency selection and rate info
                                selectedCurrency={selectedCurrency}
                                sdaiRate={sdaiRate}
                                isLoadingRate={isLoadingRate}
                                rateError={rateError}
                                // Pass dynamic config for pool addresses
                                config={config}
                                // Pass spot price for inversion logic
                                spotPrice={newBasePrice !== null ? newBasePrice : latestPrices.spotPriceSDAI}
                                // Pass chart filters
                                chartFilters={{ ...chartFilters, spot: hasSpot && chartFilters.spot }}
                                // Pass market status for smart data fetching
                                marketHasClosed={marketHasClosed}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SubgraphChart - Only renders when useSubgraph=true or useSubgraph=only */}
                      {showSubgraphChart && (
                        <div className={showTripleChart ? "mt-6" : ""}>
                          <SubgraphChart
                            proposalId={config?.proposalId || config?.MARKET_ADDRESS}
                            chainId={config?.chainId || 100}
                            height={448}
                            candleLimit={1000}
                            config={config}
                            // External spot price from CoinGecko (via ?useSpotPrice=... or config.marketInfo.coingecko_ticker)
                            // Hidden when the spot fetch or its rate read failed
                            showSpot={!!effectiveSpotPriceParam && !configSpotError}
                            spotData={stableSpotData}
                            spotPrice={finalSpotPrice}
                            onSpotRefresh={refetchConfigSpot}
                          />
                        </div>
                      )}

                      {/* Tabs Section */}
                      <div className="mt-8">
                        {/* Tab Headers */}
                        {/* NEW: Conditionally render the first button */}
                        <div className="flex flex-row gap-4">
                          {marketHasClosed ? (
                            <button
                              onClick={() => setActiveTab('redeem-tokens')}
                              className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'redeem-tokens'
                                ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                }`}
                            >
                              Redeem Tokens
                            </button>
                          ) : (
                            <>
                              {/* Recent Activity button - first */}
                              <button
                                onClick={() => setActiveTab('recent-trades-sdk')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'recent-trades-sdk'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                Recent Activity
                              </button>

                              {/* My Trades button - second */}
                              <button
                                onClick={() => setActiveTab('my-trades-sdk')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'my-trades-sdk'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                My Trades
                              </button>

                              {/* Position button - third */}
                              <button
                                onClick={() => setActiveTab('position')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'position'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                Position
                              </button>
                            </>
                          )}
                        </div>

                        {/* Filter controls for Recent Activity - only show dropdown */}
                        {activeTab === 'recent-trades-sdk' && (
                          <div className="flex items-center justify-end mt-6 mb-4">
                            <select
                              value={tradesLimit}
                              onChange={(e) => setTradesLimit(Number(e.target.value))}
                              className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
                            >
                              <option value={30}>Last 30 trades</option>
                              <option value={60}>Last 60 trades</option>
                              <option value={90}>Last 90 trades</option>
                            </select>
                          </div>
                        )}

                        {/* Filter controls for My Trades tab - only show dropdown */}
                        {activeTab === 'my-trades-sdk' && (
                          <div className="flex items-center justify-end mt-6 mb-4">
                            <select
                              value={tradesLimit}
                              onChange={(e) => setTradesLimit(Number(e.target.value))}
                              className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
                            >
                              <option value={30}>Last 30 trades</option>
                              <option value={60}>Last 60 trades</option>
                              <option value={90}>Last 90 trades</option>
                            </select>
                          </div>
                        )}

                        {/* Tab Content */}
                        <div className={activeTab === 'recent-trades-sdk' || activeTab === 'my-trades-sdk' ? 'mt-2' : 'mt-7'}>
                          {activeTab === 'position' && (
                            <PositionsTable
                              positions={positions}
                              selectedCurrency={selectedCurrency}
                              sdaiRate={sdaiRate}
                              isLoadingRate={isLoadingRate}
                              rateError={rateError}
                              setCurrentTransactionData={setCurrentTransactionData}
                              setIsConfirmModalOpen={setIsConfirmModalOpen}
                              config={config}
                              isLoadingPositions={isLoadingPositions}
                              balanceError={balanceError}
                              refetchBalances={refetchBalances}
                            />
                          )}
                          {activeTab === 'trade-history' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <TradeHistoryTable tokenImages={tokenImages} config={config} />
                            </div>
                          )}
                          {activeTab === 'recent-trades-sdk' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <SubgraphTradesDataLayer
                                tokenImages={tokenImages}
                                config={config}
                                showMyTrades={false}
                                limit={tradesLimit}
                              />
                            </div>
                          )}
                          {activeTab === 'my-trades-sdk' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <SubgraphTradesDataLayer
                                tokenImages={tokenImages}
                                config={config}
                                showMyTrades={true}
                                limit={tradesLimit}
                              />
                            </div>
                          )}
                          {activeTab === 'redeem-tokens' && (
                            <RedeemTokens config={config} positions={positions} isLoadingPositions={isLoadingPositions} onBalancesChanged={refetchBalances} balanceError={balanceError} onRetryBalances={refetchBalances} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side - Balance Panel */}
                    <div className="md:col-span-1">
                      <div className="sticky top-24 space-y-8">
                        {(
                          <div className="">
                            <ShowcaseSwapComponent
                              positions={positions}
                              prices={{
                                yesPrice: newYesPrice,
                                noPrice: newNoPrice,
                                spotPrice: newBasePrice !== null ? newBasePrice : latestPrices.spotPriceSDAI, // Pass the actual spot price
                                isLoading: !pricesUnavailable && (newYesPrice === null || newNoPrice === null),
                                error: pricesUnavailable ? (livePriceError || 'Price data unavailable') : null
                              }}
                              walletBalances={{
                                sdaiBalance: rawBalances.currency,
                                wxdaiBalance: rawBalances.native, // Native xDAI balance
                                nativeBalance: rawBalances.native
                              }}
                              isLoadingBalances={isLoadingPositions}
                              account={address}
                              isConnected={isConnected}
                              onConnectWallet={handleConnectWallet}
                              proposalId={proposalId}
                              marketHasClosed={marketHasClosed}
                              refetchBalances={refetchBalances}
                            />
                          </div>
                        )}

                        <YourViewCard subject={marketSubject} />

                        {/* Balance Stats Container */}
                        <MarketBalancePanel
                          positions={positions}
                          openSwapNativeModal={openSwapNativeModal}
                          address={address}
                          handleOpenCollateralModal={handleOpenCollateralModal}
                          isLoadingPositions={isLoadingPositions}
                          balanceError={balanceError}
                          refetchBalances={refetchBalances}
                          proposalId={proposalId}
                          devMode={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Add Processing Toast */}
          {showProcessingToast && processingStep && !isCollateralModalOpen && (
            <ProcessingToast
              step={processingStep}
              onToastClick={handleToastClick}
            />
          )}



          {/* Render Modals */}
          {/* ... existing CollateralModal rendering ... */}
          <AnimatePresence>
            {isCollateralModalOpen && (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
                onClick={handleBackdropClick}
              >
                <CollateralModal
                  onSafeTransaction={handleSafeTransaction}
                  // ... props ...
                  title={collateralModalType === 'add' ? 'Add Collateral' : 'Merge Collateral'}
                  supportText=""
                  handleClose={handleCloseCollateralModal}
                  connectedWalletAddress={address}
                  alertContainerTitle="Collateral Information"
                  alertSupportText="Only deposit funds you intend to use for interactions within this proposal. Your collateral remains yours and can be retrieved at any time when not actively used in ongoing trades."
                  tokenConfig={config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG}
                  balances={positions}
                  processingStep={processingStep}
                  action={collateralModalType}
                  proposalId={proposalId}
                  config={config}
                  configLoading={configLoading}
                />
              </div>
            )}
          </AnimatePresence>

          {/* ... existing ConfirmSwapModal rendering ... */}
          <AnimatePresence>
            {isConfirmModalOpen && currentTransactionData && (
              <ConfirmSwapModal
                toggleHideCowSwap={!isDebugMode}
                onSafeTransaction={handleSafeTransaction}
                // ... props ...
                onClose={() => setIsConfirmModalOpen(false)}
                transactionData={{
                  ...currentTransactionData,
                  isClosingPosition: currentTransactionData?.isClosingPosition || false,
                  useExistingCollateral: currentTransactionData?.useExistingCollateral || false
                }}
                existingBalance={selectedAction === 'buy'
                  ? (selectedOutcome === 'approved'
                    ? positions?.currencyYes?.total
                    : positions?.currencyNo?.total)
                  : (selectedOutcome === 'approved'
                    ? positions?.companyYes?.total
                    : positions?.companyNo?.total)
                }
                additionalCollateralNeeded={(() => {
                  // If we're selling or using existing collateral, we don't need additional collateral
                  if (currentTransactionData?.action === 'Sell' || currentTransactionData?.useExistingCollateral) {
                    return '0';
                  }

                  const existingBalance = selectedAction === 'buy'
                    ? (selectedOutcome === 'approved'
                      ? positions?.currencyYes?.total || '0'
                      : positions?.currencyNo?.total || '0')
                    : (selectedOutcome === 'approved'
                      ? positions?.companyYes?.total || '0'
                      : positions?.companyNo?.total || '0');

                  try {
                    // Convert to BigNumber for precise calculation
                    const amountBN = ethers.utils.parseUnits(amount || '0', 18);
                    const existingBalanceBN = ethers.utils.parseUnits(existingBalance || '0', 18);

                    // Calculate difference
                    const diffBN = amountBN.sub(existingBalanceBN);

                    // Only return positive differences
                    if (diffBN.gt(ethers.constants.Zero)) {
                      return ethers.utils.formatUnits(diffBN, 18);
                    }
                    return '0';
                  } catch (error) {
                    console.error('Error calculating needed amount:', error);
                    return '0';
                  }
                })()}
                onTransactionComplete={handleTransactionComplete}
                proposalId={proposalId}
              />
            )}
          </AnimatePresence>

          {/* <-- Render the new SwapNativeToCurrencyModal --> */}
          <AnimatePresence>
            {isSwapNativeModalOpen && (
              <SwapNativeToCurrencyModal
                isOpen={isSwapNativeModalOpen}
                onClose={closeSwapNativeModal}
              />
            )}
          </AnimatePresence>
          {isPredictionMarketModalOpen && (
            <PredictionMarketModal
              isOpen={isPredictionMarketModalOpen}
              onClose={() => setIsPredictionMarketModalOpen(false)}
              config={config}
            />
          )}
          <AddLiquidityModal
            isOpen={isAddLiquidityModalOpen}
            onClose={() => setIsAddLiquidityModalOpen(false)}
            config={config}
          />
          <CreatePoolModal
            isOpen={isCreatePoolModalOpen}
            onClose={() => setIsCreatePoolModalOpen(false)}
            config={config}
            onPoolCreated={refetchConfig}
          />
          {isEditProposalModalOpen && (
            <EditProposalModal
              isOpen={isEditProposalModalOpen}
              onClose={() => setIsEditProposalModalOpen(false)}
              proposalMetadataAddress={config?.proposalMetadataAddress}
            />
          )}

          {/* Snapshot Debug Console - Shows when debug mode is active */}
          {SHOW_DATA_DEBUG && isDebugMode && (
            <div className="fixed top-4 right-4 z-50 bg-black/90 text-white p-4 rounded-lg max-w-md text-xs font-mono">
              <div className="font-bold mb-2 text-futarchyViolet9">📊 Snapshot Widget Debug</div>
              <div className="space-y-1">
                <div><span className="text-futarchyGray112">Market Address:</span> {MARKET_ADDRESS || 'N/A'}</div>
                <div><span className="text-futarchyGray112">Loading:</span> {snapshotLoading ? '⏳ Yes' : '✅ No'}</div>
                <div><span className="text-futarchyGray112">Error:</span> {snapshotError || 'None'}</div>
                <div><span className="text-futarchyGray112">Source:</span> {snapshotSource || 'N/A'}</div>
                <div><span className="text-futarchyGray112">Snapshot Proposal ID:</span> {snapshotProposalId || '❌ Not Found'}</div>
                <div><span className="text-futarchyGray112">Has Data:</span> {snapshotData ? '✅ Yes' : '❌ No'}</div>
                {snapshotData && (
                  <>
                    <div><span className="text-futarchyGray112">Items:</span> {snapshotData.items?.length || 0}</div>
                    <div><span className="text-futarchyGray112">Total Votes:</span> {snapshotData.totalCount || 0}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Market Analytics Toast - Hidden on Mobile and when debug mode is false */}
          {SHOW_DATA_DEBUG && isDebugMode && (
            <div className="hidden md:block">
              <MarketStatsDebugToast
                prices={{ yesPrice: newYesPrice, noPrice: newNoPrice, isLoading: false, error: livePriceError }}
                positions={positions}
                newYesPrice={newYesPrice}
                newNoPrice={newNoPrice}
                newThirdPrice={newThirdPrice}
                newBasePrice={newBasePrice}
                contractConfig={config}
              />
            </div>
          )}

          {/* Commenting out the debug display for new Algebra prices as they are now integrated into the main display */}
          {/* <div style={{marginTop: 16, marginBottom: 16, padding: 12, background: '#23272c', borderRadius: 8}}>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New Yes Price (Algebra): {newYesPrice !== null ? newYesPrice : 'Loading...'}</div>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New No Price (Algebra): {newNoPrice !== null ? newNoPrice : 'Loading...'}</div>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New Third Price (Algebra): {newThirdPrice !== null ? newThirdPrice : 'Loading...'}</div>
            <div style={{color: '#aaa', fontSize: 12}}>These are from the Algebra pool. Old prices are still shown for comparison.</div>
          </div> */}

          {/* ---> Add Pending Order Toast Rendering <--- */}
          <PendingOrderToast count={pendingOrderCount} userAddress={address} />
          {/* Ensure this is rendered outside conditional blocks if needed,
              or adjust placement based on desired stacking context */}

          {safeToastVisible && (
            <SafeTransactionToast onClose={() => setSafeToastVisible(false)} />
          )}
        </PageLayout>
      </RootLayout>
    </>
  );
};

export default MarketPageShowcase;
