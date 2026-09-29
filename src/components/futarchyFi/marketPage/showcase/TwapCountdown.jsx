import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { computeImpactPercent, formatImpactPercent } from '../../../../utils/marketPageUtils.mjs';
import { getRpcProvider } from '../../../../utils/getBestRpc';

const ALGEBRA_TWAP_ABI = [
  "function getTimepoints(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulatives, uint112[] volatilityCumulatives, uint256[] volumePerAvgLiquiditys)",
  "function token0() external view returns (address)"
];

const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the \u201cpass\u201d (yes) outcome over the final 24 hours of the Issuance KIP\u2019s voting period is greater than or equal to that of the \u201cfail\u201d (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";

const TWAP_REFRESH_INTERVAL_MS = 30000; // refresh every 30 seconds while active

const formatTwapValue = (value) => {
  if (value === null || typeof value === 'undefined' || Number.isNaN(value)) {
    return '—';
  }
  if (value === 0) return '0.0000';
  if (value >= 1) {
    return value.toFixed(4);
  }
  return value.toPrecision(4);
};

// TWAP Countdown Component
const TwapCountdown = ({
  twapStartTimestamp,
  twapDurationHours = 24,
  twapDescription = DEFAULT_TWAP_DESCRIPTION,
  isScrolled,
  yesPoolConfig,
  noPoolConfig,
  invertTwapPoolYes = false,
  invertTwapPoolNo = false,
  yesCompanyTokenAddress = null,
  noCompanyTokenAddress = null
}) => {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timeUntilStart, setTimeUntilStart] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isWaitingToStart, setIsWaitingToStart] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [twapResults, setTwapResults] = useState({ yes: null, no: null, spread: null });
  const [twapLoading, setTwapLoading] = useState(false);
  const [twapError, setTwapError] = useState(null);
  const [lastTwapUpdate, setLastTwapUpdate] = useState(null);
  const providerRef = useRef(null);
  const poolToken0CacheRef = useRef({});

  const twapDurationSeconds = useMemo(() => Math.max(1, Math.floor(twapDurationHours * 60 * 60)), [twapDurationHours]);

  const ensureProvider = useCallback(() => {
    if (!providerRef.current) {
      // Shared across the app — see utils/getBestRpc.js.
      providerRef.current = getRpcProvider(100);
    }
    return providerRef.current;
  }, []);

  const fetchPoolTwap = useCallback(async (poolConfig, secondsAgoStart, shouldInvert = null, secondsAgoEnd = 0, companyTokenAddress = null) => {
    if (!poolConfig?.address) {
      throw new Error('Missing pool address');
    }
    const aStart = Math.max(0, Math.floor(secondsAgoStart));
    const aEnd = Math.max(0, Math.floor(secondsAgoEnd));
    const secondsWindow = Math.max(1, aStart - aEnd);
    const provider = ensureProvider();
    const poolContract = new ethers.Contract(poolConfig.address, ALGEBRA_TWAP_ABI, provider);
    const { tickCumulatives } = await poolContract.getTimepoints([aStart, aEnd]);
    const oldest = BigInt(tickCumulatives[0].toString());
    const latest = BigInt(tickCumulatives[1].toString());
    const tickDelta = latest - oldest;
    const averageTick = Number(tickDelta) / secondsWindow;
    const rawPrice = Math.pow(1.0001, averageTick);

    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      throw new Error('Invalid price data');
    }

    // Authoritative inversion check: read token0 from the pool and compare it to the
    // conditional company token. Raw pool price = 1.0001^tick = token1/token0, so when
    // the company token is token0 the raw price is already currency-per-company and
    // must NOT be inverted. Metadata flags have been wrong before (Kleros KIP markets
    // shipped invertTwapPoolYes/No=true while PNK was token0), so on-chain token order
    // wins whenever we can determine it.
    let onChainInvert = null;
    if (companyTokenAddress) {
      try {
        const poolKey = poolConfig.address.toLowerCase();
        let token0 = poolToken0CacheRef.current[poolKey];
        if (!token0) {
          token0 = (await poolContract.token0()).toLowerCase();
          poolToken0CacheRef.current[poolKey] = token0;
        }
        onChainInvert = token0 !== companyTokenAddress.toLowerCase();
      } catch (err) {
        console.warn('[TWAP] token0() read failed, falling back to configured inversion:', err?.message);
      }
    }

    // Priority: on-chain token order > explicit inversion flag from metadata > tokenCompanySlot from pool config
    // shouldInvert is null when not set, so we can distinguish between "not set" and "set to false"
    const useInversion = onChainInvert !== null
      ? onChainInvert
      : (shouldInvert !== null
        ? shouldInvert
        : (typeof poolConfig.tokenCompanySlot === 'number' && poolConfig.tokenCompanySlot === 1));

    if (onChainInvert !== null && shouldInvert !== null && onChainInvert !== shouldInvert) {
      console.warn('[TWAP] Metadata inversion flag contradicts on-chain token order; using on-chain value', {
        pool: poolConfig.address,
        metadataInvert: shouldInvert,
        onChainInvert
      });
    }

    console.log('[TWAP] fetchPoolTwap:', {
      pool: poolConfig.address?.slice(0, 10),
      rawPrice: rawPrice.toFixed(4),
      shouldInvert,
      onChainInvert,
      tokenCompanySlot: poolConfig.tokenCompanySlot,
      useInversion
    });

    const normalizedPrice = useInversion ? 1 / rawPrice : rawPrice;
    return normalizedPrice;
  }, [ensureProvider]);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const endTime = twapStartTimestamp + twapDurationSeconds;
      const diffToEnd = endTime - now;
      const diffToStart = twapStartTimestamp - now;

      if (now < twapStartTimestamp) {
        setIsActive(false);
        setHasEnded(false);
        setIsWaitingToStart(true);
        const days = Math.floor(diffToStart / 86400);
        const hours = Math.floor((diffToStart % 86400) / 3600);
        const minutes = Math.floor((diffToStart % 3600) / 60);
        const seconds = diffToStart % 60;
        setTimeUntilStart({ days, hours, minutes, seconds });
        setTimeRemaining(null);
      } else if (diffToEnd > 0) {
        setIsActive(true);
        setHasEnded(false);
        setIsWaitingToStart(false);
        const hours = Math.floor(diffToEnd / 3600);
        const minutes = Math.floor((diffToEnd % 3600) / 60);
        const seconds = diffToEnd % 60;
        setTimeRemaining({ hours, minutes, seconds });
        setTimeUntilStart(null);
      } else {
        setIsActive(false);
        setHasEnded(true);
        setIsWaitingToStart(false);
        setTimeRemaining(null);
        setTimeUntilStart(null);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [twapStartTimestamp, twapDurationSeconds]);

  useEffect(() => {
    const shouldCalculateTwap = (isActive || hasEnded) && yesPoolConfig?.address && noPoolConfig?.address;

    if (!shouldCalculateTwap) {
      setTwapResults({ yes: null, no: null, spread: null });
      setTwapError(null);
      return;
    }

    let cancelled = false;

    const runCalculation = async () => {
      try {
        setTwapLoading(true);
        setTwapError(null);
        const now = Math.floor(Date.now() / 1000);
        const twapEndTimestamp = twapStartTimestamp + twapDurationSeconds;
        // Active: [twapStart..now]. Ended: historical [twapStart..twapEnd], not the trailing 24h.
        const secondsAgoStart = Math.max(1, now - twapStartTimestamp);
        const secondsAgoEnd = hasEnded ? Math.max(0, now - twapEndTimestamp) : 0;

        const [yesPrice, noPrice] = await Promise.all([
          fetchPoolTwap(yesPoolConfig, secondsAgoStart, invertTwapPoolYes, secondsAgoEnd, yesCompanyTokenAddress),
          fetchPoolTwap(noPoolConfig, secondsAgoStart, invertTwapPoolNo, secondsAgoEnd, noCompanyTokenAddress)
        ]);

        if (cancelled) return;

        setTwapResults({
          yes: yesPrice,
          no: noPrice,
          spread: Number.isFinite(yesPrice) && Number.isFinite(noPrice)
            ? yesPrice - noPrice
            : null
        });
        setLastTwapUpdate(new Date());
      } catch (err) {
        if (!cancelled) {
          console.error('[TWAP] Calculation failed:', err);
          setTwapError(err?.message || 'Unable to calculate TWAP');
        }
      } finally {
        if (!cancelled) {
          setTwapLoading(false);
        }
      }
    };

    runCalculation();
    const intervalId = hasEnded ? null : setInterval(runCalculation, TWAP_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive, hasEnded, twapStartTimestamp, twapDurationSeconds, yesPoolConfig, noPoolConfig, invertTwapPoolYes, invertTwapPoolNo, yesCompanyTokenAddress, noCompanyTokenAddress, fetchPoolTwap]);

  const { leaderboardText, percentDiff, leaderTheme } = useMemo(() => {
    if (twapResults.yes === null || twapResults.no === null) return { leaderboardText: null, percentDiff: null, leaderTheme: 'neutral' };

    const yes = parseFloat(twapResults.yes);
    const no = parseFloat(twapResults.no);
    const diff = Math.abs(yes - no);

    // If effectively tied
    if (diff < 1e-8) {
      return {
        leaderboardText: 'YES and NO are currently tied on TWAP.',
        percentDiff: formatImpactPercent(0),
        leaderTheme: 'neutral'
      };
    }

    // Same (YES - NO) / max(YES, NO) formula and formatter as "Impact (spot)".
    const twapImpact = formatImpactPercent(computeImpactPercent(yes, no));
    if (yes > no) {
      return {
        leaderboardText: 'YES outcome is ahead on TWAP.',
        percentDiff: twapImpact,
        leaderTheme: 'blue'
      };
    } else {
      return {
        leaderboardText: 'NO outcome is ahead on TWAP.',
        percentDiff: twapImpact,
        leaderTheme: 'yellow'
      };
    }
  }, [twapResults]);

  // Determine colors based on state and leader
  const getThemeClasses = () => {
    if (isActive || hasEnded) {
      if (leaderTheme === 'blue') {
        return {
          container: 'bg-blue-500/10 border-blue-500/30 dark:bg-blue-400/10 dark:border-blue-400/30',
          pulse: 'bg-blue-500 animate-pulse',
          text: 'text-blue-600 dark:text-blue-400',
          subText: 'text-blue-700 dark:text-blue-300',
          desc: 'text-blue-600/70 dark:text-blue-400/70'
        };
      } else if (leaderTheme === 'yellow') {
        return {
          container: 'bg-yellow-500/10 border-yellow-500/30 dark:bg-yellow-400/10 dark:border-yellow-400/30',
          pulse: 'bg-yellow-500 animate-pulse',
          text: 'text-yellow-600 dark:text-yellow-400',
          subText: 'text-yellow-700 dark:text-yellow-300',
          desc: 'text-yellow-600/70 dark:text-yellow-400/70'
        };
      } else {
        // Neutral/Green for tie or complete
        return {
          container: 'bg-green-500/10 border-green-500/30 dark:bg-green-400/10 dark:border-green-400/30',
          pulse: 'bg-green-500 animate-pulse',
          text: 'text-green-600 dark:text-green-400',
          subText: 'text-green-700 dark:text-green-300',
          desc: 'text-green-600/70 dark:text-green-400/70'
        };
      }
    }

    if (isWaitingToStart) {
      return {
        container: 'bg-yellow-500/10 border-yellow-500/30 dark:bg-yellow-400/10 dark:border-yellow-400/30',
        pulse: 'bg-yellow-500 animate-pulse',
        text: 'text-yellow-600 dark:text-yellow-400',
        subText: 'text-yellow-700 dark:text-yellow-300',
        desc: 'text-yellow-600/70 dark:text-yellow-400/70'
      };
    }

    // Fallback
    return {
      container: 'bg-green-500/10 border-green-500/30 dark:bg-green-400/10 dark:border-green-400/30',
      pulse: 'bg-green-500',
      text: 'text-green-600 dark:text-green-400',
      subText: 'text-green-700 dark:text-green-300',
      desc: 'text-green-600/70 dark:text-green-400/70'
    };
  };

  const theme = getThemeClasses();

  const renderDescription = (colorClass) => (
    !isScrolled && twapDescription && showDetails && (
      <p className={`text-xs ${colorClass} mt-2`}>
        {twapDescription}
      </p>
    )
  );

  // Collapsed header label and timer value
  const headerLabel = isWaitingToStart ? 'TWAP Starts In'
    : isActive ? 'TWAP Active'
    : hasEnded ? 'TWAP Complete'
    : 'TWAP';

  const headerTimer = isWaitingToStart && timeUntilStart
    ? `${timeUntilStart.days > 0 ? `${timeUntilStart.days}d ` : ''}${String(timeUntilStart.hours).padStart(2, '0')}h ${String(timeUntilStart.minutes).padStart(2, '0')}m ${String(timeUntilStart.seconds).padStart(2, '0')}s`
    : isActive && timeRemaining
    ? `${String(timeRemaining.hours).padStart(2, '0')}h ${String(timeRemaining.minutes).padStart(2, '0')}m ${String(timeRemaining.seconds).padStart(2, '0')}s`
    : null;

  return (
    <div className={`${isScrolled ? 'mt-0' : 'mt-4'} rounded-lg border transition-all duration-300 ${theme.container}`}>
      {/* Collapsed header — always visible, click to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-2 lg:p-3 flex items-center gap-2 cursor-pointer text-left"
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.pulse}`} />
        <div className="flex-1 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${theme.text}`}>
              {headerLabel}
            </span>
            {percentDiff && (isActive || hasEnded) && (
              <span className={`text-xs font-bold ${theme.text}`}>
                (TWAP impact {percentDiff})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerTimer && (
              <span className={`text-xs font-mono ${theme.subText}`}>
                {headerTimer}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 ${theme.text} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expandable body */}
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-2 lg:px-3 pb-2 lg:pb-3 space-y-2">
            {/* Description */}
            {!isScrolled && twapDescription && (
              <p className={`text-xs ${theme.desc}`}>
                {twapDescription}
              </p>
            )}

            {/* TWAP values grid */}
            {(isActive || hasEnded) && yesPoolConfig?.address && noPoolConfig?.address && (
              <div className="rounded-md bg-white/5 dark:bg-white/10 p-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/70 dark:text-white/60">
                  <span>{hasEnded ? 'Final TWAP Window' : 'Live TWAP Window'}</span>
                  {lastTwapUpdate && (
                    <span className="text-white/50 dark:text-white/40">
                      Updated {lastTwapUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>

                {twapError ? (
                  <p className="mt-2 text-xs text-red-400 dark:text-red-300">{twapError}</p>
                ) : (
                  <>
                    {twapLoading && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/70 dark:text-white/60">
                        <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                        Calculating TWAP…
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-black/10 dark:bg-white/5 p-2">
                        <p className="text-white/60 dark:text-white/70">YES TWAP</p>
                        <p className="font-mono text-sm text-white dark:text-white">
                          {formatTwapValue(twapResults.yes)}
                        </p>
                      </div>
                      <div className="rounded-md bg-black/10 dark:bg-white/5 p-2">
                        <p className="text-white/60 dark:text-white/70">NO TWAP</p>
                        <p className="font-mono text-sm text-white dark:text-white">
                          {formatTwapValue(twapResults.no)}
                        </p>
                      </div>
                    </div>
                    {leaderboardText && (
                      <p className="mt-2 text-[11px] text-white/80 dark:text-white/70">
                        {leaderboardText}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { TwapCountdown };
