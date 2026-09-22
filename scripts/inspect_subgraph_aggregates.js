const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

// Gnosis Chain Subgraph Endpoint
const ENDPOINT = CANDLES_ENDPOINTS[100];

async function introspectAggregates() {
    // Query to find types that look like DayData
    const query = `{
        __schema {
            types {
                name
                kind
            }
        }
    }`;

    console.log('Fetching all types...');

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();
        const types = result.data.__schema.types;

        const candidateTypes = types
            .filter(t => t.name.includes('Day') || t.name.includes('Hour') || t.name.includes('Factory') || t.name.includes('Bundle'))
            .map(t => t.name);

        console.log('Candidate Aggregate Types:', candidateTypes);

        // Now introspect fields of interesting types
        for (const typeName of candidateTypes) {
            await introspectType(typeName);
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

async function introspectType(typeName) {
    const query = `{
        __type(name: "${typeName}") {
            name
            fields {
                name
                type {
                    name
                    ofType {
                        name
                    }
                }
            }
        }
    }`;

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();
    if (result.data && result.data.__type) {
        console.log(`\nFields for ${typeName}:`);
        result.data.__type.fields.forEach(f => {
            const t = f.type.name || (f.type.ofType ? f.type.ofType.name : 'Unknown');
            console.log(`- ${f.name} (${t})`);
        });
    }
}

introspectAggregates();
