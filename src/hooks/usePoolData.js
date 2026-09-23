import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getSubgraphEndpoint, FUTARCHY_API_BASE } from '../config/subgraphEndpoints';
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS } from '../config/featureFlags';
import { getBestRpcProvider } from '../utils/getBestRpc';
import { fetchProposalMarketData } from '../services/proposalMarketData';

const ERC20_BALANCE_ABI = ['function balanceOf(address account) view returns (uint256)'];

// Pool data subgraph endpoints are now dynamic per chain - see getSubgraphEndpoint(chainId)

// API base URL - avoid mixed content (upgrade http->https when page is https)
const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_POOL_API_URL || FUTARCHY_API_BASE;
const normalizeBaseUrl = (url) => {
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
  } catch (_) {
    // no-op
  }
  return url;
};
const API_BASE_URL = normalizeBaseUrl(RAW_API_BASE_URL);

console.log('Pool API URL configured as:', API_BASE_URL);

const buildPoolQuery = (poolId) => `{
  pool: pools(where: { id: "${poolId}" }, first: 1) {
    id
    liquidity
    volumeToken0
    volumeToken1
    token0 { id symbol decimals role }
    token1 { id symbol decimals role }
    tick
    proposal { id }
  }
}`;

// Helper to format a raw subgraph pool into our app's data structure
const formatSubgraphPoolData = async (pool, proposalCurrencySymbol, provider) => {
  if (!pool) return { volume: 0, liquidity: null, price: null };

  // Intelligent Volume Aggregation using ROLES or Currency Symbol
  let volumeTotal = 0;
  let currencyIsToken0 = false;
  let currencyIsToken1 = false;

  const t0 = pool.token0;
  const t1 = pool.token1;

  // Check if token is strictly defined as Collateral/Currency via Role
  const isCurrencyRole = (t) => {
    const r = t.role?.toUpperCase();
    return r === 'COLLATERAL' || r === 'CURRENCY' || r === 'YES_CURRENCY' || r === 'NO_CURRENCY';
  };

  // Fallback: Check symbol if role is missing/ambiguous
  const isCurrencySymbol = (t) => {
    if (!proposalCurrencySymbol) return false;
    return t.symbol?.replace(/^(YES|NO)_/i, '').toLowerCase() === proposalCurrencySymbol.toLowerCase();
  };

  // volumeToken0/1 are BigDecimal and already decimal-adjusted by the
  // subgraph, so they are human units as-is — do NOT divide by 10^decimals.
  const vol0 = parseFloat(pool.volumeToken0 || 0);
  const vol1 = parseFloat(pool.volumeToken1 || 0);

  // Check Token 0
  if (isCurrencyRole(t0) || isCurrencySymbol(t0)) {
    volumeTotal += vol0;
    currencyIsToken0 = true;
  }

  // Check Token 1
  if (isCurrencyRole(t1) || isCurrencySymbol(t1)) {
    volumeTotal += vol1;
    currencyIsToken1 = true;
  }

  // Fallback if no clear currency
  if (volumeTotal === 0 && !currencyIsToken0 && !currencyIsToken1) {
    const isCommonStable = (s) => s?.toUpperCase().includes('DAI') ||
      s?.toUpperCase().includes('USDC') ||
      s?.toUpperCase().includes('USDS');
    if (isCommonStable(t0.symbol)) { volumeTotal += vol0; currencyIsToken0 = true; }
    else if (isCommonStable(t1.symbol)) { volumeTotal += vol1; currencyIsToken1 = true; }
    else {
      // Blind default: Assume Token 1 is currency (standard for most pairs)
      volumeTotal += vol1;
      currencyIsToken1 = true;
    }
  }

  // Derive company-token price from tick (price of company token in currency units)
  // tick encodes price as 1.0001^tick where price = token1/token0
  let price = null;
  try {
    if (pool.tick != null) {
      const tick = parseFloat(pool.tick);
      const rawPrice = Math.pow(1.0001, tick); // token1 per token0
      if (currencyIsToken0) {
        // token0=currency, token1=company → rawPrice = company/currency → invert
        price = rawPrice > 0 ? 1 / rawPrice : null;
      } else {
        // token0=company, token1=currency → rawPrice = currency/company → use directly
        price = rawPrice;
      }
    }
  } catch (e) {
    console.warn('Error calculating price from tick:', e);
  }

  // A V3 pool's ERC20 balances are its real reserves (including uncollected fees).
  // This works for both Uniswap V3 and Algebra pools without interpreting virtual L.
  let liquidity = null;
  try {
    const normalizeAddress = (address) => address?.replace(/^\d+-/, '');
    const poolAddress = normalizeAddress(pool.id);
    const [balance0, balance1] = await Promise.all([
      new ethers.Contract(normalizeAddress(t0.id), ERC20_BALANCE_ABI, provider).balanceOf(poolAddress),
      new ethers.Contract(normalizeAddress(t1.id), ERC20_BALANCE_ABI, provider).balanceOf(poolAddress)
    ]);

    liquidity = {
      token0: normalizeAddress(t0.id),
      symbol0: t0.symbol,
      kind0: currencyIsToken0 ? 'currency' : 'company',
      amount0: ethers.utils.formatUnits(balance0, Number(t0.decimals ?? 18)),
      token1: normalizeAddress(t1.id),
      symbol1: t1.symbol,
      kind1: currencyIsToken1 ? 'currency' : 'company',
      amount1: ethers.utils.formatUnits(balance1, Number(t1.decimals ?? 18)),
      isRaw: false
    };
  } catch (e) {
    console.warn('[Pool Data] Failed to read real pool reserves:', e.message);
  }

  return {
    volume: volumeTotal,
    liquidity,
    price
  };
};

/**
 * Fetch best YES and NO pools for a proposal from the chain-specific subgraph
 * @param {string} proposalId - The proposal address
 * @param {number} chainId - The chain ID (1 for Mainnet, 100 for Gnosis)
 */
const fetchBestPoolsForProposal = async (proposalId, chainId = 100) => {
  try {
    const endpoint = getSubgraphEndpoint(chainId);
    if (!endpoint) {
      console.warn(`No subgraph endpoint for chain ${chainId}`);
      return null;
    }

    console.log(`[Pool Data] Fetching pools for ${proposalId} from chain ${chainId}`);

    // Shared with useContractConfig, which needs the same proposal — see
    // services/proposalMarketData.js. Pools carry their tokens as nested
    // entities, so each pool arrives already enriched with
    // symbol/decimals/role; whitelistedTokens only serves to derive the
    // proposal's currency symbol by role.
    const data = await fetchProposalMarketData(chainId, proposalId);
    if (!data?.proposal) {
      console.warn(`[Pool Data] No proposal found on chain ${chainId}`);
      return null;
    }

    // Derive currencySymbol from any *_CURRENCY whitelisted token.
    const currencyMeta = data.whitelistedTokens.find(t => t.role === 'YES_CURRENCY' || t.role === 'NO_CURRENCY');
    const currencySymbol = currencyMeta?.symbol?.replace(/^(YES|NO)_/i, '') || null;

    // Pools arrive with token0/token1 as full entities, so no join is needed.
    const pools = data.pools;

    console.log(`[Pool Data] Found ${pools.length} pools for proposal on chain ${chainId}`);

    // Helper to find best pool for a side — prefer CONDITIONAL pools (where trading happens)
    const getBestPool = (side) => {
      const sidePools = pools.filter(p => p.outcomeSide === side);
      if (sidePools.length === 0) return null;
      // Prefer CONDITIONAL pools (actual trading volume), then EXPECTED_VALUE, then PREDICTION
      const conditional = sidePools.filter(p => p.type === 'CONDITIONAL');
      if (conditional.length > 0) {
        return conditional.sort((a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity))[0];
      }
      return sidePools.sort((a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity))[0];
    };

    const yesPool = getBestPool('YES');
    const noPool = getBestPool('NO');

    if (!yesPool && !noPool) return null;

    // Fetch the latest candle close for both pools (more accurate than tick).
    // `first: 1` per pool can't be expressed as one filter, but GraphQL
    // aliases let both lookups ride in a single request.
    const fetchLatestCandlePrices = async (poolIds) => {
      const wanted = poolIds.filter(Boolean);
      if (wanted.length === 0) return {};
      const selection = wanted
        .map((id, i) => `p${i}: candles(where: { pool: "${id.toLowerCase()}" }, orderBy: time, orderDirection: desc, first: 1) { close }`)
        .join('\n          ');
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `{\n          ${selection}\n        }` })
        });
        const res = await resp.json();
        const prices = {};
        wanted.forEach((id, i) => {
          const close = res.data?.[`p${i}`]?.[0]?.close;
          prices[id] = close ? parseFloat(close) : null;
        });
        return prices;
      } catch (err) {
        console.warn('[Pool Data] Failed to fetch candle prices for', wanted, err);
        return {};
      }
    };

    const [candlePrices, provider] = await Promise.all([
      fetchLatestCandlePrices([yesPool?.id, noPool?.id]),
      getBestRpcProvider(chainId)
    ]);
    const yesCandlePrice = yesPool ? (candlePrices[yesPool.id] ?? null) : null;
    const noCandlePrice = noPool ? (candlePrices[noPool.id] ?? null) : null;

    const [yesData, noData] = await Promise.all([
      formatSubgraphPoolData(yesPool, currencySymbol, provider),
      formatSubgraphPoolData(noPool, currencySymbol, provider)
    ]);

    // Override tick-derived price with candle price when available
    if (yesCandlePrice != null) {
      console.log(`[Pool Data] YES candle price: ${yesCandlePrice} (tick-derived: ${yesData.price})`);
      yesData.price = yesCandlePrice;
    }
    if (noCandlePrice != null) {
      console.log(`[Pool Data] NO candle price: ${noCandlePrice} (tick-derived: ${noData.price})`);
      noData.price = noCandlePrice;
    }

    return {
      yesPool: yesData,
      noPool: noData
    };

  } catch (e) {
    console.error('Error fetching pools for proposal:', e);
    return null;
  }
};

/**
 * Fetch pool data from chain-specific subgraph
 * @param {string} poolId - The pool address
 * @param {number} chainId - The chain ID (1 for Mainnet, 100 for Gnosis)
 */
const fetchSubgraphPoolData = async (poolId, chainId = 100) => {
  try {
    const endpoint = getSubgraphEndpoint(chainId);
    if (!endpoint) {
      console.warn(`No subgraph endpoint for chain ${chainId}`);
      return null;
    }

    // Use native fetch instead of graphql-request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: buildPoolQuery(poolId.toLowerCase()) })
    });

    const result = await response.json();

    if (result.errors) {
      console.error(`Subgraph query errors for chain ${chainId}:`, result.errors);
      return null;
    }

    const pool = result.data?.pool?.[0];
    if (!pool) return null;

    // token0/token1 come back as full entities, so the second round-trip
    // that used to resolve symbol/decimals/role is no longer needed.
    const provider = await getBestRpcProvider(chainId);
    return formatSubgraphPoolData(pool, null, provider);


  } catch (error) {
    console.error('Subgraph fetch error for pool', poolId, error);
    return null;
  }
};

/**
 * Hook to fetch pool volume and liquidity data
 * @param {string} poolId - The pool address to fetch data for
 * @returns {Object} - Contains loading state, error state, volume and liquidity data
 */
export const usePoolData = (poolId) => {
  const [data, setData] = useState({
    volume: null,
    liquidity: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!poolId) {
      setLoading(false);
      return;
    }

    const fetchPoolData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch volume and liquidity in parallel
        const [volumeResponse, liquidityResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/pools/volume?pool_id=${poolId}`),
          fetch(`${API_BASE_URL}/api/v1/pools/liquidity?pool_id=${poolId}`)
        ]);

        if (!volumeResponse.ok || !liquidityResponse.ok) {
          throw new Error('Failed to fetch pool data');
        }

        const volumeData = await volumeResponse.json();
        const liquidityData = await liquidityResponse.json();

        // Normalize liquidity to support both old and new formats
        const normalizedLiquidity = liquidityData
          ? (typeof liquidityData.amount !== 'undefined'
            ? { amount: liquidityData.amount, token: liquidityData.token }
            : {
              token0: liquidityData.token0,
              amount0: liquidityData.amount0,
              token1: liquidityData.token1,
              amount1: liquidityData.amount1
            })
          : null;

        setData({
          volume: volumeData.volume,
          liquidity: normalizedLiquidity
        });
      } catch (err) {
        console.error('Error fetching pool data:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPoolData();
  }, [poolId]);

  return { data, loading, error };
};

/**
 * Hook to fetch data for both YES and NO pools
 * @param {Object} config - The contract configuration containing pool addresses
 * @returns {Object} - Contains loading state, error state, and data for both pools
 */
export const useYesNoPoolData = (config) => {
  const [data, setData] = useState({
    yesPool: { volume: null, liquidity: null },
    noPool: { volume: null, liquidity: null },
    source: 'loading'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const proposalId = config?.proposalId || config?.MARKET_ADDRESS;
    const hasPoolConfig = config?.POOL_CONFIG_YES && config?.POOL_CONFIG_NO;

    if (!config || (!hasPoolConfig && !proposalId)) {
      console.log('Pool data hook: Missing config and no proposal ID for discovery', config);
      setLoading(false);
      return;
    }

    const fetchAllPoolData = async () => {
      try {
        setLoading(true);
        setError(null);

        const yesPoolId = config.POOL_CONFIG_YES?.address;
        const noPoolId = config.POOL_CONFIG_NO?.address;

        // Get chainId from config (default to Gnosis 100)
        const chainId = config.chainId || config.CHAIN_ID || 100;
        console.log(`[Pool Data] Using chain ${chainId} for pool queries`);

        // Determine Source
        // Default: Tickspread (Legacy)
        // Exception: Whitelisted Proposals -> Subgraph

        const PROPOSALS_USING_SUBGRAPH_DATA = [
          '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC'
        ];

        // Start with global toggle (if enabled, always use subgraph)
        let useSubgraph = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS;

        // Check whitelist (only if global toggle is false)
        if (!useSubgraph && proposalId && PROPOSALS_USING_SUBGRAPH_DATA.some(addr => addr.toLowerCase() === proposalId.toLowerCase())) {
          useSubgraph = true;
        }

        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const trackParam = urlParams.get('trackLiquidityVolume');
          // Allow manual override in both directions
          if (trackParam === 'subgraph') {
            useSubgraph = true;
          } else if (trackParam === 'supabase' || trackParam === 'legacy') {
            useSubgraph = false;
          }
        }

        const currentSource = useSubgraph ? 'subgraph' : 'tickspread';
        console.log('Fetching pool data from:', currentSource);

        // Try subgraph discovery by proposal ID (works even without explicit pool config)
        if (useSubgraph && proposalId) {
          const bestPools = await fetchBestPoolsForProposal(proposalId, chainId);
          if (bestPools) {
            console.log('Using Smart Pool Selection from Subgraph:', bestPools);
            setData({
              yesPool: bestPools.yesPool || { volume: 0, liquidity: 0 },
              noPool: bestPools.noPool || { volume: 0, liquidity: 0 },
              source: 'subgraph'
            });
            setLoading(false);
            return;
          }
        }

        // Fallback paths below require explicit pool addresses
        if (!yesPoolId || !noPoolId) {
          console.log('Pool data hook: No pools found via subgraph and no explicit pool config');
          setLoading(false);
          return;
        }

        if (useSubgraph) {
          // Fallback to Config Addresses
          const [yesData, noData] = await Promise.all([
            fetchSubgraphPoolData(yesPoolId, chainId),
            fetchSubgraphPoolData(noPoolId, chainId)
          ]);

          setData({
            yesPool: yesData || { volume: 0, liquidity: 0 },
            noPool: noData || { volume: 0, liquidity: 0 },
            source: 'subgraph'
          });
          setLoading(false);
          return;
        }

        // Helper to fetch from Legacy/Tickspread
        const fetchLegacyData = async () => {
          console.log('Fetching pool data from: tickspread (Legacy)');

          // Fetch all data in parallel with error handling for each request
          const fetchWithFallback = async (url) => {
            try {
              const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              const text = await response.text();
              if (!response.ok) return null;
              try { return JSON.parse(text); } catch (e) { return null; }
            } catch (err) {
              return null;
            }
          };

          const [yesVolume, yesLiquidity, noVolume, noLiquidity] = await Promise.all([
            fetchWithFallback(`${API_BASE_URL}/api/v1/pools/volume?pool_id=${yesPoolId}`),
            fetchWithFallback(`${API_BASE_URL}/api/v1/pools/liquidity?pool_id=${yesPoolId}`),
            fetchWithFallback(`${API_BASE_URL}/api/v1/pools/volume?pool_id=${noPoolId}`),
            fetchWithFallback(`${API_BASE_URL}/api/v1/pools/liquidity?pool_id=${noPoolId}`)
          ]);

          // Normalize liquidity for YES/NO pools (support old and new formats)
          const normalize = (liq) => {
            if (!liq) return null;
            if (typeof liq.amount !== 'undefined') {
              return { amount: liq.amount, token: liq.token };
            }
            return {
              token0: liq.token0,
              amount0: liq.amount0,
              token1: liq.token1,
              amount1: liq.amount1
            };
          };

          return {
            yesPool: { volume: yesVolume?.volume || null, liquidity: normalize(yesLiquidity) },
            noPool: { volume: noVolume?.volume || null, liquidity: normalize(noLiquidity) },
            source: 'tickspread'
          };
        };

        // Ultimate Fallback: Legacy API
        const legacyData = await fetchLegacyData();
        setData(legacyData);

      } catch (err) {
        console.error('Error fetching YES/NO pool data:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllPoolData();
  }, [config?.POOL_CONFIG_YES?.address, config?.POOL_CONFIG_NO?.address, config?.proposalId, config?.MARKET_ADDRESS, config?.chainId]);

  return { data, loading, error };
};

export default usePoolData;
