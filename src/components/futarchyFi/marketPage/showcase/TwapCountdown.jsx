import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { computeImpactPercent, formatImpactPercent } from '../../../../utils/marketPageUtils.mjs';
import { getRpcProvider } from '../../../../utils/getBestRpc';
import Badge from '../../../ui/Badge';

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
  noCompanyTokenAddress = null,
  chainId = 100
}) => {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timeUntilStart, setTimeUntilStart] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isWaitingToStart, setIsWaitingToStart] = useState(false);
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
      providerRef.current = getRpcProvider(chainId);
    }
    return providerRef.current;
  }, [chainId]);

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
          // The raw RPC error means nothing to a reader; the console keeps it.
          setTwapError('The TWAP could not be read from the pools right now. The rule and window above still apply.');
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

  // The state of the test window, as one badge: waiting, live, or closed.
  const stateLabel = isWaitingToStart ? 'Window opens in'
    : isActive ? 'Window open'
    : hasEnded ? 'Window closed'
    : 'Window not scheduled';
  const stateTone = isActive ? 'accent' : isWaitingToStart ? 'warning' : 'neutral';

  const headerTimer = isWaitingToStart && timeUntilStart
    ? `${timeUntilStart.days > 0 ? `${timeUntilStart.days}d ` : ''}${String(timeUntilStart.hours).padStart(2, '0')}h ${String(timeUntilStart.minutes).padStart(2, '0')}m ${String(timeUntilStart.seconds).padStart(2, '0')}s`
    : isActive && timeRemaining
    ? `${String(timeRemaining.hours).padStart(2, '0')}h ${String(timeRemaining.minutes).padStart(2, '0')}m ${String(timeRemaining.seconds).padStart(2, '0')}s left`
    : null;

  const leaderClass = leaderTheme === 'blue' ? 'text-pass-text' : leaderTheme === 'yellow' ? 'text-fail-text' : 'text-seer-text';
  const showValues = (isActive || hasEnded) && yesPoolConfig?.address && noPoolConfig?.address;

  return (
    <div className={`${isScrolled ? 'mt-0' : ''} space-y-4`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={stateTone}>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />}
          {stateLabel}
        </Badge>
        <span className="text-sm text-seer-muted">{twapDurationHours}h time-weighted average</span>
        {headerTimer && <span className="text-sm font-semibold tabular-nums text-seer-text">{headerTimer}</span>}
      </div>

      {showValues && (
        <div>
          <div className="grid grid-cols-2 border border-seer-border rounded-surface divide-x divide-seer-border">
            <div className="p-4">
              <p className="flex items-center gap-2 text-[13px] text-seer-muted">
                <span className="w-2 h-2 rounded-full bg-pass" aria-hidden="true" />
                If it passes (YES TWAP)
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-pass-text">{formatTwapValue(twapResults.yes)}</p>
            </div>
            <div className="p-4">
              <p className="flex items-center gap-2 text-[13px] text-seer-muted">
                <span className="w-2 h-2 rounded-full bg-fail" aria-hidden="true" />
                If it fails (NO TWAP)
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-fail-text">{formatTwapValue(twapResults.no)}</p>
            </div>
          </div>

          {twapError ? (
            <p className="mt-3 text-sm text-seer-negative">{twapError}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              {twapLoading && !leaderboardText ? (
                <span className="inline-flex items-center gap-2 text-seer-muted">
                  <span className="h-3 w-3 rounded-full border-2 border-seer-border border-t-seer-purple animate-spin" aria-hidden="true" />
                  Calculating TWAP
                </span>
              ) : leaderboardText ? (
                <span className="text-seer-text">
                  <span className={`font-semibold ${leaderClass}`}>{leaderboardText}</span>
                  {percentDiff && <> TWAP impact <span className="font-semibold tabular-nums">{percentDiff}</span>.</>}
                </span>
              ) : <span />}
              {lastTwapUpdate && (
                <span className="text-[13px] text-seer-muted tabular-nums">
                  {hasEnded ? 'Final window' : 'Updated'} {lastTwapUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {twapDescription && (
        <p className="text-sm leading-relaxed text-seer-muted max-w-prose">
          {twapDescription}
        </p>
      )}
    </div>
  );
};

export { TwapCountdown };
