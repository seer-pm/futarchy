#!/usr/bin/env node
/**
 * test-candles-export.js
 * 
 * Test script to understand chart data flow for 0x45 proposal:
 * - Fetch YES/NO candles from subgraph
 * - Fetch SPOT candles from GeckoTerminal  
 * - Apply forward-fill and time alignment (like SubgraphChart)
 * - Export as JSON
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const PROPOSAL_ID = '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';
const CHAIN_ID = 100;
const CANDLE_LIMIT = 500;

// chart_start_range from metadata (market start time)
const CHART_START_RANGE = 1769385600;

// Spot config from PROPOSAL_DEFAULTS 
// GNO/WXDAI pool + sDAI rate provider
const SPOT_CONFIG = '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai';

// Subgraph endpoint
const SUBGRAPH_URL = CANDLES_ENDPOINTS[100];

// GeckoTerminal API
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';

// =========================================
// TOGGLES (same as SubgraphChart.jsx)
// =========================================
const ENABLE_GAP_FILL = true;
const ENABLE_TIME_ALIGNMENT = true;

// =========================================
// 1. Fetch YES/NO Candles from Subgraph
// =========================================
async function fetchSubgraphCandles(proposalId, limit = 500) {
    const query = `{
        pools(where: { proposal: "${proposalId.toLowerCase()}", type: "CONDITIONAL" }) {
            id
            name
            type
            outcomeSide
            price
            candles(first: ${limit}, orderBy: periodStartUnix, orderDirection: desc, where: { period: "3600" }) {
                periodStartUnix
                period
                open
                high
                low
                close
                volumeToken0
                volumeToken1
            }
        }
    }`;

    const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
    }

    const pools = result.data?.pools || [];
    const yesPool = pools.find(p => p.outcomeSide === 'YES');
    const noPool = pools.find(p => p.outcomeSide === 'NO');

    // Transform to { time, value } format
    const adaptCandles = (candles) => {
        if (!candles || candles.length === 0) return [];
        return candles
            .map(c => ({
                time: parseInt(c.periodStartUnix, 10),
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                value: parseFloat(c.close), // For line chart compatibility
                volumeToken0: parseFloat(c.volumeToken0),
                volumeToken1: parseFloat(c.volumeToken1)
            }))
            .filter(c => !isNaN(c.time) && !isNaN(c.value))
            .sort((a, b) => a.time - b.time); // Chronological order
    };

    return {
        yesData: yesPool ? adaptCandles(yesPool.candles) : [],
        noData: noPool ? adaptCandles(noPool.candles) : [],
        yesPool: yesPool ? { id: yesPool.id, name: yesPool.name, price: parseFloat(yesPool.price) } : null,
        noPool: noPool ? { id: noPool.id, name: noPool.name, price: parseFloat(noPool.price) } : null
    };
}

// =========================================
// 2. Fetch SPOT Candles from GeckoTerminal
// =========================================
async function fetchSpotCandles(configString) {
    // Parse config: "POOL_ADDRESS::RATE_PROVIDER-interval-limit-network"
    const parts = configString.split('-');
    const network = parts.pop();
    const limit = parseInt(parts.pop(), 10);
    const interval = parts.pop();
    const poolRatePart = parts.join('-');

    const [poolAddress, rateProvider] = poolRatePart.split('::');

    console.log(`[SPOT] Fetching from GeckoTerminal: pool=${poolAddress.slice(0, 10)}..., network=${network}`);

    const url = `${GECKO_BASE}/networks/${network}/pools/${poolAddress}/ohlcv/${interval}?limit=${limit}`;

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`GeckoTerminal error: ${response.status}`);
    }

    const data = await response.json();
    const ohlcvList = data.data?.attributes?.ohlcv_list || [];

    // Transform to { time, value } format
    // ohlcv_list format: [timestamp_sec, open, high, low, close, volume]
    // NOTE: GeckoTerminal returns timestamps in SECONDS (not ms)
    const candles = ohlcvList.map(row => ({
        time: row[0], // Already in seconds!
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        value: row[4], // close price
        volume: row[5]
    })).sort((a, b) => a.time - b.time);

    const latestPrice = candles.length > 0 ? candles[candles.length - 1].value : null;

    return {
        spotData: candles,
        spotPrice: latestPrice,
        pool: poolAddress,
        rateProvider
    };
}

// =========================================
// 3. Gap-Fill Logic (from SubgraphChart)
// =========================================
function gapFillCandles(candles) {
    if (!candles || candles.length < 2) return candles;

    const filled = [];
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const hourInSeconds = 3600;

    for (let i = 0; i < sorted.length; i++) {
        filled.push(sorted[i]);

        if (i < sorted.length - 1) {
            const currentTime = sorted[i].time;
            const nextTime = sorted[i + 1].time;
            const gap = nextTime - currentTime;

            if (gap > hourInSeconds) {
                const numMissing = Math.floor(gap / hourInSeconds) - 1;
                for (let j = 1; j <= numMissing; j++) {
                    filled.push({
                        time: currentTime + (j * hourInSeconds),
                        value: sorted[i].value,
                        _gapFilled: true
                    });
                }
            }
        }
    }
    return filled;
}

// =========================================
// 4. Extend Forward Logic (from SubgraphChart)
// =========================================
function extendForward(candles, maxTime) {
    if (!candles || candles.length === 0) return candles;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const last = sorted[sorted.length - 1];
    const hourInSeconds = 3600;

    if (last.time < maxTime) {
        const numToAdd = Math.floor((maxTime - last.time) / hourInSeconds);
        for (let i = 1; i <= numToAdd; i++) {
            sorted.push({
                time: last.time + (i * hourInSeconds),
                value: last.value,
                _extended: true
            });
        }
    }
    return sorted;
}

// =========================================
// 5. Time Alignment Logic (from SubgraphChart)
// =========================================
function alignToSpotRange(yesData, noData, spotData, startCandleUnix = null) {
    if (spotData.length === 0) {
        return { yesData, noData, spotData };
    }

    const yesMin = yesData.length > 0 ? Math.min(...yesData.map(d => d.time)) : Infinity;
    const noMin = noData.length > 0 ? Math.min(...noData.map(d => d.time)) : Infinity;
    const spotMin = Math.min(...spotData.map(d => d.time));
    const spotMax = Math.max(...spotData.map(d => d.time));

    // Start from where ALL THREE have data
    let rangeStart = Math.max(yesMin, noMin, spotMin);
    if (startCandleUnix && typeof startCandleUnix === 'number') {
        rangeStart = Math.max(rangeStart, startCandleUnix);
    }

    // Crop all three to rangeStart
    let filteredYes = yesData.filter(d => d.time >= rangeStart);
    let filteredNo = noData.filter(d => d.time >= rangeStart);
    let filteredSpot = spotData.filter(d => d.time >= rangeStart);

    // Forward-fill YES to SPOT's max time
    if (filteredYes.length > 0) {
        const yesMax = Math.max(...filteredYes.map(d => d.time));
        const lastYes = filteredYes.find(d => d.time === yesMax);
        if (lastYes && spotMax > yesMax) {
            const fillTimestamps = filteredSpot
                .filter(d => d.time > yesMax && d.time <= spotMax)
                .map(d => d.time);
            const forwardFill = fillTimestamps.map(time => ({
                time,
                value: lastYes.value,
                _alignedFill: true
            }));
            filteredYes = [...filteredYes, ...forwardFill];
        }
    }

    // Forward-fill NO to SPOT's max time
    if (filteredNo.length > 0) {
        const noMax = Math.max(...filteredNo.map(d => d.time));
        const lastNo = filteredNo.find(d => d.time === noMax);
        if (lastNo && spotMax > noMax) {
            const fillTimestamps = filteredSpot
                .filter(d => d.time > noMax && d.time <= spotMax)
                .map(d => d.time);
            const forwardFill = fillTimestamps.map(time => ({
                time,
                value: lastNo.value,
                _alignedFill: true
            }));
            filteredNo = [...filteredNo, ...forwardFill];
        }
    }

    return { yesData: filteredYes, noData: filteredNo, spotData: filteredSpot };
}


// Old main() removed - see below for updated main() with trades support


// =========================================
// 6. Fetch Trades/Swaps from Subgraph
// =========================================
async function fetchSubgraphTrades(poolAddresses, limit = 30) {
    if (!poolAddresses || poolAddresses.length === 0) {
        return { trades: [], error: 'No pool addresses provided' };
    }

    const poolIds = poolAddresses.map(p => p.toLowerCase());

    const query = `{
        swaps(
            where: { pool_in: ${JSON.stringify(poolIds)} }
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
            tokenIn {
                id
                symbol
                decimals
                role
            }
            tokenOut {
                id
                symbol
                decimals
                role
            }
            pool {
                id
                name
                type
                outcomeSide
            }
        }
    }`;

    const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
        return { trades: [], error: result.errors[0]?.message };
    }

    const swaps = result.data?.swaps || [];

    // Convert to trade format
    const trades = swaps.map(swap => {
        const timestamp = parseInt(swap.timestamp) * 1000;

        // Determine buy/sell (same logic as subgraphTradesClient)
        const tOutRole = swap.tokenOut?.role || '';
        const isCompanyRole = (r) => r === 'YES_COMPANY' || r === 'NO_COMPANY' || r === 'COMPANY';
        const isBuy = isCompanyRole(tOutRole);

        return {
            id: swap.id,
            txHash: swap.transactionHash,
            timestamp: timestamp,
            timestampUnix: parseInt(swap.timestamp),
            origin: swap.origin,
            amountIn: parseFloat(swap.amountIn),
            amountOut: parseFloat(swap.amountOut),
            price: parseFloat(swap.price),
            tokenInSymbol: swap.tokenIn?.symbol,
            tokenOutSymbol: swap.tokenOut?.symbol,
            tokenInRole: swap.tokenIn?.role,
            tokenOutRole: swap.tokenOut?.role,
            poolId: swap.pool?.id,
            poolName: swap.pool?.name,
            poolType: swap.pool?.type,
            outcomeSide: swap.pool?.outcomeSide,
            operationSide: isBuy ? 'buy' : 'sell'
        };
    });

    return { trades, error: null };
}

async function main() {
    console.log('='.repeat(60));
    console.log('CANDLE & TRADE EXPORT TEST');
    console.log('='.repeat(60));
    console.log(`Proposal: ${PROPOSAL_ID}`);
    console.log(`Chart Start Range: ${CHART_START_RANGE} (${new Date(CHART_START_RANGE * 1000).toISOString()})`);
    console.log(`Toggles: ENABLE_GAP_FILL=${ENABLE_GAP_FILL}, ENABLE_TIME_ALIGNMENT=${ENABLE_TIME_ALIGNMENT}`);
    console.log('='.repeat(60));

    // Step 1: Fetch YES/NO from subgraph
    console.log('\n[STEP 1] Fetching YES/NO candles from subgraph...');
    const { yesData: rawYes, noData: rawNo, yesPool, noPool } = await fetchSubgraphCandles(PROPOSAL_ID, CANDLE_LIMIT);
    console.log(`  YES pool: ${yesPool?.name || 'not found'} (${rawYes.length} candles)`);
    console.log(`  NO pool: ${noPool?.name || 'not found'} (${rawNo.length} candles)`);

    // Step 2: Fetch SPOT from GeckoTerminal
    console.log('\n[STEP 2] Fetching SPOT candles from GeckoTerminal...');
    let spotResult;
    try {
        spotResult = await fetchSpotCandles(SPOT_CONFIG);
        console.log(`  SPOT: ${spotResult.spotData.length} candles, latest price: ${spotResult.spotPrice}`);
    } catch (e) {
        console.log(`  SPOT fetch failed: ${e.message}`);
        spotResult = { spotData: [], spotPrice: null };
    }

    // Step 3: Apply startCandleUnix filter
    console.log('\n[STEP 3] Applying startCandleUnix filter...');
    let filteredYes = rawYes.filter(d => d.time >= CHART_START_RANGE);
    let filteredNo = rawNo.filter(d => d.time >= CHART_START_RANGE);
    let filteredSpot = spotResult.spotData.filter(d => d.time >= CHART_START_RANGE);
    console.log(`  After filter: YES=${filteredYes.length}, NO=${filteredNo.length}, SPOT=${filteredSpot.length}`);

    // Step 4: Gap-fill
    if (ENABLE_GAP_FILL) {
        console.log('\n[STEP 4] Applying gap-fill...');
        const yesCountBefore = filteredYes.length;
        const noCountBefore = filteredNo.length;
        filteredYes = gapFillCandles(filteredYes);
        filteredNo = gapFillCandles(filteredNo);
        const yesGapFilled = filteredYes.filter(d => d._gapFilled).length;
        const noGapFilled = filteredNo.filter(d => d._gapFilled).length;
        console.log(`  YES: ${yesCountBefore} → ${filteredYes.length} (+${yesGapFilled} gap-filled)`);
        console.log(`  NO: ${noCountBefore} → ${filteredNo.length} (+${noGapFilled} gap-filled)`);

        // Extend forward to max time
        const allTimes = [...filteredYes, ...filteredNo, ...filteredSpot].map(d => d.time);
        if (allTimes.length > 0) {
            const maxTime = Math.max(...allTimes);
            filteredYes = extendForward(filteredYes, maxTime);
            filteredNo = extendForward(filteredNo, maxTime);
            console.log(`  Extended to maxTime (${new Date(maxTime * 1000).toISOString()})`);
        }
    }

    // Step 5: Time alignment
    if (ENABLE_TIME_ALIGNMENT && filteredSpot.length > 0) {
        console.log('\n[STEP 5] Applying time alignment to SPOT range...');
        const aligned = alignToSpotRange(filteredYes, filteredNo, filteredSpot, CHART_START_RANGE);
        filteredYes = aligned.yesData;
        filteredNo = aligned.noData;
        filteredSpot = aligned.spotData;
        console.log(`  Aligned: YES=${filteredYes.length}, NO=${filteredNo.length}, SPOT=${filteredSpot.length}`);
    }

    // Step 6: Fetch Trades/Swaps
    console.log('\n[STEP 6] Fetching trades/swaps from subgraph...');
    const poolAddresses = [yesPool?.id, noPool?.id].filter(Boolean);
    const { trades, error: tradesError } = await fetchSubgraphTrades(poolAddresses, 50);

    if (tradesError) {
        console.log(`  ERROR: ${tradesError}`);
    } else {
        console.log(`  ✅ Fetched ${trades.length} trades`);

        // Group by pool
        const yesTrades = trades.filter(t => t.outcomeSide === 'YES');
        const noTrades = trades.filter(t => t.outcomeSide === 'NO');
        console.log(`  YES trades: ${yesTrades.length}, NO trades: ${noTrades.length}`);

        // Show sample
        if (trades.length > 0) {
            console.log('\n[SAMPLE] Latest 3 trades:');
            trades.slice(0, 3).forEach(t => {
                console.log(`  ${new Date(t.timestamp).toISOString()} | ${t.outcomeSide} ${t.operationSide.toUpperCase()} | ${t.tokenInSymbol} → ${t.tokenOutSymbol} | price=${t.price.toFixed(4)}`);
            });
        }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULT');
    console.log('='.repeat(60));
    console.log(`YES candles: ${filteredYes.length}`);
    console.log(`NO candles: ${filteredNo.length}`);
    console.log(`SPOT candles: ${filteredSpot.length}`);
    console.log(`TRADES: ${trades.length}`);

    if (filteredYes.length > 0) {
        const yesMin = Math.min(...filteredYes.map(d => d.time));
        const yesMax = Math.max(...filteredYes.map(d => d.time));
        console.log(`  YES range: ${new Date(yesMin * 1000).toISOString()} to ${new Date(yesMax * 1000).toISOString()}`);
    }
    if (filteredNo.length > 0) {
        const noMin = Math.min(...filteredNo.map(d => d.time));
        const noMax = Math.max(...filteredNo.map(d => d.time));
        console.log(`  NO range: ${new Date(noMin * 1000).toISOString()} to ${new Date(noMax * 1000).toISOString()}`);
    }
    if (filteredSpot.length > 0) {
        const spotMin = Math.min(...filteredSpot.map(d => d.time));
        const spotMax = Math.max(...filteredSpot.map(d => d.time));
        console.log(`  SPOT range: ${new Date(spotMin * 1000).toISOString()} to ${new Date(spotMax * 1000).toISOString()}`);
    }

    // Sample output
    console.log('\n[SAMPLE] First 3 YES candles:');
    filteredYes.slice(0, 3).forEach(c => {
        console.log(`  ${new Date(c.time * 1000).toISOString()} | value=${c.value}${c._gapFilled ? ' (gap-filled)' : ''}${c._extended ? ' (extended)' : ''}${c._alignedFill ? ' (aligned)' : ''}`);
    });

    console.log('\n[SAMPLE] Last 3 YES candles:');
    filteredYes.slice(-3).forEach(c => {
        console.log(`  ${new Date(c.time * 1000).toISOString()} | value=${c.value}${c._gapFilled ? ' (gap-filled)' : ''}${c._extended ? ' (extended)' : ''}${c._alignedFill ? ' (aligned)' : ''}`);
    });

    // Export JSON
    const exportData = {
        proposal: PROPOSAL_ID,
        chartStartRange: CHART_START_RANGE,
        exportedAt: new Date().toISOString(),
        toggles: { ENABLE_GAP_FILL, ENABLE_TIME_ALIGNMENT },
        pools: { yes: yesPool, no: noPool },
        spotConfig: SPOT_CONFIG,
        spotPrice: spotResult.spotPrice,
        candles: {
            yes: filteredYes,
            no: filteredNo,
            spot: filteredSpot
        },
        trades: trades
    };

    const fs = await import('fs');
    const exportPath = './export_candles_test.json';
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    console.log(`\n✅ Exported to ${exportPath}`);
}

main().catch(console.error);
