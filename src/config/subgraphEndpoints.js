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

const DEFAULT_API_BASE = 'https://api.futarchy.seer.pm';

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

// The aggregator whose organizations and proposals the app lists, and whose
// ProposalMetadata the market page reads. Defaults to Seer's ("Seer Futarchy",
// owner 0x4EDCA105188a0783Ab3A6f09c50567D1E3F8591D), a copy of futarchy.fi's
// organizations and proposals made with scripts/copy-registry-aggregator.mjs;
// NEXT_PUBLIC_FUTARCHY_AGGREGATOR points the app at another one. Inlined at
// build time.
const SEER_AGGREGATOR = '0xAb9C4ffdA083f10959a21bD4D4b1AE62713c582d';
// futarchy.fi's aggregator, the original: 0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1
// (owner 0x645a3d9208523bbfee980f7269ac72c61dd3b552). Set
// NEXT_PUBLIC_FUTARCHY_AGGREGATOR to it to list its organizations instead.
export const DEFAULT_AGGREGATOR = process.env.NEXT_PUBLIC_FUTARCHY_AGGREGATOR || SEER_AGGREGATOR;

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
