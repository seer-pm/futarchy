import { useEffect, useState } from 'react';
import { createSubgraphPoolFetcher } from '../../../../utils/SubgraphPoolFetcher';

// Subgraph pool fetcher instance for latest prices
const subgraphPoolFetcher = createSubgraphPoolFetcher();

const useLivePoolPrices = ({ config, configLoading, poolData, poolDataLoading, poolDataError }) => {
  const [newYesPrice, setNewYesPrice] = useState(null);
  const [newNoPrice, setNewNoPrice] = useState(null);
  const [newThirdPrice, setNewThirdPrice] = useState(null); // Added state for the third price
  const [thirdCandles, setThirdCandles] = useState([]); // Event probability historical candles
  const [newBasePrice, setNewBasePrice] = useState(null); // Added state for base/spot price from pool_candles
  // Set when the latest-price fetch fails, so price stats stop spinning.
  const [livePriceError, setLivePriceError] = useState(null);

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

  return {
    newYesPrice,
    newNoPrice,
    newThirdPrice,
    thirdCandles,
    newBasePrice,
    livePriceError,
    pricesUnavailable
  };
};

export { useLivePoolPrices };
