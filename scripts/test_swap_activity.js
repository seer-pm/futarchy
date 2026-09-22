/**
 * Test: Fetch Recent Swap Activity for YES/NO Pools in ONE call
 * 
 * Given conditional_pools config with yes/no addresses,
 * fetch all recent swaps with full details.
 * 
 * Run: node scripts/test_swap_activity.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINT_CHAIN_1 = CANDLES_ENDPOINTS[1];

// Test data from user's conditional_pools config
const CONDITIONAL_POOLS = {
    no: {
        address: "0x08D364Bf5ED8698790114a56678d14b5d6a89A77"
    },
    yes: {
        address: "0xd4776Ea355326C3D9Ab3Ff9417F12D6c8718066F"
    }
};

async function querySubgraph(query) {
    const response = await fetch(ENDPOINT_CHAIN_1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
}

/**
 * Fetch swaps for both YES and NO pools in ONE GraphQL call
 * Using pool_in filter with array of addresses (lowercase!)
 */
async function fetchSwapsForPools(yesAddress, noAddress, limit = 50) {
    // IMPORTANT: GraphQL requires lowercase addresses
    const yesLower = yesAddress.toLowerCase();
    const noLower = noAddress.toLowerCase();

    console.log('\n' + '═'.repeat(70));
    console.log('📊 FETCHING SWAPS FOR YES/NO POOLS (Single Query)');
    console.log('═'.repeat(70));
    console.log(`\nYES Pool: ${yesLower}`);
    console.log(`NO Pool:  ${noLower}`);
    console.log(`Limit:    ${limit} swaps per pool`);

    // Single query that fetches swaps from BOTH pools using pool_in
    const query = `{
        swaps(
            where: { 
                pool_in: ["${yesLower}", "${noLower}"]
            }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            id
            transactionHash
            timestamp
            amountIn
            amountOut
            price
            tokenIn {
                id
                symbol
                decimals
            }
            tokenOut {
                id
                symbol
                decimals
            }
            pool {
                id
                name
                type
                outcomeSide
            }
        }
    }`;

    console.log('\n🔄 Executing GraphQL query...');

    try {
        const result = await querySubgraph(query);

        if (result.errors) {
            console.log('\n❌ GraphQL Error:', result.errors[0]?.message);
            return null;
        }

        const swaps = result.data?.swaps || [];
        console.log(`\n✅ SUCCESS! Found ${swaps.length} swaps total\n`);

        // Separate by pool/outcome
        const yesSwaps = swaps.filter(s => s.pool.id.toLowerCase() === yesLower);
        const noSwaps = swaps.filter(s => s.pool.id.toLowerCase() === noLower);

        console.log(`📈 YES Pool swaps: ${yesSwaps.length}`);
        console.log(`📉 NO Pool swaps:  ${noSwaps.length}`);

        // Display detailed swap info
        console.log('\n' + '─'.repeat(70));
        console.log('📝 SWAP DETAILS');
        console.log('─'.repeat(70));

        swaps.forEach((swap, i) => {
            const date = new Date(parseInt(swap.timestamp) * 1000);
            const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);

            console.log(`\n${i + 1}. [${swap.pool.outcomeSide?.toUpperCase() || 'UNKNOWN'}] ${dateStr}`);
            console.log(`   ┌─ Pool: ${swap.pool.name}`);
            console.log(`   │  Type: ${swap.pool.type}`);
            console.log(`   │`);
            console.log(`   ├─ Trade:`);
            console.log(`   │  IN:  ${parseFloat(swap.amountIn).toFixed(6)} ${swap.tokenIn.symbol} (${swap.tokenIn.decimals} decimals)`);
            console.log(`   │  OUT: ${parseFloat(swap.amountOut).toFixed(6)} ${swap.tokenOut.symbol} (${swap.tokenOut.decimals} decimals)`);
            console.log(`   │`);
            console.log(`   ├─ Price: ${parseFloat(swap.price).toFixed(8)}`);
            console.log(`   │`);
            console.log(`   └─ Tx: ${swap.transactionHash}`);
        });

        // Return structured data
        return {
            all: swaps,
            yes: yesSwaps,
            no: noSwaps,
            summary: {
                totalSwaps: swaps.length,
                yesSwaps: yesSwaps.length,
                noSwaps: noSwaps.length,
                timeRange: swaps.length > 0 ? {
                    oldest: new Date(parseInt(swaps[swaps.length - 1].timestamp) * 1000).toISOString(),
                    newest: new Date(parseInt(swaps[0].timestamp) * 1000).toISOString()
                } : null
            }
        };

    } catch (error) {
        console.error('\n❌ Network Error:', error.message);
        return null;
    }
}

/**
 * Alternative: Fetch swaps for each pool separately (for comparison)
 */
async function fetchSwapsSeparately(yesAddress, noAddress, limit = 25) {
    const yesLower = yesAddress.toLowerCase();
    const noLower = noAddress.toLowerCase();

    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 ALTERNATIVE: Separate Queries (for comparison)');
    console.log('═'.repeat(70));

    // Query YES pool
    const yesQuery = `{
        swaps(
            where: { pool: "${yesLower}" }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            timestamp
            amountIn
            amountOut
            price
            tokenIn { symbol }
            tokenOut { symbol }
            pool { name outcomeSide }
        }
    }`;

    // Query NO pool
    const noQuery = `{
        swaps(
            where: { pool: "${noLower}" }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            timestamp
            amountIn
            amountOut
            price
            tokenIn { symbol }
            tokenOut { symbol }
            pool { name outcomeSide }
        }
    }`;

    const [yesResult, noResult] = await Promise.all([
        querySubgraph(yesQuery),
        querySubgraph(noQuery)
    ]);

    const yesSwaps = yesResult.data?.swaps || [];
    const noSwaps = noResult.data?.swaps || [];

    console.log(`\n✅ YES Pool: ${yesSwaps.length} swaps`);
    if (yesSwaps.length > 0) {
        yesSwaps.slice(0, 3).forEach(s => {
            const date = new Date(parseInt(s.timestamp) * 1000).toISOString().substring(0, 10);
            console.log(`   ${date}: ${parseFloat(s.amountIn).toFixed(4)} ${s.tokenIn.symbol} → ${parseFloat(s.amountOut).toFixed(4)} ${s.tokenOut.symbol}`);
        });
    }

    console.log(`\n✅ NO Pool: ${noSwaps.length} swaps`);
    if (noSwaps.length > 0) {
        noSwaps.slice(0, 3).forEach(s => {
            const date = new Date(parseInt(s.timestamp) * 1000).toISOString().substring(0, 10);
            console.log(`   ${date}: ${parseFloat(s.amountIn).toFixed(4)} ${s.tokenIn.symbol} → ${parseFloat(s.amountOut).toFixed(4)} ${s.tokenOut.symbol}`);
        });
    }

    return { yes: yesSwaps, no: noSwaps };
}

/**
 * Show the exact query you can use in your app
 */
function showReusableQuery(yesAddress, noAddress) {
    const yesLower = yesAddress.toLowerCase();
    const noLower = noAddress.toLowerCase();

    console.log('\n\n' + '═'.repeat(70));
    console.log('📋 REUSABLE GRAPHQL QUERY');
    console.log('═'.repeat(70));
    console.log(`
// Use this query in your app to fetch recent swap activity:

const GET_SWAPS_FOR_POOLS = \`
query GetSwapsForPools($poolIds: [String!]!, $limit: Int!) {
    swaps(
        where: { pool_in: $poolIds }
        first: $limit
        orderBy: timestamp
        orderDirection: desc
    ) {
        id
        transactionHash
        timestamp
        amountIn
        amountOut
        price
        tokenIn {
            id
            symbol
            decimals
        }
        tokenOut {
            id
            symbol
            decimals
        }
        pool {
            id
            name
            type
            outcomeSide
        }
    }
}
\`;

// Variables:
const variables = {
    poolIds: [
        "${yesLower}",
        "${noLower}"
    ],
    limit: 50
};
`);
}

// ========================================
// MAIN
// ========================================

async function main() {
    console.log('\n' + '🔬'.repeat(35));
    console.log('SWAP ACTIVITY TEST - Chain 1 (Uniswap)');
    console.log('🔬'.repeat(35));

    const { yes, no } = CONDITIONAL_POOLS;

    // Method 1: Single query for both pools
    const result = await fetchSwapsForPools(yes.address, no.address, 50);

    // Method 2: Separate queries (for comparison)
    await fetchSwapsSeparately(yes.address, no.address, 10);

    // Show reusable query
    showReusableQuery(yes.address, no.address);

    // Summary
    if (result) {
        console.log('\n' + '═'.repeat(70));
        console.log('📊 SUMMARY');
        console.log('═'.repeat(70));
        console.log(`Total Swaps Found: ${result.summary.totalSwaps}`);
        console.log(`YES Pool Swaps:    ${result.summary.yesSwaps}`);
        console.log(`NO Pool Swaps:     ${result.summary.noSwaps}`);
        if (result.summary.timeRange) {
            console.log(`Time Range:        ${result.summary.timeRange.oldest.substring(0, 10)} → ${result.summary.timeRange.newest.substring(0, 10)}`);
        }
    }

    console.log('\n✅ Test complete!');
}

main().catch(console.error);
