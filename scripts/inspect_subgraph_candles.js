const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const ENDPOINT = CANDLES_ENDPOINTS[100];

async function introspectCandle() {
    // Guessing the type name is "Candle". If not, we'll see errors or nothing.
    // Also checking "PoolCandle" just in case.
    const query = `{
        candle: __type(name: "Candle") {
            name
            fields {
                name
                type { name ofType { name } }
            }
        }
        poolCandle: __type(name: "PoolCandle") {
            name
            fields {
                name
                type { name ofType { name } }
            }
        }
    }`;

    console.log('Introspecting Candle type...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.data.candle) {
            console.log('\nFields for Candle:');
            result.data.candle.fields.forEach(f => console.log(`- ${f.name}`));
        } else {
            console.log('Type "Candle" not found.');
        }

        if (result.data.poolCandle) {
            console.log('\nFields for PoolCandle:');
            result.data.poolCandle.fields.forEach(f => console.log(`- ${f.name}`));
        } else {
            console.log('Type "PoolCandle" not found.');
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

introspectCandle();
