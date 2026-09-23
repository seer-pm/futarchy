'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SUBGRAPH_ENDPOINTS } from '../config/subgraphEndpoints';
import { fetchConditionalPools } from '../services/conditionalPools';

// Build queries for the Checkpoint indexer (no BigInt scalar; candles aren't
// a reverse field on Pool; proposal/pool are flat string IDs that the
// /candles/graphql proxy chain-prefixes when matched as inline literals).
//
// We inline the proposal ID and pool IDs as string literals so the proxy
// regex (which only rewrites literals like `proposal: "0x…"`) picks them
// up — variables like $proposalId aren't in the proxy's prefix list.
function buildCandlesQuery(poolIds, limit, closeTimestamp) {
    const idList = poolIds.map(id => `"${id}"`).join(', ');
    return `{
      candles(
        first: ${limit},
        orderBy: periodStartUnix,
        orderDirection: desc,
        where: { pool_in: [${idList}], period: 3600, periodStartUnix_lte: ${closeTimestamp} }
      ) {
        pool { id }
        periodStartUnix
        period
        open
        high
        low
        close
      }
    }`;
}

// Module-level cache to prevent double fetches from React Strict Mode
const fetchCache = new Map();

/**
 * Execute a GraphQL query against a subgraph
 */
async function executeQuery(endpoint, query, variables = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
        throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
}

/**
 * Adapt candles to chart-compatible format
 * Deduplicates timestamps, sorts chronologically, and FILLS MISSING HOURS
 * by carrying forward the previous close price (lightweight-charts requires unique ascending times)
 */
function adaptCandlesToChartFormat(candles) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
        return [];
    }

    // 1. Map and filter valid candles
    const mapped = candles
        .map(candle => ({
            time: parseInt(candle.periodStartUnix, 10),
            value: parseFloat(candle.close)
        }))
        .filter(point => !isNaN(point.time) && !isNaN(point.value));

    if (mapped.length === 0) return [];

    // 2. Sort chronologically (oldest first)
    mapped.sort((a, b) => a.time - b.time);

    // 3. Deduplicate - keep the LAST entry for each timestamp
    const uniqueByTime = new Map();
    for (const point of mapped) {
        uniqueByTime.set(point.time, point);
    }
    const uniquePoints = Array.from(uniqueByTime.values()).sort((a, b) => a.time - b.time);

    if (uniquePoints.length === 0) return [];

    // 4. Fill in missing hours (1 hour = 3600 seconds)
    const HOUR_SECONDS = 3600;
    const filled = [];
    const startTime = uniquePoints[0].time;
    const endTime = uniquePoints[uniquePoints.length - 1].time;

    // Create a lookup map for quick access
    const pointMap = new Map(uniquePoints.map(p => [p.time, p.value]));

    let lastValue = uniquePoints[0].value;
    for (let t = startTime; t <= endTime; t += HOUR_SECONDS) {
        if (pointMap.has(t)) {
            lastValue = pointMap.get(t);
        }
        filled.push({ time: t, value: lastValue });
    }

    return filled;
}

/**
 * Hook to fetch chart data from subgraph
 * Uses module-level cache to handle React Strict Mode double-mounting
 */
export function useSubgraphData(proposalId, chainId, candleLimit = 500, closeTimestamp = null) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        yesData: [],
        noData: [],
        yesPrice: null,
        noPrice: null,
        yesPool: null,
        noPool: null,
        hasData: false,
        lastUpdated: null
    });

    // Unique key for this proposal/chain combo
    const cacheKey = `${proposalId}-${chainId}`;

    // Track mounted state to avoid state updates after unmount
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const endpoint = SUBGRAPH_ENDPOINTS[chainId];

    // The fetch function - uses cache to prevent duplicates
    const doFetch = useCallback(async (silent = false) => {
        if (!proposalId || !endpoint) {
            setError(proposalId ? `Chain ${chainId} is not supported` : 'No proposal ID provided');
            return;
        }

        // Check if there's an in-flight request for this key
        const cached = fetchCache.get(cacheKey);
        if (cached?.inFlight) {
            console.log('[useSubgraphData] Request in flight, waiting...');
            try {
                const result = await cached.promise;
                if (mountedRef.current) {
                    setData(result);
                }
            } catch (err) {
                if (mountedRef.current) {
                    setError(err.message);
                }
            }
            return;
        }

        if (!silent) {
            setLoading(true);
        }
        setError(null);

        // Create promise and cache it
        const fetchPromise = (async () => {
            try {
                // Step 1 — fetch CONDITIONAL pools for this proposal. Shared
                // with the trades panel, which needs the same list.
                const pools = await fetchConditionalPools(chainId, proposalId);
                const yesPool = pools.find(p => p.outcomeSide === 'YES') || null;
                const noPool = pools.find(p => p.outcomeSide === 'NO') || null;

                if (!yesPool && !noPool) {
                    const emptyResult = {
                        yesData: [],
                        noData: [],
                        yesPrice: null,
                        noPrice: null,
                        yesPool: null,
                        noPool: null,
                        hasData: false,
                        lastUpdated: new Date()
                    };
                    return emptyResult;
                }

                // Step 2 — fetch candles for those pools in one batched query.
                // Checkpoint has no Pool.candles reverse field, so we query
                // candles directly and group by pool address.
                const poolIds = [yesPool, noPool].filter(Boolean).map(p => p.id);
                const candlesCutoff = closeTimestamp
                    ? Number(closeTimestamp)
                    : Math.floor(Date.now() / 1000);

                const candlesData = await executeQuery(
                    endpoint,
                    buildCandlesQuery(poolIds, candleLimit, candlesCutoff)
                );

                const yesCandles = [];
                const noCandles = [];
                const yesId = (yesPool?.id || '').toLowerCase();
                const noId = (noPool?.id || '').toLowerCase();
                for (const c of candlesData.candles || []) {
                    const poolAddr = (c.pool?.id || '').toLowerCase();
                    if (poolAddr === yesId) yesCandles.push(c);
                    else if (poolAddr === noId) noCandles.push(c);
                }

                const yesData = adaptCandlesToChartFormat(yesCandles);
                const noData = adaptCandlesToChartFormat(noCandles);

                // Get latest prices from the last candle (pure data, no artificial live candle)
                const yesPrice = yesData.length > 0
                    ? yesData[yesData.length - 1].value
                    : (yesPool ? parseFloat(yesPool.price) : null);
                const noPrice = noData.length > 0
                    ? noData[noData.length - 1].value
                    : (noPool ? parseFloat(noPool.price) : null);

                return {
                    yesData,
                    noData,
                    yesPrice,
                    noPrice,
                    yesPool: yesPool ? {
                        address: yesPool.id,
                        name: yesPool.name,
                        outcomeSide: yesPool.outcomeSide,
                        price: parseFloat(yesPool.price)
                    } : null,
                    noPool: noPool ? {
                        address: noPool.id,
                        name: noPool.name,
                        outcomeSide: noPool.outcomeSide,
                        price: parseFloat(noPool.price)
                    } : null,
                    hasData: yesData.length > 0 || noData.length > 0,
                    lastUpdated: new Date()
                };
            } finally {
                // Clear cache entry when done
                const entry = fetchCache.get(cacheKey);
                if (entry) {
                    entry.inFlight = false;
                }
            }
        })();

        // Store in cache
        fetchCache.set(cacheKey, { inFlight: true, promise: fetchPromise });

        try {
            const result = await fetchPromise;
            if (mountedRef.current) {
                setData(result);
            }
        } catch (err) {
            console.error('[useSubgraphData] Error:', err);
            if (mountedRef.current) {
                setError(err.message);
            }
        } finally {
            if (mountedRef.current && !silent) {
                setLoading(false);
            }
        }
    }, [proposalId, chainId, endpoint, candleLimit, cacheKey]);

    // Initial fetch - only once
    useEffect(() => {
        if (proposalId && endpoint) {
            doFetch(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [proposalId, endpoint]); // Minimal deps to prevent re-runs

    return {
        ...data,
        loading,
        error,
        refetch: doFetch
    };
}
