const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const ENDPOINT = CANDLES_ENDPOINTS[100];

async function listAllTypes() {
    const query = `{
        __schema {
            types {
                name
            }
        }
    }`;

    console.log('Fetching ALL type names...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.errors) {
            console.error(result.errors);
            return;
        }

        const names = result.data.__schema.types.map(t => t.name).sort();
        console.log('Types found:');
        console.log(names.join(', '));

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

listAllTypes();
