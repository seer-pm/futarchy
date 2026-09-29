/**
 * SubgraphBulkPriceFetcher.js
 * 
 * Optimized bulk fetching of pool prices from The Graph subgraph.
 * Collects all pool addresses, groups by chain, makes ONE query per chain.
 * 
 * Usage:
 *   const priceMap = await collectAndFetchPoolPrices(proposals);
 *   const yesPrice = priceMap.get(poolAddresses.yes.toLowerCase());
 */

import { SUBGRAPH_ENDPOINTS, getSubgraphEndpoint } from '../config/subgraphEndpoints';
import { readGraphqlData } from './graphqlResponse';

/**
 * Fetch multiple pools in a single GraphQL query
 * 
 * @param {string[]} poolAddresses - Array of pool addresses
 * @param {number} chainId - Chain ID (1 or 100)
 * @returns {Promise<Map<string, { price: number, name: string, outcomeSide: string }>>}
 * @throws when the request fails (HTTP error or GraphQL `errors`) — an
 *   outage is not the same as "these pools have no price"
 */
async function fetchPoolsBatch(poolAddresses, chainId) {
    const endpoint = getSubgraphEndpoint(chainId);

    if (!endpoint || !poolAddresses || poolAddresses.length === 0) {
        console.log(`[BulkPriceFetcher] ⚠️ No endpoint or addresses for chain ${chainId}`);
        return new Map();
    }

    // Lowercase and dedupe addresses
    const uniqueAddresses = [...new Set(poolAddresses.map(a => a?.toLowerCase()).filter(Boolean))];

    if (uniqueAddresses.length === 0) {
        return new Map();
    }

    const query = `{
        pools(where: { id_in: [${uniqueAddresses.map(a => `"${a}"`).join(', ')}] }) {
            id
            name
            price
            type
            outcomeSide
        }
    }`;

    console.log(`[BulkPriceFetcher] 🔍 Chain ${chainId}: Querying ${uniqueAddresses.length} pools`);
    console.log(`[BulkPriceFetcher] Addresses:`, uniqueAddresses.slice(0, 5), uniqueAddresses.length > 5 ? `...+${uniqueAddresses.length - 5} more` : '');
    console.log(`[BulkPriceFetcher] Endpoint:`, endpoint);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const data = await readGraphqlData(response, `Pool prices (chain ${chainId})`);

    const pools = data.pools || [];
    const poolMap = new Map();

    for (const pool of pools) {
        const price = parseFloat(pool.price);
        poolMap.set(pool.id.toLowerCase(), {
            price: isNaN(price) ? null : price,
            name: pool.name,
            type: pool.type,
            outcomeSide: pool.outcomeSide
        });
    }

    console.log(`[BulkPriceFetcher] ✅ Chain ${chainId}: Got ${poolMap.size}/${uniqueAddresses.length} pools`);
    console.log(`[BulkPriceFetcher] Found pools:`, pools.map(p => ({ id: p.id.slice(0, 10), name: p.name })));

    return poolMap;
}

/**
 * Collect all pool addresses from proposals and fetch prices in bulk
 * Groups by chainId and makes one query per chain
 * 
 * @param {Array} proposals - Array of proposal objects with poolAddresses and chainId
 * @returns {Promise<Map<string, number>>} Map of lowercased address -> price
 */
export async function collectAndFetchPoolPrices(proposals) {
    if (!proposals || proposals.length === 0) {
        console.log('[BulkPriceFetcher] No proposals to process');
        return new Map();
    }

    console.log(`[BulkPriceFetcher] Processing ${proposals.length} proposals...`);

    // Group pools by chainId
    const poolsByChain = {};

    for (const p of proposals) {
        const chainId = p.chainId || p.metadata?.chain || 100;

        if (!poolsByChain[chainId]) {
            poolsByChain[chainId] = [];
        }

        // Collect pool addresses from various possible sources
        const poolAddresses = p.poolAddresses || {};

        // Standard format: poolAddresses.yes / poolAddresses.no
        if (poolAddresses.yes) poolsByChain[chainId].push(poolAddresses.yes);
        if (poolAddresses.no) poolsByChain[chainId].push(poolAddresses.no);

        // Also check metadata.conditional_pools
        if (p.metadata?.conditional_pools) {
            if (p.metadata.conditional_pools.yes?.address) {
                poolsByChain[chainId].push(p.metadata.conditional_pools.yes.address);
            }
            if (p.metadata.conditional_pools.no?.address) {
                poolsByChain[chainId].push(p.metadata.conditional_pools.no.address);
            }
        }
    }

    // Log what we're fetching
    for (const [chainId, addresses] of Object.entries(poolsByChain)) {
        const unique = new Set(addresses.filter(Boolean));
        console.log(`[BulkPriceFetcher] Chain ${chainId}: ${unique.size} unique pool addresses`);
    }

    // Fetch all pools per chain in parallel
    const priceMap = new Map();

    const chainResults = await Promise.all(
        Object.entries(poolsByChain).map(async ([chainId, addresses]) => {
            const filtered = addresses.filter(Boolean);
            if (filtered.length === 0) return null;

            // One chain's outage should not blank the other chain's prices.
            // Its pools are simply absent from the map, so the cards fall
            // back to their per-pool fetch and show "—" if that fails too.
            try {
                const result = await fetchPoolsBatch(filtered, Number(chainId));
                return { chainId, result };
            } catch (error) {
                console.error(`[BulkPriceFetcher] Prices unavailable for chain ${chainId}:`, error);
                return null;
            }
        })
    );

    // Merge all results into single price map
    for (const item of chainResults) {
        if (!item) continue;
        for (const [addr, data] of item.result.entries()) {
            priceMap.set(addr, data.price);
        }
    }

    console.log(`[BulkPriceFetcher] ✅ Total: ${priceMap.size} pool prices fetched`);

    return priceMap;
}

/**
 * Attach prefetched prices to event highlight objects
 * Mutates the events array to add prefetchedPrices property
 * 
 * @param {Array} events - Array of event highlight objects
 * @param {Map<string, number>} priceMap - Map of address -> price
 */
export function attachPrefetchedPrices(events, priceMap) {
    console.log(`[BulkPriceFetcher] attachPrefetchedPrices called:`, {
        eventsCount: events?.length,
        priceMapSize: priceMap?.size,
        priceMapEntries: priceMap ? Array.from(priceMap.entries()).slice(0, 5) : []
    });

    if (!events || !priceMap || priceMap.size === 0) {
        console.log(`[BulkPriceFetcher] ⚠️ Skipping attach - no prices in map!`);
        return events;
    }

    for (const event of events) {
        const poolAddresses = event.poolAddresses || {};

        const yesAddr = (poolAddresses.yes || '').toLowerCase();
        const noAddr = (poolAddresses.no || '').toLowerCase();

        const yesPrice = yesAddr ? priceMap.get(yesAddr) ?? null : null;
        const noPrice = noAddr ? priceMap.get(noAddr) ?? null : null;

        event.prefetchedPrices = {
            yes: yesPrice,
            no: noPrice,
            source: 'subgraph-bulk'
        };

        console.log(`[BulkPriceFetcher] Event ${event.eventId}:`, {
            yesAddr: yesAddr || 'NONE',
            noAddr: noAddr || 'NONE',
            yesPrice,
            noPrice,
            foundInMap: {
                yes: yesAddr ? priceMap.has(yesAddr) : false,
                no: noAddr ? priceMap.has(noAddr) : false
            }
        });
    }

    return events;
}

// Re-export endpoints
export { SUBGRAPH_ENDPOINTS, getSubgraphEndpoint };

export default {
    collectAndFetchPoolPrices,
    attachPrefetchedPrices,
    fetchPoolsBatch
};
