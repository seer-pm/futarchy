const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

// Target endpoint
const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];

async function run() {
    console.log(`Checking Endpoint: ${SUBGRAPH_ENDPOINT}`);

    // Simple query
    const query = `
      query {
        proposals(first: 1) {
          id
        }
      }
    `;

    try {
        const res = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log('--- Raw Body ---');
        console.log(text);
        console.log('----------------');

    } catch (e) {
        console.error('Network Error:', e);
    }
}

run();
