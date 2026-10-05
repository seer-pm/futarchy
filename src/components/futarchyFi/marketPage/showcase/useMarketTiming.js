import { useEffect, useMemo, useState } from 'react';
import { fetchResolutionTime } from '../../../../utils/onChainResolution';

const useMarketTiming = (config) => {
  // Market end time falls back to the on-chain closeTimestamp when
  // config.marketInfo.endTime is not set.
  const marketEndTime = useMemo(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const close = meta?.closeTimestamp;
    return close ? Number(close) : null;
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

  // Registry metadata has no resolution date; read when the Reality.eth
  // question became final.
  const [resolutionTime, setResolutionTime] = useState(null);
  useEffect(() => {
    if (!config?.marketInfo?.resolved || config.marketInfo.resolvedTime || !config?.MARKET_ADDRESS) return;
    let cancelled = false;
    fetchResolutionTime(config.MARKET_ADDRESS, config.chainId).then((seconds) => {
      if (!cancelled) setResolutionTime(seconds);
    });
    return () => { cancelled = true; };
  }, [config?.marketInfo?.resolved, config?.marketInfo?.resolvedTime, config?.MARKET_ADDRESS, config?.chainId]);

  return { marketEndTime, resolutionTime };
};

export { useMarketTiming };
