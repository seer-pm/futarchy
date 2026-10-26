import { useEffect, useState, useCallback, useMemo } from 'react';
import RootLayout from '../../../components/layout/RootLayout';
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS } from '../../../config/featureFlags';
import ShowcaseSwapComponent from './ShowcaseSwapComponent';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useSnapshotData } from '../../../hooks/useSnapshotData';
import MarketBalancePanel from './MarketBalancePanel';
import { useYesNoPoolData } from '../../../hooks/usePoolData';
import { FUTARCHY_ROUTER_ADDRESS as DEFAULT_FUTARCHY_ROUTER_ADDRESS } from './constants/contracts';
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from '../../../constants/addresses';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { useChainValidation } from '../../../hooks/useChainValidation';
import WrongNetworkModal from '../../common/WrongNetworkModal';
import useLatestPrices from '../../../hooks/useLatestPrices';
import { useCurrency, useUpdateCurrencyFromConfig } from '../../../contexts/CurrencyContext';
import { useSdaiRate } from '../../../hooks/useSdaiRate';
import { ProcessingToast, SafeTransactionToast } from './showcase/toasts';
import { YourViewCard } from './showcase/YourViewCard';
import { PROPOSALS_USING_SUBGRAPH_TRADES, useMarketPageParams } from './showcase/useMarketPageParams';
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
import { MarketHero, MarketDecisionSection, MarketTestSection, MarketMoneySection, BriefingSection } from './showcase/MarketHero';
import { MarketChartSection } from './showcase/MarketChartSection';
import { MarketTabsSection } from './showcase/MarketTabsSection';
import { MarketModals } from './showcase/MarketModals';
import { MarketDebugPanels } from './showcase/MarketDebugPanels';

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

  const spot = useMarketSpotPrice(config, useSpotPriceParam);

  // Extract proposalId from config for passing to child components
  const proposalId = config?.proposalId;

  const tabs = useMarketTabs(config);
  const { marketHasClosed } = tabs;
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

  const snapshot = useSnapshotData(config?._registryMetadata?.snapshot_id || null, {
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

  const prices = useLivePoolPrices({ config, configLoading, poolData, poolDataLoading, poolDataError });
  const { newYesPrice, newNoPrice, newBasePrice, livePriceError, pricesUnavailable } = prices;
  const liquiditySummary = useLiquiditySummary({ config, poolData, newYesPrice, newNoPrice, latestPrices });

  const balances = useMarketBalances(config, address, isConnected);
  const { rawBalances, positions, isLoadingPositions, balanceError, refetchBalances } = balances;
  const collateral = useCollateralFlow(refetchBalances);
  const {
    isCollateralModalOpen,
    showProcessingToast,
    processingStep,
    handleOpenCollateralModal,
    handleToastClick
  } = collateral;

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

  const confirmSwap = useConfirmSwapState(refetchBalances);

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

  const timing = useMarketTiming(config);

  const rate = { sdaiRate, isLoadingRate, rateError };
  const badgeModals = {
    isPredictionMarketModalOpen,
    setIsPredictionMarketModalOpen,
    isAddLiquidityModalOpen,
    setIsAddLiquidityModalOpen,
    isCreatePoolModalOpen,
    setIsCreatePoolModalOpen,
    isEditProposalModalOpen,
    setIsEditProposalModalOpen
  };

  const briefingProps = {
    marketData,
    config,
    configLoading,
    currencySymbol,
    snapshot,
    timing,
    badgeModals
  };

  // The page is a briefing for the people deciding (left) with the trade rail beside it (right).
  // On a phone the rail sits after the chart: the reader sees the answer and the evidence, then
  // can act, then reads on about the test and the money.
  return (
    <>
      {/* Wrong Network Modal */}
      <WrongNetworkModal
        requiredChainId={chainValidation.requiredChainId}
        isOpen={chainValidation.showModal}
        onClose={() => chainValidation.setShowModal(false)}
      />

      <RootLayout useSnapScroll={false}>
        <div className="bg-seer-page text-seer-text">
          <div className="container mx-auto px-5 pt-28 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-10">
              <div className="lg:col-span-8 lg:row-start-1 min-w-0">
                <MarketHero
                  {...briefingProps}
                  isProposalOwner={isProposalOwner}
                  prices={prices}
                />
                <MarketDecisionSection marketData={marketData} />
                <BriefingSection id="briefing-chart" title="What the market expects">
                  <p className="-mt-2 mb-5 text-sm leading-relaxed text-seer-muted max-w-[68ch]">
                    Each line is the token&apos;s price in one of two worlds: purple if the proposal passes, gold if it
                    fails. The gap between them is the market&apos;s estimate of the proposal&apos;s impact; the dashed line is
                    today&apos;s spot price.
                  </p>
                  <MarketChartSection
                    showTripleChart={showTripleChart}
                    showSubgraphChart={showSubgraphChart}
                    config={config}
                    currencySymbol={currencySymbol}
                    selectedCurrency={selectedCurrency}
                    rate={rate}
                    prices={prices}
                    latestPrices={latestPrices}
                    hasSpot={hasSpot}
                    chartFilters={chartFilters}
                    handleChartFilterClick={handleChartFilterClick}
                    marketHasClosed={marketHasClosed}
                    spot={spot}
                  />
                </BriefingSection>
              </div>

              <aside aria-label="Trade" className="lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2 min-w-0">
                <div className="lg:sticky lg:top-28 space-y-6">
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

                  <YourViewCard subject={marketSubject} />

                  <MarketBalancePanel
                    positions={positions}
                    address={address}
                    handleOpenCollateralModal={handleOpenCollateralModal}
                    isLoadingPositions={isLoadingPositions}
                    balanceError={balanceError}
                    refetchBalances={refetchBalances}
                    proposalId={proposalId}
                    devMode={true}
                  />
                </div>
              </aside>

              <div className="lg:col-span-8 lg:row-start-2 min-w-0 -mt-10">
                <MarketTestSection config={config} marketData={marketData} snapshot={snapshot} />
                <MarketMoneySection
                  {...briefingProps}
                  pool={{ poolData, poolDataLoading, poolDataError }}
                  liquiditySummary={liquiditySummary}
                />
                <BriefingSection id="briefing-activity" title="Activity">
                  <MarketTabsSection
                    tabs={tabs}
                    balances={balances}
                    config={config}
                    tokenImages={tokenImages}
                    selectedCurrency={selectedCurrency}
                    rate={rate}
                    setCurrentTransactionData={confirmSwap.setCurrentTransactionData}
                    setIsConfirmModalOpen={confirmSwap.setIsConfirmModalOpen}
                  />
                </BriefingSection>
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
        <MarketModals
          collateral={collateral}
          confirmSwap={confirmSwap}
          badgeModals={badgeModals}
          isDebugMode={isDebugMode}
          handleSafeTransaction={handleSafeTransaction}
          address={address}
          positions={positions}
          proposalId={proposalId}
          config={config}
          configLoading={configLoading}
          refetchConfig={refetchConfig}
        />

        <MarketDebugPanels
          isDebugMode={isDebugMode}
          marketAddress={MARKET_ADDRESS}
          snapshot={snapshot}
          prices={prices}
          positions={positions}
          config={config}
        />

        {safeToastVisible && (
          <SafeTransactionToast onClose={() => setSafeToastVisible(false)} />
        )}
      </RootLayout>
    </>
  );
};

export default MarketPageShowcase;
