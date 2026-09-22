const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const endpoint = CANDLES_ENDPOINTS[100];

// Introspection query for Candle type
const schemaQuery = `{
  __type(name: "Candle") {
    name
    fields {
      name
      type { name kind ofType { name } }
    }
  }
}`;

// Also get Pool fields
const poolQuery = `{
  __type(name: "Pool") {
    name
    fields {
      name
      type { name kind ofType { name } }
    }
  }
}`;

// Get actual pools for the proposal
const proposalQuery = `{
  pools(where: { proposal: "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc", type: "CONDITIONAL" }) {
    id
    name
    type
    outcomeSide
    price
  }
}`;

// Get candles for YES pool (we'll find the pool ID first)
async function run() {
    try {
        console.log('=== CANDLE SCHEMA ===');
        const r1 = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: schemaQuery }) });
        const candleSchema = await r1.json();
        console.log(JSON.stringify(candleSchema, null, 2));

        console.log('\n=== POOL SCHEMA ===');
        const r2 = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: poolQuery }) });
        const poolSchema = await r2.json();
        console.log(JSON.stringify(poolSchema, null, 2));

        console.log('\n=== CONDITIONAL POOLS FOR 0x45e1... ===');
        const r3 = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: proposalQuery }) });
        const pools = await r3.json();
        console.log(JSON.stringify(pools, null, 2));

        // If we found YES pool, get its candles
        const yesPool = pools?.data?.pools?.find(p => p.outcomeSide === 'YES');
        if (yesPool) {
            console.log('\n=== SAMPLE CANDLES FOR YES POOL ===');
            const candlesQuery = `{
        candles(where: { pool: "${yesPool.id}" }, first: 5, orderBy: periodStartUnix, orderDirection: desc) {
          id
          periodStartUnix
          open
          high
          low
          close
          volumeUSD
        }
      }`;
            const r4 = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: candlesQuery }) });
            const candles = await r4.json();
            console.log(JSON.stringify(candles, null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
