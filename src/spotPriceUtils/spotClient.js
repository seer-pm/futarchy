'use client';

/**
 * Browser-compatible spot price utility
 * 
 * Works directly in React/Next.js without server
 * Uses GeckoTerminal API + ethers for rate providers
 * Also supports Balancer multi-hop via balancerHopClient
 * 
 * Usage in hook:
 *   import { fetchSpotCandles } from '@/spotPriceUtils/spotClient';
 *   const result = await fetchSpotCandles('waGnoGNO::0xbbb4.../sDAI-hour-500-xdai');
 *   const result = await fetchSpotCandles('multihop::GNO_SDAI-hour-500-xdai');
 */

import { ethers } from 'ethers';
import { fetchBalancerHopCandles } from './balancerHopClient';
import { fetchSpotFromBalancer } from '../lib/clients/balancerClient';
import { RPC_ENDPOINTS } from '../config/rpcEndpoints';


// ==============================================================
// CONFIG
// ==============================================================

const GECKO_API = 'https://api.geckoterminal.com/api/v2';

// rpcs: endpoints tried in order for rate-provider reads. Gnosis and
// mainnet share the app-wide list in config/rpcEndpoints.js.
const NETWORK_MAP = {
    xdai: { gecko: 'xdai', chainId: 100, rpcs: RPC_ENDPOINTS[100] },
    gnosis: { gecko: 'xdai', chainId: 100, rpcs: RPC_ENDPOINTS[100] },
    eth: { gecko: 'eth', chainId: 1, rpcs: RPC_ENDPOINTS[1] },
    ethereum: { gecko: 'eth', chainId: 1, rpcs: RPC_ENDPOINTS[1] },
    base: { gecko: 'base', chainId: 8453, rpcs: ['https://mainnet.base.org'] },
};

const KNOWN_RATE_PROVIDERS = {
    100: { // Gnosis
        'wagnogno': '0xbbb4966335677ea24f7b86dc19a423412390e1fb',
        'wagno': '0xbbb4966335677ea24f7b86dc19a423412390e1fb',
    },
};

const RATE_ABI = ['function getRate() view returns (uint256)'];

// ==============================================================
// HELPERS
// ==============================================================

/**
 * Parse config string:
 *   TOKEN::RATE/QUOTE-interval-limit-network[-invert]
 *   0xPOOL-interval-limit-network[-invert]
 * 
 * Add '-invert' at end to invert prices (1/price)
 */
function parseConfig(input) {
    if (!input) return null;

    // URL decode if needed
    const decoded = input.includes('%') ? decodeURIComponent(input) : input;

    const parts = decoded.split('-');
    const tokenPart = parts[0];

    // Check for invert flag at the end
    const invert = parts[parts.length - 1]?.toLowerCase() === 'invert';
    const partsWithoutInvert = invert ? parts.slice(0, -1) : parts;

    // Check if it's a pool address (starts with 0x)
    if (tokenPart.toLowerCase().startsWith('0x') && !tokenPart.includes('/')) {
        // Check for rate provider in pool address format: 0xPool::0xRate
        let poolAddress = tokenPart;
        let rateProvider = null;

        if (tokenPart.includes('::')) {
            const split = tokenPart.split('::');
            poolAddress = split[0];
            rateProvider = split[1];
        }

        return {
            poolAddress,
            base: null,
            quote: null,
            rateProvider,
            interval: partsWithoutInvert[1] || 'hour',
            limit: parseInt(partsWithoutInvert[2] || '100'),
            network: partsWithoutInvert[3] || 'xdai',
            invert,
        };
    }

    // Parse base::rate/quote
    const [baseWithRate, quote] = tokenPart.split('/');
    let base = baseWithRate;
    let rateProvider = null;

    if (baseWithRate.includes('::')) {
        [base, rateProvider] = baseWithRate.split('::');
    }

    return {
        poolAddress: null,
        base,
        quote,
        rateProvider,
        interval: partsWithoutInvert[1] || 'hour',
        limit: parseInt(partsWithoutInvert[2] || '100'),
        network: partsWithoutInvert[3] || 'xdai',
        invert,
    };
}

/**
 * Search for pool on GeckoTerminal
 */
async function searchPool(network, base, quote) {
    const geckoNetwork = NETWORK_MAP[network]?.gecko || network;
    const query = `${base} ${quote}`;
    const url = `${GECKO_API}/search/pools?query=${encodeURIComponent(query)}&network=${geckoNetwork}`;

    console.log('[spotClient] Searching:', url);

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);

    const data = await res.json();
    const pools = data.data || [];

    // Find matching pool
    const match = pools.find(p => {
        const name = p.attributes?.name?.toLowerCase() || '';
        return name.includes(base.toLowerCase()) && name.includes(quote.toLowerCase());
    });

    if (!match) throw new Error(`Pool not found: ${base}/${quote}`);

    return {
        address: match.attributes?.address,
        name: match.attributes?.name,
        network: match.relationships?.network?.data?.id || geckoNetwork,
    };
}

/**
 * Fetch OHLCV candles from GeckoTerminal
 */
async function fetchCandles(poolInfo, interval, limit, closeTimestamp = null) {
    const timeframe = interval.includes('hour') ? 'hour' : interval.includes('min') ? 'minute' : 'day';
    // currency=token gives price in quote token (sDAI), not USD
    let url = `${GECKO_API}/networks/${poolInfo.network}/pools/${poolInfo.address}/ohlcv/${timeframe}?aggregate=1&limit=${limit}&currency=token`;

    if (closeTimestamp && typeof closeTimestamp === 'number') {
        url += `&before_timestamp=${closeTimestamp}`;
    }

    console.log('[spotClient] Fetching candles:', url);

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Candles failed: ${res.status}`);

    const data = await res.json();
    const ohlcv = data.data?.attributes?.ohlcv_list || [];

    // Transform to { time, value } format (use close price)
    // OHLCV format: [timestamp_seconds, open, high, low, close, volume]
    // GeckoTerminal returns timestamps in SECONDS already (not milliseconds)
    const raw = ohlcv.map(c => ({
        time: c[0], // Already in seconds
        value: parseFloat(c[4]), // Close price
    })).reverse(); // Oldest first

    // Filter duplicates and ensure ascending order
    const seen = new Set();
    return raw.filter(c => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
    }).sort((a, b) => a.time - b.time);
}

/**
 * Get rate from ERC-4626 rate provider
 *
 * Returns null when no endpoint answers, so the caller can drop the spot
 * price instead of silently showing it unscaled.
 */
async function getRate(rateProvider, chainId) {
    const networkInfo = Object.values(NETWORK_MAP).find(n => n.chainId === chainId);
    if (!networkInfo) return null;

    for (const url of networkInfo.rpcs) {
        try {
            const provider = new ethers.providers.StaticJsonRpcProvider(url, chainId);
            const contract = new ethers.Contract(rateProvider, RATE_ABI, provider);
            const rate = await contract.getRate();
            return parseFloat(ethers.utils.formatEther(rate));
        } catch (e) {
            console.warn(`[spotClient] Rate fetch failed on ${url}:`, e.message);
        }
    }
    console.error('[spotClient] Rate fetch failed on every endpoint for', rateProvider);
    return null;
}

/**
 * Auto-detect rate provider for known tokens
 */
function detectRateProvider(symbol, chainId) {
    const providers = KNOWN_RATE_PROVIDERS[chainId];
    if (!providers) return null;
    return providers[symbol.toLowerCase()] || null;
}

// ==============================================================
// COMPOSITE CANDLES (with forward-fill)
// ==============================================================

/**
 * Fetch raw candles for a single pool (no rate/invert applied)
 */
async function fetchRawPoolCandles(poolAddress, network, interval, limit, closeTimestamp = null) {
    const geckoNetwork = NETWORK_MAP[network]?.gecko || network;
    const timeframe = interval.includes('hour') ? 'hour' : interval.includes('min') ? 'minute' : 'day';
    let url = `${GECKO_API}/networks/${geckoNetwork}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=1&limit=${limit}&currency=token`;

    if (closeTimestamp && typeof closeTimestamp === 'number') {
        url += `&before_timestamp=${closeTimestamp}`;
    }

    console.log('[spotClient] Fetching pool:', poolAddress.slice(0, 10) + '...');

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Pool ${poolAddress.slice(0, 10)} fetch failed: ${res.status}`);

    const data = await res.json();
    const ohlcv = data.data?.attributes?.ohlcv_list || [];

    // Return as Map for easy lookup
    const candleMap = new Map();
    ohlcv.forEach(c => {
        candleMap.set(c[0], parseFloat(c[4])); // time -> close price
    });
    return candleMap;
}

/**
 * Forward-fill gaps in candle data
 * For each timestamp in allTimes, carry forward the last known value
 */
function forwardFill(candleMap, allTimes) {
    const filled = new Map();
    let lastValue = null;

    // Sort times ascending
    const sortedTimes = [...allTimes].sort((a, b) => a - b);

    for (const time of sortedTimes) {
        if (candleMap.has(time)) {
            lastValue = candleMap.get(time);
        }
        if (lastValue !== null) {
            filled.set(time, lastValue);
        }
    }
    return filled;
}

/**
 * Parse composite config string
 * Format: composite::0xPOOL1[-invert]+0xPOOL2[-invert]-interval-limit-network
 * Example: composite::0xc8cf...-invert+0x3de2...-invert-hour-100-eth
 */
function parseCompositeConfig(configString) {
    // Remove prefix
    const content = configString.replace('composite::', '');
    const parts = content.split('-');

    // Find the pools part (everything before interval)
    // Pools are separated by +
    let poolsPart = parts[0];
    let rateProvider = null;

    // Check if a rate provider is specified at the end of the pools part (e.g. +0xPool::0xRate)
    if (poolsPart.includes('::')) {
        const split = poolsPart.split('::');
        poolsPart = split[0];
        rateProvider = split[1];
    }

    const pools = poolsPart.split('+').map(p => {
        const isInvert = p.toLowerCase().endsWith('invert');
        const address = isInvert ? p.slice(0, -6) : p; // remove 'invert' suffix
        return { address: address.replace(/-$/, ''), invert: isInvert };
    });

    // Rest of parts: interval, limit, network
    return {
        pools,
        rateProvider,
        interval: parts.find(p => ['hour', 'minute', 'day'].includes(p)) || 'hour',
        limit: parseInt(parts.find(p => /^\d+$/.test(p)) || '100'),
        network: parts[parts.length - 1] || 'eth'
    };
}

/**
 * Fetch composite candles from multiple pools
 * Multiplies prices together after forward-filling gaps
 */
async function fetchCompositeCandles(configString, closeTimestamp = null) {
    const config = parseCompositeConfig(configString);
    console.log('[spotClient] Composite config:', config);

    // Fetch all pools in parallel
    const poolMaps = await Promise.all(
        config.pools.map(p => fetchRawPoolCandles(p.address, config.network, config.interval, config.limit, closeTimestamp))
    );

    // Collect all unique timestamps
    const allTimes = new Set();
    poolMaps.forEach(m => m.forEach((_, time) => allTimes.add(time)));
    console.log('[spotClient] Total unique timestamps:', allTimes.size);

    // Forward-fill each pool
    const filledMaps = poolMaps.map(m => forwardFill(m, allTimes));

    // Find common timestamps (all pools have data after forward-fill)
    const commonTimes = [...allTimes].filter(time =>
        filledMaps.every(m => m.has(time))
    ).sort((a, b) => a - b);
    console.log('[spotClient] Common timestamps after fill:', commonTimes.length);

    // Get rate if specified
    let rate = 1;
    let rateInfo = null;
    if (config.rateProvider) {
        const networkInfo = NETWORK_MAP[config.network] || NETWORK_MAP.xdai;
        rate = await getRate(config.rateProvider, networkInfo.chainId);
        if (rate === null) {
            return { candles: [], price: null, rate: null, pool: null, error: 'Rate provider unavailable' };
        }
        rateInfo = { provider: config.rateProvider, rate };
        console.log('[spotClient] Applied composite explicit rate (divided by):', rate);
    }

    // Build composite candles
    let candles = commonTimes.map(time => {
        let compositeValue = 1;

        config.pools.forEach((poolConfig, i) => {
            let value = filledMaps[i].get(time);
            if (poolConfig.invert) {
                value = 1 / value;
            }
            compositeValue *= value;
        });

        if (rate !== 1) {
            compositeValue = compositeValue / rate;
        }

        return { time, value: compositeValue };
    });

    if (closeTimestamp && typeof closeTimestamp === 'number') {
        candles = candles.filter(c => c.time <= closeTimestamp);
        console.log(`[spotClient] Composite filtered down to ${candles.length} candles using closeTimestamp ${closeTimestamp}`);
    }

    const latestPrice = candles.length > 0 ? candles[candles.length - 1].value : null;

    return {
        candles,
        price: latestPrice,
        rate: rateInfo,
        pool: { name: `Composite (${config.pools.length} pools)` },
        error: null
    };
}

// ==============================================================
// MAIN EXPORT
// ==============================================================

/**
 * Fetch spot price candles - browser compatible
 * 
 * @param {string} configString - "TOKEN::RATE/QUOTE-interval-limit-network" or "balancer::PRESET-interval-limit-network"
 * @returns {Promise<{candles, price, rate, pool, error}>}
 */
export async function fetchSpotCandles(configString, closeTimestamp = null) {
    try {
        // Route to local Balancer server if balancer:: prefix detected
        // Format: balancer::PRESET (e.g., balancer::GNO_SDAI)
        if (configString && configString.startsWith('balancer::')) {
            console.log('[spotClient] Routing to local Balancer server');
            const result = await fetchSpotFromBalancer(configString.replace('balancer::', ''));
            // Normalize response format to match spotClient output
            return {
                candles: result.candles || [],
                price: result.price,
                rate: null,
                pool: { name: result.name || result.preset },
                error: result.error
            };
        }

        // Route to Balancer hop client if multihop prefix detected (legacy, fetches from subgraph directly)
        if (configString && configString.startsWith('multihop::')) {
            console.log('[spotClient] Routing to multi-hop client');
            return fetchBalancerHopCandles(configString, closeTimestamp);
        }

        // URL decode before checking for composite:: prefix
        const decodedConfigString = configString?.includes('%')
            ? decodeURIComponent(configString)
            : configString;

        // Route to composite candle handler if composite:: prefix detected
        // Format: composite::0xPOOL1[-invert]+0xPOOL2[-invert]-hour-100-eth
        if (decodedConfigString && decodedConfigString.startsWith('composite::')) {
            console.log('[spotClient] Routing to composite handler');
            return fetchCompositeCandles(decodedConfigString, closeTimestamp);
        }

        const config = parseConfig(configString);
        if (!config) {
            return { candles: [], price: null, rate: null, pool: null, error: 'Invalid config' };
        }

        console.log('[spotClient] Config:', config);

        // Get network info
        const networkInfo = NETWORK_MAP[config.network] || NETWORK_MAP.xdai;
        const geckoNetwork = networkInfo.gecko;

        // Get pool - either direct address or search
        let pool;
        if (config.poolAddress) {
            // Direct pool address
            pool = {
                address: config.poolAddress,
                name: 'Direct Pool',
                network: geckoNetwork,
            };
            console.log('[spotClient] Using direct pool:', pool.address);
        } else {
            // Search for pool by tokens
            pool = await searchPool(config.network, config.base, config.quote);
            console.log('[spotClient] Found pool:', pool);
        }

        // Fetch candles
        let candles = await fetchCandles(pool, config.interval, config.limit, closeTimestamp);
        console.log('[spotClient] Fetched', candles.length, 'candles');

        // Filter candles by closeTimestamp if provided
        if (closeTimestamp && typeof closeTimestamp === 'number') {
            candles = candles.filter(c => c.time <= closeTimestamp);
            console.log(`[spotClient] Filtered down to ${candles.length} candles using closeTimestamp ${closeTimestamp}`);
        }

        // Get rate ONLY if explicitly specified in config
        let rate = 1;
        let rateInfo = null;

        if (config.rateProvider) {
            rate = await getRate(config.rateProvider, networkInfo.chainId);
            if (rate === null) {
                return { candles: [], price: null, rate: null, pool, error: 'Rate provider unavailable' };
            }
            rateInfo = { provider: config.rateProvider, rate };

            // Apply rate to candles (DIVIDE by rate: sDAI rate 1.22 means 1 DAI = 1.22 shares)
            candles = candles.map(c => ({ ...c, value: c.value / rate }));
            console.log('[spotClient] Applied explicit rate (divided by):', rate);
        }

        // Apply invert if specified (for pools with opposite token order)
        if (config.invert) {
            candles = candles.map(c => ({ ...c, value: 1 / c.value }));
            console.log('[spotClient] Inverted prices (1/price)');
        }

        const latestPrice = candles.length > 0 ? candles[candles.length - 1].value : null;

        return {
            candles,
            price: latestPrice,
            rate: rateInfo,
            pool,
            error: null,
        };

    } catch (e) {
        console.error('[spotClient] Error:', e);
        return { candles: [], price: null, rate: null, pool: null, error: e.message };
    }
}

export default fetchSpotCandles;
