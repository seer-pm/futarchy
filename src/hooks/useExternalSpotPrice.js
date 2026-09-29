'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchSpotCandles } from '../spotPriceUtils/spotClient';

/**
 * Hook to fetch external spot price data using browser-compatible spotClient
 * 
 * @param {string} spotConfig - Config string: "TOKEN::RATE/QUOTE-interval-limit-network"
 * 
 * Usage:
 *   const { spotData, spotPrice, loading, error, refetch } = useExternalSpotPrice('waGnoGNO::0xbbb4.../sDAI-hour-500-xdai');
 */
export function useExternalSpotPrice(spotConfig, closeTimestamp = null) {
    const [spotData, setSpotData] = useState(null);
    const [spotPrice, setSpotPrice] = useState(null);
    const [rate, setRate] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch spot data using spotClient
    const fetchData = useCallback(async (silent = false) => {
        if (!spotConfig) {
            setSpotData(null);
            setSpotPrice(null);
            return;
        }

        // Feature: Automatically kill spot fetching if the market is historically concluded
        // As the user requested, "for all intents and purposes it's like coingecko ticker even exists so we won't even consider spot"
        const isMarketClosedLocally = closeTimestamp && typeof closeTimestamp === 'number' && (Date.now() / 1000) > closeTimestamp;
        if (isMarketClosedLocally) {
            console.log('[useExternalSpotPrice] Market is historically closed. Coingecko/Spot APIs are intentionally disabled.');
            setSpotData(null);
            setSpotPrice(null);
            return;
        }

        if (!silent) setLoading(true);
        setError(null);

        try {
            console.log('[useExternalSpotPrice] Fetching:', spotConfig);

            const result = await fetchSpotCandles(spotConfig, closeTimestamp);

            if (result.error) {
                throw new Error(result.error);
            }

            setSpotData(result.candles);
            setSpotPrice(result.price);
            setRate(result.rate);

            console.log('[useExternalSpotPrice] Loaded', result.candles.length, 'candles, price:', result.price);

        } catch (err) {
            console.error('[useExternalSpotPrice] Error:', err);
            setError(err.message);
            // Drop the old series on a user-visible fetch: a stale or
            // unscaled spot price is worse than none.
            if (!silent) {
                setSpotData(null);
                setSpotPrice(null);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [spotConfig]);

    // Initial fetch
    useEffect(() => {
        if (spotConfig) {
            fetchData();
        }
    }, [spotConfig, fetchData]);

    return {
        spotData,
        spotPrice,
        rate,
        loading,
        error,
        refetch: () => fetchData(false),
        silentRefetch: () => fetchData(true),
    };
}

export default useExternalSpotPrice;
