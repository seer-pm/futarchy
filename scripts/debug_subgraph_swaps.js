/**
 * Debug script to query subgraph swaps and understand ordering
 * Run: node scripts/debug_subgraph_swaps.js
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const PROPOSAL_ID = '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';
const ENDPOINT = CANDLES_ENDPOINTS[100];

async function main() {
    console.log('🔍 Querying subgraph for proposal:', PROPOSAL_ID);
    console.log('Endpoint:', ENDPOINT);
    console.log('');

    // Step 1: Get pools for this proposal
    const poolsQuery = `{
        pools(where: { proposal: "${PROPOSAL_ID.toLowerCase()}", type: "CONDITIONAL" }) {
            id
            name
            type
            outcomeSide
        }
    }`;

    console.log('📋 Fetching pools...');
    const poolsResponse = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: poolsQuery })
    });
    const poolsResult = await poolsResponse.json();
    const pools = poolsResult.data?.pools || [];
    console.log('Found', pools.length, 'pools:');
    pools.forEach(p => console.log('  -', p.id, p.name, p.outcomeSide));
    console.log('');

    if (pools.length === 0) {
        console.log('❌ No pools found');
        return;
    }

    // Step 2: Get swaps for these pools
    const poolIds = pools.map(p => p.id);
    const swapsQuery = `{
        swaps(
            where: { pool_in: ${JSON.stringify(poolIds)} }
            first: 30
            orderBy: timestamp
            orderDirection: desc
        ) {
            id
            transactionHash
            timestamp
            pool {
                id
                name
                outcomeSide
            }
        }
    }`;

    console.log('📋 Fetching swaps...');
    const swapsResponse = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: swapsQuery })
    });
    const swapsResult = await swapsResponse.json();
    const swaps = swapsResult.data?.swaps || [];

    console.log('Found', swaps.length, 'swaps:');
    console.log('');
    console.log('ORDER FROM SUBGRAPH (should be desc by timestamp):');
    console.log('─'.repeat(80));

    swaps.forEach((swap, i) => {
        const date = new Date(parseInt(swap.timestamp) * 1000);
        const dateStr = date.toISOString();
        const localStr = date.toLocaleString();
        console.log(`${i + 1}. ${swap.timestamp} (${localStr}) - ${swap.pool.outcomeSide} - ${swap.transactionHash.slice(0, 16)}...`);
    });

    console.log('');
    console.log('─'.repeat(80));
    console.log('ANALYSIS:');

    // Check if sorted correctly
    let isSorted = true;
    for (let i = 1; i < swaps.length; i++) {
        if (parseInt(swaps[i].timestamp) > parseInt(swaps[i - 1].timestamp)) {
            isSorted = false;
            console.log(`❌ OUT OF ORDER at index ${i}: ${swaps[i].timestamp} > ${swaps[i - 1].timestamp}`);
        }
    }

    if (isSorted) {
        console.log('✅ Swaps are correctly sorted desc by timestamp');
    }

    // Show first and last
    if (swaps.length > 0) {
        console.log('');
        console.log('First (newest):', new Date(parseInt(swaps[0].timestamp) * 1000).toLocaleString());
        console.log('Last (oldest):', new Date(parseInt(swaps[swaps.length - 1].timestamp) * 1000).toLocaleString());
    }
}

main().catch(console.error);
