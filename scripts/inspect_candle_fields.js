const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const ENDPOINT = CANDLES_ENDPOINTS[100];

async function introspectCandleFields() {
    const query = `{
        __type(name: "Candle") {
            name
            fields {
                name
                type {
                    name
                    ofType { name }
                }
            }
        }
    }`;

    console.log('Introspecting Candle fields...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.data.__type) {
            result.data.__type.fields.forEach(f => {
                const t = f.type.name || (f.type.ofType ? f.type.ofType.name : 'Unknown');
                console.log(`- ${f.name} (${t})`);
            });
        } else {
            console.log('Type Candle not found (again?).');
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

introspectCandleFields();
