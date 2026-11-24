/**
 * SubgraphTradesDataLayer.jsx
 * 
 * Alternative to RecentTradesDataLayer that fetches trades from The Graph subgraph.
 * Activated via ?tradeSource=subgraph URL parameter.
 * 
 * Features:
 * - Fetches swaps from subgraph using pool addresses
 * - Shows "Subgraph" badge
 * - 30s auto-refresh with countdown
 * - Resync button
 * - Last update timestamp
 * - No Supabase connection (completely isolated)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { fetchFormattedTrades, fetchPoolsForProposal } from '../../../utils/subgraphTradesClient';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';
import { SHOW_DATA_DEBUG } from '../../../config/featureFlags';
import { answerColor } from './CategoricalHistoryChart';

const REFRESH_INTERVAL = 45000; // 45 seconds

const SubgraphTradesDataLayer = ({
    config,
    tokenImages = { company: null, currency: null },
    showMyTrades = false,
    limit = 30,
    // Categorical proposals: answer of each outcome token (answerByToken);
    // trades then show their answer instead of YES/NO
    answers = null,
    // Every proposal whose pools the trades come from, when the market is a
    // family of chained proposals (utils/proposalFamily.js); default the page's
    proposalIds = null
}) => {
    const [trades, setTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
    const [isSyncing, setIsSyncing] = useState(false);

    const { address, isConnected } = useAccount();
    const intervalRef = useRef(null);
    const countdownRef = useRef(null);
    // The proposal's pool addresses once read (null until then). A ref, not
    // state: as state, every read of an empty list made a new array, which
    // recreated fetchTrades and ran it again at once, in a loop.
    const poolsRef = useRef(null);

    // Get proposalId from config
    const proposalId = config?.proposalId || config?.MARKET_ADDRESS;
    const proposalIdsKey = proposalIds?.join(',') ?? '';
    const chainId = config?.chainId || 100;

    // Fetch pools from subgraph first, then fetch swaps
    const fetchTrades = useCallback(async (showSyncIndicator = true) => {
        if (!proposalId) {
            // Config not ready yet - keep loading state, don't set error
            console.log('[SubgraphTradesDataLayer] Waiting for proposalId...');
            return;
        }

        if (showSyncIndicator) {
            setIsSyncing(true);
        }

        console.log('[SubgraphTradesDataLayer] Fetching trades:', {
            chainId,
            proposalId,
            showMyTrades,
            userAddress: showMyTrades ? address : null,
            limit
        });

        try {
            // Step 1: Get pools for this proposal from subgraph (if not already cached)
            // Read the pools again while there are none, so pools created
            // later show up on the next refresh.
            let pools = poolsRef.current;
            if (!pools?.length) {
                const ids = proposalIdsKey ? proposalIdsKey.split(',') : [proposalId];
                console.log('[SubgraphTradesDataLayer] Fetching pools for proposals:', ids);
                const poolsResults = await Promise.all(ids.map((id) => fetchPoolsForProposal(chainId, id)));
                const failed = poolsResults.find((result) => result.error);

                if (failed) {
                    setError(failed.error);
                    setIsLoading(false);
                    setIsSyncing(false);
                    return;
                }

                pools = poolsResults.flatMap((result) => result.pools.map(p => p.id));
                poolsRef.current = pools;
                console.log('[SubgraphTradesDataLayer] Found pools:', pools);
            }

            if (pools.length === 0) {
                console.warn('[SubgraphTradesDataLayer] No pools found for proposal');
                setError('No pools found for this proposal');
                setIsLoading(false);
                setIsSyncing(false);
                return;
            }

            // Step 2: Fetch swaps for these pools
            const result = await fetchFormattedTrades(
                chainId,
                pools,
                showMyTrades && address ? address : null,
                limit
            );

            if (result.error) {
                setError(result.error);
            } else {
                // SIMPLE: Just use the trades directly from subgraph
                // The subgraph GraphQL query already orders by timestamp desc
                console.log('[SubgraphTradesDataLayer] Received', result.trades.length, 'trades from subgraph');
                setTrades(result.trades);
                setError(null);
            }

            setLastUpdate(result.timestamp);
            setCountdown(REFRESH_INTERVAL / 1000);

        } catch (err) {
            console.error('[SubgraphTradesDataLayer] Fetch error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, [chainId, proposalId, proposalIdsKey, showMyTrades, address, limit]);

    // Another proposal, or a family's proposals arriving after the page's
    // own: read their pools again.
    useEffect(() => {
        poolsRef.current = null;
    }, [chainId, proposalId, proposalIdsKey]);

    // Initial fetch
    useEffect(() => {
        fetchTrades();
    }, [fetchTrades]);

    // Subscribe to context refresh triggers
    const { tradesRefreshKey } = useSubgraphRefresh();

    // React to external refresh triggers from context
    useEffect(() => {
        if (tradesRefreshKey > 0) {
            console.log('[SubgraphTradesDataLayer] External refresh triggered');
            fetchTrades(false); // silent refresh
        }
    }, [tradesRefreshKey, fetchTrades]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            fetchTrades(false); // Silent refresh
        }, REFRESH_INTERVAL);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchTrades]);

    // Countdown timer
    useEffect(() => {
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    return REFRESH_INTERVAL / 1000;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, []);

    // Manual resync
    const handleResync = () => {
        fetchTrades(true);
    };

    // Format date helper
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}`;
    };

    // Format "time ago"
    const formatTimeAgo = (timestamp) => {
        if (!timestamp) return 'never';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 5) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ago`;
    };

    // The answer a trade's pool belongs to, from either of its tokens. Token
    // IDs may carry a chain prefix ("100-0x…").
    const answerOf = (trade) => {
        if (!answers) return null;
        const key = (token) => token?.address?.replace(/^\d+-/, '').toLowerCase();
        return answers.get(key(trade.amount.tokenIN)) ?? answers.get(key(trade.amount.tokenOUT)) ?? null;
    };

    // ALWAYS sort trades by date descending (newest first) before rendering
    // This ensures correct order regardless of how the API returns them
    const sortedTrades = useMemo(() => {
        return [...trades].sort((a, b) => b.date - a.date);
    }, [trades]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyViolet9 mb-4"></div>
                    <p className="text-futarchyGray11 dark:text-futarchyGray112">{SHOW_DATA_DEBUG ? 'Loading from Subgraph...' : 'Loading trades...'}</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <p className="text-red-500 mb-2">Error loading trades</p>
                    <p className="text-sm text-futarchyGray11">{error}</p>
                    <button
                        onClick={handleResync}
                        className="mt-4 px-4 py-2 bg-futarchyViolet9 text-white rounded-lg hover:bg-futarchyViolet10"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // No trades
    if (sortedTrades.length === 0 && !isLoading) {
        return (
            <div className="relative">
                {/* Subgraph Status Bar */}
                {SHOW_DATA_DEBUG && <div className="flex items-center justify-between px-4 py-2 mb-2 bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-lg border border-futarchyGray62 dark:border-futarchyDarkGray42">
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-xs font-medium bg-futarchyTeal4 text-futarchyTeal11 dark:bg-futarchyTeal4/20 dark:text-futarchyTeal7 rounded-full border border-futarchyTeal6 dark:border-futarchyTeal7">
                            Subgraph
                        </span>
                        <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                            Updated {formatTimeAgo(lastUpdate)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112 tabular-nums">
                            {countdown}s
                        </span>
                        <button
                            onClick={handleResync}
                            disabled={isSyncing}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-futarchyGray11 dark:text-futarchyGray112 hover:text-futarchyViolet9 dark:hover:text-futarchyViolet7 transition-colors"
                        >
                            <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Resync
                        </button>
                    </div>
                </div>}
                <div className="flex items-center justify-center py-12 text-futarchyGray11 dark:text-futarchyGray112">
                    {showMyTrades && !isConnected
                        ? 'Connect wallet to view your trades'
                        : showMyTrades
                            ? 'You have no trades for this proposal'
                            : 'No trades found for this proposal'}
                </div>
            </div>
        );
    }

    // Render trades table
    return (
        <div className="relative">
            {/* Subgraph Status Bar */}
            {SHOW_DATA_DEBUG && <div className="flex items-center justify-between px-4 py-2 mb-2 bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-lg border border-futarchyGray62 dark:border-futarchyDarkGray42">
                <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 text-xs font-medium bg-futarchyTeal4 text-futarchyTeal11 dark:bg-futarchyTeal4/20 dark:text-futarchyTeal7 rounded-full border border-futarchyTeal6 dark:border-futarchyTeal7">
                        Subgraph
                    </span>
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                        Updated {formatTimeAgo(lastUpdate)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112 tabular-nums">
                        {countdown}s
                    </span>
                    <button
                        onClick={handleResync}
                        disabled={isSyncing}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-futarchyGray11 dark:text-futarchyGray112 hover:text-futarchyViolet9 dark:hover:text-futarchyViolet7 transition-colors"
                    >
                        <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Resync
                    </button>
                </div>
            </div>}

            {/* Desktop Table View */}
            <div className="hidden md:block rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                <div className="overflow-hidden rounded-xl border border-futarchyGray62 dark:border-futarchyDarkGray42">
                    <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b-2 border-futarchyGray62 dark:border-futarchyDarkGray42 dark:bg-futarchyDarkGray3 h-[60px]">
                                    <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[180px]">Outcome</th>
                                    {SHOW_DATA_DEBUG && <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[100px]">Type</th>}
                                    <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[180px]">Amount</th>
                                    <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[100px]">Price</th>
                                    <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[140px]">Date</th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                    <div className="relative">
                        <div className="overflow-y-auto overscroll-contain scroll-smooth" style={{ height: '400px', scrollbarWidth: 'none', scrollBehavior: 'smooth' }}>
                            <table className="w-full">
                                <tbody>
                                    {sortedTrades.map((trade, index) => {
                                        const eventSideLower = (trade.outcome.eventSide || '').toLowerCase();
                                        const isYes = eventSideLower === 'yes';
                                        const isNo = eventSideLower === 'no';
                                        const isBuy = trade.outcome.operationSide === 'buy';
                                        const answer = answerOf(trade);
                                        const answerStyle = answer ? { color: answerColor(answer.index), borderColor: answerColor(answer.index) } : undefined;

                                        return (
                                            <tr
                                                key={trade.id || index}
                                                className="border-b border-futarchyGray62 dark:border-futarchyDarkGray42 hover:bg-futarchyGray3 dark:hover:bg-futarchyGray3/20 transition-all duration-500 h-[60px]"
                                            >
                                                <td className="px-4 w-[200px]">
                                                    <div className="flex flex-col gap-1">
                                                        <div className={`inline-flex overflow-hidden ${answer ? 'max-w-[200px]' : 'w-[160px]'}`}>
                                                            {answer ? (
                                                                <div className="max-w-[120px] truncate px-3 py-1 text-sm font-medium text-center rounded-l-full border" style={answerStyle} title={answer.label}>
                                                                    {answer.label}
                                                                </div>
                                                            ) : <div className={`w-[80px] px-3 py-1 text-sm font-medium text-center rounded-l-full ${isYes
                                                                ? 'bg-futarchyBlue4 text-futarchyBlue11 border border-futarchyBlue6 dark:bg-transparent dark:text-futarchyBlue9 dark:border-futarchyBlue9'
                                                                : isNo
                                                                    ? 'bg-futarchyGold4 text-futarchyGold11 border border-futarchyGold6 dark:bg-transparent dark:text-futarchyGold7 dark:border-futarchyGold7'
                                                                    : 'bg-futarchyGray4 text-futarchyGray11 border border-futarchyGray6 dark:bg-transparent dark:text-futarchyGray9 dark:border-futarchyGray9'
                                                                }`}>
                                                                {trade.outcome.eventSide.toUpperCase()}
                                                            </div>}
                                                            <div className={`shrink-0 w-[80px] px-3 py-1 text-sm font-medium text-center rounded-r-full ${!isBuy
                                                                ? 'bg-futarchyTeal3 text-futarchyTeal9 border border-futarchyTeal5 dark:bg-transparent dark:text-futarchyTeal7 dark:border-futarchyTeal7'
                                                                : 'bg-futarchyCrimson4 text-futarchyCrimson11 border border-futarchyCrimson6 dark:bg-transparent dark:text-futarchyCrimson9 dark:border-futarchyCrimson9'
                                                                }`}>
                                                                {trade.outcome.operationSide === 'buy' ? 'sell' : 'buy'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {SHOW_DATA_DEBUG && <td className="px-4 w-[100px]">
                                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${trade.poolType === 'PREDICTION'
                                                        ? 'bg-futarchyViolet4 text-futarchyViolet11 border border-futarchyViolet6 dark:bg-transparent dark:text-futarchyViolet7 dark:border-futarchyViolet7'
                                                        : trade.poolType === 'CONDITIONAL'
                                                            ? 'bg-futarchyTeal4 text-futarchyTeal11 border border-futarchyTeal6 dark:bg-transparent dark:text-futarchyTeal7 dark:border-futarchyTeal7'
                                                            : 'bg-futarchyGray4 text-futarchyGray11 border border-futarchyGray6'
                                                        }`}>
                                                        {trade.poolType || 'UNKNOWN'}
                                                    </span>
                                                </td>}
                                                <td className="px-4 w-[180px]">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-semibold text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                                                            {trade.amount.tokenIN.value} {trade.amount.tokenIN.symbol}
                                                            <span className="text-futarchyTeal7 ml-1">in</span>
                                                        </span>
                                                        <span className="text-xs font-semibold text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                                                            {trade.amount.tokenOUT.value} {trade.amount.tokenOUT.symbol}
                                                            <span className="text-futarchyCrimson9 ml-1">out</span>
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 w-[100px] text-right">
                                                    <span style={answer ? { color: answerColor(answer.index) } : undefined} className={`text-xs font-semibold block ${isYes
                                                        ? 'text-futarchyBlue9'
                                                        : isNo
                                                            ? 'text-futarchyGold9'
                                                            : 'text-futarchyGray12 dark:text-futarchyGray112'
                                                        }`}>
                                                        {trade.price}
                                                    </span>
                                                </td>
                                                <td className="px-4 w-[220px]">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112">
                                                            {formatDate(trade.date)}
                                                        </span>
                                                        {trade.transactionLink && (
                                                            <a
                                                                href={trade.transactionLink}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-futarchyGray11 hover:text-futarchyViolet9 dark:text-futarchyGray112 dark:hover:text-futarchyViolet7"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                </svg>
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-2">
                {sortedTrades.map((trade, index) => {
                    const eventSideLower = (trade.outcome.eventSide || '').toLowerCase();
                    const isYes = eventSideLower === 'yes';
                    const isNo = eventSideLower === 'no';
                    const isBuy = trade.outcome.operationSide === 'buy';
                    const answer = answerOf(trade);

                    return (
                        <div
                            key={trade.id || index}
                            className="p-3 rounded-lg border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray3 dark:bg-futarchyDarkGray3"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex gap-1">
                                    {answer ? (
                                        <span className="max-w-[160px] truncate px-2 py-0.5 text-xs font-medium rounded-full border" style={{ color: answerColor(answer.index), borderColor: answerColor(answer.index) }} title={answer.label}>
                                            {answer.label}
                                        </span>
                                    ) : <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${isYes
                                        ? 'bg-futarchyBlue4 text-futarchyBlue11 dark:bg-transparent dark:text-futarchyBlue9 border border-futarchyBlue6 dark:border-futarchyBlue9'
                                        : isNo
                                            ? 'bg-futarchyGold4 text-futarchyGold11 dark:bg-transparent dark:text-futarchyGold7 border border-futarchyGold6 dark:border-futarchyGold7'
                                            : 'bg-futarchyGray4 text-futarchyGray11 border border-futarchyGray6'
                                        }`}>
                                        {trade.outcome.eventSide.toUpperCase()}
                                    </span>}
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${!isBuy
                                        ? 'bg-futarchyTeal3 text-futarchyTeal9 border border-futarchyTeal5'
                                        : 'bg-futarchyCrimson4 text-futarchyCrimson11 border border-futarchyCrimson6'
                                        }`}>
                                        {trade.outcome.operationSide}
                                    </span>
                                </div>
                                <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                                    {formatDate(trade.date)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="text-xs">
                                    <span className="text-futarchyGray12 dark:text-futarchyGray112">
                                        {trade.amount.tokenIN.value} {trade.amount.tokenIN.symbol}
                                    </span>
                                    <span className="text-futarchyGray11 mx-1">→</span>
                                    <span className="text-futarchyGray12 dark:text-futarchyGray112">
                                        {trade.amount.tokenOUT.value} {trade.amount.tokenOUT.symbol}
                                    </span>
                                </div>
                                <span style={answer ? { color: answerColor(answer.index) } : undefined} className={`text-xs font-semibold ${isYes ? 'text-futarchyBlue9' : isNo ? 'text-futarchyGold9' : ''}`}>
                                    {trade.price}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SubgraphTradesDataLayer;
