const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

// Target endpoint
const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];

async function run() {
  console.log(`Checking Endpoint: ${SUBGRAPH_ENDPOINT}`);

  // Query to check what proposals EXIST and if schema supports volumeToken0
  const query = `
      query {
        proposals(first: 3) {
          id
          pools {
            id
            liquidity
            # Verify these fields exist
            volumeToken0
            volumeToken1
          }
        }
      }
    `;

  try {
    const res = await fetch(SUBGRAPH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const json = await res.json();

    if (json.errors) {
      console.error('Schema/Query Errors:', JSON.stringify(json.errors, null, 2));
    } else {
      console.log('Success! Found Proposals:');
      console.log(JSON.stringify(json.data, null, 2));
    }

  } catch (e) {
    console.error('Network Error:', e);
  }
}

run();
