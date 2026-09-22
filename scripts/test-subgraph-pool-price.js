/**
 * Test script for SubgraphPoolFetcher
 * 
 * Tests fetching pool prices directly from The Graph subgraph endpoints
 * for both Gnosis (chain 100) and Ethereum (chain 1).
 * 
 * Usage: node scripts/test-subgraph-pool-price.js
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

// Inline SUBGRAPH_ENDPOINTS (since we're running in Node.js without transpilation)
const SUBGRAPH_ENDPOINTS = CANDLES_ENDPOINTS;

function getSubgraphEndpoint(chainId) {
    return SUBGRAPH_ENDPOINTS[chainId] || null;
}

/**
 * Fetch latest price for a single pool from subgraph
 */
async function fetchPoolPrice(poolAddress, chainId = 100) {
    const endpoint = getSubgraphEndpoint(chainId);

    if (!endpoint) {
        console.warn(`[SubgraphPoolFetcher] No endpoint for chain ${chainId}`);
        return null;
    }

    if (!poolAddress) {
        console.warn(`[SubgraphPoolFetcher] No pool address provided`);
        return null;
    }

    // Pool IDs in subgraph are lowercased
    const poolId = poolAddress.toLowerCase();

    const query = `{
        pool(id: "${poolId}") {
            id
            name
            price
            type
            outcomeSide
        }
    }`;

    try {
        console.log(`[SubgraphPoolFetcher] Fetching pool ${poolId} from chain ${chainId}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.errors) {
            console.error('[SubgraphPoolFetcher] GraphQL errors:', result.errors);
            return null;
        }

        const pool = result.data?.pool;

        if (!pool) {
            console.warn(`[SubgraphPoolFetcher] Pool ${poolId} not found in chain ${chainId}`);
            return null;
        }

        const price = parseFloat(pool.price);

        return {
            price: isNaN(price) ? null : price,
            address: pool.id,
            chainId,
            name: pool.name,
            type: pool.type,
            outcomeSide: pool.outcomeSide
        };

    } catch (error) {
        console.error(`[SubgraphPoolFetcher] Fetch error:`, error);
        return null;
    }
}

/**
 * Fetch prices for YES and NO pools in parallel
 */
async function fetchPoolPrices({ yesAddress, noAddress, chainId = 100 }) {
    const [yesResult, noResult] = await Promise.all([
        yesAddress ? fetchPoolPrice(yesAddress, chainId) : Promise.resolve(null),
        noAddress ? fetchPoolPrice(noAddress, chainId) : Promise.resolve(null)
    ]);

    return {
        yes: yesResult?.price ?? null,
        no: noResult?.price ?? null,
        chainId,
        yesPool: yesResult,
        noPool: noResult
    };
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
    console.log('='.repeat(60));
    console.log('SubgraphPoolFetcher Test');
    console.log('='.repeat(60));

    // Test 1: Fetch sample pool from Gnosis (chain 100)
    // Using a known conditional pool address from GNO proposals
    console.log('\n--- Test 1: Single Pool Fetch (Chain 100 - Gnosis) ---');

    // First, let's query to find some pools
    const findPoolsQuery = `{
        pools(first: 5, where: { type: "CONDITIONAL" }) {
            id
            name
            price
            type
            outcomeSide
        }
    }`;

    try {
        const response = await fetch(SUBGRAPH_ENDPOINTS[100], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: findPoolsQuery })
        });

        const result = await response.json();

        if (result.data?.pools && result.data.pools.length > 0) {
            console.log('\n📊 Found pools in Gnosis subgraph:');

            for (const pool of result.data.pools) {
                console.log(`\n  Pool: ${pool.name || pool.id}`);
                console.log(`    Address: ${pool.id}`);
                console.log(`    Type: ${pool.type}`);
                console.log(`    Side: ${pool.outcomeSide}`);
                console.log(`    Price: ${pool.price}`);
            }

            // Test fetchPoolPrice with first pool
            if (result.data.pools[0]) {
                console.log('\n--- Test 2: Using fetchPoolPrice function ---');
                const testPool = await fetchPoolPrice(result.data.pools[0].id, 100);
                console.log('fetchPoolPrice result:', testPool);
            }

            // Test fetchPoolPrices with YES and NO pools
            const yesPools = result.data.pools.filter(p => p.outcomeSide === 'YES');
            const noPools = result.data.pools.filter(p => p.outcomeSide === 'NO');

            if (yesPools[0] && noPools[0]) {
                console.log('\n--- Test 3: Using fetchPoolPrices for YES/NO ---');
                const prices = await fetchPoolPrices({
                    yesAddress: yesPools[0].id,
                    noAddress: noPools[0].id,
                    chainId: 100
                });
                console.log('fetchPoolPrices result:', prices);

                // Calculate impact
                if (prices.yes !== null && prices.no !== null) {
                    const maxPrice = Math.max(prices.yes, prices.no);
                    const impact = maxPrice !== 0
                        ? ((prices.yes - prices.no) / maxPrice) * 100
                        : 0;
                    console.log(`\n📈 Calculated Impact: ${impact >= 0 ? '+' : ''}${impact.toFixed(2)}%`);
                }
            }
        } else {
            console.log('No pools found in Gnosis subgraph');
        }
    } catch (error) {
        console.error('Test error:', error);
    }

    // Test 4: Check Chain 1 (Ethereum) endpoint
    console.log('\n--- Test 4: Chain 1 (Ethereum) Endpoint Check ---');
    try {
        const eth1Query = `{
            pools(first: 3) {
                id
                name
                price
                type
                outcomeSide
            }
        }`;

        const response = await fetch(SUBGRAPH_ENDPOINTS[1], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: eth1Query })
        });

        const result = await response.json();

        if (result.data?.pools && result.data.pools.length > 0) {
            console.log(`✅ Found ${result.data.pools.length} pools on Ethereum mainnet:`);
            for (const pool of result.data.pools) {
                console.log(`  - ${pool.name || pool.id}: ${pool.price}`);
            }
        } else if (result.errors) {
            console.log('⚠️  Ethereum subgraph errors:', result.errors[0]?.message);
        } else {
            console.log('No pools found in Ethereum subgraph');
        }
    } catch (error) {
        console.error('Ethereum test error:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Tests Complete');
    console.log('='.repeat(60));
}

runTests().catch(console.error);
