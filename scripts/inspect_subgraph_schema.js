const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

// Gnosis Chain Subgraph Endpoint
const ENDPOINT = CANDLES_ENDPOINTS[100];

async function introspectPoolSchema() {
    const query = `{
        __type(name: "Pool") {
            name
            fields {
                name
                type {
                    name
                    kind
                    ofType {
                        name
                        kind
                    }
                }
            }
        }
    }`;

    console.log('Introspecting Pool schema...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.errors) {
            console.error('Introspection Errors:', JSON.stringify(result.errors, null, 2));
            return;
        }

        const fields = result.data.__type.fields;
        console.log('Available fields on Pool type:');
        fields.forEach(field => {
            const typeName = field.type.name || (field.type.ofType ? field.type.ofType.name : 'Unknown');
            console.log(`- ${field.name} (${typeName})`);
        });

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

introspectPoolSchema();
