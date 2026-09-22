const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];
const TEST_POOL_ID = '0xf8346e622557763a62cc981187d084695ee296c3'; // A pool known to have liquidity from user's JSON

const POOL_QUERY = `
  query GetPoolData($poolId: ID!, $timestamp24hAgo: BigInt!) {
    pool(id: $poolId) {
      id
      liquidity
      volumeToken0
      volumeToken1
      token0 {
        symbol
        decimals
      }
      token1 {
        symbol
        decimals
      }
    }
    candles(
      where: { pool: $poolId, time_gte: $timestamp24hAgo, period: 3600 }
      orderBy: time
      orderDirection: desc
    ) {
      volumeUSD
    }
  }
`;

async function testHookFetching() {
    console.log(`Testing Fetch for Pool: ${TEST_POOL_ID}`);
    const timestamp24hAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    console.log('Sending query...');
    console.log('Variables:', { poolId: TEST_POOL_ID.toLowerCase(), timestamp24hAgo });

    try {
        const response = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: POOL_QUERY,
                variables: {
                    poolId: TEST_POOL_ID.toLowerCase(),
                    timestamp24hAgo: timestamp24hAgo // Passing as number, checking if BigInt accepts it
                }
            })
        });

        const result = await response.json();

        console.log('-------------------------------------------');
        if (result.errors) {
            console.error('❌ QUERY ERROR:', JSON.stringify(result.errors, null, 2));
        } else if (!result.data || !result.data.pool) {
            console.log('⚠️  NO DATA FOUND (pool is null)');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('✅ SUCCESS!');
            console.log('Liquidity:', result.data.pool.liquidity);
            console.log(`Candles Found: ${result.data.candles.length}`);
        }
        console.log('-------------------------------------------');

    } catch (e) {
        console.error('Fetch Failed:', e);
    }
}

testHookFetching();
