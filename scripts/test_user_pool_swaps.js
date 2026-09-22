/**
 * Test: Filter swaps by user wallet AND specific pools
 * 
 * Given:
 * - User address: 0x645A3D9208523bbFEE980f7269ac72C61Dd3b552
 * - Conditional pools: YES and NO pool addresses
 * 
 * Run: node scripts/test_user_pool_swaps.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINT_CHAIN_1 = CANDLES_ENDPOINTS[1];

// User wallet
const USER_WALLET = '0x645A3D9208523bbFEE980f7269ac72C61Dd3b552';

// Conditional pools from config
const CONDITIONAL_POOLS = {
    no: { address: "0x08D364Bf5ED8698790114a56678d14b5d6a89A77" },
    yes: { address: "0xd4776Ea355326C3D9Ab3Ff9417F12D6c8718066F" }
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
 * Fetch swaps for a specific user in specific pools
 * Combines: origin = userAddress AND pool_in = [pool1, pool2]
 */
async function fetchUserSwapsForPools(userAddress, poolAddresses, limit = 50) {
    // IMPORTANT: Lowercase all addresses for GraphQL
    const userLower = userAddress.toLowerCase();
    const poolIds = poolAddresses.map(p => p.toLowerCase());

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 USER SWAPS FOR SPECIFIC POOLS');
    console.log('═'.repeat(70));
    console.log(`\nUser:  ${userAddress}`);
    console.log(`Pools: ${poolIds.length} pools`);
    poolIds.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

    // Combined filter: origin AND pool_in
    const query = `{
        swaps(
            where: { 
                origin: "${userLower}",
                pool_in: ${JSON.stringify(poolIds)}
            }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            id
            transactionHash
            timestamp
            origin
            amountIn
            amountOut
            price
            tokenIn { symbol decimals }
            tokenOut { symbol decimals }
            pool { 
                id
                name 
                type 
                outcomeSide 
            }
        }
    }`;

    console.log('\n🔄 Querying with combined filter: origin + pool_in...\n');

    try {
        const result = await querySubgraph(query);

        if (result.errors) {
            console.log('❌ Error:', result.errors[0]?.message);
            return null;
        }

        const swaps = result.data?.swaps || [];
        console.log(`✅ Found ${swaps.length} swaps for this user in these pools\n`);

        if (swaps.length === 0) {
            console.log('ℹ️  This user has no swaps in the specified pools.');
            return [];
        }

        // Separate by outcome
        const yesSwaps = swaps.filter(s => s.pool.outcomeSide === 'yes');
        const noSwaps = swaps.filter(s => s.pool.outcomeSide === 'no');

        console.log(`📈 YES Pool swaps: ${yesSwaps.length}`);
        console.log(`📉 NO Pool swaps:  ${noSwaps.length}`);

        console.log('\n' + '─'.repeat(70));
        console.log('📝 SWAP DETAILS');
        console.log('─'.repeat(70));

        swaps.forEach((swap, i) => {
            const date = new Date(parseInt(swap.timestamp) * 1000);
            const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
            const side = swap.pool.outcomeSide?.toUpperCase() || 'UNKNOWN';

            console.log(`\n${i + 1}. [${side}] ${dateStr}`);
            console.log(`   Pool: ${swap.pool.name}`);
            console.log(`   Trade: ${parseFloat(swap.amountIn).toFixed(6)} ${swap.tokenIn.symbol} → ${parseFloat(swap.amountOut).toFixed(6)} ${swap.tokenOut.symbol}`);
            console.log(`   Price: ${parseFloat(swap.price).toFixed(6)}`);
            console.log(`   Tx: ${swap.transactionHash}`);
        });

        return { all: swaps, yes: yesSwaps, no: noSwaps };

    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

// Show reusable query
function showReusableQuery() {
    console.log('\n\n' + '═'.repeat(70));
    console.log('📋 REUSABLE GRAPHQL QUERY');
    console.log('═'.repeat(70));
    console.log(`
// Query: Get user's swaps for specific pools
const GET_USER_SWAPS_FOR_POOLS = \`
query GetUserSwapsForPools($userAddress: String!, $poolIds: [String!]!, $limit: Int!) {
    swaps(
        where: { 
            origin: $userAddress,
            pool_in: $poolIds 
        }
        first: $limit
        orderBy: timestamp
        orderDirection: desc
    ) {
        transactionHash
        timestamp
        amountIn
        amountOut
        price
        tokenIn { symbol decimals }
        tokenOut { symbol decimals }
        pool { name type outcomeSide }
    }
}
\`;

// Variables:
const variables = {
    userAddress: "${USER_WALLET.toLowerCase()}",
    poolIds: [
        "${CONDITIONAL_POOLS.yes.address.toLowerCase()}",  // YES pool
        "${CONDITIONAL_POOLS.no.address.toLowerCase()}"    // NO pool
    ],
    limit: 50
};
`);
}

async function main() {
    console.log('\n' + '🔬'.repeat(35));
    console.log('USER + POOL FILTER TEST - Chain 1');
    console.log('🔬'.repeat(35));

    // Get pool addresses
    const poolAddresses = [
        CONDITIONAL_POOLS.yes.address,
        CONDITIONAL_POOLS.no.address
    ];

    // Fetch with combined filter
    const result = await fetchUserSwapsForPools(USER_WALLET, poolAddresses, 50);

    // Show reusable query
    showReusableQuery();

    // Summary
    if (result) {
        console.log('\n' + '═'.repeat(70));
        console.log('📊 SUMMARY');
        console.log('═'.repeat(70));
        console.log(`User: ${USER_WALLET}`);
        console.log(`YES Pool (${CONDITIONAL_POOLS.yes.address.substring(0, 10)}...): ${result.yes?.length || 0} swaps`);
        console.log(`NO Pool (${CONDITIONAL_POOLS.no.address.substring(0, 10)}...): ${result.no?.length || 0} swaps`);
        console.log(`Total: ${result.all?.length || 0} swaps`);
    }

    console.log('\n✅ Test complete!');
}

main().catch(console.error);
