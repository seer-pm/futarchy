/**
 * Get the best working RPC for a given chain ID.
 * Tests multiple RPCs and caches the top performers so we can
 * reuse the fastest three before probing the full list again.
 */

import { ethers } from 'ethers';

// Hardcoded RPC lists (faster than fetching from chainlist). A private
// endpoint from the environment is probed first; the public ones remain as
// fallbacks, and the probe below still drops any that are slow or failing.
const RPC_LISTS = {
  1: [ // Ethereum Mainnet
    process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
    'https://ethereum-rpc.publicnode.com',
    'https://1rpc.io/eth',
    'https://rpc.ankr.com/eth'
  ].filter(Boolean),
  100: [ // Gnosis Chain
    process.env.NEXT_PUBLIC_GNOSIS_RPC_URL,
    'https://rpc.gnosischain.com',
    'https://gnosis-rpc.publicnode.com',
    'https://1rpc.io/gnosis',
    'https://rpc.ankr.com/gnosis'
  ].filter(Boolean)
};

const RPC_TIMEOUT_MS = 5000; // 5 second timeout
const CACHE_DURATION_MS = 5 * 60 * 1000; // Cache for 5 minutes
const MAX_CACHED_RPC_COUNT = 3; // Keep the best three RPCs warm

// Cache for best RPC results
const rpcCache = {};

function normalizeCacheEntry(entry) {
  if (!entry) return null;
  if (Array.isArray(entry.urls)) {
    return entry;
  }

  // Backwards compatibility for older single-url cache shape
  if (entry.url) {
    return {
      urls: [entry.url],
      timestamp: entry.timestamp || Date.now()
    };
  }

  return null;
}

async function tryCachedRpcs(chainId, cacheKey, now) {
  const rawEntry = rpcCache[cacheKey];
  const cacheEntry = normalizeCacheEntry(rawEntry);

  if (!cacheEntry || !cacheEntry.urls.length) {
    return null;
  }

  if (now - cacheEntry.timestamp > CACHE_DURATION_MS) {
    return null;
  }

  console.log(`[RPC-TEST] Attempting cached RPCs for chain ${chainId}...`);

  const candidates = cacheEntry.urls.slice(0, MAX_CACHED_RPC_COUNT);

  for (const candidateUrl of candidates) {
    const result = await testRpc(candidateUrl);

    if (result.success) {
      const deduped = cacheEntry.urls.filter(url => url !== candidateUrl);
      cacheEntry.urls = [candidateUrl, ...deduped].slice(0, MAX_CACHED_RPC_COUNT);
      cacheEntry.timestamp = now;
      rpcCache[cacheKey] = cacheEntry;
      console.log(`[RPC-TEST] Using cached RPC for chain ${chainId}: ${candidateUrl}`);
      return candidateUrl;
    }
  }

  console.log(`[RPC-TEST] Cached RPCs exhausted for chain ${chainId}, running full probe...`);
  return null;
}

/**
 * Test a single RPC endpoint using browser fetch to detect CORS issues
 */
async function testRpc(rpcUrl) {
  const started = performance.now();

  try {
    // Use fetch API to test CORS compatibility in browser context
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

    // Make actual JSON-RPC request to test CORS
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }

    const blockNumber = parseInt(data.result, 16);
    const latency = performance.now() - started;

    console.log(`[RPC-TEST] ✅ ${rpcUrl} - ${latency.toFixed(0)}ms (block: ${blockNumber})`);

    return {
      url: rpcUrl,
      success: true,
      latency,
      blockNumber
    };
  } catch (error) {
    // Detect specific CORS errors
    const isCorsError = error.name === 'TypeError' && error.message.includes('fetch');
    const errorType = isCorsError ? 'CORS blocked' :
                     error.name === 'AbortError' ? 'timeout' :
                     error.message;

    console.warn(`[RPC-TEST] ❌ ${rpcUrl} - ${errorType}`);

    return {
      url: rpcUrl,
      success: false,
      error: errorType,
      isCorsError
    };
  }
}

/**
 * Get the best RPC for a chain ID
 * Tests all RPCs in parallel and returns the fastest working one
 * CORS-blocked RPCs are excluded from results
 */
export async function getBestRpc(chainId) {
  const cacheKey = `chain-${chainId}`;
  const now = Date.now();

  // Prefer cached candidates before hitting every endpoint again
  const cachedUrl = await tryCachedRpcs(chainId, cacheKey, now);
  if (cachedUrl) {
    return cachedUrl;
  }

  const rpcList = RPC_LISTS[chainId];

  if (!rpcList || rpcList.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${chainId}`);
  }

  console.log(`[RPC-TEST] Testing ${rpcList.length} RPCs for chain ${chainId}...`);

  // Test all RPCs in parallel
  const results = await Promise.all(rpcList.map(testRpc));

  // Separate CORS-blocked from other failures
  const corsBlocked = results.filter(r => !r.success && r.isCorsError);
  const otherFailures = results.filter(r => !r.success && !r.isCorsError);
  const workingRpcs = results
    .filter(r => r.success)
    .sort((a, b) => a.latency - b.latency);

  // Log CORS issues prominently
  if (corsBlocked.length > 0) {
    console.warn(`[RPC-TEST] ⚠️ ${corsBlocked.length} RPCs blocked by CORS:`,
      corsBlocked.map(r => r.url));
  }

  if (otherFailures.length > 0) {
    console.warn(`[RPC-TEST] ⚠️ ${otherFailures.length} RPCs failed (non-CORS):`,
      otherFailures.map(r => `${r.url}: ${r.error}`));
  }

  if (workingRpcs.length === 0) {
    console.error('[RPC-TEST] ❌ All RPCs failed!', {
      corsBlocked: corsBlocked.length,
      otherFailures: otherFailures.length,
      total: results.length
    });

    // Provide helpful error message
    if (corsBlocked.length === results.length) {
      console.error('[RPC-TEST] All RPCs are CORS-blocked. This may be a browser configuration issue.');
    }

    // Fallback to first RPC in list (may still fail, but we tried)
    rpcCache[cacheKey] = {
      urls: [],
      timestamp: now
    };
    return rpcList[0];
  }

  const bestRpc = workingRpcs[0];
  console.log(`[RPC-TEST] ✅ Best RPC for chain ${chainId}: ${bestRpc.url} (${bestRpc.latency.toFixed(0)}ms)`);
  console.log(`[RPC-TEST] 📊 Summary: ${workingRpcs.length} working, ${corsBlocked.length} CORS-blocked, ${otherFailures.length} other failures`);

  // Cache the result
  rpcCache[cacheKey] = {
    urls: workingRpcs.map(r => r.url).slice(0, MAX_CACHED_RPC_COUNT),
    timestamp: now
  };

  return bestRpc.url;
}

/**
 * Get a provider for the best RPC
 */
export async function getBestRpcProvider(chainId) {
  const rpcUrl = await getBestRpc(chainId);
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

/**
 * Clear the RPC cache (useful for forcing re-test)
 */
export function clearRpcCache() {
  Object.keys(rpcCache).forEach(key => delete rpcCache[key]);
  console.log('[RPC-TEST] Cache cleared');
}

/**
 * Get diagnostic information about all RPCs for a chain
 * Useful for debugging CORS and connectivity issues
 */
export async function diagnoseRpcs(chainId) {
  const rpcList = RPC_LISTS[chainId];

  if (!rpcList || rpcList.length === 0) {
    return {
      error: `No RPC endpoints configured for chain ${chainId}`,
      results: []
    };
  }

  console.log(`[RPC-DIAGNOSE] Running full diagnostic for chain ${chainId}...`);

  const results = await Promise.all(rpcList.map(testRpc));

  const summary = {
    chainId,
    totalRpcs: results.length,
    working: results.filter(r => r.success).length,
    corsBlocked: results.filter(r => r.isCorsError).length,
    otherFailures: results.filter(r => !r.success && !r.isCorsError).length,
    results: results.map(r => ({
      url: r.url,
      status: r.success ? 'working' : (r.isCorsError ? 'cors-blocked' : 'failed'),
      latency: r.latency || null,
      error: r.error || null,
      blockNumber: r.blockNumber || null
    }))
  };

  console.log('[RPC-DIAGNOSE] Results:', summary);

  return summary;
}

/**
 * Get the current RPC cache status
 */
export function getRpcCacheStatus() {
  const status = {};

  Object.keys(rpcCache).forEach(key => {
    const entry = normalizeCacheEntry(rpcCache[key]);
    if (entry) {
      const age = Date.now() - entry.timestamp;
      const isExpired = age > CACHE_DURATION_MS;

      status[key] = {
        urls: entry.urls,
        age: Math.floor(age / 1000), // seconds
        isExpired,
        expiresIn: isExpired ? 0 : Math.floor((CACHE_DURATION_MS - age) / 1000)
      };
    }
  });

  return status;
}
