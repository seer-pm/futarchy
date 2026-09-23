/**
 * useAggregatorProposals Hook
 * 
 * Fetches proposals from the futarchy-complete subgraph
 * based on an aggregator address, with owner detection.
 * 
 * Usage:
 *   const { proposals, loading, error } = useAggregatorProposals(aggregatorAddress, connectedWallet);
 */

import { useState, useEffect } from 'react';

import { getSubgraphEndpoint } from '../config/subgraphEndpoints';
import { cachedOnce, fetchNestedRegistrySnapshot } from '../services/registrySnapshot';
import {
    getProposalCloseTimestamp,
    isProposalArchived,
    isProposalClosed,
    isProposalResolved,
} from '../utils/proposalLifecycle';

/**
 * Parse metadata JSON safely
 */
function parseMetadata(metadataString) {
    if (!metadataString) return {};
    try {
        return JSON.parse(metadataString);
    } catch (e) {
        console.warn('[useAggregatorProposals] Failed to parse metadata:', e);
        return {};
    }
}

/**
 * Transform subgraph proposal to EventHighlight-compatible format
 * 
 * Data comes from:
 * - Registry Subgraph: organization metadata, proposal names, owner
 * - Market Subgraph (future): pool addresses, prices, etc.
 */
function transformProposalToEvent(proposal, org, connectedWallet) {
    const orgMeta = parseMetadata(org.metadata);
    const proposalMeta = parseMetadata(proposal.metadata);

    // Debug: Log chain detection sources
    const detectedChain = proposalMeta.chain
        ? parseInt(proposalMeta.chain)
        : (orgMeta.chain ? parseInt(orgMeta.chain) : 100);

    console.log(`[🔗 CHAIN-DETECT] Proposal "${proposal.displayNameEvent?.slice(0, 30)}...":`, {
        proposalMetaChain: proposalMeta.chain,
        orgMetaChain: orgMeta.chain,
        detectedChain,
        proposalAddress: proposal.proposalAddress?.slice(0, 10)
    });

    // Check if connected wallet is the proposal owner OR organization owner (editor)
    const isOwner = connectedWallet &&
        proposal.owner?.toLowerCase() === connectedWallet.toLowerCase();
    const isEditor = connectedWallet &&
        org.owner?.toLowerCase() === connectedWallet.toLowerCase();

    if (connectedWallet) {
        console.log(`[🔗 OWNER-CHECK] Proposal: ${proposal.displayNameEvent?.slice(0, 30)}...`, {
            proposalOwner: proposal.owner?.toLowerCase(),
            orgOwner: org.owner?.toLowerCase(),
            connectedWallet: connectedWallet.toLowerCase(),
            isOwner,
            isEditor
        });
    }

    // Start time - no createdAt in subgraph, use current time as placeholder
    const startTimeSeconds = Math.floor(Date.now() / 1000);

    // End time: prioritize closeTimestamp from metadata JSON.
    const closeTimestamp = getProposalCloseTimestamp(proposalMeta);
    let endTimeSeconds = closeTimestamp || startTimeSeconds + 7 * 24 * 60 * 60; // Default 7 days
    if (closeTimestamp) {
        console.log(`[🔗 CLOSE-TIME] Proposal "${proposal.displayNameEvent?.slice(0, 30)}..." closeTimestamp:`, {
            raw: proposalMeta.closeTimestamp,
            normalized: endTimeSeconds,
            date: new Date(endTimeSeconds * 1000).toISOString()
        });
    }

    // Visibility: 'public' (default), 'hidden' (staging/test - only for owner/editor)
    const visibility = proposalMeta.visibility || 'public';

    const resolved = isProposalResolved(proposalMeta);
    const closed = isProposalClosed(proposalMeta);
    const currencySymbol = proposalMeta?.currencyTokens?.base?.tokenSymbol ||
        (detectedChain === 1 ? 'USDS' : 'sDAI');

    return {
        // =============================================
        // IDENTIFICATION - Use proposalAddress for links!
        // =============================================
        eventId: proposal.proposalAddress,  // This is what /markets/[id] uses
        proposalMetadataAddress: proposal.id,  // The registry metadata contract
        proposalAddress: proposal.proposalAddress,  // The actual market contract

        // Display info (from Registry Subgraph)
        eventTitle: proposal.displayNameEvent || proposal.displayNameQuestion || 'Unknown Proposal',
        proposalTitle: proposal.displayNameEvent || proposal.displayNameQuestion || 'Unknown Proposal',
        description: proposal.description || '',

        // Organization info (from Registry Subgraph)
        companyId: org.id,
        companyLogo: orgMeta.logo || orgMeta.coverImage || '/assets/fallback-company.png',
        authorName: org.name || 'Unknown Organization',

        // Stats placeholder (will be fetched by card from Market Subgraph)
        stats: {
            yesPrice: `0.50 ${currencySymbol}`,
            noPrice: `0.50 ${currencySymbol}`
        },

        // Pool info - will need to fetch from market subgraph or metadata
        predictionPools: proposalMeta.predictionPools || proposalMeta.prediction_pools || null,
        poolAddresses: proposalMeta.poolAddresses || proposalMeta.conditional_pools ? {
            yes: proposalMeta.conditional_pools?.yes?.address,
            no: proposalMeta.conditional_pools?.no?.address
        } : null,

        // Time info (seconds, not milliseconds)
        startTime: startTimeSeconds,
        endTime: endTimeSeconds,  // Uses closeTimestamp from metadata if available
        closeTimestamp,
        isClosed: closed,
        timeProgress: 0,

        // Status — use metadata resolution fields if available
        status: resolved ? 'resolved' : (closed ? 'ended' : 'ongoing'),
        resolutionStatus: proposalMeta.resolution_status || (closed ? 'closed' : 'unresolved'),
        resolution_status: proposalMeta.resolution_status || null,
        resolution_outcome: proposalMeta.resolution_outcome || null,
        resolutionOutcome: proposalMeta.resolution_outcome || null,
        finalOutcome: proposalMeta.resolution_outcome || null,

        // =============================================
        // VISIBILITY & OWNERSHIP FLAGS
        // =============================================
        visibility,                            // 'public' or 'hidden'
        isOwner,                              // Connected wallet === proposal.owner
        isEditor,                             // Connected wallet === org.owner
        owner: proposal.owner,                 // Who created this proposal metadata
        orgOwner: org.owner,                   // Who owns the organization
        fromSubgraph: true,                    // Came from on-chain registry
        dataSource: 'registry-subgraph',       // Explicit source label

        // Chain ID: Priority - proposal metadata > org metadata > default Gnosis (100)
        chainId: detectedChain,

        // Full metadata for extended use
        // Include display_title_0 (Question) and display_title_1 (Event) for split display
        metadata: {
            ...proposalMeta,
            display_title_0: proposal.displayNameQuestion || null,  // "What will the impact on GNO price be"
            display_title_1: proposal.displayNameEvent || null      // "if GIP-145 is approved?"
        },
        orgMetadata: orgMeta
    };
}

// Candles checkpoint indexer — single endpoint serves both chains;
// IDs use the form "<chainId>-<address>" so we can query in one shot.
const CANDLES_GRAPHQL_URL = getSubgraphEndpoint(100);

/**
 * Bulk fetch CONDITIONAL pool addresses for a list of proposals.
 *
 * Issues a single query against the candles indexer:
 *   pools(where: { proposal_in: ["100-0x…", "1-0x…"] })
 * The Checkpoint schema has no reverse Proposal.pools field, so we
 * query Pool directly and group by proposal id.
 *
 * Returns a map keyed by lowercased proposalAddress (no chain prefix)
 * so callers don't need to know the ID format.
 */
async function bulkFetchPoolsByChain(proposals) {
    const ids = [];
    for (const p of proposals) {
        if (!p.proposalAddress) continue;
        ids.push(p.proposalAddress.toLowerCase());
    }

    if (ids.length === 0) return {};

    // Both homepage transformers ask for the same proposal set, so share
    // the request rather than hitting the candles indexer twice. Failures
    // are handled here so they never land in the cache.
    try {
        return await cachedOnce(`pools:${ids.slice().sort().join(',')}`, () => fetchPoolsByIds(ids));
    } catch (e) {
        console.warn('[🔗 REGISTRY-POOLS] candles fetch failed:', e.message);
        return {};
    }
}

async function fetchPoolsByIds(ids) {
    console.log(`[🔗 REGISTRY-POOLS] Bulk-fetching pools for ${ids.length} proposals`);

    const query = `
        query GetProposalPools($ids: [String!]!) {
            pools(where: { proposal_in: $ids }, first: 1000) {
                id
                proposal { id }
                type
                outcomeSide
            }
        }
    `;

    const response = await fetch(CANDLES_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { ids } }),
    });
    const result = await response.json();

    if (result?.errors) {
        throw new Error(result.errors[0]?.message || 'candles query failed');
    }

    const poolMap = {};
    for (const pool of result?.data?.pools || []) {
        if (pool.type !== 'CONDITIONAL' && pool.type !== 'conditional') continue;
        const propAddr = (pool.proposal?.id || '').toLowerCase();
        if (!propAddr) continue;
        if (!poolMap[propAddr]) poolMap[propAddr] = { yes: null, no: null };
        if (pool.outcomeSide === 'YES' || pool.outcomeSide === 'yes') {
            poolMap[propAddr].yes = pool.id;
        } else if (pool.outcomeSide === 'NO' || pool.outcomeSide === 'no') {
            poolMap[propAddr].no = pool.id;
        }
    }

    console.log(`[🔗 REGISTRY-POOLS] Got CONDITIONAL pools for ${Object.keys(poolMap).length} proposals`);
    return poolMap;
}

/**
 * React hook to fetch proposals from an aggregator
 * 
 * @param {string|null} aggregatorAddress - The aggregator contract address
 * @param {string|null} connectedWallet - The connected wallet address (for owner detection)
 * @returns {{ 
 *   proposals: Array, 
 *   organizations: Array,
 *   loading: boolean, 
 *   error: Error|null 
 * }}
 */
export function useAggregatorProposals(aggregatorAddress, connectedWallet = null) {
    const [proposals, setProposals] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Skip if no aggregator address provided
        if (!aggregatorAddress) {
            setProposals([]);
            setOrganizations([]);
            return;
        }

        let cancelled = false;

        async function loadProposals() {
            setLoading(true);
            setError(null);

            try {
                // One shared request for the whole registry — see
                // services/registrySnapshot.js.
                const aggregator = await fetchNestedRegistrySnapshot(aggregatorAddress);

                if (cancelled) return;

                const allProposals = [];
                const orgs = [];

                for (const org of aggregator.organizations || []) {
                    orgs.push({
                        id: org.id,
                        name: org.name,
                        owner: org.owner,
                        proposalCount: org.proposals?.length || 0
                    });

                    for (const proposal of org.proposals || []) {
                        const event = transformProposalToEvent(proposal, org, connectedWallet);
                        allProposals.push(event);
                    }
                }

                // Sort by createdAt (most recent first)
                allProposals.sort((a, b) => b.startTime - a.startTime);

                setProposals(allProposals);
                setOrganizations(orgs);

                console.log(`[useAggregatorProposals] Loaded ${allProposals.length} proposals from ${orgs.length} organizations`);
            } catch (e) {
                if (cancelled) return;
                console.error('[useAggregatorProposals] Error:', e);
                setError(e);
                setProposals([]);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProposals();

        return () => {
            cancelled = true;
        };
    }, [aggregatorAddress, connectedWallet]);

    return { proposals, organizations, loading, error };
}

/**
 * Standalone function to fetch proposals (for non-React usage)
 * 
 * 1. Fetches proposals from registry subgraph (names, owners, org metadata)
 * 2. Groups by chain, bulk fetches pool addresses from market subgraphs
 * 3. Merges pool addresses back into proposals
 */
export async function fetchProposalsFromAggregator(aggregatorAddress, connectedWallet = null) {
    console.log(`[fetchProposalsFromAggregator] Starting fetch from aggregator: ${aggregatorAddress}`);

    // Step 1: Get proposals from the shared registry snapshot
    const aggregator = await fetchNestedRegistrySnapshot(aggregatorAddress);

    const allProposals = [];
    for (const org of aggregator.organizations || []) {
        for (const proposal of org.proposals || []) {
            // Skip archived proposals (test/abandoned, never going live)
            const proposalMeta = parseMetadata(proposal.metadata);
            if (isProposalArchived(proposalMeta)) {
                console.log(`[🗄️ ARCHIVED] Skipping "${proposal.displayNameEvent?.slice(0, 40)}..."`);
                continue;
            }
            allProposals.push(transformProposalToEvent(proposal, org, connectedWallet));
        }
    }

    console.log(`[🔗 REGISTRY-PROPOSALS] Got ${allProposals.length} proposals from registry subgraph`);

    // Step 2: Bulk fetch pool addresses from market subgraphs (grouped by chain)
    // This makes 1 query per chain instead of N queries
    if (allProposals.length > 0) {
        const poolMap = await bulkFetchPoolsByChain(allProposals);

        // Step 3: Merge pool addresses back into proposals
        for (const proposal of allProposals) {
            const pools = poolMap[proposal.proposalAddress?.toLowerCase()];
            if (pools) {
                proposal.poolAddresses = {
                    yes: pools.yes,
                    no: pools.no
                };
                console.log(`[🔗 REGISTRY-POOLS] Merged pools for "${proposal.eventTitle}": YES=${pools.yes?.slice(0, 10)}..., NO=${pools.no?.slice(0, 10)}...`);
            }
        }
    }

    return {
        proposals: allProposals.sort((a, b) => b.startTime - a.startTime),
        organizations: aggregator.organizations || []
    };
}

export default useAggregatorProposals;
