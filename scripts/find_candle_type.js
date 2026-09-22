const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const ENDPOINT = CANDLES_ENDPOINTS[100];

async function findCandleType() {
    const query = `{
        __type(name: "Pool") {
            fields {
                name
                type {
                    kind
                    name
                    ofType {
                        kind
                        name
                        ofType {
                            kind
                            name
                            ofType {
                                kind
                                name
                            }
                        }
                    }
                }
            }
        }
    }`;

    console.log('Deep Introspection of Pool fields...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        const candlesField = result.data.__type.fields.find(f => f.name === 'candles');
        if (candlesField) {
            console.log('Candles field found:', JSON.stringify(candlesField, null, 2));
        } else {
            console.log('Candles field NOT found on Pool.');
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

findCandleType();
