const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

async function runUserQuery() {
    const endpoint = CANDLES_ENDPOINTS[100];

    const query = `
    query GetPoolsWithCandles($proposalId: String!, $limit: Int!) {
      pools(where: { proposal: $proposalId, type: "CONDITIONAL" }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        liquidity
        volumeToken0
        volumeToken1
        proposal {
          id
          marketName
        }
        candles(first: $limit, orderBy: periodStartUnix, orderDirection: desc) {
          periodStartUnix
          open
          high
          low
          close
          volumeUSD
        }
      }
    }
  `;

    const variables = {
        "proposalId": "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc",
        "limit": 500
    };

    console.log('Running User Query...');
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });

        const result = await response.json();

        if (result.errors) {
            console.error('GraphQL Errors:', JSON.stringify(result.errors, null, 2));
        } else {
            console.log('Success!');
            console.log(JSON.stringify(result.data, null, 2));

            // Check specifically for liquidity/volume
            const pools = result.data.pools || [];
            console.log('\n--- SUMMARY ---');
            pools.forEach(p => {
                console.log(`Pool ${p.id} (${p.outcomeSide}):`);
                console.log(`  Liquidity: ${p.liquidity}`);
                console.log(`  Vol T0: ${p.volumeToken0}`);
                console.log(`  Vol T1: ${p.volumeToken1}`);
                console.log(`  Candles: ${p.candles.length}`);
            });
        }

    } catch (error) {
        console.error('Fetch Error:', error);
    }
}

runUserQuery();
