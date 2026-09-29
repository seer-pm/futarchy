import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAllBalancesAndPositions } from '../utils/unifiedBalanceFetcher';
import { mergeWithLastKnown, describeFailedReads } from '../utils/balanceReadState';

// null = "not loaded yet", never '0' (which means "zero balance")
const EMPTY_BALANCES = {
  currency: null,
  company: null,
  native: null,
  currencyYes: null,
  currencyNo: null,
  companyYes: null,
  companyNo: null,
  wrappedCurrencyYes: null,
  wrappedCurrencyNo: null,
  wrappedCompanyYes: null,
  wrappedCompanyNo: null,
  totalCurrencyYes: null,
  totalCurrencyNo: null,
  totalCompanyYes: null,
  totalCompanyNo: null,
};

const useBalanceManager = (config, address, isConnected) => {
  // Read balances on the market's chain, not the wallet's: the token addresses
  // in config only exist there, and quotes already use config.chainId.
  const chainId = config?.chainId || 100; // Default to Gnosis

  console.log('[BALANCE] Hook initialized with:', {
    hasConfig: !!config,
    address: !!address,
    isConnected,
    chainId
  });

  // Memoize config to prevent unnecessary re-renders
  const stableConfig = useMemo(() => {
    console.log('[BALANCE] Computing stableConfig:', {
      hasConfig: !!config,
      hasBaseTokensConfig: !!config?.BASE_TOKENS_CONFIG,
      hasMergeConfig: !!config?.MERGE_CONFIG,
      hasConditionalTokensAddress: !!config?.CONDITIONAL_TOKENS_ADDRESS
    });
    
    if (!config?.BASE_TOKENS_CONFIG || !config?.MERGE_CONFIG || !config?.CONDITIONAL_TOKENS_ADDRESS) {
      console.log('[BALANCE] stableConfig is null - missing required config parts');
      return null;
    }
    console.log('[BALANCE] stableConfig created successfully');
    return {
      BASE_TOKENS_CONFIG: config.BASE_TOKENS_CONFIG,
      MERGE_CONFIG: config.MERGE_CONFIG,
      CONDITIONAL_TOKENS_ADDRESS: config.CONDITIONAL_TOKENS_ADDRESS
    };
  }, [config?.BASE_TOKENS_CONFIG, config?.MERGE_CONFIG, config?.CONDITIONAL_TOKENS_ADDRESS]);

  // IMPORTANT: Use null for initial state, NOT '0'
  // null = "not loaded yet" -> shows loading spinner
  // '0' = "user has zero balance" -> shows 0.00 (SCARY!)
  const [balances, setBalances] = useState(EMPTY_BALANCES);
  
  // Start with loading true if we have a wallet connected
  const [isLoading, setIsLoading] = useState(true); // Internal loading state - starts true
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false); // Track if we've loaded at least once
  const [error, setError] = useState(null);

  // Each fetch takes a ticket; a response whose ticket is no longer the
  // latest (the account or chain changed, or a newer fetch started) is
  // dropped so it cannot overwrite the current account's balances.
  const requestIdRef = useRef(0);

  // UI loading state - true during initial load (before first successful fetch)
  const isLoadingForUI = !hasInitiallyLoaded && isConnected && !!address && !!stableConfig;

  console.log('[BALANCE] Current state:', { 
    isLoading: isLoadingForUI, 
    hasInitiallyLoaded,
    hasBalances: Object.keys(balances).length > 0,
    error: !!error 
  });

  // Removed helper functions - now handled by unifiedBalanceFetcher

  // Main balance fetching function using unified fetcher
  const fetchAllBalances = useCallback(async () => {
    console.log('[BALANCE] 🔍 fetchAllBalances called with:', {
      isConnected,
      address: !!address,
      hasStableConfig: !!stableConfig,
      fullConfig: !!config
    });

    if (!isConnected || !address || !stableConfig) {
      console.log('[BALANCE] ❌ Cannot fetch balances: missing requirements', {
        isConnected,
        address: !!address,
        hasStableConfig: !!stableConfig
      });
      setIsLoading(false);
      return;
    }

    console.log('[BALANCE] ✅ All requirements met, starting balance fetch with unified fetcher...');
    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    try {
      // Use the unified fetcher with getBestRpc system
      const { failedReads, totalReads, ...formattedBalances } = await fetchAllBalancesAndPositions(
        stableConfig,
        address,
        chainId
      );

      if (requestId !== requestIdRef.current) {
        console.log('[BALANCE] ⏭️ Dropping stale balance response');
        return;
      }

      console.log('[BALANCE] ✅ Balances fetched via unified system:', formattedBalances);
      // Reads that failed come back null: keep the last value we read for
      // them rather than showing the user a zero balance.
      setBalances(prev => mergeWithLastKnown(prev, formattedBalances));
      setError(describeFailedReads(failedReads, totalReads));

    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error('[BALANCE] ❌ Error fetching balances:', error);
      // Keep the last known balances; the error tells the UI they may be stale.
      setError(error.message || "Couldn't load balances");
    } finally {
      if (requestId === requestIdRef.current) {
        console.log('[BALANCE] 🏁 Balance fetch completed');
        setIsLoading(false);
        setHasInitiallyLoaded(true);
      }
    }
  }, [isConnected, address, stableConfig, chainId]);

  // Start from a clean slate whenever the account, chain or connection
  // changes, so the previous account's balances are never shown for the new
  // one, and drop any response still in flight for the old one.
  useEffect(() => {
    console.log('[BALANCE] 🔗 Account or chain changed, resetting balances:', { isConnected, chainId });
    requestIdRef.current += 1;
    setBalances(EMPTY_BALANCES);
    setError(null);
    setHasInitiallyLoaded(false);
    setIsLoading(!!isConnected);
  }, [isConnected, address, chainId]);

  // Fetch balances when dependencies change
  useEffect(() => {
    console.log('[BALANCE] ⚡ Dependencies changed, checking if should fetch balances:', {
      isConnected,
      address: !!address,
      hasStableConfig: !!stableConfig
    });
    
    if (isConnected && address && stableConfig) {
      console.log('[BALANCE] 🎯 All conditions met, calling fetchAllBalances');
      fetchAllBalances();
    } else {
      console.log('[BALANCE] ⏸️ Conditions not met, not fetching balances');
    }
  }, [isConnected, address, stableConfig, fetchAllBalances]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (isConnected && address && stableConfig) {
      console.log('[BALANCE] ⏰ Setting up auto-refresh interval');
      const interval = setInterval(fetchAllBalances, 15000);
      return () => {
        console.log('[BALANCE] 🛑 Clearing auto-refresh interval');
        clearInterval(interval);
      };
    }
  }, [isConnected, address, stableConfig, fetchAllBalances]);

  console.log('[BALANCE] 🔄 Returning hook result:', {
    balances: Object.keys(balances).reduce((acc, key) => ({ ...acc, [key]: balances[key] }), {}),
    isLoading: isLoadingForUI,
    hasInitiallyLoaded,
    error: !!error
  });

  return {
    balances,
    isLoading: isLoadingForUI, // Only show loading during initial load
    hasInitiallyLoaded,
    error,
    refetch: fetchAllBalances
  };
};

export { useBalanceManager }; 