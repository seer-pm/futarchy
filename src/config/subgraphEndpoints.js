/**
 * Subgraph Endpoints Configuration
 *
 * Endpoints for fetching Futarchy proposal data.
 *
 * Both the registry and candles subgraphs are reached through a single
 * API host, which owns the path layout (/registry/graphql,
 * /candles/graphql) and forwards to whatever indexer backs it. Point
 * NEXT_PUBLIC_FUTARCHY_API_URL at your own deployment to swap backends
 * without touching this file.
 *
 * Note for static export: NEXT_PUBLIC_* values are inlined at build
 * time, so changing the host requires a rebuild — which is exactly why
 * the indexer URLs live behind the API host rather than here.
 *
 * The current backend is the Checkpoint indexer, whose schema differs
 * from the old Graph Node schema (no auto-generated reverse fields), so
 * callers must issue flat queries and join in JS.
 */

const DEFAULT_API_BASE = 'https://api.futarchy.fi';

// Trailing slashes would produce '//registry/graphql' — strip them.
export const FUTARCHY_API_BASE = (
    process.env.NEXT_PUBLIC_FUTARCHY_API_URL || DEFAULT_API_BASE
).replace(/\/+$/, '');

// Aggregator/Organization hierarchy — registry indexer
export const AGGREGATOR_SUBGRAPH_URL = `${FUTARCHY_API_BASE}/registry/graphql`;

// Candles/pools — candles indexer (serves both chains, routed by chainId)
export const SUBGRAPH_ENDPOINTS = {
    1:   `${FUTARCHY_API_BASE}/candles/graphql?chainId=1`,
    100: `${FUTARCHY_API_BASE}/candles/graphql`,
};

// Default Aggregator Contract (same as futarchy-complete-sdk)
export const DEFAULT_AGGREGATOR = '0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1';

/**
 * Pool types available in the subgraph
 */
export const POOL_TYPES = {
    PREDICTION: 'PREDICTION',       // Probability pools (YES_sDAI/sDAI, NO_sDAI/sDAI)
    CONDITIONAL: 'CONDITIONAL',     // Wrapped conditional token pools (YES_GNO/YES_sDAI)
    EXPECTED_VALUE: 'EXPECTED_VALUE' // Expected value pools (YES_GNO/sDAI)
};

/**
 * Outcome sides for conditional pools
 */
export const OUTCOME_SIDES = {
    YES: 'YES',
    NO: 'NO'
};

/**
 * Get the subgraph endpoint for a given chain ID
 * @param {number} chainId - The chain ID
 * @returns {string|null} The endpoint URL or null if not supported
 */
export function getSubgraphEndpoint(chainId) {
    return SUBGRAPH_ENDPOINTS[chainId] || null;
}

/**
 * Check if a chain ID is supported
 * @param {number} chainId - The chain ID
 * @returns {boolean} True if the chain is supported
 */
export function isChainSupported(chainId) {
    return chainId in SUBGRAPH_ENDPOINTS;
}
