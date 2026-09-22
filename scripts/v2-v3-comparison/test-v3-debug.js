/**
 * Debug V3 Subgraph Swap Structure
 * 
 * Run: node scripts/test-v3-debug.js
 */

const V3_POOL = '0xd1d7fa8871d84d0e77020fc28b7cd5718c446522';
// NOTE: this Balancer v3 subgraph deployment no longer exists (the Studio
// endpoint answers "deployment does not exist"). It is Balancer's, not
// ours, so it cannot be repointed at the futarchy API — a replacement
// Balancer endpoint is needed before this script can run.
const V3_SUBGRAPH = 'https://api.studio.thegraph.com/query/75376/balancer-v3-gnosis/version/latest';

async function debugV3Swaps() {
    console.log('Fetching V3 swaps to debug structure...\n');

    // First, get ANY recent swaps to see the data structure
    const query1 = `
        query {
            swaps(
                orderBy: blockTimestamp
                orderDirection: desc
                first: 5
            ) {
                id
                pool
                blockTimestamp
                tokenIn
                tokenOut
                tokenInSymbol
                tokenOutSymbol
                tokenAmountIn
                tokenAmountOut
            }
        }
    `;

    console.log('=== Fetching ANY recent swaps ===\n');
    const response1 = await fetch(V3_SUBGRAPH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query1 })
    });

    const result1 = await response1.json();
    console.log('Recent swaps:');
    console.log(JSON.stringify(result1.data?.swaps?.slice(0, 3), null, 2));

    // Now try filtering by pool
    console.log('\n\n=== Fetching swaps for aGNO/sDAI pool ===\n');
    console.log('Pool address:', V3_POOL);

    const query2 = `
        query GetPoolSwaps($pool: Bytes!) {
            swaps(
                where: { pool: $pool }
                orderBy: blockTimestamp
                orderDirection: desc
                first: 10
            ) {
                id
                pool
                blockTimestamp
                tokenIn
                tokenOut
                tokenInSymbol
                tokenOutSymbol
                tokenAmountIn
                tokenAmountOut
            }
        }
    `;

    const response2 = await fetch(V3_SUBGRAPH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: query2,
            variables: { pool: V3_POOL.toLowerCase() }
        })
    });

    const result2 = await response2.json();

    if (result2.errors) {
        console.log('Errors:', result2.errors);
    }

    console.log('Pool swaps:');
    console.log(JSON.stringify(result2.data?.swaps, null, 2));

    if (result2.data?.swaps?.length > 0) {
        const swap = result2.data.swaps[0];
        console.log('\n\n=== First swap price calculation ===');
        console.log(`${swap.tokenInSymbol} → ${swap.tokenOutSymbol}`);
        console.log(`Amount In: ${swap.tokenAmountIn}`);
        console.log(`Amount Out: ${swap.tokenAmountOut}`);
        const price = parseFloat(swap.tokenAmountOut) / parseFloat(swap.tokenAmountIn);
        console.log(`Price: ${price.toFixed(4)}`);
    }
}

debugV3Swaps().catch(err => console.error('Error:', err));
