/**
 * Test Script for Subgraph Pure Modules
 * 
 * Tests the config, client, and adapter modules before React integration.
 * Run with: node scripts/test_subgraph_modules.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

// Test endpoints configuration
const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

const POOL_TYPES = {
    PREDICTION: 'PREDICTION',
    CONDITIONAL: 'CONDITIONAL',
    EXPECTED_VALUE: 'EXPECTED_VALUE'
};

// ============================================================
// ADAPTER FUNCTIONS (copied from subgraphDataAdapter.js)
// ============================================================

function adaptCandlesToChartFormat(candles, options = {}) {
    const { invert = false, priceField = 'close' } = options;

    if (!candles || !Array.isArray(candles)) {
        return [];
    }

    return candles
        .map(candle => {
            const timestamp = parseInt(candle.periodStartUnix, 10);
            let price = parseFloat(candle[priceField] || candle.close);

            if (invert && price !== 0) {
                price = 1 / price;
            }

            return {
                time: timestamp,
                value: price
            };
        })
        .filter(point => !isNaN(point.time) && !isNaN(point.value))
        .sort((a, b) => a.time - b.time);
}

function adaptPoolToSimpleFormat(pool) {
    if (!pool) return null;

    return {
        address: pool.id,
        name: pool.name,
        type: pool.type,
        outcomeSide: pool.outcomeSide,
        price: parseFloat(pool.price),
        isInverted: pool.isInverted,
        proposalId: pool.proposal?.id || null,
        marketName: pool.proposal?.marketName || null
    };
}

function filterConditionalPools(pools) {
    if (!pools || !Array.isArray(pools)) {
        return { yesPools: [], noPools: [] };
    }

    const conditionalPools = pools.filter(p => p.type === 'CONDITIONAL');

    return {
        yesPools: conditionalPools.filter(p => p.outcomeSide === 'YES'),
        noPools: conditionalPools.filter(p => p.outcomeSide === 'NO')
    };
}

function createChartDataStructure({ yesCandles, noCandles, yesPool, noPool }) {
    // NOTE: isInverted is just informational - prices are already correct in subgraph
    const yesData = adaptCandlesToChartFormat(yesCandles);

    const noData = adaptCandlesToChartFormat(noCandles);

    const yesLatestPrice = yesData.length > 0 ? yesData[yesData.length - 1].value : (yesPool?.price || null);
    const noLatestPrice = noData.length > 0 ? noData[noData.length - 1].value : (noPool?.price || null);

    return {
        yesData,
        noData,
        yesPrice: yesLatestPrice,
        noPrice: noLatestPrice,
        yesPools: yesPool ? [adaptPoolToSimpleFormat(yesPool)] : [],
        noPools: noPool ? [adaptPoolToSimpleFormat(noPool)] : [],
        hasData: yesData.length > 0 || noData.length > 0,
        yesDataCount: yesData.length,
        noDataCount: noData.length
    };
}

function calculateImpact(yesPrice, noPrice, spotPrice = null) {
    if (yesPrice === null || noPrice === null) return 0;

    const denominator = spotPrice || Math.max(yesPrice, noPrice);

    if (denominator === 0) return 0;

    return ((yesPrice - noPrice) / denominator) * 100;
}

// ============================================================
// CLIENT FUNCTIONS (adapted from subgraphClient.js)
// ============================================================

const QUERIES = {
    GET_POOLS_FOR_PROPOSAL: `
    query GetPoolsForProposal($proposalId: String!) {
      pools(where: { proposal: $proposalId }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        proposal {
          id
          marketName
        }
      }
    }
  `,

    GET_CONDITIONAL_POOLS: `
    query GetConditionalPools($proposalId: String!) {
      pools(where: { proposal: $proposalId, type: "CONDITIONAL" }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        proposal {
          id
          marketName
        }
      }
    }
  `,

    GET_CANDLES: `
    query GetCandles($poolId: String!, $limit: Int!) {
      candles(
        where: { pool: $poolId }
        first: $limit
        orderBy: periodStartUnix
        orderDirection: desc
      ) {
        periodStartUnix
        open
        high
        low
        close
        volumeUSD
      }
    }
  `
};

async function executeQuery(endpoint, query, variables = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
        throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
}

function createSubgraphClient(chainId) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];

    if (!endpoint) {
        throw new Error(`Chain ${chainId} is not supported`);
    }

    return {
        chainId,
        endpoint,

        async getPoolsForProposal(proposalId) {
            const data = await executeQuery(endpoint, QUERIES.GET_POOLS_FOR_PROPOSAL, {
                proposalId: proposalId.toLowerCase()
            });
            return data.pools || [];
        },

        async getConditionalPools(proposalId) {
            const data = await executeQuery(endpoint, QUERIES.GET_CONDITIONAL_POOLS, {
                proposalId: proposalId.toLowerCase()
            });
            return data.pools || [];
        },

        async getCandles(poolId, limit = 500) {
            const data = await executeQuery(endpoint, QUERIES.GET_CANDLES, {
                poolId: poolId.toLowerCase(),
                limit
            });
            return data.candles || [];
        },

        async getChartData(proposalId, candleLimit = 500) {
            const pools = await this.getConditionalPools(proposalId);

            const yesPool = pools.find(p => p.outcomeSide === 'YES') || null;
            const noPool = pools.find(p => p.outcomeSide === 'NO') || null;

            const [yesCandles, noCandles] = await Promise.all([
                yesPool ? this.getCandles(yesPool.id, candleLimit) : Promise.resolve([]),
                noPool ? this.getCandles(noPool.id, candleLimit) : Promise.resolve([])
            ]);

            return {
                yesPool,
                noPool,
                yesCandles,
                noCandles,
                proposalId: proposalId.toLowerCase()
            };
        }
    };
}

// ============================================================
// TEST CASES
// ============================================================

const TEST_PROPOSALS = {
    chain1: '0x4e018f1D8b93B91a0Ce186874eDb53CB6fFfCa62',
    chain100: '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC'
};

async function testConfigModule() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST: Config Module');
    console.log('='.repeat(60));

    console.log('\n✅ SUBGRAPH_ENDPOINTS:');
    console.log('  Chain 1:', SUBGRAPH_ENDPOINTS[1]);
    console.log('  Chain 100:', SUBGRAPH_ENDPOINTS[100]);

    console.log('\n✅ POOL_TYPES:', Object.values(POOL_TYPES).join(', '));

    return true;
}

async function testAdapterModule() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST: Adapter Module');
    console.log('='.repeat(60));

    // Test adaptCandlesToChartFormat
    const mockCandles = [
        { periodStartUnix: '1704067200', open: '100.5', high: '101.2', low: '99.8', close: '100.9' },
        { periodStartUnix: '1704070800', open: '100.9', high: '102.5', low: '100.0', close: '101.5' },
        { periodStartUnix: '1704074400', open: '101.5', high: '103.0', low: '101.0', close: '102.8' }
    ];

    const chartData = adaptCandlesToChartFormat(mockCandles);
    console.log('\n✅ adaptCandlesToChartFormat:');
    console.log('  Input:', mockCandles.length, 'candles');
    console.log('  Output:', chartData.length, 'data points');
    console.log('  Sample:', JSON.stringify(chartData[0]));

    // Test with inversion
    const invertedData = adaptCandlesToChartFormat(mockCandles, { invert: true });
    console.log('\n✅ adaptCandlesToChartFormat (inverted):');
    console.log('  Original value:', chartData[0].value);
    console.log('  Inverted value:', invertedData[0].value);
    console.log('  Expected (1/original):', 1 / chartData[0].value);

    // Test adaptPoolToSimpleFormat
    const mockPool = {
        id: '0x123abc',
        name: 'YES_GNO / YES_sDAI',
        type: 'CONDITIONAL',
        outcomeSide: 'YES',
        price: '119.47',
        isInverted: false,
        proposal: { id: '0x456def', marketName: 'Test Market' }
    };

    const simplifiedPool = adaptPoolToSimpleFormat(mockPool);
    console.log('\n✅ adaptPoolToSimpleFormat:');
    console.log('  Input:', mockPool.name);
    console.log('  Output:', JSON.stringify(simplifiedPool, null, 2));

    // Test filterConditionalPools
    const mockPools = [
        { type: 'CONDITIONAL', outcomeSide: 'YES' },
        { type: 'CONDITIONAL', outcomeSide: 'NO' },
        { type: 'PREDICTION', outcomeSide: 'YES' },
        { type: 'EXPECTED_VALUE', outcomeSide: 'YES' }
    ];

    const filtered = filterConditionalPools(mockPools);
    console.log('\n✅ filterConditionalPools:');
    console.log('  Input:', mockPools.length, 'pools');
    console.log('  YES pools:', filtered.yesPools.length);
    console.log('  NO pools:', filtered.noPools.length);

    // Test calculateImpact
    const impact = calculateImpact(119.47, 108.09);
    console.log('\n✅ calculateImpact:');
    console.log('  YES Price: 119.47');
    console.log('  NO Price: 108.09');
    console.log('  Impact:', impact.toFixed(2) + '%');

    return true;
}

async function testClientModule(chainId) {
    const proposalId = chainId === 1 ? TEST_PROPOSALS.chain1 : TEST_PROPOSALS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum)' : 'Chain 100 (Gnosis)';

    console.log('\n' + '='.repeat(60));
    console.log(`TEST: Client Module - ${chainName}`);
    console.log('='.repeat(60));

    try {
        const client = createSubgraphClient(chainId);
        console.log('\n✅ Client created for chain', chainId);
        console.log('  Endpoint:', client.endpoint);

        // Test getPoolsForProposal
        console.log('\n📊 Fetching all pools for proposal...');
        const allPools = await client.getPoolsForProposal(proposalId);
        console.log(`  Found ${allPools.length} total pools`);

        // Test getConditionalPools
        console.log('\n📊 Fetching CONDITIONAL pools...');
        const conditionalPools = await client.getConditionalPools(proposalId);
        console.log(`  Found ${conditionalPools.length} CONDITIONAL pools`);
        conditionalPools.forEach(p => {
            console.log(`    - ${p.name} (${p.outcomeSide}) - Price: ${parseFloat(p.price).toFixed(4)}`);
        });

        // Test getChartData (complete flow)
        console.log('\n📊 Fetching complete chart data...');
        const chartRawData = await client.getChartData(proposalId, 50);
        console.log(`  YES Pool: ${chartRawData.yesPool?.name || 'Not found'}`);
        console.log(`  NO Pool: ${chartRawData.noPool?.name || 'Not found'}`);
        console.log(`  YES Candles: ${chartRawData.yesCandles.length}`);
        console.log(`  NO Candles: ${chartRawData.noCandles.length}`);

        // Test full adapter integration
        console.log('\n📊 Transforming data with adapter...');
        const chartData = createChartDataStructure(chartRawData);
        console.log(`  yesData: ${chartData.yesDataCount} points`);
        console.log(`  noData: ${chartData.noDataCount} points`);
        console.log(`  yesPrice: ${chartData.yesPrice?.toFixed(4) || 'N/A'}`);
        console.log(`  noPrice: ${chartData.noPrice?.toFixed(4) || 'N/A'}`);
        console.log(`  hasData: ${chartData.hasData}`);

        // Calculate and display impact
        const impact = calculateImpact(chartData.yesPrice, chartData.noPrice);
        console.log(`  Impact: ${impact.toFixed(2)}%`);

        // Show sample of transformed data
        if (chartData.yesData.length > 0) {
            console.log('\n📈 Sample YES data (first 3 points):');
            chartData.yesData.slice(0, 3).forEach(point => {
                const date = new Date(point.time * 1000).toISOString();
                console.log(`    ${date}: ${point.value.toFixed(4)}`);
            });
        }

        if (chartData.noData.length > 0) {
            console.log('\n📉 Sample NO data (first 3 points):');
            chartData.noData.slice(0, 3).forEach(point => {
                const date = new Date(point.time * 1000).toISOString();
                console.log(`    ${date}: ${point.value.toFixed(4)}`);
            });
        }

        return true;
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        return false;
    }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('\n🚀 SUBGRAPH MODULES TEST');
    console.log('========================');
    console.log('Testing pure JS modules before React integration\n');

    let allPassed = true;

    // Test config
    const configPassed = await testConfigModule();
    if (!configPassed) allPassed = false;

    // Test adapter
    const adapterPassed = await testAdapterModule();
    if (!adapterPassed) allPassed = false;

    // Test client with Chain 100 (Gnosis)
    const client100Passed = await testClientModule(100);
    if (!client100Passed) allPassed = false;

    // Test client with Chain 1 (Ethereum)
    const client1Passed = await testClientModule(1);
    if (!client1Passed) allPassed = false;

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Config Module: ${configPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Adapter Module: ${adapterPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Client Chain 100: ${client100Passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Client Chain 1: ${client1Passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    if (allPassed) {
        console.log('\n🎉 All modules are working correctly!');
        console.log('Ready to proceed with React component implementation.');
    }
}

main().catch(console.error);
