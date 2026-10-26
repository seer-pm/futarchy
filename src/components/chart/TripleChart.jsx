import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
import { PRECISION_CONFIG } from '../futarchyFi/marketPage/constants/contracts';
import { CHART_FONT_FAMILY, chartColors, impactColor } from '../../config/chartColors';

const computeRightOffset = (...seriesList) => {
  if (!seriesList.length) return 0;
  const lengths = seriesList.map(series => Array.isArray(series) ? series.length : 0);
  const maxCandles = Math.max(...lengths, 0);
  if (maxCandles === 0) return 0;
  const proportionalOffset = Math.ceil(maxCandles * 0.07);
  return proportionalOffset > 0 ? proportionalOffset : 0;
};

const DEFAULT_YES_POOL = '0xF336F812Db1ad142F22A9A4dd43D40e64B478361';
const DEFAULT_NO_POOL = '0xfbf1BE5CE2f9056dAaB1C368EC241ad7Be3507A8';
const DEFAULT_BASE_POOL = '0xd1d7fa8871d84d0e77020fc28b7cd5718c446522';

// The Supabase candles backend is permanently gone; the chart renders from
// prop data only. `supabase` is a stub so the (disabled) legacy code paths
// below never crash if re-enabled by mistake.
const supabase = null;

const INTERVAL_OPTIONS = [
  { label: '1 Minute', value: '60000' },
  { label: '1 Hour', value: '3600000' }
];

const TripleChart = ({
  height = 448,
  propYesData = null,
  propNoData = null,
  propBaseData = null,
  propEventProbabilityData = null,
  shouldFetchData = true,
  selectedCurrency = 'SDAI',
  sdaiRate = null,
  isLoadingRate = false,
  rateError = null,
  yesPoolAddress = DEFAULT_YES_POOL,
  noPoolAddress = DEFAULT_NO_POOL,
  basePoolAddress = DEFAULT_BASE_POOL,
  config = null,
  spotPrice = null, // Add spot price prop to determine inversion logic
  chartFilters = { spot: true, yes: true, no: true, impact: false }, // Spot price shown as semi-transparent dashed line
  cropSpot = true, // Only show spot data points that have corresponding YES/NO data at the same timestamp
}) => {
  // Supabase realtime candle fetching is permanently disabled (backend gone);
  // these flags stay hardcoded off so the chart only renders prop data.
  const usingSupabaseRealtime = false;
  const useBaseFromSupabase = false;

  // Get dynamic pool addresses from config - PRIORITIZE CONDITIONAL POOLS
  // POOL_CONFIG_YES/NO are mapped to conditional_pools in useContractConfig (the prediction market pools)
  // PREDICTION_POOLS are fallback pools if conditional pools not available
  // This ensures we're charting the actual conditional token prices (YES_TOKEN/sDAI vs NO_TOKEN/sDAI)
  const dynamicYesPoolAddress = config?.POOL_CONFIG_YES?.address || config?.PREDICTION_POOLS?.yes?.address;
  const dynamicNoPoolAddress = config?.POOL_CONFIG_NO?.address || config?.PREDICTION_POOLS?.no?.address;
  const dynamicThirdPoolAddress = config?.POOL_CONFIG_THIRD?.address || config?.PREDICTION_POOLS?.third?.address;
  const dynamicBasePoolAddress = config?.BASE_POOL_CONFIG?.address || basePoolAddress; // Use base pool from config if available, otherwise fallback

  // Use spot price from config if not provided as prop
  const effectiveSpotPrice = spotPrice || config?.spotPrice || config?.marketInfo?.spotPrice || config?.metadata?.spotPrice;

  // Don't fetch data until config is available (unless using prop data)
  const shouldWaitForConfig = shouldFetchData && !propYesData && !propNoData && (!dynamicYesPoolAddress || !dynamicNoPoolAddress);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const isInitialLoad = useRef(true); // Track if this is the initial fetch
  const intervalDropdownRef = useRef(null);
  const chartReadyRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [yesData, setYesData] = useState(propYesData || []);
  const [noData, setNoData] = useState(propNoData || []);
  const [baseData, setBaseData] = useState(propBaseData || []);
  const [eventProbabilityData, setEventProbabilityData] = useState(propEventProbabilityData || []);
  const [loading, setLoading] = useState(!propYesData || !propNoData || !propBaseData || !propEventProbabilityData);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(
    () => typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const [supabaseYesCandles, setSupabaseYesCandles] = useState([]);
  const [supabaseNoCandles, setSupabaseNoCandles] = useState([]);
  const [supabaseBaseCandles, setSupabaseBaseCandles] = useState([]);
  const [supabaseThirdCandles, setSupabaseThirdCandles] = useState([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false);
  const [errorSupabase, setErrorSupabase] = useState(null);
  const [interval, setIntervalValue] = useState('3600000'); // default 1 hour
  const [isIntervalDropdownOpen, setIsIntervalDropdownOpen] = useState(false);

  // Function to calculate impact data from yes, no, and spot data
  const calculateImpactData = (yesData, noData, spotData) => {
    if (!yesData || !noData || !spotData) return [];

    // Create a map of all timestamps
    const timestampMap = new Map();

    // Add all data points to the map
    yesData.forEach(d => {
      if (!timestampMap.has(d.time)) {
        timestampMap.set(d.time, {});
      }
      timestampMap.get(d.time).yes = d.value;
    });

    noData.forEach(d => {
      if (!timestampMap.has(d.time)) {
        timestampMap.set(d.time, {});
      }
      timestampMap.get(d.time).no = d.value;
    });

    spotData.forEach(d => {
      if (!timestampMap.has(d.time)) {
        timestampMap.set(d.time, {});
      }
      timestampMap.get(d.time).spot = d.value;
    });

    // Calculate impact for each timestamp where all three values exist
    const impactData = [];
    timestampMap.forEach((values, time) => {
      if (values.yes !== undefined && values.no !== undefined && values.spot !== undefined && values.spot > 0) {
        // Impact formula: (yes - no) / spot * 100
        const impact = ((values.yes - values.no) / values.spot) * 100;
        impactData.push({
          time: time,
          value: impact
        });
      }
    });

    // Sort by time
    impactData.sort((a, b) => a.time - b.time);

    console.log('[Impact Calculation] Generated', impactData.length, 'impact points from', timestampMap.size, 'timestamps');
    return impactData;
  };

  const getImpactColor = (impactSeries = []) => {
    const lastPoint = impactSeries?.[impactSeries.length - 1];
    const value = typeof lastPoint?.value === 'number' ? lastPoint.value : 0;
    return impactColor(isDarkMode, value);
  };

  // Helper function to crop spot data to only include timestamps where YES/NO data exists
  const cropSpotData = (spotData, yesData, noData) => {
    if (!cropSpot || !spotData?.length || (!yesData?.length && !noData?.length)) {
      return spotData;
    }

    // Create a Set of timestamps from YES and NO data
    const conditionalTimestamps = new Set();
    yesData.forEach(d => conditionalTimestamps.add(d.time));
    noData.forEach(d => conditionalTimestamps.add(d.time));

    // Filter spot data to only include timestamps that exist in conditional data
    const croppedSpot = spotData.filter(d => conditionalTimestamps.has(d.time));

    console.log(`[Spot Cropping] Original spot points: ${spotData.length}, Cropped to: ${croppedSpot.length} (matched with YES/NO timestamps)`);

    return croppedSpot;
  };

  // Helper function to invert token pool data to match spot price relationship to 1
  const processTokenData = (data, tokenType = 'TOKEN') => {
    console.log(`[${tokenType} Data Processing] Raw data before inversion check:`, data);
    console.log(`[${tokenType} Data Processing] Spot price for inversion logic:`, effectiveSpotPrice);

    const processedData = data.map(d => {
      if (!d.value || !effectiveSpotPrice) return d;

      // If spot price < 1: invert values > 1 to make them < 1 (like spot price)
      // If spot price > 1: invert values < 1 to make them > 1 (like spot price)
      const shouldInvert = (effectiveSpotPrice < 1 && d.value > 1) || (effectiveSpotPrice >= 1 && d.value < 1);

      if (shouldInvert) {
        const invertedValue = 1 / d.value;
        console.log(`[${tokenType} Data Processing] Inverting price: ${d.value} -> ${invertedValue} (spotPrice: ${effectiveSpotPrice} ${effectiveSpotPrice < 1 ? '< 1' : '>= 1'})`);
        return { ...d, value: invertedValue };
      }
      return d;
    });

    const invertedCount = processedData.filter((d, i) => d.value !== data[i].value).length;
    if (invertedCount > 0) {
      console.log(`[${tokenType} Data Processing] Inverted ${invertedCount} prices to match spot price relationship to 1 (spotPrice: ${effectiveSpotPrice})`);
    } else {
      console.log(`[${tokenType} Data Processing] No inversion needed - values already match spot price relationship (spotPrice: ${effectiveSpotPrice})`);
    }

    return processedData;
  };

  // Effect to handle clicks outside the dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (intervalDropdownRef.current && !intervalDropdownRef.current.contains(event.target)) {
        setIsIntervalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  useEffect(() => {
    console.log('[TripleChart Data Effect] Running effect. Props:', {
      propYesData,
      propNoData,
      propBaseData,
      shouldFetchData,
      usingSupabaseRealtime,
      dynamicYesPoolAddress,
      dynamicNoPoolAddress,
      shouldWaitForConfig
    });

    // If we should wait for config and don't have addresses yet, show loading
    if (shouldWaitForConfig) {
      console.log('[TripleChart] Waiting for config to load with pool addresses...');
      setLoading(true);
      setError(null);
      return;
    }

    const fetchSupabaseData = async () => {
      if (!usingSupabaseRealtime) return;

      // Don't fetch if we don't have the pool addresses yet
      if (!dynamicYesPoolAddress || !dynamicNoPoolAddress) {
        console.log('[Supabase] Waiting for pool addresses before fetching data');
        return;
      }

      // Debug: Start fetching
      console.log('[Supabase] Fetching YES/NO/BASE/THIRD pool data', {
        dynamicYesPoolAddress,
        dynamicNoPoolAddress,
        dynamicThirdPoolAddress,
        dynamicBasePoolAddress,
        useBaseFromSupabase,
        interval,
        effectiveSpotPrice
      });
      console.log('[TripleChart Data Effect] Starting fetchSupabaseData...');
      if (isInitialLoad.current) {
        setIsLoadingSupabase(true);
        setErrorSupabase(null);
        setLoading(false);
      }
      try {
        const { data: yesData, error: yesError } = await supabase
          .from('pool_candles')
          .select('timestamp, price')
          .eq('address', dynamicYesPoolAddress)
          .eq('interval', interval)
          .order('timestamp', { ascending: false })
          .limit(500);
        const yesDataChrono = (yesData || []).slice().reverse();
        // Debug: YES data (raw)
        console.log('[Supabase] Initial YES pool data (raw):', yesDataChrono);
        // Process YES data to match spot price relationship to 1
        // If spot < 1: invert values > 1 to be < 1 | If spot > 1: invert values < 1 to be > 1
        const yesDataInverted = yesData.map(d => {
          if (!d.price || !effectiveSpotPrice) return { ...d, value: d.price };

          // If spot price < 1: invert values > 1 to make them < 1 (like spot price)
          // If spot price > 1: invert values < 1 to make them > 1 (like spot price)
          const shouldInvert = (effectiveSpotPrice < 1 && d.price > 1) || (effectiveSpotPrice >= 1 && d.price < 1);

          if (shouldInvert) {
            console.log(`[Supabase] Inverting YES price: ${d.price} -> ${1 / d.price} (spotPrice: ${effectiveSpotPrice} ${effectiveSpotPrice < 1 ? '< 1' : '>= 1'})`);
            return { ...d, price: 1 / d.price, value: 1 / d.price };
          }
          return { ...d, value: d.price };
        });
        console.log('[Supabase] Initial YES pool data (processed):', yesDataInverted);
        const yesLessThanOne = yesDataInverted.filter(d => d.value !== null && d.value < 1);
        console.log('[YES Pool] Values less than 1 after processing:', yesLessThanOne);
        if (yesError) throw new Error(`Error fetching YES pool data: ${yesError.message}`);
        const { data: noData, error: noError } = await supabase
          .from('pool_candles')
          .select('timestamp, price')
          .eq('address', dynamicNoPoolAddress)
          .eq('interval', interval)
          .order('timestamp', { ascending: false })
          .limit(500);
        const noDataChrono = (noData || []).slice().reverse();
        // Debug: NO data (raw)
        console.log('[Supabase] Initial NO pool data (raw):', noDataChrono);
        // Process NO data to match spot price relationship to 1
        // If spot < 1: invert values > 1 to be < 1 | If spot > 1: invert values < 1 to be > 1
        const noDataInverted = noData.map(d => {
          if (!d.price || !effectiveSpotPrice) return { ...d, value: d.price };

          // If spot price < 1: invert values > 1 to make them < 1 (like spot price)
          // If spot price > 1: invert values < 1 to make them > 1 (like spot price)
          const shouldInvert = (effectiveSpotPrice < 1 && d.price > 1) || (effectiveSpotPrice >= 1 && d.price < 1);

          if (shouldInvert) {
            console.log(`[Supabase] Inverting NO price: ${d.price} -> ${1 / d.price} (spotPrice: ${effectiveSpotPrice} ${effectiveSpotPrice < 1 ? '< 1' : '>= 1'})`);
            return { ...d, price: 1 / d.price, value: 1 / d.price };
          }
          return { ...d, value: d.price };
        });
        console.log('[Supabase] Initial NO pool data (processed):', noDataInverted);
        const lessThanOne = noDataInverted.filter(d => d.value !== null && d.value < 1);
        console.log('[NO Pool] Values less than 1 after processing:', lessThanOne);
        if (noError) throw new Error(`Error fetching NO pool data: ${noError.message}`);

        let thirdData = [];
        if (dynamicThirdPoolAddress) {
          const { data: thirdDataResponse, error: thirdError } = await supabase
            .from('pool_candles')
            .select('timestamp, price')
            .eq('address', dynamicThirdPoolAddress)
            .eq('interval', interval)
            .order('timestamp', { ascending: false })
            .limit(500);
          if (thirdError) throw new Error(`Error fetching THIRD pool data: ${thirdError.message}`);
          thirdData = (thirdDataResponse || []).slice().reverse();
          console.log('[Supabase] Initial THIRD pool data:', thirdData);
        }
        // -----------------------------------------------------------------------------------
        // SMART SPOT PRICE FETCHING WITH TIMESTAMP FILTERING
        // -----------------------------------------------------------------------------------
        // Strategy:
        // 1. First, fetch latest 500 candles from spot price pool (normal fetch)
        // 2. After cropSpot filtering, check if we have any overlapping data
        // 3. If filtered spot data is EMPTY (no overlap with YES/NO timestamps):
        //    - Extract the timestamp range from YES/NO data
        //    - Refetch spot price data using that specific timestamp range
        //    - This ensures we get spot prices from the same time period as YES/NO data
        // -----------------------------------------------------------------------------------
        let baseData;
        if (useBaseFromSupabase) {
          // Step 1: Initial fetch - get latest 500 candles
          console.log('[Supabase BASE] Step 1: Fetching latest 500 candles from spot pool...');
          const { data: baseDataResponse, error: baseError } = await supabase
            .from('pool_candles')
            .select('timestamp, price')
            .eq('address', dynamicBasePoolAddress)
            .eq('interval', interval)
            .order('timestamp', { ascending: false })
            .limit(500);
          if (baseError) throw new Error(`Error fetching BASE pool data: ${baseError.message}`);
          baseData = (baseDataResponse || []).slice().reverse();
          console.log('[Supabase BASE] Initial fetch complete:', {
            candlesCount: baseData.length,
            firstTimestamp: baseData[0]?.timestamp,
            lastTimestamp: baseData[baseData.length - 1]?.timestamp
          });
        } else {
          // Not using external API fallback for BASE data
          baseData = [];
        }
        // Convert data to chart format
        const yesCandles = yesDataInverted.map(d => ({ time: d.timestamp, value: parseFloat(d.value || d.price) }));
        const noCandles = noDataInverted.map(d => ({ time: d.timestamp, value: parseFloat(d.value || d.price) }));
        const thirdCandles = dynamicThirdPoolAddress ? thirdData.map(d => ({ time: d.timestamp, value: parseFloat(d.price) })) : [];
        let baseCandles = useBaseFromSupabase ? baseData.map(d => ({ time: d.timestamp, value: parseFloat(d.price) })) : [];

        // -----------------------------------------------------------------------------------
        // Step 2: Check if cropSpot filtering will result in empty spot data
        // -----------------------------------------------------------------------------------
        if (cropSpot && useBaseFromSupabase && baseCandles.length > 0 && (yesCandles.length > 0 || noCandles.length > 0)) {
          console.log('[Supabase BASE] Step 2: Checking cropSpot overlap...');

          // Simulate the cropSpot filtering to check if we'll have overlap
          const conditionalTimestamps = new Set();
          yesCandles.forEach(d => conditionalTimestamps.add(d.time));
          noCandles.forEach(d => conditionalTimestamps.add(d.time));

          const croppedCount = baseCandles.filter(d => conditionalTimestamps.has(d.time)).length;
          console.log('[Supabase BASE] Overlap check:', {
            spotCandles: baseCandles.length,
            conditionalTimestamps: conditionalTimestamps.size,
            overlappingCandles: croppedCount
          });

          // Step 3: If no overlap detected, refetch spot data using YES/NO timestamp range
          if (croppedCount === 0 && conditionalTimestamps.size > 0) {
            console.log('[Supabase BASE] ⚠️ NO OVERLAP DETECTED! Refetching spot data with timestamp filter...');

            // Get min/max timestamps from YES/NO data
            const timestamps = Array.from(conditionalTimestamps).sort((a, b) => a - b);
            const minTimestamp = timestamps[0];
            const maxTimestamp = timestamps[timestamps.length - 1];

            console.log('[Supabase BASE] Refetching with timestamp range:', {
              minTimestamp,
              maxTimestamp,
              minDate: new Date(minTimestamp * 1000).toISOString(),
              maxDate: new Date(maxTimestamp * 1000).toISOString(),
              rangeHours: ((maxTimestamp - minTimestamp) / 3600).toFixed(2)
            });

            // Refetch spot data with timestamp filters
            const { data: refetchedBaseData, error: refetchError } = await supabase
              .from('pool_candles')
              .select('timestamp, price')
              .eq('address', dynamicBasePoolAddress)
              .eq('interval', interval)
              .gte('timestamp', minTimestamp)  // Greater than or equal to min timestamp
              .lte('timestamp', maxTimestamp)  // Less than or equal to max timestamp
              .order('timestamp', { ascending: true });  // Already in chronological order

            if (refetchError) {
              console.error('[Supabase BASE] Refetch error:', refetchError);
            } else if (refetchedBaseData && refetchedBaseData.length > 0) {
              console.log('[Supabase BASE] ✅ Refetch successful!', {
                candlesCount: refetchedBaseData.length,
                firstTimestamp: refetchedBaseData[0]?.timestamp,
                lastTimestamp: refetchedBaseData[refetchedBaseData.length - 1]?.timestamp
              });

              // Update baseCandles with the refetched data
              baseCandles = refetchedBaseData.map(d => ({ time: d.timestamp, value: parseFloat(d.price) }));

              // Verify we now have overlap
              const newCroppedCount = baseCandles.filter(d => conditionalTimestamps.has(d.time)).length;
              console.log('[Supabase BASE] Post-refetch overlap:', {
                spotCandles: baseCandles.length,
                overlappingCandles: newCroppedCount,
                overlapRate: ((newCroppedCount / baseCandles.length) * 100).toFixed(1) + '%'
              });
            } else {
              console.warn('[Supabase BASE] Refetch returned no data in the timestamp range');
            }
          }
        }

        // Set the final state with potentially refetched base data
        setSupabaseYesCandles(yesCandles);
        setSupabaseNoCandles(noCandles);
        setSupabaseThirdCandles(thirdCandles);
        if (useBaseFromSupabase) {
          setSupabaseBaseCandles(baseCandles);
          setBaseData(baseCandles);
        } else {
          setBaseData(baseData.map(candle => ({ time: candle.timestamp, value: candle.average_price })));
        }
        if (isInitialLoad.current) {
          setIsLoadingSupabase(false);
          isInitialLoad.current = false;
        }
      } catch (err) {
        if (isInitialLoad.current) {
          setErrorSupabase(err.message);
          setSupabaseYesCandles([]);
          setSupabaseNoCandles([]);
          setSupabaseBaseCandles([]);
          setBaseData([]);
          setIsLoadingSupabase(false);
        }
      }
    };

    if (usingSupabaseRealtime) {
      console.log('[TripleChart Data Effect] Decision: Use Supabase.');
      if (isLoadingSupabase) {
        console.log('[TripleChart Data Effect] Skipping fetch: Already loading Supabase data.');
        return; // Don't start a new fetch if one is already running
      }

      fetchSupabaseData(); // Initial fetch
      const intervalId = setInterval(() => {
        if (!isLoadingSupabase) { // Check loading state before interval fetch
          console.log('[TripleChart Data Effect] Triggering interval fetch.');
          fetchSupabaseData();
        } else {
          console.log('[TripleChart Data Effect] Skipping interval fetch: Previous fetch still loading.');
        }
      }, 60 * 1000); // Refetch interval

      return () => {
        console.log('[TripleChart Data Effect] Clearing Supabase refetch interval.');
        clearInterval(intervalId);
      };

    } else {
      console.log('[TripleChart Data Effect] Decision: Not using Supabase.');
      if (propYesData && propNoData && propBaseData) {
        console.log('[TripleChart Data Effect] Decision: Using provided props.');
        setYesData(propYesData);
        setNoData(propNoData);
        setBaseData(propBaseData);
        setEventProbabilityData(propEventProbabilityData || []);
        setLoading(false);
        setIsLoadingSupabase(false);
        setError(null);
        setErrorSupabase(null);
        return;

      } else if (shouldFetchData) {
        console.log('[TripleChart Data Effect] Decision: No external API fetch. Awaiting prop data or enable Supabase.');
        setLoading(false);
        setIsLoadingSupabase(false);
        setError(null);
        setErrorSupabase(null);
        setEventProbabilityData([]);
        return;

      } else {
        console.log('[TripleChart Data Effect] Decision: Not using props and not fetching.');
        setLoading(false);
        setIsLoadingSupabase(false);
        setError(null);
        setErrorSupabase(null);
        setYesData([]);
        setNoData([]);
        setBaseData([]);
        setSupabaseYesCandles([]);
        setSupabaseNoCandles([]);
        setSupabaseBaseCandles([]);
        setEventProbabilityData([]);
        return;
      }
    }

  }, [propYesData, propNoData, propBaseData, propEventProbabilityData, shouldFetchData, usingSupabaseRealtime, interval, dynamicYesPoolAddress, dynamicNoPoolAddress, dynamicThirdPoolAddress, dynamicBasePoolAddress, useBaseFromSupabase, config, effectiveSpotPrice]);

  useEffect(() => {
    if (!chartContainerRef.current) {
      console.log('[TripleChart Width Effect] No container ref on mount.');
      return;
    }

    const updateContainerWidth = () => {
      if (chartContainerRef.current) { // Check again inside callback
        const newWidth = chartContainerRef.current.clientWidth;
        console.log(`[TripleChart Width Effect] Updating width: ${newWidth}`); // Add log
        if (newWidth > 0) { // Only set if width is non-zero
          setContainerWidth(newWidth);

          if (chartInstanceRef.current) {
            chartInstanceRef.current.applyOptions({ width: newWidth });
          }
        }
      } else {
        console.log('[TripleChart Width Effect] Ref gone during update?'); // Add log
      }
    };

    updateContainerWidth(); // Try to set initial width

    const resizeObserver = new ResizeObserver(updateContainerWidth);
    resizeObserver.observe(chartContainerRef.current);

    // Maybe the window listener is redundant if CSS handles resizing? Let's keep for now.
    window.addEventListener('resize', updateContainerWidth);

    return () => {
      console.log('[TripleChart Width Effect] Cleaning up observer/listener.'); // Add log
      if (chartContainerRef.current) {
        resizeObserver.unobserve(chartContainerRef.current);
      }
    };
  }, []);

  useEffect(() => {


    if (!chartContainerRef.current) {
      console.log('[TripleChart Render Effect] Aborting: No container ref.');
      return;
    }

    if (containerWidth === 0) {
      console.log('[TripleChart Render Effect] Aborting: Zero width.');
      return;
    }

    // Don't recreate if chart already exists
    if (chartReadyRef.current) {
      console.log('[TripleChart Render Effect] Chart already created, skipping recreation');
      return;
    }

    // Wait for data to be available before creating chart
    const hasData = usingSupabaseRealtime
      ? (supabaseYesCandles?.length > 0 && supabaseNoCandles?.length > 0 && (useBaseFromSupabase ? supabaseBaseCandles?.length > 0 : baseData?.length > 0))
      : (yesData?.length > 0 && noData?.length > 0 && baseData?.length > 0);

    if (!hasData) {
      console.log('[TripleChart Render Effect] Aborting: No data available yet');
      return;
    }

    console.log('[TripleChart Render Effect] Data is available, creating chart...');

    // The chart is transparent so it sits on whatever surface holds it, in either theme.
    const colors = chartColors(isDarkMode);
    const backgroundColor = 'transparent';
    const textColor = colors.text;
    const crosshairColor = colors.crosshair;
    const borderColor = 'transparent';

    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height: height,
      layout: {
        background: { type: 'solid', color: backgroundColor },
        textColor: textColor,
        fontFamily: CHART_FONT_FAMILY,
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

    const adjustValue = (value) => {
      if (selectedCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0) {
        return value * sdaiRate;
      }
      return value;
    };



    const formatData = (data, tokenType = 'BASE') => {
      // Debug: Raw data before formatting
      console.log('[Supabase] Raw data for formatting:', data);
      const offsetMinutes = new Date().getTimezoneOffset();
      const timezoneOffsetSeconds = offsetMinutes * 60;

      console.log('Timezone adjustment:', {
        offsetMinutes,
        timezoneOffsetSeconds,
        localTime: new Date().toLocaleString(),
        utcTime: new Date().toUTCString()
      });

      let processedData = data;

      // Apply token data inversion if this is YES or NO data
      if (tokenType === 'YES' || tokenType === 'NO') {
        processedData = processTokenData(data, tokenType);
      }

      const shouldAdjustValue = tokenType !== 'EVENT';

      const sortedData = processedData.map(d => {
        let timestamp = d.time;

        if (timestamp.toString().length > 10) {
          timestamp = Math.floor(timestamp / 1000);
        }

        const localTimestamp = timestamp - timezoneOffsetSeconds;

        if (d === processedData[0]) {
          console.log('First point conversion:', {
            originalUtc: new Date(timestamp * 1000).toUTCString(),
            converted: new Date(localTimestamp * 1000).toLocaleString()
          });
        }

        const currentTime = Math.floor(Date.now() / 1000);
        if (localTimestamp > currentTime) {
          console.warn('Future timestamp detected and adjusted:', {
            original: new Date(timestamp * 1000).toUTCString(),
            adjusted: new Date(currentTime * 1000).toLocaleString()
          });
          return {
            time: currentTime,
            value: shouldAdjustValue ? adjustValue(d.value) : d.value
          };
        }

        return {
          time: localTimestamp,
          value: shouldAdjustValue ? adjustValue(d.value) : d.value
        };
      }).sort((a, b) => a.time - b.time);

      // Filter out duplicate timestamps
      const uniqueData = sortedData.filter((item, index, arr) => {
        // Keep the first item, or items with a timestamp different from the a one
        return index === 0 || item.time > arr[index - 1].time;
      });

      // Log if duplicates were removed
      if (uniqueData.length < sortedData.length) {
        console.warn(`[TripleChart formatData] Removed ${sortedData.length - uniqueData.length} duplicate timestamp entries.`);
      }

      const finalData = tokenType === 'EVENT'
        ? uniqueData.map(point => ({ ...point, value: point.value * 100 }))
        : uniqueData;

      return finalData;
    };

    // Use precision from config.PRECISION_CONFIG if available, otherwise use old precisions.main fallback
    const dynamicPrecision = config?.PRECISION_CONFIG?.display?.price || config?.precisions?.main || 2;
    const priceFormat = {
      type: 'price',
      precision: dynamicPrecision,
      minMove: Math.pow(10, -dynamicPrecision), // Adjust minMove based on precision
    };

    const yesLine = chart.addSeries(LineSeries, {
      color: colors.pass,
      lineWidth: 2,
      title: 'YES',
      priceFormat: priceFormat,
    });

    const noLine = chart.addSeries(LineSeries, {
      color: colors.fail,
      lineWidth: 2,
      title: 'NO',
      priceFormat: priceFormat,
    });

    const baseLine = chart.addSeries(LineSeries, {
      color: colors.spot,
      lineWidth: 2,
      lineStyle: 2, // Dashed line (0=solid, 1=dotted, 2=dashed, 3=large dashed, 4=sparse dotted)
      title: 'SPOT',
      priceFormat: priceFormat,
    });

    const eventProbabilityLine = chart.addSeries(LineSeries, {
      color: colors.eventProbability,
      lineWidth: 2,
      title: 'EVENT %',
      priceFormat: {
        type: 'custom',
        formatter: (price) => `${price.toFixed(2)}%`,
        minMove: 0.01,
      },
    });

    // Impact line, coloured by the sign of its latest point
    const impactLine = chart.addSeries(LineSeries, {
      color: colors.impactPositive,
      lineWidth: 2,
      title: 'IMPACT %',
      priceFormat: {
        type: 'custom',
        formatter: (price) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%`,
        minMove: 0.01,
      },
    });

    // Set initial data
    console.log('[Chart Creation] Setting initial data...');
    console.log('[Chart Creation] YES data source:', usingSupabaseRealtime ? 'supabase' : 'props', 'length:', (usingSupabaseRealtime ? supabaseYesCandles : yesData)?.length);
    console.log('[Chart Creation] NO data source:', usingSupabaseRealtime ? 'supabase' : 'props', 'length:', (usingSupabaseRealtime ? supabaseNoCandles : noData)?.length);
    console.log('[Chart Creation] BASE data source:', (usingSupabaseRealtime && useBaseFromSupabase) ? 'supabase' : 'props', 'length:', (usingSupabaseRealtime && useBaseFromSupabase ? supabaseBaseCandles : baseData)?.length);
    console.log('[Chart Creation] EVENT data source:', usingSupabaseRealtime ? 'supabase' : 'props', 'length:', (usingSupabaseRealtime ? supabaseThirdCandles : eventProbabilityData)?.length);

    const yesDataForChart = formatData(usingSupabaseRealtime ? supabaseYesCandles : yesData, 'YES'); // Apply YES token inversion logic
    const noDataForChart = formatData(usingSupabaseRealtime ? supabaseNoCandles : noData, 'NO');  // Apply NO token inversion logic
    let baseDataForChart = formatData(usingSupabaseRealtime && useBaseFromSupabase ? supabaseBaseCandles : baseData, 'BASE');
    const eventProbabilityDataForChart = formatData(usingSupabaseRealtime ? supabaseThirdCandles : eventProbabilityData, 'EVENT');

    // Apply startCandleUnix filtering (if present in config)
    // This ensures chart only shows candles after the proposal/market started
    const startCandleUnix = config?.startCandleUnix || config?.metadata?.startCandleUnix || config?.marketInfo?.startCandleUnix;
    let filteredYesData = yesDataForChart;
    let filteredNoData = noDataForChart;
    let filteredBaseData = baseDataForChart;
    let filteredEventData = eventProbabilityDataForChart;

    if (startCandleUnix && typeof startCandleUnix === 'number') {
      console.log(`[TripleChart] Filtering data to start from ${new Date(startCandleUnix * 1000).toISOString()}`);
      filteredYesData = yesDataForChart.filter(d => d.time >= startCandleUnix);
      filteredNoData = noDataForChart.filter(d => d.time >= startCandleUnix);
      filteredBaseData = baseDataForChart.filter(d => d.time >= startCandleUnix);
      filteredEventData = eventProbabilityDataForChart.filter(d => d.time >= startCandleUnix);
      console.log(`[TripleChart] After startCandleUnix filter - YES: ${filteredYesData.length}, NO: ${filteredNoData.length}, BASE: ${filteredBaseData.length}, EVENT: ${filteredEventData.length}`);
    }

    // Apply cropSpot filtering to base data
    filteredBaseData = cropSpotData(filteredBaseData, filteredYesData, filteredNoData);

    console.log('[Chart Creation] Formatted data lengths - YES:', filteredYesData?.length, 'NO:', filteredNoData?.length, 'BASE:', filteredBaseData?.length, 'EVENT:', filteredEventData?.length);

    yesLine.setData(filteredYesData);
    noLine.setData(filteredNoData);
    baseLine.setData(filteredBaseData);
    eventProbabilityLine.setData(filteredEventData);

    // Calculate and set impact data
    const impactDataForChart = calculateImpactData(filteredYesData, filteredNoData, filteredBaseData);
    impactLine.setData(impactDataForChart);
    impactLine.applyOptions({ color: getImpactColor(impactDataForChart) });

    const dynamicRightOffset = computeRightOffset(filteredYesData, filteredNoData, filteredEventData);
    chart.timeScale().applyOptions({ rightOffset: dynamicRightOffset });

    // Set initial visibility based on chartFilters
    yesLine.applyOptions({ visible: chartFilters.yes });
    noLine.applyOptions({ visible: chartFilters.no });
    baseLine.applyOptions({ visible: chartFilters.spot });
    impactLine.applyOptions({ visible: chartFilters.impact });
    eventProbabilityLine.applyOptions({ visible: chartFilters.eventProbability });

    // Store series references for later updates
    chartInstanceRef.current.yesLine = yesLine;
    chartInstanceRef.current.noLine = noLine;
    chartInstanceRef.current.baseLine = baseLine;
    chartInstanceRef.current.impactLine = impactLine;
    chartInstanceRef.current.eventProbabilityLine = eventProbabilityLine;

    const existingTextNode = chartContainerRef.current.querySelector('#currency-label');
    if (existingTextNode) {
      existingTextNode.remove();
    }

    const currencyLabel = document.createElement('div');
    currencyLabel.id = 'currency-label';
    currencyLabel.style.position = 'absolute';
    currencyLabel.style.top = '10px';
    currencyLabel.style.right = '50px';
    currencyLabel.style.zIndex = '10';
    currencyLabel.style.padding = '2px 6px';
    currencyLabel.style.fontSize = '10px';
    currencyLabel.style.borderRadius = '4px';
    currencyLabel.style.backgroundColor = colors.labelBackground;
    currencyLabel.style.color = colors.labelText;
    const displayCurrencyLabel = selectedCurrency === 'WXDAI' ? 'xDAI' : selectedCurrency;
    currencyLabel.textContent = `Prices in ${displayCurrencyLabel}`;
    if (isLoadingRate && selectedCurrency === 'WXDAI') {
      currencyLabel.textContent += ' (Rate Loading...)';
    } else if (rateError && selectedCurrency === 'WXDAI') {
      currencyLabel.textContent += ' (Rate N/A)';
    }
    chartContainerRef.current.appendChild(currencyLabel);

    // Fit content on initial chart creation
    chart.timeScale().fitContent();

    // Mark chart as ready
    chartReadyRef.current = true;

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        chartReadyRef.current = false;
      }
      const labelToRemove = chartContainerRef.current?.querySelector('#currency-label');
      if (labelToRemove) {
        labelToRemove.remove();
      }
    };
  }, [containerWidth, height, usingSupabaseRealtime, supabaseYesCandles?.length > 0, supabaseNoCandles?.length > 0, supabaseBaseCandles?.length > 0, yesData?.length > 0, noData?.length > 0, baseData?.length > 0, useBaseFromSupabase]);

  // Effect to handle theme changes without recreating chart
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    const colors = chartColors(isDarkMode);
    const backgroundColor = 'transparent';
    const textColor = colors.text;
    const crosshairColor = colors.crosshair;
    const borderColor = 'transparent';

    chartInstanceRef.current.applyOptions({
      layout: {
        background: { type: 'solid', color: backgroundColor },
        textColor: textColor,
      },
      crosshair: {
        vertLine: { color: crosshairColor },
        horzLine: { color: crosshairColor },
      },
      timeScale: { borderColor: borderColor },
      rightPriceScale: { borderColor: borderColor },
      leftPriceScale: { borderColor: borderColor },
    });

    // Each theme has its own series steps, validated against that theme's surface
    const { yesLine, noLine, baseLine, eventProbabilityLine, impactLine } = chartInstanceRef.current;
    yesLine?.applyOptions({ color: colors.pass });
    noLine?.applyOptions({ color: colors.fail });
    baseLine?.applyOptions({ color: colors.spot, lineStyle: 2 });
    eventProbabilityLine?.applyOptions({ color: colors.eventProbability });
    if (impactLine) {
      impactLine.applyOptions({ color: getImpactColor(impactLine.data()) });
    }

    // Update currency label
    const currencyLabel = chartContainerRef.current?.querySelector('#currency-label');
    if (currencyLabel) {
      currencyLabel.style.backgroundColor = colors.labelBackground;
      currencyLabel.style.color = colors.labelText;
    }
  }, [isDarkMode]);

  // Effect to update currency label text
  useEffect(() => {
    const currencyLabel = chartContainerRef.current?.querySelector('#currency-label');
    if (currencyLabel) {
      const displayCurrencyLabel = selectedCurrency === 'WXDAI' ? 'xDAI' : selectedCurrency;
      currencyLabel.textContent = `Prices in ${displayCurrencyLabel}`;
      if (isLoadingRate && selectedCurrency === 'WXDAI') {
        currencyLabel.textContent += ' (Rate Loading...)';
      } else if (rateError && selectedCurrency === 'WXDAI') {
        currencyLabel.textContent += ' (Rate N/A)';
      }
    }
  }, [selectedCurrency, isLoadingRate, rateError]);

  // Separate effect to update chart data without recreating the chart
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    console.log('[Chart Data Update] Updating chart series data...');

    const formatDataUpdate = (data, tokenType = 'BASE') => {
      const offsetMinutes = new Date().getTimezoneOffset();
      const timezoneOffsetSeconds = offsetMinutes * 60;

      let processedData = data;

      // Apply token data inversion if this is YES or NO data
      if (tokenType === 'YES' || tokenType === 'NO') {
        processedData = processTokenData(data, tokenType);
      }

      const shouldAdjustValue = tokenType !== 'EVENT';

      const sortedData = processedData.map(d => {
        let timestamp = d.time;

        if (timestamp.toString().length > 10) {
          timestamp = Math.floor(timestamp / 1000);
        }

        const localTimestamp = timestamp - timezoneOffsetSeconds;
        const currentTime = Math.floor(Date.now() / 1000);

        if (localTimestamp > currentTime) {
          return {
            time: currentTime,
            value: shouldAdjustValue ? adjustValue(d.value) : d.value
          };
        }

        return {
          time: localTimestamp,
          value: shouldAdjustValue ? adjustValue(d.value) : d.value
        };
      }).sort((a, b) => a.time - b.time);

      const uniqueData = sortedData.filter((item, index, arr) => {
        return index === 0 || item.time > arr[index - 1].time;
      });

      return tokenType === 'EVENT'
        ? uniqueData.map(point => ({ ...point, value: point.value * 100 }))
        : uniqueData;
    };



    const adjustValue = (value) => {
      if (selectedCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0) {
        return value * sdaiRate;
      }
      return value;
    };

    // Get series references and update data
    const yesLine = chartInstanceRef.current.yesLine;
    const noLine = chartInstanceRef.current.noLine;
    const baseLine = chartInstanceRef.current.baseLine;
    const eventLine = chartInstanceRef.current.eventProbabilityLine;

    if (yesLine && noLine && baseLine && eventLine) {
      console.log('[Chart Data Update] Updating series with new data...');

      // Update YES data with inversion logic
      const formattedYesData = formatDataUpdate(usingSupabaseRealtime ? supabaseYesCandles : yesData, 'YES');
      yesLine.setData(formattedYesData);

      // Update NO data with inversion logic
      const formattedNoData = formatDataUpdate(usingSupabaseRealtime ? supabaseNoCandles : noData, 'NO');
      noLine.setData(formattedNoData);

      // Update BASE data and apply cropSpot filtering
      let formattedBaseData = formatDataUpdate(usingSupabaseRealtime && useBaseFromSupabase ? supabaseBaseCandles : baseData, 'BASE');
      formattedBaseData = cropSpotData(formattedBaseData, formattedYesData, formattedNoData);
      baseLine.setData(formattedBaseData);

      // Update event probability data
      const formattedEventData = formatDataUpdate(usingSupabaseRealtime ? supabaseThirdCandles : eventProbabilityData, 'EVENT');
      eventLine.setData(formattedEventData);

      // Update impact data if we have an impact line
      if (chartInstanceRef.current.impactLine) {
        const impactData = calculateImpactData(formattedYesData, formattedNoData, formattedBaseData);
        chartInstanceRef.current.impactLine.setData(impactData);
        chartInstanceRef.current.impactLine.applyOptions({
          color: getImpactColor(impactData),
        });
      }

      const updatedRightOffset = computeRightOffset(formattedYesData, formattedNoData, formattedEventData);
      if (chartInstanceRef.current.timeScale) {
        chartInstanceRef.current.timeScale().applyOptions({ rightOffset: updatedRightOffset });
      }
    } else {
      console.log('[Chart Data Update] Series references not found, skipping update');
    }
  }, [yesData, noData, baseData, eventProbabilityData, supabaseYesCandles, supabaseNoCandles, supabaseBaseCandles, supabaseThirdCandles, selectedCurrency, sdaiRate, isLoadingRate, rateError, usingSupabaseRealtime, useBaseFromSupabase, effectiveSpotPrice, cropSpot]);

  // Effect to handle chart filter changes
  useEffect(() => {
    if (!chartInstanceRef.current || !chartReadyRef.current) return;

    const { yesLine, noLine, baseLine, impactLine, eventProbabilityLine } = chartInstanceRef.current;

    if (!yesLine || !noLine || !baseLine || !impactLine || !eventProbabilityLine) return;

    console.log('[Chart Filters] Updating visibility - YES:', chartFilters.yes, 'NO:', chartFilters.no, 'SPOT:', chartFilters.spot, 'IMPACT:', chartFilters.impact, 'EVENT:', chartFilters.eventProbability);

    // Update visibility based on filters
    yesLine.applyOptions({
      visible: chartFilters.yes && !chartFilters.impact && !chartFilters.eventProbability, // Hide when other overlays are shown
    });

    noLine.applyOptions({
      visible: chartFilters.no && !chartFilters.impact && !chartFilters.eventProbability, // Hide when other overlays are shown
    });

    baseLine.applyOptions({
      visible: chartFilters.spot && !chartFilters.impact && !chartFilters.eventProbability, // Hide when other overlays are shown
    });

    impactLine.applyOptions({
      visible: chartFilters.impact, // Only show when impact filter is active
    });

    eventProbabilityLine.applyOptions({
      visible: chartFilters.eventProbability,
    });

    // Fit content when filters change to adjust the view
    if (chartInstanceRef.current.timeScale) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [chartFilters]);

  useEffect(() => {
    if (!usingSupabaseRealtime) return;

    // Don't set up realtime if we don't have the pool addresses yet
    if (!dynamicYesPoolAddress || !dynamicNoPoolAddress) {
      console.log('[Supabase] Waiting for pool addresses before setting up realtime listeners');
      return;
    }

    console.log('[Supabase] Setting up realtime listeners for YES, NO, EVENT, and BASE pools');
    const ALLOWED_ADDRESSES = [
      dynamicYesPoolAddress.toLowerCase(),
      dynamicNoPoolAddress.toLowerCase(),
      ...(dynamicThirdPoolAddress ? [dynamicThirdPoolAddress.toLowerCase()] : []),
      ...(useBaseFromSupabase && dynamicBasePoolAddress ? [dynamicBasePoolAddress.toLowerCase()] : [])
    ];
    const channel = supabase
      .channel('realtime-pool-candles')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pool_candles',
        filter: `interval=eq.${interval}`
      }, (payload) => {
        console.log('[Supabase] Realtime pool update:', payload);
        const poolKey = payload.new?.address?.toLowerCase() || payload.old?.address?.toLowerCase();
        if (!ALLOWED_ADDRESSES.includes(poolKey)) return;

        // Determine which state to update
        let updateFn;
        if (poolKey === dynamicYesPoolAddress.toLowerCase()) {
          updateFn = setSupabaseYesCandles;
        } else if (poolKey === dynamicNoPoolAddress.toLowerCase()) {
          updateFn = setSupabaseNoCandles;
        } else if (dynamicThirdPoolAddress && poolKey === dynamicThirdPoolAddress.toLowerCase()) {
          updateFn = setSupabaseThirdCandles;
        } else if (useBaseFromSupabase && poolKey === dynamicBasePoolAddress.toLowerCase()) {
          updateFn = setSupabaseBaseCandles;
        } else {
          return; // Unknown pool
        }

        updateFn(prev => {
          let arr = prev.slice();
          if (payload.eventType === 'INSERT') {
            arr = [...arr, { time: payload.new.timestamp, value: parseFloat(payload.new.price) }];
            arr = arr.sort((a, b) => a.time - b.time);
          } else if (payload.eventType === 'UPDATE') {
            arr = arr.map(c => c.time === payload.new.timestamp ? { time: payload.new.timestamp, value: parseFloat(payload.new.price) } : c);
          } else if (payload.eventType === 'DELETE') {
            arr = arr.filter(c => c.time !== payload.old.timestamp);
          }
          return arr;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [interval, dynamicYesPoolAddress, dynamicNoPoolAddress, dynamicThirdPoolAddress, dynamicBasePoolAddress, usingSupabaseRealtime, useBaseFromSupabase]);

  const intervalDropdown = (
    <div
      ref={intervalDropdownRef}
      style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, fontSize: 12, width: 150 }}
    >
      <div
        onClick={() => setIsIntervalDropdownOpen(!isIntervalDropdownOpen)}
        style={{
          background: 'var(--seer-surface)',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--seer-text)',
          border: '1px solid var(--seer-border)'
        }}
      >
        <span>Interval: {INTERVAL_OPTIONS.find(opt => opt.value === interval)?.label}</span>
        <span style={{ marginLeft: 8, transform: isIntervalDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      {isIntervalDropdownOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--seer-surface)',
          marginTop: 4,
          borderRadius: 4,
          boxShadow: '0 10px 28px rgb(20 18 35 / 0.14)',
          overflow: 'hidden',
          border: '1px solid var(--seer-border)'
        }}>
          {INTERVAL_OPTIONS.map(opt => {
            const isSelected = opt.value === interval;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  setIntervalValue(opt.value);
                  setIsIntervalDropdownOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--seer-surface-raised)' : 'transparent',
                  color: 'var(--seer-text)',
                  fontWeight: isSelected ? 'bold' : 'normal'
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) {
    const loadingMessage = shouldWaitForConfig
      ? "Loading market configuration..."
      : "Loading chart data...";

    return (
      <div className={`flex items-center justify-center h-[${height}px] bg-transparent`}>
        <div className={`text-seer-muted`}>{loadingMessage}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-[${height}px] bg-transparent`}>
        <div className={`text-seer-negative`}>Error loading chart data: {error}</div>
      </div>
    );
  }

  if (usingSupabaseRealtime && isLoadingSupabase && isInitialLoad.current) {
    return (
      <div className={`flex items-center justify-center h-[${height}px] bg-transparent`}>
        <div className={`text-seer-muted`}>Loading market data...</div>
      </div>
    );
  }

  if (usingSupabaseRealtime && errorSupabase) {
    return (
      <div className={`flex items-center justify-center h-[${height}px] bg-transparent`}>
        <div className={`text-seer-negative`}>Error: {errorSupabase}</div>
      </div>
    );
  }

  // DEBUG: Log the data being plotted
  console.log('[TripleChart] YES chart data:', yesData);
  console.log('[TripleChart] NO chart data:', noData);
  console.log('[TripleChart] BASE chart data:', baseData);

  return (
    <div className="relative w-full" style={{ zIndex: 0 }}>
      {usingSupabaseRealtime && intervalDropdown}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};

export default TripleChart;
