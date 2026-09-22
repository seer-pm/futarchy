/**
 * Test script for Subgraph Endpoints - CORRECTED SCHEMA
 * 
 * Based on schema introspection:
 * 
 * Chain 1 (Uniswap) Schema:
 * - Candle: id, time, period, periodStartUnix, pool, block, open, high, low, close, volumeToken0, volumeToken1, volumeUSD
 * - Pool: id, token0, token1, fee, liquidity, sqrtPrice, price, tick, isInverted, name, type, outcomeSide, candles, proposal
 * - Proposal: id, marketName, companyToken, currencyToken, pools, outcomeTokens
 * 
 * Chain 100 (Algebra) Schema: (same structure)
 * - Candle: id, time, period, periodStartUnix, pool, block, open, high, low, close, volumeToken0, volumeToken1, volumeUSD
 * - Pool: id, token0, token1, fee, liquidity, sqrtPrice, price, tick, isInverted, name, type, outcomeSide, candles, proposal
 * - Proposal: id, marketName, companyToken, currencyToken, pools, outcomeTokens
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINTS = {
    chain1: CANDLES_ENDPOINTS[1],
    chain100: CANDLES_ENDPOINTS[100]
};

const TEST_PROPOSALS = {
    chain1: '0x4e018f1D8b93B91a0Ce186874eDb53CB6fFfCa62'.toLowerCase(),
    chain100: '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC'.toLowerCase()
};

async function querySubgraph(endpoint, query) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

// Test 1: Get All Proposals with correct fields
async function testGetProposals(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 1: Get All Proposals - ${chainName}`);
    console.log('='.repeat(60));

    const query = `{
    proposals(first: 10) {
      id
      marketName
      companyToken
      currencyToken
      pools {
        id
      }
      outcomeTokens {
        id
      }
    }
  }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ GraphQL Errors:', result.errors);
            return null;
        }

        console.log(`\n✅ Found ${result.data.proposals?.length || 0} proposals:`);
        result.data.proposals?.forEach((p, i) => {
            console.log(`\n  ${i + 1}. ${p.id}`);
            console.log(`     MarketName: ${p.marketName || 'N/A'}`);
            console.log(`     CompanyToken: ${p.companyToken}`);
            console.log(`     CurrencyToken: ${p.currencyToken}`);
            console.log(`     Pools: ${p.pools?.length || 0}`);
        });

        return result.data.proposals;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 2: Get ALL Pools with correct fields
async function testGetAllPools(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 2: Get ALL Pools - ${chainName}`);
    console.log('='.repeat(60));

    const query = `{
    pools(first: 20) {
      id
      token0
      token1
      name
      type
      outcomeSide
      price
      tick
      liquidity
      isInverted
      proposal {
        id
        marketName
      }
    }
  }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ GraphQL Errors:', result.errors);
            return null;
        }

        console.log(`\n✅ Found ${result.data.pools?.length || 0} pools total:`);
        result.data.pools?.forEach((pool, i) => {
            console.log(`\n  ${i + 1}. ${pool.id.substring(0, 42)}...`);
            console.log(`     Name: ${pool.name}`);
            console.log(`     Type: ${pool.type}, Side: ${pool.outcomeSide || 'N/A'}`);
            console.log(`     Price: ${pool.price}`);
            console.log(`     IsInverted: ${pool.isInverted}`);
            console.log(`     Proposal: ${pool.proposal?.id?.substring(0, 20) || 'N/A'}...`);
        });

        return result.data.pools;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 3: Get Pools for Specific Proposal
async function testGetPoolsForProposal(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 3: Get Pools for Proposal - ${chainName}`);
    console.log(`Proposal: ${proposalId}`);
    console.log('='.repeat(60));

    const query = `{
    pools(where: { proposal: "${proposalId}" }) {
      id
      token0
      token1
      name
      type
      outcomeSide
      price
      tick
      liquidity
      sqrtPrice
      isInverted
      proposal {
        id
        marketName
        companyToken
        currencyToken
      }
    }
  }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ GraphQL Errors:', result.errors);
            return null;
        }

        console.log(`\n✅ Found ${result.data.pools?.length || 0} pools for proposal:`);
        result.data.pools?.forEach((pool, i) => {
            console.log(`\n  ${i + 1}. Pool: ${pool.id}`);
            console.log(`     Name: ${pool.name}`);
            console.log(`     Type: ${pool.type}`);
            console.log(`     OutcomeSide: ${pool.outcomeSide || 'N/A'}`);
            console.log(`     Token0: ${pool.token0}`);
            console.log(`     Token1: ${pool.token1}`);
            console.log(`     Price: ${pool.price}`);
            console.log(`     IsInverted: ${pool.isInverted}`);
        });

        return result.data.pools;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 4: Get Conditional YES/NO Pools (using type = "CONDITIONAL")
async function testGetConditionalPools(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 4: Get Conditional YES/NO Pools - ${chainName}`);
    console.log(`Proposal: ${proposalId}`);
    console.log('='.repeat(60));

    // Query YES pools
    const queryYes = `{
    pools(where: { 
      proposal: "${proposalId}",
      outcomeSide: "yes"
    }) {
      id
      name
      type
      outcomeSide
      price
      tick
      isInverted
    }
  }`;

    // Query NO pools
    const queryNo = `{
    pools(where: { 
      proposal: "${proposalId}",
      outcomeSide: "no"
    }) {
      id
      name
      type
      outcomeSide
      price
      tick
      isInverted
    }
  }`;

    try {
        const [yesResult, noResult] = await Promise.all([
            querySubgraph(endpoint, queryYes),
            querySubgraph(endpoint, queryNo)
        ]);

        console.log('\n📈 YES Pools:');
        if (yesResult.errors) {
            console.log('❌ Errors:', yesResult.errors);
        } else if (yesResult.data.pools?.length > 0) {
            yesResult.data.pools.forEach(pool => {
                console.log(`  - ${pool.id}`);
                console.log(`    Name: ${pool.name}`);
                console.log(`    Type: ${pool.type}, Side: ${pool.outcomeSide}`);
                console.log(`    Price: ${pool.price}`);
            });
        } else {
            console.log('  No YES pools found');
        }

        console.log('\n📉 NO Pools:');
        if (noResult.errors) {
            console.log('❌ Errors:', noResult.errors);
        } else if (noResult.data.pools?.length > 0) {
            noResult.data.pools.forEach(pool => {
                console.log(`  - ${pool.id}`);
                console.log(`    Name: ${pool.name}`);
                console.log(`    Type: ${pool.type}, Side: ${pool.outcomeSide}`);
                console.log(`    Price: ${pool.price}`);
            });
        } else {
            console.log('  No NO pools found');
        }

        return {
            yesPools: yesResult.data?.pools || [],
            noPools: noResult.data?.pools || []
        };
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 5: Get Candles for a Pool (CORRECTED: use 'time' not 'timestamp')
async function testGetCandles(chainId, poolAddress = null) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 5: Get Candles - ${chainName}`);
    console.log('='.repeat(60));

    // First get a pool if not provided
    if (!poolAddress) {
        const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
        const poolsQuery = `{
      pools(where: { proposal: "${proposalId}" }, first: 1) {
        id
        name
        type
        outcomeSide
      }
    }`;

        const poolsResult = await querySubgraph(endpoint, poolsQuery);
        if (poolsResult.data?.pools?.length > 0) {
            poolAddress = poolsResult.data.pools[0].id;
            console.log(`Using pool: ${poolsResult.data.pools[0].name} (${poolsResult.data.pools[0].outcomeSide || 'spot'})`);
        } else {
            console.log('❌ No pools found to query candles');
            return null;
        }
    }

    console.log(`Pool: ${poolAddress}`);

    // Using correct field names: 'time' not 'timestamp', 'periodStartUnix' for ordering
    const query = `{
    candles(
      where: { pool: "${poolAddress.toLowerCase()}" },
      first: 20,
      orderBy: periodStartUnix,
      orderDirection: desc
    ) {
      id
      time
      period
      periodStartUnix
      open
      high
      low
      close
      volumeToken0
      volumeToken1
      volumeUSD
      pool {
        id
        name
        type
        outcomeSide
      }
    }
  }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ GraphQL Errors:', result.errors);
            return null;
        }

        console.log(`\n✅ Found ${result.data.candles?.length || 0} candles:`);
        result.data.candles?.slice(0, 5).forEach((candle, i) => {
            const date = new Date(parseInt(candle.periodStartUnix) * 1000).toISOString();
            console.log(`\n  ${i + 1}. ${date}`);
            console.log(`     Time: ${candle.time}, Period: ${candle.period}`);
            console.log(`     Open: ${candle.open}, Close: ${candle.close}`);
            console.log(`     High: ${candle.high}, Low: ${candle.low}`);
            console.log(`     Volume: ${candle.volumeUSD} USD`);
        });

        if (result.data.candles?.length > 5) {
            console.log(`\n  ... and ${result.data.candles.length - 5} more candles`);
        }

        return result.data.candles;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 6: Get Conditional Pool Types - Determine what types exist
async function testPoolTypes(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 6: Pool Types Analysis - ${chainName}`);
    console.log(`Proposal: ${proposalId}`);
    console.log('='.repeat(60));

    const query = `{
    pools(where: { proposal: "${proposalId}" }) {
      id
      name
      type
      outcomeSide
      price
    }
  }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ GraphQL Errors:', result.errors);
            return null;
        }

        const pools = result.data.pools || [];

        // Group by type
        const byType = {};
        pools.forEach(pool => {
            const type = pool.type || 'unknown';
            if (!byType[type]) byType[type] = [];
            byType[type].push(pool);
        });

        console.log('\n📊 Pools grouped by TYPE:');
        Object.entries(byType).forEach(([type, typePools]) => {
            console.log(`\n  ${type}: ${typePools.length} pools`);
            typePools.forEach(p => {
                console.log(`    - ${p.name} (${p.outcomeSide || 'N/A'}) - Price: ${p.price}`);
            });
        });

        // Group by outcomeSide
        const bySide = {};
        pools.forEach(pool => {
            const side = pool.outcomeSide || 'base';
            if (!bySide[side]) bySide[side] = [];
            bySide[side].push(pool);
        });

        console.log('\n📊 Pools grouped by OUTCOME SIDE:');
        Object.entries(bySide).forEach(([side, sidePools]) => {
            console.log(`\n  ${side}: ${sidePools.length} pools`);
            sidePools.forEach(p => {
                console.log(`    - ${p.name} (${p.type}) - Price: ${p.price}`);
            });
        });

        return pools;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Test 7: Get Candles for YES and NO pools to visualize data for chart
async function testChartData(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 7: Chart Data (YES/NO Candles) - ${chainName}`);
    console.log(`Proposal: ${proposalId}`);
    console.log('='.repeat(60));

    // Get conditional pools (YES and NO with type=CONDITIONAL)
    const poolsQuery = `{
    pools(where: { proposal: "${proposalId}", type: "CONDITIONAL" }) {
      id
      name
      type
      outcomeSide
      price
    }
  }`;

    try {
        const poolsResult = await querySubgraph(endpoint, poolsQuery);

        if (poolsResult.errors || !poolsResult.data?.pools?.length) {
            console.log('❌ No CONDITIONAL pools found, trying without type filter...');

            // Fallback: get all pools and filter by outcomeSide
            const fallbackQuery = `{
        pools(where: { proposal: "${proposalId}" }) {
          id
          name
          type
          outcomeSide
          price
        }
      }`;

            const fallbackResult = await querySubgraph(endpoint, fallbackQuery);
            if (!fallbackResult.data?.pools?.length) {
                console.log('❌ No pools found for this proposal');
                return null;
            }

            poolsResult.data = fallbackResult.data;
        }

        const yesPools = poolsResult.data.pools.filter(p => p.outcomeSide === 'yes');
        const noPools = poolsResult.data.pools.filter(p => p.outcomeSide === 'no');

        console.log(`\n✅ Found ${yesPools.length} YES pools and ${noPools.length} NO pools`);

        // Get candles for the first YES pool
        if (yesPools.length > 0) {
            const yesPool = yesPools[0];
            console.log(`\n📈 YES Pool: ${yesPool.name}`);
            console.log(`   Current Price: ${yesPool.price}`);

            const candlesQuery = `{
        candles(
          where: { pool: "${yesPool.id.toLowerCase()}" },
          first: 50,
          orderBy: periodStartUnix,
          orderDirection: desc
        ) {
          periodStartUnix
          close
          open
          high
          low
        }
      }`;

            const candlesResult = await querySubgraph(endpoint, candlesQuery);
            if (candlesResult.data?.candles?.length) {
                console.log(`   Candles: ${candlesResult.data.candles.length}`);
                console.log(`   Latest: ${new Date(parseInt(candlesResult.data.candles[0].periodStartUnix) * 1000).toISOString()}`);
                console.log(`   Oldest: ${new Date(parseInt(candlesResult.data.candles[candlesResult.data.candles.length - 1].periodStartUnix) * 1000).toISOString()}`);
            }
        }

        // Get candles for the first NO pool
        if (noPools.length > 0) {
            const noPool = noPools[0];
            console.log(`\n📉 NO Pool: ${noPool.name}`);
            console.log(`   Current Price: ${noPool.price}`);

            const candlesQuery = `{
        candles(
          where: { pool: "${noPool.id.toLowerCase()}" },
          first: 50,
          orderBy: periodStartUnix,
          orderDirection: desc
        ) {
          periodStartUnix
          close
          open
          high
          low
        }
      }`;

            const candlesResult = await querySubgraph(endpoint, candlesQuery);
            if (candlesResult.data?.candles?.length) {
                console.log(`   Candles: ${candlesResult.data.candles.length}`);
                console.log(`   Latest: ${new Date(parseInt(candlesResult.data.candles[0].periodStartUnix) * 1000).toISOString()}`);
                console.log(`   Oldest: ${new Date(parseInt(candlesResult.data.candles[candlesResult.data.candles.length - 1].periodStartUnix) * 1000).toISOString()}`);
            }
        }

        return { yesPools, noPools };
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// Main execution
async function main() {
    console.log('\n🚀 SUBGRAPH ENDPOINT TESTING (CORRECTED SCHEMA)');
    console.log('================================================\n');
    console.log('Chain 1 Endpoint:', ENDPOINTS.chain1);
    console.log('Chain 100 Endpoint:', ENDPOINTS.chain100);
    console.log('\nTest Proposals:');
    console.log('  Chain 1:', TEST_PROPOSALS.chain1);
    console.log('  Chain 100:', TEST_PROPOSALS.chain100);

    // Test Chain 1 (Ethereum/Uniswap)
    console.log('\n\n' + '🔷'.repeat(30));
    console.log('TESTING CHAIN 1 (ETHEREUM/UNISWAP)');
    console.log('🔷'.repeat(30));

    await testGetProposals(1);
    await testGetAllPools(1);
    await testGetPoolsForProposal(1);
    await testPoolTypes(1);
    await testGetConditionalPools(1);
    await testGetCandles(1);
    await testChartData(1);

    // Test Chain 100 (Gnosis/Algebra)
    console.log('\n\n' + '🟠'.repeat(30));
    console.log('TESTING CHAIN 100 (GNOSIS/ALGEBRA)');
    console.log('🟠'.repeat(30));

    await testGetProposals(100);
    await testGetAllPools(100);
    await testGetPoolsForProposal(100);
    await testPoolTypes(100);
    await testGetConditionalPools(100);
    await testGetCandles(100);
    await testChartData(100);

    console.log('\n\n✅ All tests completed!');
}

main().catch(console.error);
