import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SHOW_DATA_DEBUG } from '../../../../config/featureFlags';
import { useAccount } from 'wagmi';
import dayjs from 'dayjs';
import { openTransactionInExplorer } from '../MarketHistoryViewModel';
import { useTradeHistory } from '../MarketHistoryViewModel';
import { Spinner } from './MarketTiming';

// Move TradeHistoryTable outside of MarketPageShowcase
// Update TradeHistoryTable to use TRADE_HISTORY_DATA
const TradeHistoryTable = React.memo(({ tokenImages = { company: null, currency: null }, config }) => {
  const [trades, setTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Rename hook variables to avoid conflict with local state
  const { trades: tradesFromHook, loading: loadingFromHook, error: errorFromHook, fetchTrades: fetchTradesFromHook } = useTradeHistory(config);
  const scrollContainerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const hasReceivedInitialHookData = useRef(false);

  // Add new state to prevent infinite retry loops
  const [hasAttemptedInitialLoad, setHasAttemptedInitialLoad] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const [forceShowData, setForceShowData] = useState(false);

  // Performance tracking
  const pipelineStartTime = useRef(null);

  //lets force after 1 second timeout re rneder compaone 

  //lets do it below


  // Get wallet connection state directly with different variable names
  const { address: walletAddress, isConnected: walletConnected } = useAccount();
  // Track previous connection state to detect changes
  const [prevConnected, setPrevConnected] = useState(walletConnected);
  const [prevAddress, setPrevAddress] = useState(walletAddress);

  // Track wallet connection changes and clear trades when wallet disconnects or address changes
  useEffect(() => {
    if (prevConnected && !walletConnected) {
      // Wallet was disconnected
      console.log('[TRADE_HISTORY_DEBUG] Wallet disconnected, clearing trades.');
      setTrades([]);
      setIsLoading(false);
      hasReceivedInitialHookData.current = false; // Reset for next connection
      setHasAttemptedInitialLoad(false); // Reset retry state
      setRetryCount(0);
      setForceShowData(false); // Reset force flag
    } else if (prevAddress && prevAddress !== walletAddress && walletConnected) {
      // Address changed while connected
      console.log('[TRADE_HISTORY_DEBUG] Wallet address changed, clearing trades and reloading.');
      setTrades([]);
      setIsLoading(true);
      hasReceivedInitialHookData.current = false; // Reset for new address
      setHasAttemptedInitialLoad(false); // Reset retry state
      setRetryCount(0);
      setForceShowData(false); // Reset force flag
      // loadTrades will be called by the useEffect that depends on loadTrades
    }

    setPrevConnected(walletConnected);
    setPrevAddress(walletAddress);
  }, [walletConnected, walletAddress, prevConnected, prevAddress]);

  // Debug log for hook data
  useEffect(() => {
    const hookDataChangeTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎣 HOOK: Hook data changed:', {
      tradesFromHook: tradesFromHook?.length,
      loadingFromHook,
      errorFromHook,
      hookLoadingChanged: loadingFromHook ? 'LOADING' : 'NOT_LOADING',
      timestamp: hookDataChangeTime.toFixed(2)
    });
  }, [tradesFromHook, loadingFromHook, errorFromHook]);

  // Debug log for loading states
  useEffect(() => {
    const stateChangeTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎛️ STATES: Loading states:', {
      isLoading,
      loadingFromHook,
      tradesLength: trades.length,
      hasAttemptedInitialLoad,
      retryCount,
      renderCondition: (isLoading || loadingFromHook),
      timestamp: stateChangeTime.toFixed(2)
    });
  }, [isLoading, loadingFromHook, trades.length, hasAttemptedInitialLoad, retryCount]);

  // Safety mechanism: Clear loading states if they're stuck but we have data
  useEffect(() => {
    if ((isLoading || loadingFromHook) && trades.length > 0) {
      console.log('[TRADE_HISTORY_DEBUG] Loading states stuck but we have trades! Force clearing loading states.');
      setIsLoading(false);
      setRetryCount(0);

      // Set a timer to force show data if hook loading state stays stuck
      const forceTimer = setTimeout(() => {
        if (loadingFromHook && trades.length > 0) {
          console.log('[TRADE_HISTORY_DEBUG] Hook loading stuck after 3 seconds - forcing data display');
          setForceShowData(true);
        }
      }, 3000);

      return () => clearTimeout(forceTimer);
    }
  }, [isLoading, loadingFromHook, trades.length]);

  // Add back the OutcomeBadge component
  const OutcomeBadge = ({ actionText, tradeType }) => { // Changed props
    // const [action, type] = outcome.split(' - '); // Removed this line

    // Define width classes to ensure consistent size
    const containerWidth = "w-[160px]";
    const halfWidth = "w-[80px]";

    return (
      <div className={`inline-flex overflow-hidden ${containerWidth}`}>
        {/* Yes/No part */}
        <div
          className={`${halfWidth} px-3 py-1 text-sm font-medium text-center ${actionText.toLowerCase() === 'yes' // Use actionText
            ? 'bg-futarchyBlue4 text-futarchyBlue11 border border-futarchyBlue6 rounded-l-full dark:bg-transparent dark:text-futarchyBlue9 dark:border-futarchyBlue9'
            : 'bg-futarchyGold4 text-futarchyGold11 border border-futarchyGold6 rounded-l-full dark:bg-transparent dark:text-futarchyGold7 dark:border-futarchyGold7'
            }`}
        >
          {actionText} {/* Use actionText */}
        </div>

        {/* Buy/Sell part */}
        <div
          className={`${halfWidth} px-3 py-1 text-sm font-medium text-center ${ // Ensure this line number matches if editing only this line, adjust context if needed
            (tradeType && tradeType.toLowerCase() === 'sell') // Use tradeType with a check
              ? 'bg-futarchyCrimson4 text-futarchyCrimson11 border border-futarchyCrimson6 rounded-r-full dark:bg-transparent dark:text-futarchyCrimson9 dark:border-futarchyCrimson9'
              : 'bg-futarchyTeal3 text-futarchyTeal9 border border-futarchyTeal5 rounded-r-full dark:bg-transparent dark:text-futarchyTeal7 dark:border-futarchyTeal7'
            }`}
        >
          {tradeType} {/* Use tradeType */}
        </div>
      </div>
    );
  };

  // Use useCallback to memoize the loadTrades function
  const loadTrades = useCallback(async (isInitialLoad = false) => {
    try {
      console.log(`[TRADE_HISTORY_DEBUG] loadTrades called. isInitialLoad: ${isInitialLoad}, walletConnected: ${walletConnected}, walletAddress: ${walletAddress}`);
      setIsLoading(true);

      // Check if wallet is connected before trying to fetch
      if (!walletConnected || !walletAddress) {
        console.log(`[TRADE_HISTORY_DEBUG] Wallet not connected or no address, skipping loadTrades. walletConnected: ${walletConnected}, walletAddress: ${walletAddress}`);
        setTrades([]);
        setIsLoading(false);
        setHasAttemptedInitialLoad(true); // Mark as attempted even if skipped
        return [];
      }

      // Mark that we've attempted initial load
      if (isInitialLoad) {
        setHasAttemptedInitialLoad(true);
      }

      // Fetch trades using the renamed fetchTradesFromHook
      // This initial fetch is still useful for hydration or if websockets fail
      // Start pipeline timing
      if (!pipelineStartTime.current) {
        pipelineStartTime.current = performance.now();
        console.log(`[TRADE_HISTORY_DEBUG] ⏱️ PIPELINE: Starting pipeline timer at ${pipelineStartTime.current.toFixed(2)}ms`);
      }

      console.log(`[TRADE_HISTORY_DEBUG] About to call fetchTradesFromHook for ${walletAddress}`);
      const rawTrades = await fetchTradesFromHook();
      console.log(`[TRADE_HISTORY_DEBUG] fetchTradesFromHook returned ${rawTrades?.length || 0} trades`);

      // If no trades returned but wallet is connected, this might be a timing issue
      if ((!rawTrades || rawTrades.length === 0) && walletConnected && walletAddress && isInitialLoad) {
        console.log(`[TRADE_HISTORY_DEBUG] No trades returned on initial load but wallet is connected. This might be a timing issue. Will retry.`);
        // Don't set empty trades immediately, let the hook's useEffect handle it
        setIsLoading(false);
        return [];
      }

      //const rawTrades =[];

      // Helper function to format small numbers
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      // Format timestamp for display
      const formatDisplayTimestamp = (timestampStr) => {
        // timestampStr is like "2025-05-28 11:40:25.000 UTC"
        // We want to display as "MM/DD HH:mm"
        return dayjs(timestampStr).format('MM/DD HH:mm');
      };

      const formattedTrades = rawTrades.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: formatDisplayTimestamp(trade.timestamp)
      }));
      const mockTrades = formattedTrades

      // Process mockTrades to include formatted fields, similar to how rawTrades would be processed
      const processedMockTrades = mockTrades.map(trade => ({
        ...trade,
        formattedTimestamp: formatDisplayTimestamp(trade.timestamp),
        isNew: false // For potential animation/highlighting
      }));

      console.log('DEBUG (TradeHistoryTable): Trades for display (from loadTrades):', processedMockTrades);
      setTrades(processedMockTrades); // Set the fully processed mock trades
      setRetryCount(0); // Reset retry count on successful trade load
      setIsLoading(false); // Set loading to false on successful load
      return processedMockTrades;
    } catch (err) {
      console.error('DEBUG (TradeHistoryTable): Error in loadTrades:', err);
      setError(err.message);
      setIsLoading(false); // Also set loading to false on error
      return [];
    }
  }, [fetchTradesFromHook, walletConnected, walletAddress, tokenImages]); // Added wallet state to dependencies

  // Effect to process and set trades when tradesFromHook changes (real-time updates)
  useEffect(() => {
    const uiProcessStartTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎨 UI: tradesFromHook changed, processing for UI update.');

    // If this is the first time we're getting data from the hook (initial load)
    if (tradesFromHook && tradesFromHook.length > 0 && !hasReceivedInitialHookData.current) {
      const initialDataProcessTime = performance.now();
      console.log('[TRADE_HISTORY_DEBUG] 📥 UI: Received initial data from hook, updating trades.');
      hasReceivedInitialHookData.current = true;

      // Format and set trades
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      const formatStartTime = performance.now();
      const formattedTradesFromHook = tradesFromHook.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: dayjs(trade.timestamp).format('MM/DD HH:mm')
      }));
      const formatEndTime = performance.now();

      console.log(`[TRADE_HISTORY_DEBUG] 🎛️ UI: Setting initial trades from hook: ${formattedTradesFromHook.length}. Format time: ${(formatEndTime - formatStartTime).toFixed(2)}ms`);
      const setUITradesStartTime = performance.now();
      setTrades(formattedTradesFromHook);
      setIsLoading(false);
      setRetryCount(0); // Reset retry count on successful data load
      setForceShowData(false); // Reset force flag since we have legitimate data
      const setUITradesEndTime = performance.now();

      // Calculate total pipeline time
      const totalPipelineTime = pipelineStartTime.current ? (setUITradesEndTime - pipelineStartTime.current) : 0;
      console.log(`[TRADE_HISTORY_DEBUG] ✨ UI: Initial trades set in UI. Set time: ${(setUITradesEndTime - setUITradesStartTime).toFixed(2)}ms`);
      console.log(`[TRADE_HISTORY_DEBUG] 🏁 PIPELINE: TOTAL TIME from start to UI: ${totalPipelineTime.toFixed(2)}ms`);

      // Reset pipeline timer
      pipelineStartTime.current = null;
    }
    // Only update local trades if tradesFromHook has actual data (for real-time updates)
    // Don't overwrite existing trades if tradesFromHook is empty
    else if (tradesFromHook && tradesFromHook.length > 0 && hasReceivedInitialHookData.current) {
      console.log('DEBUG (TradeHistoryTable): Real-time update detected, merging new trades.');

      // Helper function to format small numbers (can be moved to a utility if used elsewhere)
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      const formattedTradesFromHook = tradesFromHook.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: dayjs(trade.timestamp).format('MM/DD HH:mm')
      }));

      console.log('DEBUG (TradeHistoryTable): Processed trades from tradesFromHook for UI:', formattedTradesFromHook);

      // Instead of replacing all trades, merge with existing trades
      setTrades(prevTrades => {
        console.log('DEBUG (TradeHistoryTable): Current trades count:', prevTrades.length);
        console.log('DEBUG (TradeHistoryTable): New trades count from hook:', formattedTradesFromHook.length);

        // Check if we should replace entirely (if new trades list is significantly larger) 
        // or merge (if it's just a few new trades)
        if (formattedTradesFromHook.length > prevTrades.length) {
          // Likely a full refresh, replace entirely
          console.log('DEBUG (TradeHistoryTable): Full refresh detected, replacing all trades.');
          return formattedTradesFromHook;
        } else {
          // Likely new trades to add, merge them
          console.log('DEBUG (TradeHistoryTable): Merging new trades with existing trades.');

          // Create a map of existing trades by unique identifier
          const existingTradesMap = new Map();
          prevTrades.forEach(trade => {
            const key = `${trade.txHash}_${trade.eventId}`;
            existingTradesMap.set(key, trade);
          });

          // Add new trades that don't already exist
          const newTradesToAdd = [];
          formattedTradesFromHook.forEach(trade => {
            const key = `${trade.txHash}_${trade.eventId}`;
            if (!existingTradesMap.has(key)) {
              console.log('DEBUG (TradeHistoryTable): Adding new trade:', trade.txHash, trade.eventId);
              newTradesToAdd.push({ ...trade, isNew: true }); // Mark as new for potential highlighting
            } else {
              console.log('DEBUG (TradeHistoryTable): Trade already exists, skipping:', trade.txHash, trade.eventId);
            }
          });

          if (newTradesToAdd.length > 0) {
            // Merge and sort by timestamp (newest first)
            const mergedTrades = [...newTradesToAdd, ...prevTrades];
            mergedTrades.sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf());
            console.log('DEBUG (TradeHistoryTable): Merged trades total:', mergedTrades.length);
            setRetryCount(0); // Reset retry count when new trades are successfully added
            return mergedTrades;
          } else {
            console.log('DEBUG (TradeHistoryTable): No new trades to add.');
            return prevTrades;
          }
        }
      });
    } else if (tradesFromHook && tradesFromHook.length === 0 && !loadingFromHook) {
      // Only clear trades if hook is not loading and explicitly returned empty array
      // This could happen if user disconnects wallet or switches to account with no trades
      console.log('DEBUG (TradeHistoryTable): tradesFromHook is empty and not loading, this might be a wallet change.');
      hasReceivedInitialHookData.current = false; // Reset for next wallet connection
    } else {
      console.log('DEBUG (TradeHistoryTable): tradesFromHook is empty or undefined, keeping existing trades.');
    }

    // Always update error state if there's an error from the hook
    if (errorFromHook) {
      setError(errorFromHook);
    }
  }, [tradesFromHook, tokenImages, loadingFromHook, errorFromHook]);

  // Initial load of trades - only if hook hasn't provided data yet
  useEffect(() => {
    if (!hasReceivedInitialHookData.current && walletConnected && walletAddress && !loadingFromHook) {
      console.log('DEBUG (TradeHistoryTable): Initial loadTrades call from useEffect (hook has no data yet).');
      loadTrades(true); // Pass true for initial load
    } else {
      console.log('DEBUG (TradeHistoryTable): Skipping manual loadTrades - hook is handling it.', {
        hasReceivedInitialHookData: hasReceivedInitialHookData.current,
        walletConnected,
        walletAddress: !!walletAddress,
        loadingFromHook
      });
    }
  }, [loadTrades, hasReceivedInitialHookData, walletConnected, walletAddress, loadingFromHook]); // loadTrades is memoized

  // Add a separate effect to retry loading trades if initial load failed but wallet is connected
  useEffect(() => {
    if (walletConnected && walletAddress && trades.length === 0 && !isLoading && hasAttemptedInitialLoad && retryCount < MAX_RETRIES) {
      console.log(`[TRADE_HISTORY_DEBUG] Wallet connected but no trades displayed. Setting up retry timer. Retry count: ${retryCount}/${MAX_RETRIES}`);

      const retryTimeout = setTimeout(() => {
        console.log(`[TRADE_HISTORY_DEBUG] Retry timer triggered - attempting to reload trades. Retry: ${retryCount + 1}/${MAX_RETRIES}`);
        setRetryCount(prev => prev + 1);
        loadTrades(false); // Retry as non-initial load
      }, 2000 + (retryCount * 1000)); // Progressive delay: 2s, 3s, 4s

      return () => {
        console.log('DEBUG (TradeHistoryTable): Clearing retry timeout.');
        clearTimeout(retryTimeout);
      };
    }
  }, [walletConnected, walletAddress, trades.length, isLoading, loadTrades, hasAttemptedInitialLoad, retryCount, MAX_RETRIES]);

  // Add periodic refresh (every 30 seconds) when connected
  useEffect(() => {
    if (walletConnected && walletAddress) {
      const interval = setInterval(() => {
        console.log('DEBUG (TradeHistoryTable): Periodic trades refresh (calling loadTrades).');
        loadTrades(); // This will call fetchTradesFromHook
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [walletConnected, walletAddress, loadTrades]);

  // Add these handlers to the TradeHistoryTable component
  const handleWheel = (e) => {
    e.preventDefault(); // Prevent page scroll
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTop += e.deltaY;
  };

  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
    setScrollTop(scrollContainerRef.current.scrollTop);
  };

  const handleTouchMove = (e) => {
    e.preventDefault(); // Prevent page scroll on mobile
    const touch = e.touches[0];
    const container = scrollContainerRef.current;
    if (!container) return;

    const deltaY = touch.clientY - startY;
    container.scrollTop = scrollTop - deltaY;
  };

  // Add this SVG component at the top of TradeHistoryTable
  const ExternalLinkIcon = () => (
    <svg
      className="w-4 h-4 text-black dark:text-white hover:text-futarchyGray11 dark:hover:text-futarchyGray5 transition-colors"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-futarchyGray62 dark:border-futarchyDarkGray42">
      {/* Header */}
      <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-futarchyGray62 dark:border-futarchyDarkGray42 dark:bg-futarchyDarkGray3 h-[60px]">
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[200px]">Outcome</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[180px]">Amount</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[100px]">Price</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[220px]">Date</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Scrollable body with fade effect */}
      <div className="relative">
        {!walletConnected ? (
          <div className="py-8 text-center text-futarchyGray11">
            Connect wallet to view trade history
          </div>
        ) : (isLoading || (loadingFromHook && trades.length === 0 && !forceShowData)) ? (
          <div className="py-8 text-center text-futarchyGray11">
            {retryCount > 0 ? `Retrying... (${retryCount}/${MAX_RETRIES})` : 'Loading trades...'}
            {SHOW_DATA_DEBUG && <div className="text-xs mt-1 text-futarchyGray8">
              Local: {isLoading ? 'loading' : 'ready'} | Hook: {loadingFromHook ? 'loading' : 'ready'} | Trades: {trades.length} | Force: {forceShowData ? 'yes' : 'no'}
            </div>}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-futarchyCrimson11">
            Error loading trades: {error}
            {retryCount >= MAX_RETRIES && (
              <div className="text-xs mt-2">
                Max retries reached. Try switching tabs or refreshing the page.
              </div>
            )}
          </div>
        ) : trades.length === 0 ? (
          <div className="py-8 text-center text-futarchyGray11">
            {retryCount >= MAX_RETRIES ? (
              <div>
                <div>No trades found</div>
                <div className="text-xs mt-2 text-futarchyGray8">
                  Try switching tabs or refreshing the page if this persists.
                </div>
              </div>
            ) : (
              <Spinner />
            )}
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto overscroll-contain scroll-smooth"
            style={{
              height: '181px', // 60px * 3 rows + 1px border bottom for each row
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              scrollBehavior: 'smooth',
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const renderStartTime = performance.now();
              console.log(`[TRADE_HISTORY_DEBUG] 🖼️ RENDER: Starting to render ${trades.length} trades at ${renderStartTime.toFixed(2)}ms`);
              return null;
            })()}
            <table className="w-full">
              <tbody>

                {trades.map((trade, index) => (
                  <tr
                    key={`trade-${index}-${trade.txHash}`}
                    className="border-b border-futarchyGray62 dark:border-futarchyDarkGray42 hover:bg-futarchyGray3 dark:hover:bg-futarchyGray3/20 transition-colors h-[60px]"
                  >
                    <td className="px-4 w-[200px]">
                      <OutcomeBadge actionText={trade.outcome} tradeType={trade.type} />
                    </td>
                    <td className="px-4 w-[180px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                          {/* Image removed */}
                          {`${trade.amounts.in.value} ${trade.amounts.in.token}`}
                          <span className="text-futarchyTeal7 ml-1">in</span>
                        </span>
                        <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                          {/* Image removed */}
                          {`${trade.amounts.out.value} ${trade.amounts.out.token}`}
                          <span className="text-futarchyCrimson9 ml-1">out</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 w-[100px] text-right">
                      <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 block">{trade.price}</span>
                    </td>
                    <td className="px-4 w-[220px]">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">{trade.formattedTimestamp}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTransactionInExplorer(trade.txHash, config);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-futarchyGray4 dark:hover:bg-futarchyGray3/45 transition-colors"
                          title="View on Block Explorer"
                        >
                          <ExternalLinkIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if tokenImages or config change
  return JSON.stringify(prevProps.tokenImages) === JSON.stringify(nextProps.tokenImages) &&
    JSON.stringify(prevProps.config) === JSON.stringify(nextProps.config);
});

TradeHistoryTable.displayName = 'TradeHistoryTable';

export { TradeHistoryTable };
