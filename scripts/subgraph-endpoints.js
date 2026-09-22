/**
 * Subgraph endpoints for the ad-hoc scripts in this directory.
 *
 * These scripts used to point at two backends that no longer exist: a
 * self-hosted Graph Node behind CloudFront (the domain no longer resolves)
 * and a Graph Studio deployment (deleted). Both are now served by the
 * futarchy-api deployment, which forwards to the Goldsky-hosted subgraphs.
 *
 * Going through the API rather than straight to Goldsky keeps the subgraph
 * URLs in one place — bumping a subgraph version is a change there, not
 * across every script here.
 *
 * Override the host with FUTARCHY_API_URL when pointing at a local
 * futarchy-api (http://localhost:3031) or a different deployment.
 */

const API_BASE = (process.env.FUTARCHY_API_URL || 'https://seer-futarchy-api.netlify.app')
    .replace(/\/+$/, '');

// Aggregator / Organization / ProposalEntity metadata. Not partitioned by
// chain: the metadata contracts live on Gnosis and record proposals for
// every chain, with the target chain stored in each proposal's metadata.
const REGISTRY_URL = `${API_BASE}/registry/graphql`;

// Pools, candles and swaps, one subgraph per chain — Algebra on Gnosis,
// Uniswap V3 on mainnet.
const CANDLES_ENDPOINTS = {
    1: `${API_BASE}/candles/graphql?chainId=1`,
    100: `${API_BASE}/candles/graphql`,
};

module.exports = { API_BASE, REGISTRY_URL, CANDLES_ENDPOINTS };
