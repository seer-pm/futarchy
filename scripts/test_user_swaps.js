/**
 * Test: Filter swaps by user wallet address
 * 
 * Run: node scripts/test_user_swaps.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINT_CHAIN_1 = CANDLES_ENDPOINTS[1];
const ENDPOINT_CHAIN_100 = CANDLES_ENDPOINTS[100];

// User wallet to filter by
const USER_WALLET = '0x645A3D9208523bbFEE980f7269ac72C61Dd3b552';

async function querySubgraph(endpoint, query) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
}

async function fetchUserSwaps(chainId, userAddress, limit = 50) {
    const endpoint = chainId === 1 ? ENDPOINT_CHAIN_1 : ENDPOINT_CHAIN_100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum)' : 'Chain 100 (Gnosis)';

    // IMPORTANT: Lowercase for GraphQL filtering
    const userLower = userAddress.toLowerCase();

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔍 USER SWAPS - ${chainName}`);
    console.log(`   Wallet: ${userAddress}`);
    console.log('═'.repeat(70));

    // Query using 'origin' field (the actual user wallet)
    const query = `{
        swaps(
            where: { origin: "${userLower}" }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            id
            transactionHash
            timestamp
            sender
            recipient
            origin
            amountIn
            amountOut
            price
            tokenIn { symbol decimals }
            tokenOut { symbol decimals }
            pool { name type outcomeSide }
        }
    }`;

    console.log('\n🔄 Querying with: origin = "' + userLower + '"');

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('\n❌ Error:', result.errors[0]?.message);
            return null;
        }

        const swaps = result.data?.swaps || [];
        console.log(`\n✅ Found ${swaps.length} swaps for this user\n`);

        if (swaps.length > 0) {
            // Separate by outcome
            const yesSwaps = swaps.filter(s => s.pool.outcomeSide === 'yes');
            const noSwaps = swaps.filter(s => s.pool.outcomeSide === 'no');
            const otherSwaps = swaps.filter(s => !['yes', 'no'].includes(s.pool.outcomeSide));

            console.log(`📈 YES swaps: ${yesSwaps.length}`);
            console.log(`📉 NO swaps:  ${noSwaps.length}`);
            console.log(`📊 Other:     ${otherSwaps.length}`);

            console.log('\n' + '─'.repeat(70));
            console.log('📝 SWAP DETAILS');
            console.log('─'.repeat(70));

            swaps.forEach((swap, i) => {
                const date = new Date(parseInt(swap.timestamp) * 1000);
                const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
                const side = swap.pool.outcomeSide?.toUpperCase() || 'BASE';

                console.log(`\n${i + 1}. [${side}] ${dateStr}`);
                console.log(`   Pool: ${swap.pool.name} (${swap.pool.type})`);
                console.log(`   Trade: ${parseFloat(swap.amountIn).toFixed(6)} ${swap.tokenIn.symbol} → ${parseFloat(swap.amountOut).toFixed(6)} ${swap.tokenOut.symbol}`);
                console.log(`   Price: ${parseFloat(swap.price).toFixed(6)}`);
                console.log(`   Tx: ${swap.transactionHash}`);
                console.log(`   Origin (User): ${swap.origin}`);
            });
        }

        return swaps;

    } catch (error) {
        console.error('\n❌ Network Error:', error.message);
        return null;
    }
}

// Also test with 'sender' field for comparison
async function fetchUserSwapsBySender(chainId, userAddress, limit = 50) {
    const endpoint = chainId === 1 ? ENDPOINT_CHAIN_1 : ENDPOINT_CHAIN_100;
    const userLower = userAddress.toLowerCase();

    console.log('\n\n' + '─'.repeat(70));
    console.log('📋 ALTERNATIVE: Query by sender field');
    console.log('─'.repeat(70));

    const query = `{
        swaps(
            where: { sender: "${userLower}" }
            first: ${limit}
            orderBy: timestamp
            orderDirection: desc
        ) {
            timestamp
            pool { name outcomeSide }
            amountIn
            tokenIn { symbol }
            tokenOut { symbol }
        }
    }`;

    const result = await querySubgraph(endpoint, query);
    const swaps = result.data?.swaps || [];
    console.log(`Found ${swaps.length} swaps by sender field`);

    return swaps;
}

async function main() {
    console.log('\n' + '🔬'.repeat(35));
    console.log('USER SWAP HISTORY TEST');
    console.log('🔬'.repeat(35));
    console.log(`\nTarget User: ${USER_WALLET}`);

    // Test Chain 1 (Ethereum)
    const chain1Swaps = await fetchUserSwaps(1, USER_WALLET);
    await fetchUserSwapsBySender(1, USER_WALLET);

    // Test Chain 100 (Gnosis)
    const chain100Swaps = await fetchUserSwaps(100, USER_WALLET);
    await fetchUserSwapsBySender(100, USER_WALLET);

    // Summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Chain 1 (Ethereum):  ${chain1Swaps?.length || 0} swaps`);
    console.log(`Chain 100 (Gnosis):  ${chain100Swaps?.length || 0} swaps`);
    console.log(`\n✅ Use 'origin' field to filter by user wallet address`);
}

main().catch(console.error);
