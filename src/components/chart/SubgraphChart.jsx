'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
import { useSubgraphData } from '../../hooks/useSubgraphData';
import { formatWith } from '../../utils/precisionFormatter';
import { formatImpactPercent } from '../../utils/marketPageUtils.mjs';
import { resolveMarketStatus } from '../../utils/proposalLifecycle';
import { useSubgraphRefresh } from '../../contexts/SubgraphRefreshContext';
import { SHOW_DATA_DEBUG } from '../../config/featureFlags';

/**
 * SubgraphChart - A chart component that fetches data from The Graph subgraphs
 * 
 * Styled identically to TripleChart for visual consistency.
 * Uses same colors (blue YES, yellow NO), same container styling, same fonts.
 */

const LoadingSpinner = () => (
    <div className="w-4 h-4 border-2 border-futarchyGray11 dark:border-futarchyGray112 border-t-transparent rounded-full animate-spin" />
);

const ParameterCard = ({ label, value, valueClassName = '', isDisabled = false, onClick = null }) => (
    <div
        onClick={onClick}
        className={`flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 first:rounded-tl-3xl last:rounded-tr-3xl px-1 ${isDisabled ? 'opacity-40' : ''} ${onClick ? 'cursor-pointer hover:bg-futarchyGray62/30 dark:hover:bg-futarchyGray112/20 transition-colors' : ''}`}
    >
        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">{label}</span>
        <span className={`text-[9px] md:text-sm font-bold text-futarchyGray12 dark:text-white ${valueClassName}`}>{value}</span>
    </div>
);

const SubgraphChart = ({
    proposalId,
    chainId = 100,
    height = 448,
    candleLimit = 1000, // Page size per pool (indexer max is 1000)
    config = null,
    autoResyncInterval = 60, // Auto-resync every X seconds (configurable)
    // NEW: External spot price props
    spotData = null,        // External spot candles [{ time, value }]
    spotPrice = null,       // Latest spot price for impact formula
    showSpot = false,       // Whether to show spot line
    onSpotRefresh = null,   // Callback to refresh spot data
}) => {
    const chartContainerRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [isDarkMode, setIsDarkMode] = useState(
        () => typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
    );

    // Line visibility state - click labels to toggle
    const [lineVisibility, setLineVisibility] = useState({
        yes: true,
        no: true,
        spot: true
    });

    // Toggle line visibility
    const toggleLine = (line) => {
        setLineVisibility(prev => ({ ...prev, [line]: !prev[line] }));
    };

    // Countdown state for auto-resync
    const [countdown, setCountdown] = useState(autoResyncInterval);
    const countdownRef = useRef(null);

    // Keep a stable reference to refetch to avoid recreating interval
    const refetchRef = useRef(null);

    // Fetch data from subgraph
    const {
        yesData,
        noData,
        yesPrice,
        noPrice,
        yesPool,
        noPool,
        hasData,
        loading,
        error,
        refetch,
        lastUpdated
    } = useSubgraphData(
        proposalId,
        chainId,
        candleLimit,
        config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp || null,
        config?.startCandleUnix || config?.metadata?.startCandleUnix || config?.marketInfo?.startCandleUnix || null
    );

    // Subscribe to context refresh triggers
    const { chartRefreshKey } = useSubgraphRefresh();

    // Keep refetch reference updated without triggering effect re-runs
    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);

    // React to external refresh triggers from context
    useEffect(() => {
        if (chartRefreshKey > 0 && refetchRef.current) {
            console.log('[SubgraphChart] External refresh triggered');
            refetchRef.current(true); // silent refresh
        }
    }, [chartRefreshKey]);

    // Auto-resync. The per-second countdown only feeds the debug Resync
    // button; without it, one timer per resync period avoids re-rendering
    // the chart every second.
    useEffect(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
        }

        if (!SHOW_DATA_DEBUG) {
            countdownRef.current = setInterval(() => {
                if (refetchRef.current) refetchRef.current(true);
            }, autoResyncInterval * 1000);
        } else {
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        // Time to resync! Use silent=true for smooth update without flicker
                        if (refetchRef.current) {
                            refetchRef.current(true);
                        }
                        return autoResyncInterval;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [autoResyncInterval]); // Only re-create interval when interval changes

    // Get precision config from props or use default
    const precisionConfig = config?.PRECISION_CONFIG;
    const dynamicPrecision = precisionConfig?.display?.price || config?.precisions?.main || 4;



    // Dark mode observer
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const observer = new MutationObserver((mutationsList) => {
            for (let mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const currentMode = document.documentElement.classList.contains('dark');
                    setIsDarkMode(currentMode);
                }
            }
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    // Container resize observer
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const resizeObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                setContainerWidth(entries[0].contentRect.width);
            }
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
            setContainerWidth(chartContainerRef.current.clientWidth);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Chart creation and data update
    useEffect(() => {
        if (!chartContainerRef.current || containerWidth === 0 || !hasData) {
            return;
        }

        // Clean up previous chart
        if (chartInstanceRef.current) {
            chartInstanceRef.current.remove();
            chartInstanceRef.current = null;
        }

        // Same colors as TripleChart
        const backgroundColor = isDarkMode ? 'transparent' : 'rgb(249, 249, 249)';
        const textColor = isDarkMode ? 'rgb(220, 220, 220)' : '#333333';
        const crosshairColor = isDarkMode ? 'rgba(200, 200, 200, 0.3)' : 'rgba(51, 51, 51, 0.3)';
        const borderColor = isDarkMode ? 'transparent' : 'rgb(249, 249, 249)';

        const chart = createChart(chartContainerRef.current, {
            width: containerWidth,
            height: height,
            layout: {
                background: { type: 'solid', color: backgroundColor },
                textColor: textColor,
                fontFamily: 'Arial, sans-serif',
            },
            // Chart-level localization for crosshair tooltip (converts UTC timestamps to local time)
            localization: {
                timeFormatter: (time) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleDateString([], {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit'
                    }) + ' ' + date.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                },
            },
            grid: {
                vertLines: { color: 'rgba(0, 0, 0, 0)' },
                horzLines: { color: 'rgba(0, 0, 0, 0)' },
            },
            crosshair: {
                vertLine: {
                    width: 1,
                    color: crosshairColor,
                    style: 0,
                },
                horzLine: {
                    width: 1,
                    color: crosshairColor,
                    style: 0,
                },
            },
            timeScale: {
                borderColor: borderColor,
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 0,
                tickMarkFormatter: (time) => {
                    const date = new Date(time * 1000);
                    const now = new Date();
                    const isToday = date.getDate() === now.getDate() &&
                        date.getMonth() === now.getMonth() &&
                        date.getFullYear() === now.getFullYear();

                    if (isToday) {
                        return date.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                    }

                    return date.toLocaleDateString([], {
                        day: '2-digit',
                        month: '2-digit'
                    }) + ' ' + date.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                },
            },
            rightPriceScale: {
                borderColor: borderColor,
                borderVisible: false,
            },
            leftPriceScale: {
                borderColor: borderColor,
                visible: false,
                borderVisible: false,
            },
        });

        chartInstanceRef.current = chart;

        // Same price format as TripleChart
        const priceFormat = {
            type: 'price',
            precision: dynamicPrecision,
            minMove: Math.pow(10, -dynamicPrecision),
        };

        // Create YES line - SAME BLUE as TripleChart: rgb(0, 144, 255)
        const yesLine = chart.addSeries(LineSeries, {
            color: 'rgb(0, 144, 255)',
            lineWidth: 2,
            title: 'YES',
            priceFormat: priceFormat,
            visible: lineVisibility.yes,
        });

        // Create NO line - SAME YELLOW as TripleChart: rgb(245, 196, 0)
        const noLine = chart.addSeries(LineSeries, {
            color: 'rgb(245, 196, 0)',
            lineWidth: 2,
            title: 'NO',
            priceFormat: priceFormat,
            visible: lineVisibility.no,
        });

        const closeTimestamp = config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp;
        // Closed by the clock or resolved (a market can be resolved before its close time)
        const isMarketClosedLocally = resolveMarketStatus({ ...config?.marketInfo, closeTimestamp }).state !== 'active';

        // Create SPOT line - dashed, semi-transparent (same as TripleChart)
        const spotLine = chart.addSeries(LineSeries, {
            color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
            lineWidth: 2,
            lineStyle: 2, // Dashed
            title: 'SPOT',
            priceFormat: priceFormat,
            visible: !isMarketClosedLocally && showSpot && spotData && spotData.length > 0 && lineVisibility.spot,
        });

        // Forward-fill: extend YES/NO lines to match SPOT time range
        // 1. Find where ALL THREE start (max of mins) - only show where all have data
        // 2. Forward-fill YES/NO to extend to SPOT's end
        let filteredYes = yesData || [];
        let filteredNo = noData || [];
        let filteredSpot = spotData || [];

        // FIRST: Apply startCandleUnix filter from config (if present)
        // This ensures chart only shows candles after the proposal/market started
        const startCandleUnix = config?.startCandleUnix || config?.metadata?.startCandleUnix || config?.marketInfo?.startCandleUnix;
        if (startCandleUnix && typeof startCandleUnix === 'number') {
            console.log(`[SubgraphChart] Filtering data to start from ${new Date(startCandleUnix * 1000).toISOString()}`);
            filteredYes = filteredYes.filter(d => d.time >= startCandleUnix);
            filteredNo = filteredNo.filter(d => d.time >= startCandleUnix);
            filteredSpot = filteredSpot.filter(d => d.time >= startCandleUnix);
        }

        // SECOND: Apply closeTimestamp filter from config (if present)
        // This ensures the chart does not show candles after the proposal/market ended
        if (closeTimestamp && typeof closeTimestamp === 'number') {
            console.log(`[SubgraphChart] Filtering data to end at ${new Date(closeTimestamp * 1000).toISOString()}`);
            filteredYes = filteredYes.filter(d => d.time <= closeTimestamp);
            filteredNo = filteredNo.filter(d => d.time <= closeTimestamp);
            filteredSpot = filteredSpot.filter(d => d.time <= closeTimestamp);
        }

        // GAP-FILL FOR YES/NO - Fill missing hourly candles with previous value
        const ENABLE_GAP_FILL = true; // ENABLED - fills gaps in YES/NO with previous value

        const gapFillCandles = (candles) => {
            if (!candles || candles.length < 2) return candles;

            const filled = [];
            const sorted = [...candles].sort((a, b) => a.time - b.time);
            const hourInSeconds = 3600;

            for (let i = 0; i < sorted.length; i++) {
                filled.push(sorted[i]);

                // Check if there's a gap to the next candle
                if (i < sorted.length - 1) {
                    const currentTime = sorted[i].time;
                    const nextTime = sorted[i + 1].time;
                    const gap = nextTime - currentTime;

                    // If gap is more than 1 hour, fill it
                    if (gap > hourInSeconds) {
                        const numMissing = Math.floor(gap / hourInSeconds) - 1;
                        for (let j = 1; j <= numMissing; j++) {
                            filled.push({
                                time: currentTime + (j * hourInSeconds),
                                value: sorted[i].value // carry forward
                            });
                        }
                        console.log(`[SubgraphChart] Gap-filled ${numMissing} candles`);
                    }
                }
            }
            return filled;
        };

        if (ENABLE_GAP_FILL) {
            const yesCountBefore = filteredYes.length;
            const noCountBefore = filteredNo.length;
            filteredYes = gapFillCandles(filteredYes);
            filteredNo = gapFillCandles(filteredNo);
            if (filteredYes.length > yesCountBefore) {
                console.log(`[SubgraphChart] YES gap-filled: ${yesCountBefore} → ${filteredYes.length}`);
            }
            if (filteredNo.length > noCountBefore) {
                console.log(`[SubgraphChart] NO gap-filled: ${noCountBefore} → ${filteredNo.length}`);
            }

            // Also extend YES/NO to the most forward time across all series
            const allTimes = [
                ...filteredYes.map(d => d.time),
                ...filteredNo.map(d => d.time),
                ...filteredSpot.map(d => d.time)
            ];
            if (allTimes.length > 0) {
                const maxTime = Math.max(...allTimes);
                const hourInSeconds = 3600;

                // Extend YES to maxTime
                if (filteredYes.length > 0) {
                    const lastYes = filteredYes[filteredYes.length - 1];
                    if (lastYes.time < maxTime) {
                        const numToAdd = Math.floor((maxTime - lastYes.time) / hourInSeconds);
                        for (let i = 1; i <= numToAdd; i++) {
                            filteredYes.push({
                                time: lastYes.time + (i * hourInSeconds),
                                value: lastYes.value
                            });
                        }
                        console.log(`[SubgraphChart] YES extended forward with ${numToAdd} candles`);
                    }
                }

                // Extend NO to maxTime
                if (filteredNo.length > 0) {
                    const lastNo = filteredNo[filteredNo.length - 1];
                    if (lastNo.time < maxTime) {
                        const numToAdd = Math.floor((maxTime - lastNo.time) / hourInSeconds);
                        for (let i = 1; i <= numToAdd; i++) {
                            filteredNo.push({
                                time: lastNo.time + (i * hourInSeconds),
                                value: lastNo.value
                            });
                        }
                        console.log(`[SubgraphChart] NO extended forward with ${numToAdd} candles`);
                    }
                }
            }
        }

        // TIME OVERLAP ALIGNMENT - TOGGLE (set to false to disable)
        const ENABLE_TIME_ALIGNMENT = true; // ENABLED - aligns YES/NO to SPOT range

        if (ENABLE_TIME_ALIGNMENT && showSpot && filteredSpot.length > 0 && (filteredYes.length > 0 || filteredNo.length > 0)) {
            // Get time boundaries for all series (using ALREADY FILTERED data)
            const yesMin = filteredYes.length > 0 ? Math.min(...filteredYes.map(d => d.time)) : Infinity;
            const noMin = filteredNo.length > 0 ? Math.min(...filteredNo.map(d => d.time)) : Infinity;
            const spotMin = Math.min(...filteredSpot.map(d => d.time));
            const spotMax = Math.max(...filteredSpot.map(d => d.time));

            // STEP 1: Start from where ALL THREE have data (max of mins)
            // Also respect startCandleUnix if set
            let rangeStart = Math.max(yesMin, noMin, spotMin);
            if (startCandleUnix && typeof startCandleUnix === 'number') {
                rangeStart = Math.max(rangeStart, startCandleUnix);
            }

            // Further crop all three to start from rangeStart
            filteredYes = filteredYes.filter(d => d.time >= rangeStart);
            filteredNo = filteredNo.filter(d => d.time >= rangeStart);
            filteredSpot = filteredSpot.filter(d => d.time >= rangeStart);

            // STEP 2: Forward-fill YES to SPOT's max time
            if (filteredYes.length > 0) {
                const yesMax = Math.max(...filteredYes.map(d => d.time));
                const lastYes = filteredYes.find(d => d.time === yesMax);

                if (lastYes && spotMax > yesMax) {
                    const fillTimestamps = filteredSpot
                        .filter(d => d.time > yesMax && d.time <= spotMax)
                        .map(d => d.time);

                    const forwardFill = fillTimestamps.map(time => ({
                        time,
                        value: lastYes.value
                    }));

                    filteredYes = [...filteredYes, ...forwardFill];
                    console.log(`[SubgraphChart] Forward-filled YES with ${forwardFill.length} points`);
                }
            }

            // STEP 3: Forward-fill NO to SPOT's max time
            if (filteredNo.length > 0) {
                const noMax = Math.max(...filteredNo.map(d => d.time));
                const lastNo = filteredNo.find(d => d.time === noMax);

                if (lastNo && spotMax > noMax) {
                    const fillTimestamps = filteredSpot
                        .filter(d => d.time > noMax && d.time <= spotMax)
                        .map(d => d.time);

                    const forwardFill = fillTimestamps.map(time => ({
                        time,
                        value: lastNo.value
                    }));

                    filteredNo = [...filteredNo, ...forwardFill];
                    console.log(`[SubgraphChart] Forward-filled NO with ${forwardFill.length} points`);
                }
            }

            console.log(`[SubgraphChart] Aligned to SPOT range (${new Date(spotMin * 1000).toLocaleDateString()} - ${new Date(spotMax * 1000).toLocaleDateString()})`);
            console.log(`[SubgraphChart] Points: YES=${filteredYes.length}, NO=${filteredNo.length}, SPOT=${filteredSpot.length}`);
        } else {
            // No alignment - just log what we have
            console.log(`[SubgraphChart] No alignment (disabled or no overlap), showing: YES=${filteredYes.length}, NO=${filteredNo.length}, SPOT=${filteredSpot.length}`);
        }

        // Set data
        if (filteredYes.length > 0) {
            yesLine.setData(filteredYes);
        }
        if (filteredNo.length > 0) {
            noLine.setData(filteredNo);
        }
        if (showSpot && filteredSpot.length > 0) {
            spotLine.setData(filteredSpot);
        }

        // Fit content
        chart.timeScale().fitContent();

        // Cleanup
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.remove();
                chartInstanceRef.current = null;
            }
        };
    }, [containerWidth, height, isDarkMode, hasData, yesData, noData, dynamicPrecision, showSpot, spotData, config, lineVisibility]);

    // Calculate impact - use spotPrice when available (better formula)
    let impact = 0;
    if (yesPrice !== null && noPrice !== null) {
        if (showSpot && spotPrice && spotPrice > 0) {
            // Correct formula: (yes - no) / spotPrice * 100
            impact = ((yesPrice - noPrice) / spotPrice) * 100;
        } else {
            // Fallback: (yes - no) / max(yes, no) * 100
            const denominator = Math.max(yesPrice, noPrice);
            impact = denominator > 0 ? ((yesPrice - noPrice) / denominator) * 100 : 0;
        }
    }
    // After resolution the losing side's tokens are worthless, so the gap
    // between the two pools no longer measures anything (same as the header).
    const impactCloseTimestamp = config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp;
    const isResolved = resolveMarketStatus({ ...config?.marketInfo, closeTimestamp: impactCloseTimestamp }).state === 'resolved';
    const impactColorClass = isResolved ? '' : (impact >= 0 ? '!text-futarchyTeal7' : '!text-futarchyCrimson7');

    // A failed fetch leaves prices null: show a dash instead of spinning forever.
    const fetchFailed = !!error && !loading;
    const pendingValue = () => (fetchFailed ? '—' : <LoadingSpinner />);

    // Get currency from config
    const currency = config?.BASE_TOKENS_CONFIG?.currency?.symbol ||
        config?.metadata?.currencyTokens?.base?.tokenSymbol ||
        (Number(chainId) === 1 ? 'USDS' : 'sDAI');
    const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || 'TOKEN';
    const tradingPair = `${companySymbol}/${currency}`;

    return (
        // Same container styling as TripleChart parent in MarketPageShowcase
        <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden flex flex-col">

            {/* Header - Same styling as ChartParameters container */}
            <div className="h-16 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
                <div className="flex items-stretch justify-around font-oxanium h-full">
                    {/* Trading Pair - with SUBGRAPH badge */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 first:rounded-tl-3xl px-1">
                        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium flex items-center gap-1">
                            Trading Pair
                            {SHOW_DATA_DEBUG && <span className="text-[8px] bg-futarchyViolet9/20 dark:bg-futarchyViolet7/20 text-futarchyViolet9 dark:text-futarchyViolet7 px-1 rounded">SUBGRAPH</span>}
                        </span>
                        <span className="text-[9px] md:text-sm font-bold text-futarchyGray12 dark:text-white">{tradingPair}</span>
                    </div>

                    {/* Yes Price - SAME BLUE color as ChartParameters */}
                    <ParameterCard
                        label="Yes Price"
                        value={yesPrice === null ? pendingValue() : `${formatWith(yesPrice, 'price', precisionConfig)} ${currency}`}
                        valueClassName="!text-futarchyBlue9 dark:!text-futarchyBlue8"
                        onClick={() => toggleLine('yes')}
                        isDisabled={!lineVisibility.yes}
                    />

                    {/* No Price - SAME YELLOW color as ChartParameters */}
                    <ParameterCard
                        label="No Price"
                        value={noPrice === null ? pendingValue() : `${formatWith(noPrice, 'price', precisionConfig)} ${currency}`}
                        valueClassName="!text-yellow-500 dark:!text-yellow-400"
                        onClick={() => toggleLine('no')}
                        isDisabled={!lineVisibility.no}
                    />

                    {/* Spot/Status Logic */}
                    {(() => {
                        const ct = config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp;
                        const marketStatus = resolveMarketStatus({ ...config?.marketInfo, closeTimestamp: ct });

                        return marketStatus.state !== 'active' ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 px-1 opacity-80">
                                <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">Status</span>
                                <span className="text-[9px] md:text-[11px] font-bold text-futarchyGray12 dark:text-white mt-0.5">
                                    {marketStatus.label}
                                </span>
                            </div>
                        ) : (
                            showSpot && (
                                <ParameterCard
                                    label="Spot Price"
                                    value={spotPrice === null ? <LoadingSpinner /> : `${formatWith(spotPrice, 'price', precisionConfig)} ${currency}`}
                                    valueClassName="opacity-60"
                                    onClick={() => toggleLine('spot')}
                                    isDisabled={!lineVisibility.spot}
                                />
                            )
                        );
                    })()}

                    {/* Impact - SAME styling as ChartParameters */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 last:rounded-tr-3xl px-1">
                        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">Impact (spot)</span>
                        <span className={`text-[9px] md:text-sm font-bold text-futarchyGray12 dark:text-white ${impactColorClass}`}>
                            {isResolved ? '—' : (yesPrice === null || noPrice === null) ? pendingValue() : formatImpactPercent(impact)}
                        </span>
                    </div>

                    {/* Resync Button with Countdown */}
                    {SHOW_DATA_DEBUG && <div className="flex-1 flex flex-col items-center justify-center text-center px-2 last:rounded-tr-3xl">
                        <button
                            onClick={() => {
                                refetch(false); // Manual click shows loading
                                if (onSpotRefresh) onSpotRefresh(); // Refresh spot data too
                                setCountdown(autoResyncInterval);
                            }}
                            disabled={loading}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] md:text-xs font-medium rounded-lg transition-all
                ${loading
                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-futarchyViolet9/10 dark:bg-futarchyViolet7/10 text-futarchyViolet9 dark:text-futarchyViolet7 hover:bg-futarchyViolet9/20 dark:hover:bg-futarchyViolet7/20'
                                }`}
                        >
                            <svg
                                className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {loading ? 'Syncing...' : `Resync (${countdown}s)`}
                        </button>
                    </div>}
                </div>
            </div>

            {/* Chart Area - Same styling as TripleChart container */}
            <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 flex-grow overflow-hidden" style={{ height: `${height}px` }}>
                <div className="w-full h-full flex flex-col relative">
                    {/* Loading overlay */}
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-10">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-futarchyViolet9 dark:border-futarchyViolet7 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm text-gray-600 dark:text-gray-400 font-oxanium">{SHOW_DATA_DEBUG ? 'Loading from subgraph...' : 'Loading chart...'}</span>
                            </div>
                        </div>
                    )}

                    {/* Error state */}
                    {error && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center p-4">
                                <div className="text-red-500 dark:text-red-400 text-sm mb-2 font-oxanium">Error loading data</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">{error}</div>
                                <button
                                    onClick={refetch}
                                    className="text-xs px-3 py-1.5 bg-futarchyViolet9/10 text-futarchyViolet9 dark:text-futarchyViolet7 rounded-lg hover:bg-futarchyViolet9/20 font-oxanium"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}

                    {/* No data state */}
                    {!loading && !error && !hasData && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center p-4">
                                <div className="text-gray-500 dark:text-gray-400 text-sm mb-2 font-oxanium">No candle data available</div>
                                <div className="text-xs text-gray-400 dark:text-gray-500">
                                    Candles are created when swaps occur in the pool
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Chart container */}
                    <div
                        ref={chartContainerRef}
                        className="w-full h-full"
                        style={{ visibility: hasData ? 'visible' : 'hidden' }}
                    />
                </div>
            </div>

            {/* Footer with pool info and data stats */}
            {SHOW_DATA_DEBUG && <div className="px-4 py-2 border-t border-futarchyGray62 dark:border-futarchyGray11/70 bg-futarchyGray2/50 dark:bg-futarchyDarkGray2/50">
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 font-oxanium">
                    <span className="flex items-center gap-4">
                        {yesPool && <span>YES: {yesPool.name}</span>}
                        {noPool && <span>NO: {noPool.name}</span>}
                    </span>
                    <span className="flex items-center gap-3">
                        <span>Data: YES ({yesData?.length || 0}) | NO ({noData?.length || 0})</span>
                        {lastUpdated && <span>Updated: {lastUpdated.toLocaleDateString([], { month: 'short', day: 'numeric' })} {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>}
                    </span>
                </div>
            </div>}
        </div>
    );
};

export default SubgraphChart;
