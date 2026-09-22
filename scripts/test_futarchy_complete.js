/**
 * Test script for futarchy-complete subgraph
 * Run: node scripts/test_futarchy_complete.js
 */

const { REGISTRY_URL } = require('./subgraph-endpoints');

const ENDPOINT = REGISTRY_URL;

// Introspection query to see Proposal fields
const INTROSPECTION_QUERY = `
    query IntrospectProposal {
        __type(name: "Proposal") {
            name
            fields {
                name
                type { name kind }
            }
        }
    }
`;

async function main() {
    console.log('=== Testing Futarchy Complete Subgraph ===\n');
    console.log('Endpoint:', ENDPOINT, '\n');

    // 1. Introspect schema
    console.log('1. Introspecting Proposal type...');
    try {
        const schemaRes = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: INTROSPECTION_QUERY })
        });

        const text = await schemaRes.text();
        try {
            const schema = JSON.parse(text);
            if (schema.data?.__type?.fields) {
                console.log('   Available fields on Proposal:');
                schema.data.__type.fields.forEach(f => {
                    console.log(`   - ${f.name} (${f.type?.name || f.type?.kind})`);
                });
            } else {
                console.log('   Schema error:', JSON.stringify(schema.errors || 'No type found'));
            }
        } catch (e) {
            console.error('   Failed to parse JSON. Raw response:', text.slice(0, 500));
        }
    } catch (e) {
        console.error('   Fetch error:', e.message);
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
