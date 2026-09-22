const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];
const LEGACY_API = 'https://stag.api.tickspread.com';
const PROPOSAL_ID = '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';

async function compareSources() {
    console.log(`Analyzing Proposal: ${PROPOSAL_ID}`);
    console.log('===================================================');

    // 1. Get Pool Addresses from Subgraph
    const proposalQuery = `{
        proposal(id: "${PROPOSAL_ID.toLowerCase()}") {
            pools {
                id
                outcomeSide
                liquidity
            }
        }
    }`;

    let pools = [];
    try {
        const res = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: proposalQuery })
        });
        const json = await res.json();

        if (json.errors) {
            console.error('Subgraph Query Errors:', JSON.stringify(json.errors, null, 2));
            return;
        }

        if (json.data && json.data.proposal) {
            pools = json.data.proposal.pools;
        } else {
            console.error(`Proposal ${PROPOSAL_ID} not found or returned no pools.`);
            console.log('Full Query Response:', JSON.stringify(json, null, 2));
            return;
        }
    } catch (err) {
        console.error('Subgraph Error:', err);
        return;
    }

    // 2. For each pool, fetch full Subgraph Data AND Legacy Data
    for (const pool of pools) {
        console.log(`\nUNKNOWN POOL for '${pool.outcomeSide.toUpperCase()}' side: ${pool.id}`);
        console.log('---------------------------------------------------');

        // --- SUBGRAPH DATA ---
        console.log('⚡ SOURCE: SUBGRAPH');
        try {
            // Replicating the exact query from the hook
            const timestamp24hAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
            const poolQuery = `{
                pool(id: "${pool.id}") {
                    liquidity
                    volumeToken0
                    volumeToken1
                }
                candles(
                    where: { pool: "${pool.id}", time_gte: ${timestamp24hAgo}, period: 3600 }
                    orderBy: time
                    orderDirection: desc
                ) {
                    volumeUSD
                }
            }`;
            const subRes = await fetch(SUBGRAPH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: poolQuery })
            });
            const subJson = await subRes.json();
            const poolData = subJson.data.pool;
            const candles = subJson.data.candles || [];

            const volumeUSD24h = candles.reduce((acc, c) => acc + parseFloat(c.volumeUSD || 0), 0);

            console.log(`   Liquidity (Raw L): ${poolData.liquidity}`);
            console.log(`   Volume Token0:     ${poolData.volumeToken0}`);
            console.log(`   Volume Token1:     ${poolData.volumeToken1}`);
            console.log(`   Volume (24h USD from candles):  $${volumeUSD24h.toFixed(2)}`);
        } catch (err) {
            console.log('   Error fetching subgraph details:', err.message);
        }

        // --- LEGACY DATA ---
        console.log('\n🗄️  SOURCE: LEGACY (Tickspread)');
        try {
            const liqRes = await fetch(`${LEGACY_API}/api/v1/pools/liquidity?pool_id=${pool.id}`);
            const volRes = await fetch(`${LEGACY_API}/api/v1/pools/volume?pool_id=${pool.id}`);

            const liqText = await liqRes.text();
            const volText = await volRes.text();

            let liqJson = null;
            let volJson = null;

            try { liqJson = JSON.parse(liqText); } catch (e) { console.log('   Liquidity Parse Error:', liqText); }
            try { volJson = JSON.parse(volText); } catch (e) { console.log('   Volume Parse Error:', volText); }

            if (liqJson) {
                // Handle various legacy formats
                let amt = '0';
                if (typeof liqJson.amount !== 'undefined') amt = liqJson.amount;
                else if (liqJson.amount0) amt = `${liqJson.amount0} / ${liqJson.amount1}`;

                console.log(`   Liquidity (TVL):   ${amt}`);
            }

            if (volJson) {
                console.log(`   Volume (Total):    ${volJson.volume}`);
            }

        } catch (err) {
            console.log('   Error fetching legacy data:', err.message);
        }
        console.log('---------------------------------------------------');
    }
}

compareSources();
