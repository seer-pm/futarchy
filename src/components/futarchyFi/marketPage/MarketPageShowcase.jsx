import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import RootLayout from '../../../components/layout/RootLayout';
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS, SHOW_DATA_DEBUG, DEBUG_MODE } from '../../../config/featureFlags';
import { StatDisplay, AggregatedStatDisplay, formatVolume, formatLiquidity, normalizeTokenAmount } from './page/Formatter';
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
import { getRealityQuestionUrl } from '../../debug/constants/chainConfig';
import { computeImpactPercent, formatImpactPercent, normalizeRealityQuestionUrl } from '../../../utils/marketPageUtils.mjs';
import WrongNetworkModal from '../../common/WrongNetworkModal';
import CreatePoolModal from './CreatePoolModal';
import { createSubgraphPoolFetcher } from '../../../utils/SubgraphPoolFetcher';
import TripleChart from '@components/chart/TripleChart';
import ChartParameters from './tripleChart/chartParameters/ChartParameters';
import useLatestPrices from '../../../hooks/useLatestPrices';
import { useCurrency, useUpdateCurrencyFromConfig } from '../../../contexts/CurrencyContext';
import { useSdaiRate } from '../../../hooks/useSdaiRate';
import { useBalanceManager } from '../../../hooks/useBalanceManager';
import { useExternalSpotPrice } from '../../../hooks/useExternalSpotPrice';
import { CowSdk } from '@gnosis.pm/cow-sdk';
import AddLiquidityModal from './AddLiquidityModal';
import { PendingOrderToast, ProcessingToast, SafeTransactionToast } from './showcase/toasts';
import { TwapCountdown } from './showcase/TwapCountdown';
import { TradeHistoryTable } from './showcase/TradeHistoryTable';
import { YourViewCard } from './showcase/YourViewCard';
import { PredictionMarketModal } from './showcase/PredictionMarketModal';
import { SnapshotWidget } from './showcase/SnapshotWidget';

// Subgraph pool fetcher instance for latest prices
const subgraphPoolFetcher = createSubgraphPoolFetcher();

const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the \u201cpass\u201d (yes) outcome over the final 24 hours of the Issuance KIP\u2019s voting period is greater than or equal to that of the \u201cfail\u201d (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";

// Token ABI (unchanged, used by multiple features)
const WXDAI_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

// WXDAI Token Contract on Gnosis Chain
const DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS = DEFAULT_BASE_TOKENS_CONFIG.currency.address;

// ConditionalTokens Contract
const CONDITIONAL_TOKENS_ADDRESS = "0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce";

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

  // Read useSubgraph query parameter for chart display control
  // - No param or not set: Show only TripleChart (original behavior)
  // - useSubgraph=true: Show both TripleChart AND SubgraphChart
  // - useSubgraph=only: Show ONLY SubgraphChart (don't mount TripleChart)
  // Proposals that default to Subgraph Trades
  const PROPOSALS_USING_SUBGRAPH_TRADES = [
    '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC',
    '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa'  // AAVE proposal
  ];

  // Proposal-specific config for SubgraphChart and spot price
  const PROPOSAL_DEFAULTS = {
    '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC': {
      useSubgraph: 'only',
      useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
    },
    '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa': {
      useSubgraph: 'only',
      useSpotPrice: 'composite::0xaa7a70070e7495fe86c67225329dbd39baa2f63b+0xc8cf54b0b70899ea846b70361e62f3f5b22b1f4binvert+0x3de27efa2f1aa663ae5d458857e731c129069f29invert-hour-100-eth'  // AAVE/GHO composite: USDC/GHO * AAVE/USDC(inv) * AAVE/GHO(inv)
    },
    '0xeCe80208CB8376Be311cE0f5Ea4eF73850a0dcF0': {
      useSubgraph: 'only',
      useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
    }
  };

  const searchParams = useSearchParams();

  // Get proposal ID from URL path (/markets/[address]) or query param (?proposalId=)
  // Use pathname for /markets/[address] format
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const pathMatch = pathname.match(/\/markets?\/([^/?]+)/i);
  const proposalIdFromPath = pathMatch?.[1] || null;

  // Get proposal ID early for defaults lookup
  const proposalIdForDefaults = proposalIdFromPath || proposal?.address || proposal?.id || searchParams.get('proposalId');
  const normalizedProposalIdForDefaults = proposalIdForDefaults?.toLowerCase?.();
  const proposalDefaults = Object.entries(PROPOSAL_DEFAULTS).find(
    ([address]) => address.toLowerCase() === normalizedProposalIdForDefaults
  )?.[1] || {};

  // Apply defaults: URL params override proposal defaults
  // If global toggle is enabled, force subgraph for all proposals
  const useSubgraphParam = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS
    ? 'only'  // Force SubgraphChart only
    : (searchParams.get('useSubgraph') || proposalDefaults.useSubgraph);
  const showTripleChart = useSubgraphParam !== 'only'; // Show unless 'only'
  const showSubgraphChart = useSubgraphParam === 'true' || useSubgraphParam === 'only';

  // External spot price from GeckoTerminal via spotClient
  // Priority: 1) URL param, 2) proposal defaults, 3) config.marketInfo.coingecko_ticker
  const useSpotPriceParam = searchParams.get('useSpotPrice') || proposalDefaults.useSpotPrice;

  // Check for tradeSource parameter to switch between Supabase and Subgraph for trades
  // - No param: Default to Supabase UNLESS in whitelist
  // - tradeSource=subgraph: Use Subgraph (SubgraphTradesDataLayer)
  // - tradeSource=supabase: Use Supabase (RecentTradesDataLayer)
  const tradeSourceParam = searchParams.get('tradeSource');

  // Logic moved below config definition...

  const handleSafeTransaction = useCallback(() => {
    setSafeToastVisible(true);
    // Auto-hide after 10 seconds
    setTimeout(() => setSafeToastVisible(false), 10000);
  }, []);
  const [marketHasClosed, setMarketHasClosed] = useState(false);
  const [isPredictionMarketModalOpen, setIsPredictionMarketModalOpen] = useState(false);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isCreatePoolModalOpen, setIsCreatePoolModalOpen] = useState(false);
  const [isEditProposalModalOpen, setIsEditProposalModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // The sticky hero collapses on desktop once the page scrolls. Without a
  // placeholder the content below jumps up by the height it loses, moving
  // whatever is under the cursor mid-click. heroReserve re-adds that height
  // as a spacer at the top of the page content so nothing shifts.
  const heroRef = useRef(null);
  const [heroEl, setHeroEl] = useState(null);
  const attachHeroRef = useCallback((el) => {
    heroRef.current = el;
    setHeroEl(el);
  }, []);
  const expandedHeroHeightRef = useRef(0);
  const isScrolledRef = useRef(false);
  const [heroReserve, setHeroReserve] = useState(0);
  const syncHeroReserve = useCallback(() => {
    const el = heroRef.current;
    if (!el) return;
    const height = el.offsetHeight;
    if (!isScrolledRef.current) {
      expandedHeroHeightRef.current = height;
      setHeroReserve(0);
    } else {
      setHeroReserve(Math.max(0, expandedHeroHeightRef.current - height));
    }
  }, []);
  // Layout effect: measure after the collapse commits but before paint.
  useLayoutEffect(() => {
    isScrolledRef.current = isScrolled;
    syncHeroReserve();
  }, [isScrolled, syncHeroReserve]);
  // Follow later size changes (data loading, the 300ms padding transition).
  useEffect(() => {
    if (!heroEl || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(syncHeroReserve);
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, [heroEl, syncHeroReserve]);

  // Chart line visibility filters
  const [chartFilters, setChartFilters] = useState({
    spot: true, // Spot price shown as semi-transparent dashed line
    yes: true,
    no: true,
    impact: false, // Impact line is hidden by default
    eventProbability: false // Event probability line hidden by default
  });

  const handleChartFilterClick = (filterType) => {
    setChartFilters(prev => {
      const newFilters = { ...prev };

      // Special handling for impact - when clicked, show only impact line
      if (filterType === 'impact') {
        if (!prev.impact) {
          // Clicking impact when it's off: show only impact
          newFilters.spot = false;
          newFilters.yes = false;
          newFilters.no = false;
          newFilters.eventProbability = false;
          newFilters.impact = true;
        } else {
          // Clicking impact when it's on: show all normal lines
          newFilters.spot = true;
          newFilters.yes = true;
          newFilters.no = true;
          newFilters.impact = false;
          newFilters.eventProbability = false;
        }
        return newFilters;
      }

      // Special handling for event probability - mirror impact behaviour
      if (filterType === 'eventProbability') {
        if (!prev.eventProbability) {
          newFilters.spot = false;
          newFilters.yes = false;
          newFilters.no = false;
          newFilters.impact = false;
          newFilters.eventProbability = true;
        } else {
          newFilters.spot = true;
          newFilters.yes = true;
          newFilters.no = true;
          newFilters.impact = false;
          newFilters.eventProbability = false;
        }
        return newFilters;
      }

      // If impact is currently shown, clicking any other filter switches back to normal mode
      if (prev.impact) {
        newFilters.impact = false;
        newFilters.spot = false;
        newFilters.yes = false;
        newFilters.no = false;
        newFilters.eventProbability = false;
        newFilters[filterType] = true;
        return newFilters;
      }

      // If event probability is currently shown, clicking any other filter switches back to normal mode
      if (prev.eventProbability) {
        newFilters.eventProbability = false;
        newFilters.spot = false;
        newFilters.yes = false;
        newFilters.no = false;
        newFilters.impact = false;
        newFilters[filterType] = true;
        return newFilters;
      }

      // Normal filter logic for spot/yes/no
      // If clicking on an enabled item with all enabled, disable the other two
      if (prev[filterType] && prev.spot && prev.yes && prev.no) {
        Object.keys(newFilters).forEach(key => {
          if (key !== 'impact' && key !== 'eventProbability') {
            newFilters[key] = key === filterType;
          }
        });
      }
      // If clicking on a disabled item, enable it
      else if (!prev[filterType]) {
        newFilters[filterType] = true;
      }
      // If clicking on the only enabled item, enable all (except impact)
      else if (prev[filterType] && Object.values({ spot: prev.spot, yes: prev.yes, no: prev.no }).filter(v => v).length === 1) {
        newFilters.spot = true;
        newFilters.yes = true;
        newFilters.no = true;
      }
      // Otherwise, just toggle the clicked item
      else {
        newFilters[filterType] = !prev[filterType];
      }

      return newFilters;
    });
  };


  // Scroll detection for minimized header - DESKTOP ONLY with animation lock
  useEffect(() => {
    let isAnimating = false;
    let animationTimeout = null;

    const handleScroll = () => {
      // Only apply on desktop (lg breakpoint = 1024px and up)
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        return;
      }

      // Don't update during animation to prevent feedback loop
      if (isAnimating) return;

      const shouldMinimize = window.scrollY > 0;

      // Only update if state actually changes
      setIsScrolled((prevScrolled) => {
        if (prevScrolled !== shouldMinimize) {
          // Lock updates during animation
          isAnimating = true;

          // Clear any existing timeout
          if (animationTimeout) clearTimeout(animationTimeout);

          // Unlock after animation completes (300ms)
          animationTimeout = setTimeout(() => {
            isAnimating = false;
          }, 350); // Slightly longer than CSS transition

          return shouldMinimize;
        }
        return prevScrolled;
      });
    };

    // Also check on resize
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        isAnimating = false;
      } else {
        handleScroll();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (animationTimeout) clearTimeout(animationTimeout);
    };
  }, []);


  // ...existing state...
  const [newYesPrice, setNewYesPrice] = useState(null);
  const [newNoPrice, setNewNoPrice] = useState(null);
  const [newThirdPrice, setNewThirdPrice] = useState(null); // Added state for the third price
  const [thirdCandles, setThirdCandles] = useState([]); // Event probability historical candles
  const [newBasePrice, setNewBasePrice] = useState(null); // Added state for base/spot price from pool_candles
  // Set when the latest-price fetch fails, so price stats stop spinning.
  const [livePriceError, setLivePriceError] = useState(null);


  const { address: connectedAddress, isConnected: walletConnected } = useAccount();
  const contractAddress = searchParams.get('contractAddress');
  const { selectedCurrency } = useCurrency(); // Get selected currency from context
  const { rate: sdaiRate, isLoading: isLoadingRate, error: rateError } = useSdaiRate(); // Get sDAI rate

  // Prioritize URL query parameters over props/connected wallet
  const debugModeParam = searchParams.get('debugMode');
  const normalizedDebugParam = debugModeParam?.toLowerCase?.();
  const isDebugMode =
    normalizedDebugParam === 'true' ||
    normalizedDebugParam === '1' ||
    normalizedDebugParam === 'yes' ||
    normalizedDebugParam === 'on' ||
    normalizedDebugParam === 't' ||
    debugMode;
  // ?debugAddress= shows another wallet's positions as if it were connected;
  // developer builds only.
  const debugAddress = DEBUG_MODE ? searchParams.get('debugAddress') : null;
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

  // Compute effective spot price param now that config is available
  // Priority: 1) URL param, 2) proposal defaults, 3) config.marketInfo.coingecko_ticker from Registry
  const effectiveSpotPriceParam = useMemo(() => {
    return useSpotPriceParam || config?.marketInfo?.coingecko_ticker || null;
  }, [useSpotPriceParam, config?.marketInfo?.coingecko_ticker]);

  // Second hook call with effective param (will re-fetch when config loads and provides coingecko_ticker)
  const {
    spotData: configSpotData,
    spotPrice: configSpotPrice,
    refetch: refetchConfigSpot,
    loading: configSpotLoading,
    error: configSpotError
  } = useExternalSpotPrice(effectiveSpotPriceParam, config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp);

  // Nullify spot data for closed markets
  const isLocallyClosed = config && (() => {
    const ct = config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp;
    return ct && typeof ct === 'number' && (Date.now() / 1000) > ct;
  })();

  const finalSpotData = isLocallyClosed ? null : configSpotData;
  const finalSpotPrice = isLocallyClosed ? null : configSpotPrice;
  const finalSpotLoading = isLocallyClosed ? false : configSpotLoading;

  // Stabilize spotData reference — only update when actual data values change
  const stableSpotData = useMemo(() => finalSpotData, [JSON.stringify(finalSpotData)]);

  const liquiditySummary = useMemo(() => {
    const tokensConfig = config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
    const currencyAddress = tokensConfig?.currency?.address?.toLowerCase() || null;
    const companyAddress = tokensConfig?.company?.address?.toLowerCase() || null;

    const parsePrice = (value) => {
      if (value === null || value === undefined) return null;
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    };

    const computeBreakdown = (liquidity, poolPrice) => {
      if (!liquidity) return null;

      // Some APIs return a pre-summed amount - treat it entirely as currency liquidity
      if (typeof liquidity.amount !== 'undefined') {
        const total = normalizeTokenAmount(liquidity.amount);
        return {
          total,
          cashValue: total,
          companyValue: 0,
          otherValue: 0,
          priceUsed: parsePrice(poolPrice)
        };
      }

      const entries = [
        { token: liquidity.token0, amount: liquidity.amount0, kind: liquidity.kind0 },
        { token: liquidity.token1, amount: liquidity.amount1, kind: liquidity.kind1 }
      ];

      let cashValue = 0;
      let companyTokenAmount = 0;
      let otherValue = 0;

      for (const entry of entries) {
        if (!entry || entry.amount === null || entry.amount === undefined) continue;
        const normalizedAmount = normalizeTokenAmount(entry.amount);
        const tokenAddress = entry.token?.toLowerCase();

        if (entry.kind === 'currency' || (currencyAddress && tokenAddress === currencyAddress)) {
          cashValue += normalizedAmount;
        } else if (entry.kind === 'company' || (companyAddress && tokenAddress === companyAddress)) {
          companyTokenAmount += normalizedAmount;
        } else {
          otherValue += normalizedAmount;
        }
      }

      const price = parsePrice(poolPrice);
      const companyValue = price ? companyTokenAmount * price : companyTokenAmount;
      const total = cashValue + companyValue + otherValue;

      return {
        total,
        cashValue,
        companyValue,
        otherValue,
        priceUsed: price,
        rawCompanyAmount: companyTokenAmount
      };
    };

    const yesPrice = parsePrice(newYesPrice ?? poolData?.yesPool?.price ?? latestPrices.yes);
    const noPrice = parsePrice(newNoPrice ?? poolData?.noPool?.price ?? latestPrices.no);

    const yesData = computeBreakdown(poolData?.yesPool?.liquidity, yesPrice);
    const noData = computeBreakdown(poolData?.noPool?.liquidity, noPrice);

    const MINIMUM_DISPLAY = 1e-9;
    const tooltipBreakdown = [];

    if (yesData) {
      const hasYesCompany = yesData.companyValue > MINIMUM_DISPLAY;
      const hasYesOther = yesData.otherValue > MINIMUM_DISPLAY;
      const hasYesCash = yesData.cashValue > MINIMUM_DISPLAY;

      tooltipBreakdown.push({
        label: 'YES Total',
        value: yesData.total,
        className: 'text-futarchyBlue9 font-semibold'
      });
      if (hasYesCash && (hasYesCompany || hasYesOther)) {
        tooltipBreakdown.push({
          label: 'YES Cash',
          value: yesData.cashValue,
          className: 'text-futarchyBlue9'
        });
      }
      if (hasYesCompany) {
        tooltipBreakdown.push({
          label: yesData.priceUsed ? 'YES Company' : 'YES Company (raw)',
          value: yesData.companyValue,
          className: 'text-futarchyBlue9'
        });
      }
      if (hasYesOther) {
        tooltipBreakdown.push({
          label: 'YES Other',
          value: yesData.otherValue,
          className: 'text-white/80'
        });
      }
    }

    if (noData) {
      const hasNoCompany = noData.companyValue > MINIMUM_DISPLAY;
      const hasNoOther = noData.otherValue > MINIMUM_DISPLAY;
      const hasNoCash = noData.cashValue > MINIMUM_DISPLAY;

      tooltipBreakdown.push({
        label: 'NO Total',
        value: noData.total,
        className: 'text-futarchyGold8 font-semibold'
      });
      if (hasNoCash && (hasNoCompany || hasNoOther)) {
        tooltipBreakdown.push({
          label: 'NO Cash',
          value: noData.cashValue,
          className: 'text-futarchyGold8'
        });
      }
      if (hasNoCompany) {
        tooltipBreakdown.push({
          label: noData.priceUsed ? 'NO Company' : 'NO Company (raw)',
          value: noData.companyValue,
          className: 'text-futarchyGold8'
        });
      }
      if (hasNoOther) {
        tooltipBreakdown.push({
          label: 'NO Other',
          value: noData.otherValue,
          className: 'text-white/80'
        });
      }
    }

    return {
      yes: yesData,
      no: noData,
      breakdown: tooltipBreakdown
    };
  }, [
    config?.BASE_TOKENS_CONFIG,
    poolData?.yesPool?.liquidity,
    poolData?.noPool?.liquidity,
    poolData?.yesPool?.price,
    poolData?.noPool?.price,
    newYesPrice,
    newNoPrice,
    latestPrices.yes,
    latestPrices.no
  ]);

  // Extract proposalId from config for passing to child components
  const proposalId = config?.proposalId;

  // Token images for trade history rows; populated from on-chain metadata when available
  const [tokenImages, setTokenImages] = useState({
    company: null,
    currency: null
  });

  // Split Configuration
  useEffect(() => {
    if (config?.marketInfo) {
      // Check if market is resolved based on resolution status only
      if (config.marketInfo.resolved) {
        setMarketHasClosed(true);
        // Switch to redeem-tokens tab when market is resolved
        setActiveTab('redeem-tokens');
      } else {
        setMarketHasClosed(false);
      }
    }
  }, [config]);

  // Pull token images from the on-chain proposal metadata when present
  useEffect(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const images = meta?.token_images || meta?.tokenImages;
    if (images?.company || images?.currency) {
      setTokenImages({
        company: images.company || null,
        currency: images.currency || null
      });
    }
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

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

  // Fetch latest prices from Supabase pool_candles - much simpler!
  useEffect(() => {
    let isMounted = true;
    let interval = null;

    async function fetchLatestPricesFromSupabase() {
      try {
        console.log('[MarketPageShowcase] Fetching latest prices from Supabase pool_candles:', {
          YES_POOL: config?.POOL_CONFIG_YES?.address,
          NO_POOL: config?.POOL_CONFIG_NO?.address,
          THIRD_POOL: config?.POOL_CONFIG_THIRD?.address,
          BASE_POOL: config?.BASE_POOL_CONFIG?.address
        });

        // Don't fetch if config is not loaded yet
        if (!config?.POOL_CONFIG_YES?.address || !config?.POOL_CONFIG_NO?.address) {
          console.log('[MarketPageShowcase] Pool addresses not yet loaded, skipping price fetch');
          return;
        }

        const subgraphChainId = config?.chainId || 100;

        // One batched pool query for every price we need — YES, NO and BASE —
        // instead of a `pool(id:)` request each.
        const priceAddresses = [
          config.POOL_CONFIG_YES.address,
          config.POOL_CONFIG_NO.address,
          config.BASE_POOL_CONFIG?.address
        ].filter(Boolean);

        const [priceResult, thirdResult] = await Promise.all([
          subgraphPoolFetcher.fetch('pools.batch', {
            ids: priceAddresses,
            chainId: subgraphChainId
          }),
          config.POOL_CONFIG_THIRD?.address
            ? subgraphPoolFetcher.fetch('pools.candles', {
              id: config.POOL_CONFIG_THIRD.address,
              limit: 500,
              chainId: subgraphChainId
            })
            : Promise.resolve(null)
        ]);

        // Pool IDs come back lowercased from the subgraph.
        const pricesByAddress = new Map(
          (priceResult?.data || []).map(pool => [String(pool.id).toLowerCase(), pool.price])
        );
        const priceFor = (address) =>
          address ? (pricesByAddress.get(String(address).toLowerCase()) ?? null) : null;

        // Extract prices from latest candles
        let thirdPrice = null;

        // Backend now handles token slot inversion, use raw prices directly
        const yesPrice = priceFor(config.POOL_CONFIG_YES.address);
        const noPrice = priceFor(config.POOL_CONFIG_NO.address);
        const basePrice = priceFor(config.BASE_POOL_CONFIG?.address);
        console.log('[MarketPageShowcase] Pool prices from batch:', { yesPrice, noPrice, basePrice });

        if (thirdResult?.status === 'success' && thirdResult.data.length > 0) {
          const processedThirdCandles = thirdResult.data
            .map((candle) => ({
              time: candle.timestamp,
              value: Number(candle.price)
            }))
            .filter((candle) => !Number.isNaN(candle.value))
            .sort((a, b) => a.time - b.time);

          const rawThirdPrice = processedThirdCandles[processedThirdCandles.length - 1]?.value;
          // Event probability should use raw price without inversion
          thirdPrice = rawThirdPrice;
          setThirdCandles(processedThirdCandles);
          console.log('[MarketPageShowcase] THIRD price (event probability) from pool_candles:', {
            raw: rawThirdPrice,
            used: thirdPrice,
            candles: processedThirdCandles.length
          });
        } else {
          setThirdCandles([]);
        }

        if (isMounted) {
          console.log('[MarketPageShowcase] Fetched prices from Supabase pool_candles:', {
            yesPrice, noPrice, thirdPrice, basePrice,
            yesTokenSlot: config.POOL_CONFIG_YES.tokenCompanySlot,
            noTokenSlot: config.POOL_CONFIG_NO.tokenCompanySlot,
            thirdTokenSlot: config.POOL_CONFIG_THIRD?.tokenCompanySlot,
            baseCurrencySlot: config.BASE_POOL_CONFIG?.currencySlot
          });
          setNewYesPrice(yesPrice);
          setNewNoPrice(noPrice);
          setNewThirdPrice(thirdPrice);
          setNewBasePrice(basePrice);
          setLivePriceError(yesPrice === null && noPrice === null ? 'Price data unavailable' : null);
        }
      } catch (e) {
        console.error('[MarketPageShowcase] Failed to fetch prices from Supabase:', e);
        if (isMounted) {
          setNewYesPrice(null);
          setNewNoPrice(null);
          setNewThirdPrice(null);
          setNewBasePrice(null);
          setThirdCandles([]);
          setLivePriceError(e?.message || 'Price data unavailable');
        }
      }
    }

    // Only start fetching if config is loaded
    if (config?.POOL_CONFIG_YES?.address && config?.POOL_CONFIG_NO?.address) {
      fetchLatestPricesFromSupabase();
      // Update every 30 seconds (more frequent since Supabase is faster)
      interval = setInterval(fetchLatestPricesFromSupabase, 30000);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [config?.POOL_CONFIG_YES?.address, config?.POOL_CONFIG_NO?.address, config?.POOL_CONFIG_THIRD?.address, config?.BASE_POOL_CONFIG?.address]); // Only depend on pool addresses

  // NOTE: The Supabase realtime pool_candles subscription that lived here was
  // removed — the Supabase backend is permanently gone. Prices refresh via the
  // 30s subgraph polling above.

  // Fallback: use subgraph-derived prices when Supabase pool_candles aren't available
  // (e.g., AAVE market has no POOL_CONFIG_YES/NO so Supabase fetch never runs)
  useEffect(() => {
    if (newYesPrice === null && poolData?.yesPool?.price != null) {
      setNewYesPrice(poolData.yesPool.price);
    }
    if (newNoPrice === null && poolData?.noPool?.price != null) {
      setNewNoPrice(poolData.noPool.price);
    }
  }, [newYesPrice, newNoPrice, poolData?.yesPool?.price, poolData?.noPool?.price]);

  // Prices are unavailable (not loading) once every source has failed: the
  // latest-price fetch, or — for markets without pool addresses — pool data.
  const pricesUnavailable = (newYesPrice === null || newNoPrice === null) && (
    !!livePriceError ||
    (!config?.POOL_CONFIG_YES?.address && !configLoading && !poolDataLoading && !!poolDataError)
  );

  // Connection state for tracking wallet connection changes
  const [previousConnectionState, setPreviousConnectionState] = useState(isConnected);

  // Track wallet connection state changes explicitly
  useEffect(() => {
    // If connection state changed
    if (previousConnectionState !== isConnected) {
      setPreviousConnectionState(isConnected);
      console.log('Wallet connection state changed:', {
        previous: previousConnectionState,
        current: isConnected,
        address
      });

      // Balance manager handles connection state changes automatically
    }
  }, [isConnected, address, previousConnectionState]);

  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalType, setCollateralModalType] = useState('add');
  const [isApproved, setIsApproved] = useState(false);
  // Use centralized balance manager
  const { balances: rawBalances, isLoading: isLoadingPositions, error: balanceError, refetch: refetchBalances } = useBalanceManager(config, address, isConnected);

  // Transform balances to match existing position structure for compatibility
  const positions = useMemo(() => ({
    currencyYes: {
      unwrapped: rawBalances.currencyYes,
      wrapped: rawBalances.wrappedCurrencyYes,
      total: rawBalances.totalCurrencyYes
    },
    currencyNo: {
      unwrapped: rawBalances.currencyNo,
      wrapped: rawBalances.wrappedCurrencyNo,
      total: rawBalances.totalCurrencyNo
    },
    companyYes: {
      unwrapped: rawBalances.companyYes,
      wrapped: rawBalances.wrappedCompanyYes,
      total: rawBalances.totalCompanyYes
    },
    companyNo: {
      unwrapped: rawBalances.companyNo,
      wrapped: rawBalances.wrappedCompanyNo,
      total: rawBalances.totalCompanyNo
    },
    wxdai: rawBalances.currency, // SDAI balance for compatibility
    faot: rawBalances.company,   // GNO balance for compatibility
    native: rawBalances.native   // Native xDAI balance
  }), [rawBalances]);

  // Balance manager handles wallet disconnection automatically

  const [showEventDetails, setShowEventDetails] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showProcessingToast, setShowProcessingToast] = useState(false);

  // Add state for active tab - default to redeem-tokens if market is resolved, otherwise recent-trades-sdk
  const [activeTab, setActiveTab] = useState(
    config?.marketInfo?.resolved ? 'redeem-tokens' : 'recent-trades-sdk'
  );

  // State for Recent Trades filter controls
  const [showMyTrades, setShowMyTrades] = useState(false);
  const [tradesLimit, setTradesLimit] = useState(30);

  // Dynamic market data state. Starts empty (the hero shows a skeleton while
  // isLoading) — never another market's copy.
  const [marketData, setMarketData] = useState({
    display_title_0: "",
    display_title_1: "",
    title: "",
    description: "",
    question_title: null,
    question_link: null,
    isLoading: true,
    error: null
  });

  const marketSubject = useMemo(() => {
    const displayTexts = [
      marketData.display_title_1,
      marketData.display_title_0,
      marketData.title,
      config?.marketInfo?.display_text_1,
      config?.marketInfo?.title
    ].filter(Boolean);
    const identifier = displayTexts.join(' ').match(/\b(?:EIP|GIP|KIP|ERC|RIP|SIP|AIP|MIP|TIP)[-\s]?\d+\b/i)?.[0];

    if (identifier) return identifier.replace(/\s+/, '-').toUpperCase();

    const fallback = String(displayTexts[0] || 'this market')
      .replace(/^\s*if\s+/i, '')
      .replace(/[?.!]+$/, '')
      .trim();
    return fallback.length > 48 ? `${fallback.slice(0, 45).trimEnd()}…` : fallback;
  }, [
    marketData.display_title_1,
    marketData.display_title_0,
    marketData.title,
    config?.marketInfo?.display_text_1,
    config?.marketInfo?.title
  ]);

  const [selectedToken, setSelectedToken] = useState('currency');

  // Function to fetch dynamic market data from Supabase
  const fetchMarketData = async () => {
    // Don't fetch if config is not loaded yet - we'll get the data from useContractConfig instead
    if (!config || !config.marketInfo) {
      console.log('Config not loaded yet, skipping fetchMarketData');
      return;
    }

    try {
      console.log('Using market data from config:', config.marketInfo);
      console.log('Checking for display_text fields:', {
        display_text_0: config.marketInfo?.display_text_0,
        display_text_1: config.marketInfo?.display_text_1
      });
      setMarketData(prev => ({ ...prev, isLoading: true, error: null }));

      // Use the market info from useContractConfig hook instead of querying again
      const marketInfo = config.marketInfo;

      // Parse the market event data to extract display titles
      // Neutral fallbacks: a market without metadata shows its address, not
      // another market's title/description.
      const fallbackTitle = config?.MARKET_ADDRESS
        ? `Market ${config.MARKET_ADDRESS.slice(0, 6)}…${config.MARKET_ADDRESS.slice(-4)}`
        : 'Market';
      let parsedData = {
        display_title_0: marketInfo.title || fallbackTitle,
        display_title_1: "",
        title: marketInfo.title || fallbackTitle,
        description: marketInfo.description || "",
        question_title: marketInfo.title || null,
        question_link: normalizeRealityQuestionUrl(marketInfo.questionLink, config?.chainId) || null,
        isLoading: false,
        error: null
      };

      // Auto-generate Reality.eth link if not provided
      if (!parsedData.question_link && config?.MARKET_ADDRESS && config?.chainId) {
        try {
          const realityUrl = await getRealityQuestionUrl(config.chainId, config.MARKET_ADDRESS);
          if (realityUrl) {
            parsedData.question_link = realityUrl;
            console.log('[Reality] Auto-generated question link:', realityUrl);
          }
        } catch (e) {
          console.warn('[Reality] Failed to generate question link:', e);
        }
      }

      // First, try to use display_text_0 and display_text_1 from metadata if available
      if (marketInfo.display_text_0 && marketInfo.display_text_1) {
        parsedData.display_title_0 = marketInfo.display_text_0;
        parsedData.display_title_1 = marketInfo.display_text_1;
      } else if (marketInfo.title) {
        // Fallback: Try to split the title into two parts if it contains "if"
        const title = marketInfo.title;
        const ifIndex = title.toLowerCase().indexOf(' if ');

        if (ifIndex !== -1) {
          parsedData.display_title_0 = title.substring(0, ifIndex);
          parsedData.display_title_1 = "if " + title.substring(ifIndex + 4);
        } else {
          // If no "if" found, use the full title as display_title_0
          parsedData.display_title_0 = title;
          parsedData.display_title_1 = "";
        }
      }

      setMarketData(parsedData);

    } catch (error) {
      console.error('Failed to process market data from config:', error);
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to process market data'
      }));
    }
  };

  const checkAllowance = async () => {
    if (!address) return;

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const wxdaiContract = new ethers.Contract(
        DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS,
        WXDAI_ABI,
        provider
      );

      const allowance = await wxdaiContract.allowance(address, CONDITIONAL_TOKENS_ADDRESS);
      setIsApproved(allowance.gt(0));
    } catch (error) {
      console.error('Failed to check allowance:', error);
    }
  };

  // Check allowance when address changes
  useEffect(() => {
    if (address) {
      checkAllowance();
    }
  }, [address]);

  // Fetch market data when config is loaded
  useEffect(() => {
    if (config && config.marketInfo) {
      fetchMarketData();
    }
  }, [config]);

  // Surface config failures instead of leaving the hero stuck on
  // "Loading badges…" / "Loading description…" forever
  useEffect(() => {
    if (!configLoading && configError) {
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: configError.message || 'Market data unavailable'
      }));
    }
  }, [configLoading, configError]);

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

  // Add wagmi account change effect
  useEffect(() => {
    if (address) {
      checkAllowance();
      // Balance fetching is handled by useBalanceManager
    }
  }, [address, isConnected]);

  // Modal handlers
  const handleOpenCollateralModal = (type) => {
    console.log('Opening modal:', type);
    setCollateralModalType(type);
    setIsCollateralModalOpen(true);
  };

  const handleCloseCollateralModal = () => {
    setIsCollateralModalOpen(false);
    // A split or merge may have just landed: refresh now, not on the next poll
    refetchBalances();
    // Reset all states when closing modal
    setProcessingStep(null);
    setCurrentSubstep({ step: 1, substep: 0 });
  };

  // Add processing state
  const [processingStep, setProcessingStep] = useState(null);
  const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 0 });

  // Add click outside handler
  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself, not the modal
    if (e.target === e.currentTarget) {
      handleCloseCollateralModal();
    }
  };

  // Add handler for toast click
  const handleToastClick = () => {
    setIsCollateralModalOpen(true);
  };

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [currentTransactionData, setCurrentTransactionData] = useState(null);

  // Add handler for transaction completion
  const handleTransactionComplete = (transactionDetails) => {
    // Refresh balances or any other state that needs updating
    refetchBalances();
  };

  // Add selectedAction state
  const [selectedAction, setSelectedAction] = useState('buy');
  // Add selectedOutcome state
  const [selectedOutcome, setSelectedOutcome] = useState('approved');
  // Add amount state
  const [amount, setAmount] = useState('1');

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

  // Market end time falls back to the on-chain closeTimestamp when
  // config.marketInfo.endTime is not set.
  const marketEndTime = useMemo(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const close = meta?.closeTimestamp;
    return close ? Number(close) : null;
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

  // ---> State for pending order check (count instead of ID) <---
  const [isLoadingPendingOrder, setIsLoadingPendingOrder] = useState(false);
  // const [pendingOrderId, setPendingOrderId] = useState(null); // Remove single ID state
  const [pendingOrderCount, setPendingOrderCount] = useState(0); // Add count state
  const [showPendingOrderToast, setShowPendingOrderToast] = useState(false);

  // ---> useEffect to check for pending CoW orders <---
  useEffect(() => {
    const checkPendingCowOrders = async () => {
      if (!isConnected || !address) {
        setShowPendingOrderToast(false); // Hide toast if disconnected
        setPendingOrderCount(0); // Reset count
        return;
      }

      console.log('[Pending Order Check] Starting check for address:', address);
      setIsLoadingPendingOrder(true);
      setPendingOrderCount(0); // Reset before check
      setShowPendingOrderToast(false);

      try {
        const chainId = 100; // Gnosis Chain
        const cowSdk = new CowSdk(chainId);
        const ordersData = await cowSdk.cowApi.getOrders({ owner: address, limit: 10 }); // Limit query slightly

        console.log('[Pending Order Check] Received orders:', ordersData);

        // ---> Filter for all pending orders and get count <----
        const pendingOrders = ordersData.filter(order =>
          order.status === 'open' || order.status === 'submitted'
        );
        const count = pendingOrders.length;

        if (count > 0) {
          console.log(`[Pending Order Check] Found ${count} pending order(s).`);
          setPendingOrderCount(count);
          setShowPendingOrderToast(true);
        } else {
          console.log('[Pending Order Check] No pending orders found.');
          setPendingOrderCount(0);
          setShowPendingOrderToast(false);
        }

      } catch (error) {
        console.error('[Pending Order Check] Error checking for pending CoW orders:', error);
        // Don't show toast on error, just log it
        setPendingOrderCount(0);
        setShowPendingOrderToast(false);
      } finally {
        setIsLoadingPendingOrder(false);
      }
    };

    checkPendingCowOrders();

  }, [address, isConnected]);

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
                value={formatImpactPercent(computeImpactPercent(newYesPrice, newNoPrice), pricesUnavailable ? '—' : 'N/A')}
                valueClassName={(computeImpactPercent(newYesPrice, newNoPrice) ?? 0) >= 0 ? 'text-futarchyTeal7' : 'text-futarchyCrimson11'}
                Icon={ImpactIcon}
                isLoading={!pricesUnavailable && (newYesPrice === null || newNoPrice === null)}
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

                  // Resolve Question badge
                  if (marketData.question_link) {
                    badges.push({
                      text: 'Resolve Question',
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
