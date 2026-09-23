/**
 * RPC endpoints — one shared provider per chain.
 *
 * This module used to probe every endpoint in a list on each call and rank
 * them by latency. Two things made that expensive: the probe itself fired an
 * eth_blockNumber at half a dozen hosts, and every call site built its own
 * `JsonRpcProvider`, each of which opens with a network-detection round trip.
 * A market page load spent 39 eth_chainId requests before doing any real work.
 *
 * Now a chain gets exactly one provider, built once and reused:
 *
 *   - the configured endpoint is primary, with public endpoints behind it,
 *     which is the same arrangement providers.jsx uses for wagmi;
 *   - the network is passed explicitly, so ethers never issues the detection
 *     request;
 *   - calls are batched, so reads issued in the same tick share one POST;
 *   - a failing endpoint advances to the next one and the call is retried,
 *     which is the part of the old probe worth keeping.
 *
 * Set NEXT_PUBLIC_GNOSIS_RPC_URL / NEXT_PUBLIC_MAINNET_RPC_URL to put a
 * private endpoint first. These are inlined at build time (output: 'export'),
 * so a static build needs them present in CI.
 */

import { RPC_ENDPOINTS as RPC_LISTS, RPC_NETWORKS as NETWORKS } from '../config/rpcEndpoints';
import { createStaticBatchProvider } from './staticBatchProvider';

// chainId -> { index, provider }
const activeProviders = new Map();

function buildProvider(chainId, url) {
  // Static so ethers never asks the endpoint for its chain id, batching so
  // reads in the same tick share a POST — see utils/staticBatchProvider.js.
  return withFailover(createStaticBatchProvider(url, NETWORKS[chainId]), chainId);
}

/**
 * Advance to the next endpoint and retry once when a call fails. Without
 * this, losing the primary endpoint would take the page down — it is the one
 * thing the old latency probe bought us.
 */
function withFailover(provider, chainId) {
  const originalSend = provider.send.bind(provider);

  provider.send = async (method, params) => {
    try {
      return await originalSend(method, params);
    } catch (error) {
      const next = advanceEndpoint(chainId, provider);
      if (!next) throw error;
      console.warn(`[RPC] ${method} failed, falling back to the next endpoint for chain ${chainId}`);
      return next.send(method, params);
    }
  };

  return provider;
}

/**
 * Move a chain onto its next endpoint, unless it has already moved on (two
 * concurrent failures should not skip an endpoint each).
 *
 * @returns {Object|null} the new provider, or null when the list is exhausted
 */
function advanceEndpoint(chainId, failedProvider) {
  const state = activeProviders.get(chainId);
  if (!state) return null;
  if (state.provider !== failedProvider) return state.provider;

  const nextIndex = state.index + 1;
  const urls = RPC_LISTS[chainId] || [];
  if (nextIndex >= urls.length) return null;

  const provider = buildProvider(chainId, urls[nextIndex]);
  activeProviders.set(chainId, { index: nextIndex, provider, url: urls[nextIndex] });
  return provider;
}

function getState(chainId) {
  let state = activeProviders.get(chainId);
  if (state) return state;

  const urls = RPC_LISTS[chainId] || [];
  if (urls.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${chainId}`);
  }

  state = { index: 0, url: urls[0], provider: buildProvider(chainId, urls[0]) };
  activeProviders.set(chainId, state);
  return state;
}

/**
 * The endpoint currently in use for a chain.
 *
 * Kept async because callers await it; there is no probing left to wait for.
 *
 * @param {number} chainId
 * @returns {Promise<string>}
 */
export async function getBestRpc(chainId) {
  return getState(chainId).url;
}

/**
 * The shared provider for a chain. Built on first use and reused afterwards.
 *
 * @param {number} chainId
 * @returns {Promise<import('./staticBatchProvider').StaticJsonRpcBatchProvider>}
 */
export async function getBestRpcProvider(chainId) {
  return getRpcProvider(chainId);
}

/**
 * Same provider, for call sites that are not async. Nothing is awaited any
 * more, so there is no reason to force them to be.
 *
 * @param {number} chainId
 * @returns {import('./staticBatchProvider').StaticJsonRpcBatchProvider}
 */
export function getRpcProvider(chainId) {
  return getState(chainId).provider;
}

/**
 * Drop the providers so the next call rebuilds from the primary endpoint.
 * Used by the RPC refresh button and the diagnostics page.
 */
export function clearRpcCache() {
  activeProviders.clear();
  console.log('[RPC] Providers reset to the primary endpoint');
}

const RPC_TIMEOUT_MS = 5000;

/**
 * Probe every endpoint of a chain and report latency and reachability.
 *
 * This is the old probe, kept for the /rpc-diagnostics page — it runs when
 * someone asks for it, never on a page load.
 *
 * @param {number} chainId
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

async function testRpc(rpcUrl) {
  const started = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

    // A real JSON-RPC request, so the probe also exercises CORS.
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
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

    return {
      url: rpcUrl,
      success: true,
      latency: performance.now() - started,
      blockNumber: parseInt(data.result, 16)
    };
  } catch (error) {
    const isCorsError = error.name === 'TypeError' && error.message.includes('fetch');
    const errorType = isCorsError ? 'CORS blocked'
      : error.name === 'AbortError' ? 'timeout'
        : error.message;

    console.warn(`[RPC-TEST] ❌ ${rpcUrl} - ${errorType}`);

    return { url: rpcUrl, success: false, error: errorType, isCorsError };
  }
}

/**
 * Which endpoint each chain is currently on. Shape kept for the diagnostics
 * page, which renders `urls` and the expiry fields.
 */
export function getRpcCacheStatus() {
  const status = {};

  for (const [chainId, state] of activeProviders.entries()) {
    status[`chain-${chainId}`] = {
      urls: [state.url],
      age: 0,
      isExpired: false,
      expiresIn: 0
    };
  }

  return status;
}
