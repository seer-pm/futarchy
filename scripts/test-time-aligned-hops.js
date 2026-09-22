/**
 * Test: Time-aligned Balancer hop queries
 * 
 * 1. Get YES/NO candle time range from futarchy subgraph
 * 2. Use that time range to fetch Balancer swaps
 * 
 * Run: node scripts/test-time-aligned-hops.js
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const fetch = require('node-fetch');

// ==============================================================
// CONFIG
// ==============================================================

const GRAPH_API_KEY = '1f3de4a47d9dfb2a32e1890f63858fff';

// Futarchy subgraph for YES/NO candles (Algebra/CloudFront)
const FUTARCHY_SUBGRAPH = CANDLES_ENDPOINTS[100];

// Balancer V2 subgraph for multihop spot
const BALANCER_SUBGRAPH = `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg`;

const PROPOSAL_ID = '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';

// Balancer hop pools
const HOPS = [
    { name: 'GNO/WXDAI', poolId: '0x8189c4c96826d016a99986394103dfa9ae41e7ee0002000000000000000000aa', tokenIn: '0x9c58bacc331c9aa871afd802db6379a98e80cedb', tokenOut: '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d' },
    { name: 'WXDAI/USDC', poolId: '0x2086f52651837600180de173b09470f54ef7491000000000000000000000004f', tokenIn: '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', tokenOut: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83' },
    { name: 'USDC/sDAI', poolId: '0x7644fa5d0ea14fcf3e813fdf93ca9544f8567655000000000000000000000066', tokenIn: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83', tokenOut: '0xaf204776c7245bf4147c2612bf6e5972ee483701' }
];

// ==============================================================
// HELPERS
// ==============================================================

async function querySubgraph(url, query, variables = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });
    const result = await response.json();
    if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        throw new Error(result.errors[0].message);
    }
    return result.data;
}

// ==============================================================
// STEP 1: Get YES/NO candle time range
// ==============================================================

async function getYesNoCandleRange() {
    console.log('\n📊 STEP 1: Get YES/NO Candle Time Range');
    console.log('='.repeat(60));

    const query = `
        query GetPoolsWithCandles($proposalId: String!, $limit: Int!, $period: BigInt!) {
            pools(where: { proposal: $proposalId, type: "CONDITIONAL" }) {
                id
                outcomeSide
                price
                candles(first: $limit, orderBy: periodStartUnix, orderDirection: desc, where: { period: $period }) {
                    periodStartUnix
                    close
                }
            }
        }
    `;

    try {
        const data = await querySubgraph(FUTARCHY_SUBGRAPH, query, {
            proposalId: PROPOSAL_ID.toLowerCase(),
            limit: 500,
            period: "3600"
        });

        const pools = data.pools || [];

        let minTime = Infinity;
        let maxTime = 0;
        let yesCandles = [];
        let noCandles = [];

        for (const pool of pools) {
            const candles = pool.candles || [];
            console.log(`  ${pool.outcomeSide}: ${candles.length} candles, price ${parseFloat(pool.price).toFixed(4)}`);

            for (const c of candles) {
                const t = parseInt(c.periodStartUnix);
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;
            }

            if (pool.outcomeSide === 'YES') yesCandles = candles;
            if (pool.outcomeSide === 'NO') noCandles = candles;
        }

        if (minTime === Infinity) {
            console.log('  ❌ No candles found!');
            return null;
        }

        console.log(`\n  Time range:`);
        console.log(`    Min: ${new Date(minTime * 1000).toISOString()}`);
        console.log(`    Max: ${new Date(maxTime * 1000).toISOString()}`);
        console.log(`    Span: ${Math.round((maxTime - minTime) / 3600)} hours`);

        return { minTime, maxTime, yesCandles, noCandles };

    } catch (e) {
        console.error('  Error:', e.message);
        return null;
    }
}

// ==============================================================
// STEP 2: Fetch Balancer swaps using time range
// ==============================================================

async function getBalancerSwapsInRange(fromTimestamp) {
    console.log('\n📈 STEP 2: Fetch Balancer Swaps (from timestamp)');
    console.log('='.repeat(60));
    console.log(`  From: ${new Date(fromTimestamp * 1000).toISOString()}`);

    const allHopSwaps = [];

    for (const hop of HOPS) {
        const query = `
            query getSwaps($poolId: String!, $from: Int!) {
                swaps(
                    where: { poolId: $poolId, timestamp_gte: $from }
                    orderBy: timestamp
                    orderDirection: asc
                    first: 1000
                ) {
                    timestamp
                    tokenIn
                    tokenOut
                    tokenAmountIn
                    tokenAmountOut
                }
            }
        `;

        try {
            const data = await querySubgraph(BALANCER_SUBGRAPH, query, {
                poolId: hop.poolId,
                from: fromTimestamp
            });

            const swaps = data.swaps || [];
            allHopSwaps.push({ hop, swaps });

            if (swaps.length > 0) {
                const oldest = new Date(parseInt(swaps[0].timestamp) * 1000);
                const newest = new Date(parseInt(swaps[swaps.length - 1].timestamp) * 1000);
                console.log(`\n  ${hop.name}:`);
                console.log(`    Swaps: ${swaps.length}`);
                console.log(`    From: ${oldest.toISOString()}`);
                console.log(`    To:   ${newest.toISOString()}`);
            } else {
                console.log(`\n  ${hop.name}: 0 swaps in range`);
            }

        } catch (e) {
            console.error(`  ${hop.name}: Error - ${e.message}`);
            allHopSwaps.push({ hop, swaps: [] });
        }
    }

    return allHopSwaps;
}

// ==============================================================
// STEP 3: Build hourly candles from swaps
// ==============================================================

function buildHourlyCandles(swaps, tokenIn, tokenOut) {
    const hourlyPrices = {};

    for (const swap of swaps) {
        const hourTs = Math.floor(swap.timestamp / 3600) * 3600;
        const amtIn = parseFloat(swap.tokenAmountIn);
        const amtOut = parseFloat(swap.tokenAmountOut);

        if (amtIn === 0 || amtOut === 0) continue;

        let price;
        if (swap.tokenIn.toLowerCase() === tokenIn.toLowerCase()) {
            price = amtOut / amtIn;
        } else if (swap.tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
            price = amtIn / amtOut;
        } else {
            continue;
        }

        if (!hourlyPrices[hourTs]) {
            hourlyPrices[hourTs] = { prices: [], first: null, last: null };
        }
        hourlyPrices[hourTs].prices.push(price);
        if (!hourlyPrices[hourTs].first) hourlyPrices[hourTs].first = price;
        hourlyPrices[hourTs].last = price;
    }

    const ohlc = {};
    for (const [ts, data] of Object.entries(hourlyPrices)) {
        if (data.prices.length === 0) continue;
        ohlc[ts] = { close: data.last };
    }
    return ohlc;
}

function combineHopCandles(hopCandles) {
    const allTimestamps = new Set();
    for (const hop of hopCandles) {
        Object.keys(hop).forEach(ts => allTimestamps.add(ts));
    }

    const combined = [];
    const prevPrices = hopCandles.map(() => 1);

    for (const ts of [...allTimestamps].sort()) {
        const currentPrices = hopCandles.map((hop, i) => {
            if (hop[ts]) {
                prevPrices[i] = hop[ts].close;
                return hop[ts].close;
            }
            return prevPrices[i];
        });

        const composite = currentPrices.reduce((a, b) => a * b, 1);
        combined.push({ time: parseInt(ts), value: composite });
    }

    return combined.sort((a, b) => a.time - b.time);
}

// ==============================================================
// MAIN
// ==============================================================

async function main() {
    console.log('🔍 TEST: Time-Aligned Multihop Queries');
    console.log(`Proposal: ${PROPOSAL_ID}`);
    console.log(`Time: ${new Date().toISOString()}`);

    // Step 1: Get YES/NO time range
    const candleRange = await getYesNoCandleRange();
    if (!candleRange) {
        console.log('\n❌ Cannot proceed without YES/NO candle data');
        return;
    }

    // Step 2: Fetch Balancer swaps using YES/NO min time
    const hopSwaps = await getBalancerSwapsInRange(candleRange.minTime);

    // Step 3: Build composite candles
    console.log('\n🔗 STEP 3: Build Composite Candles');
    console.log('='.repeat(60));

    const hopCandles = hopSwaps.map(({ hop, swaps }) =>
        buildHourlyCandles(swaps, hop.tokenIn, hop.tokenOut)
    );

    for (let i = 0; i < HOPS.length; i++) {
        console.log(`  ${HOPS[i].name}: ${Object.keys(hopCandles[i]).length} hourly candles`);
    }

    const spotCandles = combineHopCandles(hopCandles);
    console.log(`\n  Composite SPOT candles: ${spotCandles.length}`);

    if (spotCandles.length > 0) {
        console.log(`\n  Last 5 SPOT candles:`);
        for (const c of spotCandles.slice(-5)) {
            const time = new Date(c.time * 1000);
            console.log(`    ${time.toISOString().slice(0, 16)} | ${c.value.toFixed(4)} sDAI`);
        }
    }

    // Compare with YES/NO
    console.log('\n📊 Comparison:');
    console.log('='.repeat(60));
    console.log(`  YES candles: ${candleRange.yesCandles.length}`);
    console.log(`  NO candles:  ${candleRange.noCandles.length}`);
    console.log(`  SPOT candles: ${spotCandles.length}`);

    console.log('\n✅ Done!');
}

main().catch(console.error);
