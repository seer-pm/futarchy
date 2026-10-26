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

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Badge from '../../ui/Badge';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { fetchFormattedTrades, fetchPoolsForProposal } from '../../../utils/subgraphTradesClient';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';
import { SHOW_DATA_DEBUG } from '../../../config/featureFlags';

const REFRESH_INTERVAL = 45000; // 45 seconds

const SubgraphTradesDataLayer = ({
    config,
    tokenImages = { company: null, currency: null },
    showMyTrades = false,
    limit = 30
}) => {
    const [trades, setTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
    const [isSyncing, setIsSyncing] = useState(false);
    const [poolAddresses, setPoolAddresses] = useState([]);

    const { address, isConnected } = useAccount();
    const intervalRef = useRef(null);
    const countdownRef = useRef(null);
    const poolsFetchedRef = useRef(false);

    // Get proposalId from config
    const proposalId = config?.proposalId || config?.MARKET_ADDRESS;
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
            let pools = poolAddresses;
            if (pools.length === 0 || !poolsFetchedRef.current) {
                console.log('[SubgraphTradesDataLayer] Fetching pools for proposal:', proposalId);
                const poolsResult = await fetchPoolsForProposal(chainId, proposalId);

                if (poolsResult.error) {
                    setError(poolsResult.error);
                    setIsLoading(false);
                    setIsSyncing(false);
                    return;
                }

                pools = poolsResult.pools.map(p => p.id);
                setPoolAddresses(pools);
                poolsFetchedRef.current = true;
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
    }, [chainId, proposalId, poolAddresses, showMyTrades, address, limit]);

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
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-seer-border border-t-seer-purple mb-3" aria-hidden="true"></div>
                    <p className="text-sm text-seer-muted">{SHOW_DATA_DEBUG ? 'Loading from Subgraph...' : 'Loading trades...'}</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <p className="text-seer-negative font-semibold mb-2">Error loading trades</p>
                    <p className="text-sm text-seer-muted">{error}</p>
                    <button
                        onClick={handleResync}
                        className="mt-4 seer-button seer-button-secondary"
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
                {SHOW_DATA_DEBUG && <div className="flex items-center justify-between px-4 py-2 mb-2 bg-seer-surface-raised rounded-surface border border-seer-border">
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-xs font-semibold bg-seer-accent-soft text-seer-accent-text rounded-control">
                            Subgraph
                        </span>
                        <span className="text-xs text-seer-muted">
                            Updated {formatTimeAgo(lastUpdate)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-seer-muted tabular-nums">
                            {countdown}s
                        </span>
                        <button
                            onClick={handleResync}
                            disabled={isSyncing}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-seer-muted hover:text-seer-accent-text transition-colors"
                        >
                            <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Resync
                        </button>
                    </div>
                </div>}
                <div className="flex items-center justify-center py-12 text-sm text-seer-muted">
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
            {SHOW_DATA_DEBUG && <div className="flex items-center justify-between px-4 py-2 mb-2 bg-seer-surface-raised rounded-surface border border-seer-border">
                <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-seer-accent-soft text-seer-accent-text rounded-control">
                        Subgraph
                    </span>
                    <span className="text-xs text-seer-muted">
                        Updated {formatTimeAgo(lastUpdate)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-seer-muted tabular-nums">
                        {countdown}s
                    </span>
                    <button
                        onClick={handleResync}
                        disabled={isSyncing}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-seer-muted hover:text-seer-accent-text transition-colors"
                    >
                        <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Resync
                    </button>
                </div>
            </div>}

            {/* Desktop table: one surface, hairline rows, the header pinned while the rows scroll. */}
            <div className="hidden md:block rounded-surface border border-seer-border bg-seer-surface overflow-hidden">
                <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: '420px' }}>
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-seer-surface">
                            <tr className="border-b border-seer-border">
                                <th scope="col" className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-seer-muted">Outcome</th>
                                {SHOW_DATA_DEBUG && <th scope="col" className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-seer-muted">Type</th>}
                                <th scope="col" className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-seer-muted">Amount</th>
                                <th scope="col" className="h-11 px-4 text-right text-xs font-semibold uppercase tracking-wide text-seer-muted">Price</th>
                                <th scope="col" className="h-11 px-4 text-right text-xs font-semibold uppercase tracking-wide text-seer-muted">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-seer-border">
                            {sortedTrades.map((trade, index) => {
                                const eventSideLower = (trade.outcome.eventSide || '').toLowerCase();
                                const isYes = eventSideLower === 'yes';
                                const isNo = eventSideLower === 'no';
                                const isBuy = trade.outcome.operationSide === 'buy';

                                return (
                                    <tr key={trade.id || index} className="hover:bg-seer-surface-raised transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-2">
                                                <Badge tone={isYes ? 'pass' : isNo ? 'fail' : 'neutral'}>{trade.outcome.eventSide.toUpperCase()}</Badge>
                                                <span className={`text-[13px] font-semibold ${!isBuy ? 'text-seer-positive' : 'text-seer-negative'}`}>
                                                    {trade.outcome.operationSide === 'buy' ? 'sell' : 'buy'}
                                                </span>
                                            </span>
                                        </td>
                                        {SHOW_DATA_DEBUG && <td className="px-4 py-3">
                                            <Badge tone={trade.poolType === 'PREDICTION' ? 'accent' : 'neutral'}>{trade.poolType || 'UNKNOWN'}</Badge>
                                        </td>}
                                        <td className="px-4 py-3">
                                            <span className="flex flex-col gap-0.5 text-[13px] tabular-nums text-seer-text whitespace-nowrap">
                                                <span>{trade.amount.tokenIN.value} {trade.amount.tokenIN.symbol} <span className="text-seer-muted">in</span></span>
                                                <span>{trade.amount.tokenOUT.value} {trade.amount.tokenOUT.symbol} <span className="text-seer-muted">out</span></span>
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-right text-[13px] font-semibold tabular-nums ${isYes ? 'text-pass-text' : isNo ? 'text-fail-text' : 'text-seer-text'}`}>
                                            {trade.price}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center justify-end gap-2 text-[13px] tabular-nums text-seer-muted">
                                                {formatDate(trade.date)}
                                                {trade.transactionLink && (
                                                    <a
                                                        href={trade.transactionLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-label="View transaction"
                                                        className="text-seer-muted hover:text-seer-accent-text"
                                                    >
                                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" aria-hidden="true" />
                                                    </a>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Phone: one row per trade on the same surface, the side read the same way as above. */}
            <ul className="md:hidden max-h-[480px] overflow-y-auto overscroll-contain rounded-surface border border-seer-border bg-seer-surface divide-y divide-seer-border">
                {sortedTrades.map((trade, index) => {
                    const eventSideLower = (trade.outcome.eventSide || '').toLowerCase();
                    const isYes = eventSideLower === 'yes';
                    const isNo = eventSideLower === 'no';
                    const isBuy = trade.outcome.operationSide === 'buy';

                    return (
                        <li key={trade.id || index} className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-2">
                                    <Badge tone={isYes ? 'pass' : isNo ? 'fail' : 'neutral'}>{trade.outcome.eventSide.toUpperCase()}</Badge>
                                    <span className={`text-[13px] font-semibold ${!isBuy ? 'text-seer-positive' : 'text-seer-negative'}`}>
                                        {trade.outcome.operationSide === 'buy' ? 'sell' : 'buy'}
                                    </span>
                                </span>
                                <span className="text-xs tabular-nums text-seer-muted">{formatDate(trade.date)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[13px] tabular-nums">
                                <span className="text-seer-text">
                                    {trade.amount.tokenIN.value} {trade.amount.tokenIN.symbol}
                                    <span className="text-seer-muted mx-1" aria-label="to">→</span>
                                    {trade.amount.tokenOUT.value} {trade.amount.tokenOUT.symbol}
                                </span>
                                <span className={`font-semibold ${isYes ? 'text-pass-text' : isNo ? 'text-fail-text' : 'text-seer-text'}`}>{trade.price}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default SubgraphTradesDataLayer;
