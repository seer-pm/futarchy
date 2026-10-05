import { useMemo } from 'react';
import { useExternalSpotPrice } from '../../../../hooks/useExternalSpotPrice';

const useMarketSpotPrice = (config, useSpotPriceParam) => {
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

  return {
    effectiveSpotPriceParam,
    configSpotError,
    stableSpotData,
    finalSpotPrice,
    finalSpotLoading,
    refetchConfigSpot
  };
};

export { useMarketSpotPrice };
