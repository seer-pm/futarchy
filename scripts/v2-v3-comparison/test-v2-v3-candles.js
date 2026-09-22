/**
 * V2 vs V3 Historical Candle Comparison - NORMALIZED TO GNO/WXDAI
 * 
 * Compares hourly candles with both routes normalized to GNO/WXDAI:
 * - V2: GNO/WXDAI (raw from GeckoTerminal)
 * - V3: waGNO/sDAI × waGNO_rate × sDAI_rate = GNO/WXDAI
 * 
 * This way we compare apples to apples!
 * 
 * Run: node scripts/test-v2-v3-candles.js
 */

const fs = require('fs');
const path = require('path');

// ============ Config ============
const GNOSIS_RPC = 'https://rpc.gnosischain.com';

// V2 Route
const V2_POOL = '0x8189c4c96826d016a99986394103dfa9ae41e7ee'; // GNO/WXDAI

// V3 Route - Subgraph
const V3_POOL = '0xd1d7fa8871d84d0e77020fc28b7cd5718c446522'; // waGNO/sDAI
// NOTE: this Balancer v3 subgraph deployment no longer exists (the Studio
// endpoint answers "deployment does not exist"). It is Balancer's, not
// ours, so it cannot be repointed at the futarchy API — a replacement
// Balancer endpoint is needed before this script can run.
const V3_SUBGRAPH = 'https://api.studio.thegraph.com/query/75376/balancer-v3-gnosis/version/latest';

// Rate Providers
const SDAI_RATE_PROVIDER = '0x89c80a4540a00b5270347e02e2e144c71da2eced';
const WAGNO_RATE_PROVIDER = '0xbbb4966335677ea24f7b86dc19a423412390e1fb';

// GeckoTerminal
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';

// How many hours to compare
const HOURS_TO_FETCH = 168; // 7 days

// ============ Helper Functions ============

async function getRateFromProvider(providerAddress, label) {
    const callData = '0x679aefce'; // keccak256("getRate()")[:4]

    const response = await fetch(GNOSIS_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: providerAddress, data: callData }, 'latest']
        })
    });

    const result = await response.json();
    if (result.error) return null;

    const rateBigInt = BigInt(result.result);
    return Number(rateBigInt) / 1e18;
}

async function getGeckoCandles(poolAddress, hours) {
    console.log(`  Fetching ${hours} hourly candles from GeckoTerminal...`);

    const url = `${GECKO_BASE}/networks/xdai/pools/${poolAddress}/ohlcv/hour?limit=${hours}&currency=token`;

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();

    if (!data.data?.attributes?.ohlcv_list) {
        console.log('  X No candle data from GeckoTerminal');
        return [];
    }

    const candles = data.data.attributes.ohlcv_list.map(([timestamp, open, high, low, close, volume]) => ({
        time: timestamp,
        open, high, low, close, volume
    }));

    console.log(`  OK Got ${candles.length} candles from GeckoTerminal`);
    return candles.sort((a, b) => a.time - b.time);
}

async function getV3SwapsFromSubgraph(poolAddress, hours) {
    console.log(`  Fetching V3 swaps from Balancer subgraph...`);

    const since = Math.floor(Date.now() / 1000) - (hours * 3600);

    const query = `
        query GetPoolSwaps($pool: Bytes!, $since: BigInt!) {
            swaps(
                where: { pool: $pool, blockTimestamp_gte: $since }
                orderBy: blockTimestamp
                orderDirection: asc
                first: 1000
            ) {
                id
                blockTimestamp
                tokenInSymbol
                tokenOutSymbol
                tokenAmountIn
                tokenAmountOut
            }
        }
    `;

    const response = await fetch(V3_SUBGRAPH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            variables: { pool: poolAddress.toLowerCase(), since: since.toString() }
        })
    });

    const result = await response.json();

    if (result.errors) {
        console.log('  Warning:', result.errors[0]?.message);
        return [];
    }

    const swaps = result.data?.swaps || [];
    console.log(`  OK Got ${swaps.length} swaps from V3 subgraph`);

    return swaps;
}

function buildHourlyCandlesFromSwaps(swaps) {
    const hourlyBuckets = {};

    for (const swap of swaps) {
        const timestamp = parseInt(swap.blockTimestamp);
        const hourBucket = Math.floor(timestamp / 3600) * 3600;

        if (!hourlyBuckets[hourBucket]) {
            hourlyBuckets[hourBucket] = [];
        }

        const tokenInSymbol = (swap.tokenInSymbol || '').toLowerCase();
        const tokenOutSymbol = (swap.tokenOutSymbol || '').toLowerCase();

        let price = null;

        // waGNO -> sDAI: price = amountOut / amountIn (sDAI per waGNO)
        if ((tokenInSymbol.includes('gno') || tokenInSymbol.includes('agno')) &&
            (tokenOutSymbol.includes('sdai') || tokenOutSymbol.includes('dai'))) {
            price = parseFloat(swap.tokenAmountOut) / parseFloat(swap.tokenAmountIn);
        }
        // sDAI -> waGNO: price = amountIn / amountOut (sDAI per waGNO)
        else if ((tokenOutSymbol.includes('gno') || tokenOutSymbol.includes('agno')) &&
            (tokenInSymbol.includes('sdai') || tokenInSymbol.includes('dai'))) {
            price = parseFloat(swap.tokenAmountIn) / parseFloat(swap.tokenAmountOut);
        }

        if (price && price > 0 && price < 1000) {
            hourlyBuckets[hourBucket].push({ timestamp, price });
        }
    }

    const candles = [];

    for (const [hourStr, trades] of Object.entries(hourlyBuckets)) {
        if (trades.length === 0) continue;

        const hour = parseInt(hourStr);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        candles.push({
            time: hour,
            open: trades[0].price,
            close: trades[trades.length - 1].price,
            high: Math.max(...trades.map(t => t.price)),
            low: Math.min(...trades.map(t => t.price)),
            trades: trades.length
        });
    }

    return candles.sort((a, b) => a.time - b.time);
}

function alignAndCompareCandles(v2Candles, v3Candles) {
    const v2Map = new Map(v2Candles.map(c => [c.time, c]));
    const v3Map = new Map(v3Candles.map(c => [c.time, c]));

    const allTimestamps = new Set([
        ...v2Candles.map(c => c.time),
        ...v3Candles.map(c => c.time)
    ]);

    const sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);

    const comparison = [];
    let lastV2 = null;
    let lastV3 = null;

    for (const time of sortedTimes) {
        const v2 = v2Map.get(time);
        const v3 = v3Map.get(time);

        const v2Close = v2 ? v2.close : lastV2;
        const v3Close = v3 ? v3.close : lastV3;

        if (v2) lastV2 = v2.close;
        if (v3) lastV3 = v3.close;

        if (v2Close && v3Close) {
            const diff = v3Close - v2Close;
            const diffPct = (diff / v2Close) * 100;

            comparison.push({
                time,
                timeISO: new Date(time * 1000).toISOString(),
                v2_close: v2Close,
                v3_close: v3Close,
                diff,
                diffPct,
                v2_has_data: !!v2,
                v3_has_data: !!v3
            });
        }
    }

    return comparison;
}

// ============ Main ============

async function runCandleComparison() {
    console.log('='.repeat(60));
    console.log('  V2 vs V3 Candle Comparison (NORMALIZED TO GNO/WXDAI)');
    console.log('='.repeat(60));
    console.log();

    // Step 1: Get both rates
    console.log('[1] Getting rate providers...');
    const [sDAIrate, waGNOrate] = await Promise.all([
        getRateFromProvider(SDAI_RATE_PROVIDER, 'sDAI'),
        getRateFromProvider(WAGNO_RATE_PROVIDER, 'waGNO')
    ]);

    console.log(`  sDAI rate:  ${sDAIrate?.toFixed(6)} (1 sDAI = ${sDAIrate?.toFixed(6)} WXDAI)`);
    console.log(`  waGNO rate: ${waGNOrate?.toFixed(6)} (1 waGNO = ${waGNOrate?.toFixed(6)} GNO)`);

    // Combined conversion factor to go from waGNO/sDAI -> GNO/WXDAI
    const conversionFactor = waGNOrate * sDAIrate;
    console.log(`  Combined:   ${conversionFactor.toFixed(6)} (waGNO/sDAI -> GNO/WXDAI)\n`);

    // Step 2: Get V2 candles (GeckoTerminal) - RAW GNO/WXDAI
    console.log('[2] V2 Route: GNO/WXDAI (raw, no rate conversion)');
    const v2Candles = await getGeckoCandles(V2_POOL, HOURS_TO_FETCH);
    console.log();

    // Step 3: Get V3 swaps and build candles
    console.log('[3] V3 Route: waGNO/sDAI from Balancer V3 subgraph');
    const v3Swaps = await getV3SwapsFromSubgraph(V3_POOL, HOURS_TO_FETCH);
    const v3RawCandles = buildHourlyCandlesFromSwaps(v3Swaps);
    console.log(`  Built ${v3RawCandles.length} hourly candles from swaps`);

    // Apply both rates to normalize to GNO/WXDAI:
    // waGNO/sDAI × waGNO_rate × sDAI_rate = GNO/WXDAI
    const v3Candles = v3RawCandles.map(c => ({
        ...c,
        open: c.open * conversionFactor,
        high: c.high * conversionFactor,
        low: c.low * conversionFactor,
        close: c.close * conversionFactor
    }));
    console.log(`  Applied rates (× ${conversionFactor.toFixed(4)}) to normalize to GNO/WXDAI\n`);

    // Step 4: Compare
    console.log('-'.repeat(60));
    console.log('[4] Comparing candles (both in GNO/WXDAI)...\n');

    const comparison = alignAndCompareCandles(v2Candles, v3Candles);

    if (comparison.length === 0) {
        console.log('X No overlapping candles to compare');
        console.log(`   V2 has ${v2Candles.length} candles`);
        console.log(`   V3 has ${v3Candles.length} candles`);

        if (v3RawCandles.length > 0) {
            console.log('\n  V3 sample candles (raw waGNO/sDAI):');
            v3RawCandles.slice(-5).forEach(c => {
                console.log(`    ${new Date(c.time * 1000).toISOString()}: ${c.close.toFixed(4)} sDAI/waGNO`);
            });
            console.log('\n  V3 sample candles (normalized GNO/WXDAI):');
            v3Candles.slice(-5).forEach(c => {
                console.log(`    ${new Date(c.time * 1000).toISOString()}: ${c.close.toFixed(4)} WXDAI/GNO`);
            });
        }
        return;
    }

    // Stats
    const diffs = comparison.map(c => c.diffPct);
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const minDiff = Math.min(...diffs);
    const maxDiff = Math.max(...diffs);

    console.log('DIFF STATISTICS (V3 normalized - V2 raw), both in GNO/WXDAI:');
    console.log(`  Average: ${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(4)}%`);
    console.log(`  Min:     ${minDiff >= 0 ? '+' : ''}${minDiff.toFixed(4)}%`);
    console.log(`  Max:     ${maxDiff >= 0 ? '+' : ''}${maxDiff.toFixed(4)}%`);
    console.log(`  Points:  ${comparison.length} hours\n`);

    // Show last 15 candles
    console.log('-'.repeat(60));
    console.log('LAST 15 HOURLY CANDLES (both in GNO/WXDAI):\n');
    console.log('Time (UTC)           | V2 (WXDAI/GNO) | V3 (WXDAI/GNO) | Diff %');
    console.log('-'.repeat(60));

    comparison.slice(-15).forEach(c => {
        const timeStr = c.timeISO.slice(5, 16).replace('T', ' ');
        const v2Str = c.v2_close.toFixed(4).padStart(13);
        const v3Str = c.v3_close.toFixed(4).padStart(13);
        const diffStr = `${c.diffPct >= 0 ? '+' : ''}${c.diffPct.toFixed(2)}%`.padStart(8);
        console.log(`${timeStr}  |${v2Str}  |${v3Str}  |${diffStr}`);
    });

    // Save to JSON
    const output = {
        generated: new Date().toISOString(),
        comparison_type: 'Both normalized to GNO/WXDAI',
        config: {
            v2_pool: V2_POOL,
            v3_pool: V3_POOL,
            sdai_rate: sDAIrate,
            wagno_rate: waGNOrate,
            conversion_factor: conversionFactor,
            hours_fetched: HOURS_TO_FETCH
        },
        stats: {
            avg_diff_pct: avgDiff,
            min_diff_pct: minDiff,
            max_diff_pct: maxDiff,
            total_points: comparison.length
        },
        v2_candles: v2Candles,
        v3_candles: v3Candles,
        v3_raw_candles: v3RawCandles,
        comparison
    };

    const outputPath = path.join(__dirname, 'test-v2-v3-candles-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved full data to: ${outputPath}`);

    console.log('\nDone!');
}

runCandleComparison().catch(err => {
    console.error('\nTest failed:', err);
    process.exit(1);
});
