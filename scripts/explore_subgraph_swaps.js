/**
 * Subgraph Schema Explorer - Focus on SWAPS
 * 
 * Pure JavaScript - run with: node scripts/explore_subgraph_swaps.js
 * 
 * DISCOVERED SCHEMA:
 * 
 * Entity Types: Candle, Pool, Proposal, Swap, WhitelistedToken
 * 
 * Swap Entity Fields:
 * - id: ID!
 * - transactionHash: Bytes!
 * - timestamp: BigInt!
 * - pool: Pool!
 * - sender: Bytes!
 * - recipient: Bytes!
 * - origin: Bytes!
 * - amount0: BigDecimal!
 * - amount1: BigDecimal!
 * - amountIn: BigDecimal!
 * - amountOut: BigDecimal!
 * - tokenIn: WhitelistedToken!
 * - tokenOut: WhitelistedToken!
 * - price: BigDecimal!
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINTS = {
    chain1: CANDLES_ENDPOINTS[1],
    chain100: CANDLES_ENDPOINTS[100]
};

// Test proposals (lowercase)
const TEST_PROPOSALS = {
    chain1: '0x4e018f1d8b93b91a0ce186874edb53cb6fffca62',
    chain100: '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc'
};

async function querySubgraph(endpoint, query) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
}

// ========================================
// COMPLETE SWAP SCHEMA DISPLAY
// ========================================

function printSwapSchema() {
    console.log('\n' + '═'.repeat(70));
    console.log('📋 SWAP ENTITY SCHEMA (Both Chains)');
    console.log('═'.repeat(70));
    console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│ SWAP                                                                │
├─────────────────┬───────────────────┬───────────────────────────────┤
│ Field           │ Type              │ Description                   │
├─────────────────┼───────────────────┼───────────────────────────────┤
│ id              │ ID!               │ Unique swap identifier        │
│ transactionHash │ Bytes!            │ Transaction hash on chain     │
│ timestamp       │ BigInt!           │ Unix timestamp (seconds)      │
│ pool            │ Pool!             │ Related pool entity           │
│ sender          │ Bytes!            │ Address that sent the tx      │
│ recipient       │ Bytes!            │ Address that received tokens  │
│ origin          │ Bytes!            │ Original transaction sender   │
│ amount0         │ BigDecimal!       │ Delta of token0 (+ or -)      │
│ amount1         │ BigDecimal!       │ Delta of token1 (+ or -)      │
│ amountIn        │ BigDecimal!       │ Absolute amount traded in     │
│ amountOut       │ BigDecimal!       │ Absolute amount received out  │
│ tokenIn         │ WhitelistedToken! │ Token being sold              │
│ tokenOut        │ WhitelistedToken! │ Token being bought            │
│ price           │ BigDecimal!       │ Execution price of the swap   │
└─────────────────┴───────────────────┴───────────────────────────────┘

Related Entities:

┌─────────────────────────────────────────────────────────────────────┐
│ POOL                                                                │
├─────────────────┬───────────────────┬───────────────────────────────┤
│ id              │ ID!               │ Pool contract address         │
│ token0          │ WhitelistedToken! │ First token in pair           │
│ token1          │ WhitelistedToken! │ Second token in pair          │
│ fee             │ BigInt!           │ Pool fee tier                 │
│ liquidity       │ BigInt!           │ Current liquidity             │
│ sqrtPrice       │ BigInt!           │ Current sqrt(price)           │
│ price           │ BigDecimal!       │ Current pool price            │
│ tick            │ BigInt!           │ Current tick                  │
│ isInverted      │ Boolean!          │ If price was inverted         │
│ name            │ String!           │ e.g. "YES_GNO / YES_sDAI"     │
│ type            │ String!           │ CONDITIONAL | PREDICTION | EV │
│ outcomeSide     │ String            │ "yes" | "no" | null           │
│ proposal        │ Proposal          │ Parent proposal               │
│ candles         │ [Candle!]!        │ Historical candle data        │
└─────────────────┴───────────────────┴───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ WHITELISTED_TOKEN                                                   │
├─────────────────┬───────────────────┬───────────────────────────────┤
│ id              │ ID!               │ Token contract address        │
│ symbol          │ String!           │ Token symbol (e.g. YES_GNO)   │
│ name            │ String!           │ Full token name               │
│ decimals        │ BigInt!           │ Token decimals (usually 18)   │
└─────────────────┴───────────────────┴───────────────────────────────┘
`);
}

// ========================================
// QUERY ALL SWAPS WITH FULL DETAILS
// ========================================

async function queryAllSwaps(chainId, limit = 50) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1 (Ethereum/Uniswap)' : 'Chain 100 (Gnosis/Algebra)';

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔄 ALL SWAPS - ${chainName} (Latest ${limit})`);
    console.log('═'.repeat(70));

    const query = `{
        swaps(
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
            amount0
            amount1
            amountIn
            amountOut
            price
            tokenIn {
                id
                symbol
                decimals
            }
            tokenOut {
                id
                symbol
                decimals
            }
            pool {
                id
                name
                type
                outcomeSide
                price
                proposal {
                    id
                    marketName
                }
            }
        }
    }`;

    try {
        const result = await querySubgraph(endpoint, query);

        if (result.errors) {
            console.log('❌ Error:', result.errors[0]?.message);
            return null;
        }

        const swaps = result.data?.swaps || [];
        console.log(`\n✅ Found ${swaps.length} swaps\n`);

        // Group by pool for analysis
        const byPool = {};
        swaps.forEach(s => {
            const poolName = s.pool?.name || 'unknown';
            if (!byPool[poolName]) byPool[poolName] = [];
            byPool[poolName].push(s);
        });

        console.log('📊 Swaps by Pool:');
        Object.entries(byPool).forEach(([name, poolSwaps]) => {
            const side = poolSwaps[0]?.pool?.outcomeSide || 'spot';
            console.log(`   ${name} (${side}): ${poolSwaps.length} swaps`);
        });

        // Show detailed swap info
        console.log('\n📝 Recent Swaps Detail:\n');
        swaps.slice(0, 10).forEach((swap, i) => {
            const date = new Date(parseInt(swap.timestamp) * 1000);
            const inSymbol = swap.tokenIn?.symbol || '???';
            const outSymbol = swap.tokenOut?.symbol || '???';

            console.log(`${i + 1}. ${date.toISOString().split('T')[0]} ${date.toTimeString().substring(0, 8)}`);
            console.log(`   Pool: ${swap.pool?.name} (${swap.pool?.outcomeSide || 'base'})`);
            console.log(`   Trade: ${parseFloat(swap.amountIn).toFixed(6)} ${inSymbol} → ${parseFloat(swap.amountOut).toFixed(6)} ${outSymbol}`);
            console.log(`   Price: ${parseFloat(swap.price).toFixed(8)}`);
            console.log(`   Sender: ${swap.sender.substring(0, 10)}...`);
            console.log(`   Tx: ${swap.transactionHash.substring(0, 20)}...`);
            console.log('');
        });

        return swaps;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
    }
}

// ========================================
// SWAPS FOR SPECIFIC PROPOSAL
// ========================================

async function querySwapsForProposal(chainId, proposalId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1' : 'Chain 100';

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🎯 SWAPS FOR PROPOSAL - ${chainName}`);
    console.log(`   Proposal: ${proposalId}`);
    console.log('═'.repeat(70));

    // First get the pools for this proposal
    const poolsQuery = `{
        pools(where: { proposal: "${proposalId}" }) {
            id
            name
            type
            outcomeSide
            price
        }
    }`;

    const poolsResult = await querySubgraph(endpoint, poolsQuery);
    if (!poolsResult.data?.pools?.length) {
        console.log('❌ No pools found for this proposal');
        return null;
    }

    const pools = poolsResult.data.pools;
    console.log(`\n📦 Found ${pools.length} pools:`);
    pools.forEach(p => {
        console.log(`   - ${p.name} (${p.outcomeSide || 'base'}) - Price: ${parseFloat(p.price).toFixed(6)}`);
    });

    // Query swaps for each pool
    const allSwaps = [];

    for (const pool of pools) {
        const swapsQuery = `{
            swaps(
                where: { pool: "${pool.id.toLowerCase()}" }
                first: 100
                orderBy: timestamp
                orderDirection: desc
            ) {
                id
                transactionHash
                timestamp
                amount0
                amount1
                amountIn
                amountOut
                price
                sender
                tokenIn { symbol }
                tokenOut { symbol }
            }
        }`;

        const swapsResult = await querySubgraph(endpoint, swapsQuery);
        const swaps = swapsResult.data?.swaps || [];

        console.log(`\n📈 ${pool.name} (${pool.outcomeSide || 'base'}): ${swaps.length} swaps`);

        if (swaps.length > 0) {
            const oldest = new Date(parseInt(swaps[swaps.length - 1].timestamp) * 1000);
            const newest = new Date(parseInt(swaps[0].timestamp) * 1000);
            console.log(`   Time range: ${oldest.toISOString().split('T')[0]} → ${newest.toISOString().split('T')[0]}`);

            // Calculate volume
            const totalIn = swaps.reduce((sum, s) => sum + parseFloat(s.amountIn), 0);
            console.log(`   Total amountIn: ${totalIn.toFixed(4)}`);

            // Show last 3 swaps
            console.log(`   Recent trades:`);
            swaps.slice(0, 3).forEach(s => {
                const date = new Date(parseInt(s.timestamp) * 1000);
                console.log(`     ${date.toISOString().split('T')[0]} - ${parseFloat(s.amountIn).toFixed(4)} ${s.tokenIn?.symbol} → ${parseFloat(s.amountOut).toFixed(4)} ${s.tokenOut?.symbol} @ ${parseFloat(s.price).toFixed(6)}`);
            });
        }

        allSwaps.push({ pool, swaps });
    }

    return allSwaps;
}

// ========================================
// SWAP ANALYTICS
// ========================================

async function analyzeSwapActivity(chainId) {
    const endpoint = chainId === 1 ? ENDPOINTS.chain1 : ENDPOINTS.chain100;
    const chainName = chainId === 1 ? 'Chain 1' : 'Chain 100';

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 SWAP ACTIVITY ANALYSIS - ${chainName}`);
    console.log('═'.repeat(70));

    // Get all swaps with pool info
    const query = `{
        swaps(first: 1000, orderBy: timestamp, orderDirection: desc) {
            timestamp
            amountIn
            amountOut
            price
            pool {
                name
                type
                outcomeSide
                proposal { marketName }
            }
        }
    }`;

    const result = await querySubgraph(endpoint, query);
    const swaps = result.data?.swaps || [];

    console.log(`\n📈 Total swaps analyzed: ${swaps.length}`);

    // Group by outcome side
    const byOutcome = { yes: [], no: [], base: [] };
    swaps.forEach(s => {
        const side = s.pool?.outcomeSide || 'base';
        byOutcome[side]?.push(s);
    });

    console.log('\n📊 Distribution by Outcome:');
    Object.entries(byOutcome).forEach(([side, sideSwaps]) => {
        if (sideSwaps.length > 0) {
            const avgPrice = sideSwaps.reduce((sum, s) => sum + parseFloat(s.price), 0) / sideSwaps.length;
            console.log(`   ${side.toUpperCase()}: ${sideSwaps.length} swaps, avg price: ${avgPrice.toFixed(6)}`);
        }
    });

    // Group by pool type
    const byType = {};
    swaps.forEach(s => {
        const type = s.pool?.type || 'unknown';
        if (!byType[type]) byType[type] = [];
        byType[type].push(s);
    });

    console.log('\n📊 Distribution by Pool Type:');
    Object.entries(byType).forEach(([type, typeSwaps]) => {
        console.log(`   ${type}: ${typeSwaps.length} swaps`);
    });

    // Group by proposal
    const byProposal = {};
    swaps.forEach(s => {
        const proposal = s.pool?.proposal?.marketName || 'Unknown';
        if (!byProposal[proposal]) byProposal[proposal] = [];
        byProposal[proposal].push(s);
    });

    console.log('\n📊 Distribution by Proposal:');
    Object.entries(byProposal).forEach(([name, propSwaps]) => {
        console.log(`   ${name.substring(0, 50)}${name.length > 50 ? '...' : ''}: ${propSwaps.length} swaps`);
    });

    // Time distribution (last 7 days, last 30 days, etc.)
    const now = Date.now() / 1000;
    const day = 86400;
    const swaps24h = swaps.filter(s => parseInt(s.timestamp) > now - day);
    const swaps7d = swaps.filter(s => parseInt(s.timestamp) > now - (7 * day));
    const swaps30d = swaps.filter(s => parseInt(s.timestamp) > now - (30 * day));

    console.log('\n📊 Time Distribution:');
    console.log(`   Last 24h: ${swaps24h.length} swaps`);
    console.log(`   Last 7d:  ${swaps7d.length} swaps`);
    console.log(`   Last 30d: ${swaps30d.length} swaps`);

    return { swaps, byOutcome, byType, byProposal };
}

// ========================================
// MAIN
// ========================================

async function main() {
    console.log('\n' + '🔬'.repeat(35));
    console.log('SUBGRAPH SWAPS EXPLORER - COMPLETE ANALYSIS');
    console.log('🔬'.repeat(35));

    // Print the schema
    printSwapSchema();

    // ===== Chain 100 (Gnosis) =====
    console.log('\n\n' + '🟠'.repeat(35));
    console.log('CHAIN 100 (GNOSIS / ALGEBRA)');
    console.log('🟠'.repeat(35));

    await queryAllSwaps(100, 30);
    await querySwapsForProposal(100, TEST_PROPOSALS.chain100);
    await analyzeSwapActivity(100);

    // ===== Chain 1 (Ethereum) =====
    console.log('\n\n' + '🔷'.repeat(35));
    console.log('CHAIN 1 (ETHEREUM / UNISWAP)');
    console.log('🔷'.repeat(35));

    await queryAllSwaps(1, 30);
    await querySwapsForProposal(1, TEST_PROPOSALS.chain1);
    await analyzeSwapActivity(1);

    console.log('\n\n✅ Complete!');
}

main().catch(console.error);
