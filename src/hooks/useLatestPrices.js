import { useState, useEffect } from 'react';

// Base token addresses for Balancer SDK
const BASE_COMPANY_TOKEN_ADDRESS = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb"; // GNO
const BASE_CURRENCY_TOKEN_ADDRESS = "0xaf204776c7245bF4147c2612BF6e5972Ee483701"; // sDAI

/**
 * Fetch spot price using custom endpoint if available
 */
const fetchCustomSpotPrice = async (fetchSpotPriceUrl) => {
  try {
    console.log('[SPOT] Starting custom spot price fetch from:', fetchSpotPriceUrl);
    
    const bearerToken = process.env.NEXT_PUBLIC_SPOT_PRICE_TOKEN ||
                        process.env.SPOT_PRICE_TOKEN;

    console.log('[SPOT] Bearer token check:', {
      hasSpotPriceToken: !!process.env.NEXT_PUBLIC_SPOT_PRICE_TOKEN,
      hasRegularSpotToken: !!process.env.SPOT_PRICE_TOKEN,
      finalToken: bearerToken ? 'found' : 'not found',
      tokenSource: process.env.NEXT_PUBLIC_SPOT_PRICE_TOKEN ? 'dedicated spot price token' :
                   process.env.SPOT_PRICE_TOKEN ? 'regular spot price token' : 'none'
    });
    
    if (!bearerToken) {
      console.warn('[SPOT] No bearer token found in environment variables');
      throw new Error('No bearer token available for custom spot price endpoint');
    }

    const response = await fetch(fetchSpotPriceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Custom spot price API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[SPOT] Custom spot price response:', data);

    if (!data.price_in_sdai) {
      throw new Error('Custom spot price response missing price_in_sdai field');
    }

    const price = parseFloat(data.price_in_sdai);
    if (isNaN(price) || !isFinite(price)) {
      throw new Error(`Invalid price_in_sdai value: ${data.price_in_sdai}`);
    }

    const result = {
      price: price,
      timestamp: Date.now(),
      source: 'custom',
      rawData: data
    };
    
    console.log('[SPOT] Custom spot price result:', result);
    return result;

  } catch (error) {
    console.error('[SPOT] Failed to fetch custom spot price:', error);
    throw error;
  }
};

/**
 * Fetch spot price using Balancer V3 REST API (lightweight, no SDK import)
 */
const fetchBalancerSpotPrice = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    console.log('[SPOT] Fetching Balancer spot price via V3 API...');

    const companyAddr = BASE_COMPANY_TOKEN_ADDRESS.toLowerCase();
    const currencyAddr = BASE_CURRENCY_TOKEN_ADDRESS.toLowerCase();

    const response = await fetch('https://api-v3.balancer.fi/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        query: `{
          poolGetPools(
            where: { chainIn: [GNOSIS], tokensIn: ["${companyAddr}", "${currencyAddr}"] }
            orderBy: totalLiquidity
            orderDirection: desc
            first: 10
          ) {
            id address type
            dynamicData { totalLiquidity }
            poolTokens { address symbol balance decimals weight }
          }
        }`
      })
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Balancer V3 API returned ${response.status}`);

    const data = await response.json();
    const pools = data.data?.poolGetPools || [];

    // Find pool containing BOTH company and currency tokens
    const matchingPool = pools.find(pool => {
      const addrs = pool.poolTokens.map(t => t.address.toLowerCase());
      return addrs.includes(companyAddr) && addrs.includes(currencyAddr);
    });

    // Most markets have no Balancer pool for this pair. That is expected, not a failure.
    if (!matchingPool) {
      console.log('[SPOT] No Balancer pool contains both tokens; no Balancer spot price');
      return null;
    }

    const companyToken = matchingPool.poolTokens.find(t => t.address.toLowerCase() === companyAddr);
    const currencyToken = matchingPool.poolTokens.find(t => t.address.toLowerCase() === currencyAddr);

    const companyBalance = parseFloat(companyToken.balance);
    const currencyBalance = parseFloat(currencyToken.balance);

    // Weighted pool: price = (currencyBalance/currencyWeight) / (companyBalance/companyWeight)
    const companyWeight = parseFloat(companyToken.weight || '1');
    const currencyWeight = parseFloat(currencyToken.weight || '1');

    const price = (currencyBalance / currencyWeight) / (companyBalance / companyWeight);

    if (!isFinite(price) || price <= 0) throw new Error(`Invalid calculated price: ${price}`);

    console.log('[SPOT] Balancer V3 spot price:', price, 'from pool:', matchingPool.id);

    return {
      price,
      pool: {
        id: matchingPool.id,
        address: matchingPool.address,
        type: matchingPool.type,
        totalLiquidity: matchingPool.dynamicData?.totalLiquidity
      },
      timestamp: Date.now(),
      source: 'balancer'
    };

  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

/**
 * Hook to fetch the latest price data from candle API endpoints and custom/Balancer spot price
 * @param {number} pollingInterval - Interval in milliseconds to refresh data (default: 30000 - 30 seconds)
 * @param {Object} config - Configuration object containing fetchSpotPrice URL and other metadata
 * @returns {Object} - Object containing latest price data and loading/error states
 */
const useLatestPrices = (pollingInterval = 30000, config = null) => {
  const [prices, setPrices] = useState({
    yes: null,
    no: null, 
    base: null,
    spotPrice: null,
    spotPriceSDAI: null,
    timestamp: null,
    // Store the full candle data for the chart
    yesData: [],
    noData: [],
    baseData: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    // Skip initial fetch if config is expected but not yet loaded
    // Only fetch immediately if no config is needed or config is already available
    if (config === null) {
      console.log('[SPOT] Config is null, skipping price fetch until config loads...');
      setPrices(prev => ({ ...prev, loading: true }));
      return;
    }

    const fetchLatestPrices = async () => {
      try {
        // YES/NO pool data is currently unused (fetched via subgraph instead)
        let balancerSpotPrice;

        // Try custom spot price first if available, then fall back to Balancer V3 API
        const fetchSpotPriceUrl = config?.metadata?.fetchSpotPrice || config?.marketInfo?.fetchSpotPrice;
        try {
          if (fetchSpotPriceUrl) {
            balancerSpotPrice = await fetchCustomSpotPrice(fetchSpotPriceUrl);
          } else {
            balancerSpotPrice = await fetchBalancerSpotPrice();
          }
        } catch (error) {
          console.warn('[SPOT] Primary spot price fetch failed:', error.message);
          // If custom failed, try Balancer as fallback
          if (fetchSpotPriceUrl) {
            try {
              balancerSpotPrice = await fetchBalancerSpotPrice();
            } catch (balancerError) {
              console.warn('[SPOT] Balancer fallback also failed:', balancerError.message);
              balancerSpotPrice = null;
            }
          } else {
            balancerSpotPrice = null;
          }
        }

        // Use Balancer spot price for base price if available
        const basePrice = balancerSpotPrice?.price || null;
        console.log('[SPOT] Extracted prices:', { basePrice });

        // Spot price is the base asset price (YES/NO data comes from Supabase pool_candles, not here)
        const spotPrice = basePrice;
        const spotPriceSDAI = basePrice;

        // Create synthetic base data from Balancer price for chart consistency
        const formattedBaseData = balancerSpotPrice ? [{
          time: balancerSpotPrice.timestamp,
          value: basePrice
        }] : [];

        const finalState = {
          yes: null,
          no: null,
          base: basePrice,
          spotPrice: spotPrice,
          spotPriceSDAI: spotPriceSDAI,
          timestamp: balancerSpotPrice?.timestamp || Date.now(),
          yesData: [],
          noData: [],
          baseData: formattedBaseData,
          loading: false,
          error: null,
          balancerPool: balancerSpotPrice?.pool || null,
          source: balancerSpotPrice ? 'hybrid' : 'partial'
        };

        console.log('[SPOT] Setting final state:', finalState);
        setPrices(finalState);

      } catch (error) {
        console.error('[SPOT] Error fetching latest prices:', error);
        console.error('[SPOT] Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        setPrices(prev => ({
          ...prev,
          loading: false,
          error: error.message
        }));
      }
    };

    // Fetch immediately
    fetchLatestPrices();
    
    // Set up polling
    const interval = setInterval(fetchLatestPrices, pollingInterval);
    
    // Clean up
    return () => clearInterval(interval);
  }, [pollingInterval, config?.metadata?.fetchSpotPrice, config?.marketInfo?.fetchSpotPrice]);

  return prices;
};

export default useLatestPrices; 