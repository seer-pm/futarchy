/**
 * Check Proposal schema fields on subgraph
 * Run: node scripts/check_proposal_schema.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINT = CANDLES_ENDPOINTS[100];

// Introspection query to see all Proposal fields
const INTROSPECTION = `
    query {
        __type(name: "Proposal") {
            name
            fields {
                name
                type { name kind }
            }
        }
    }
`;

// Simple query without orderBy
const SIMPLE_QUERY = `
    query {
        proposals(first: 5) {
            id
            marketName
        }
    }
`;

async function main() {
    console.log('=== Checking Proposal Schema ===\n');
    console.log('Endpoint:', ENDPOINT, '\n');

    // 1. Introspection
    console.log('1. Getting Proposal fields...');
    const schemaRes = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: INTROSPECTION })
    });
    const schema = await schemaRes.json();

    if (schema.data?.__type?.fields) {
        console.log('   Available fields:');
        schema.data.__type.fields.forEach(f => {
            console.log(`   - ${f.name} (${f.type?.name || f.type?.kind})`);
        });
    } else {
        console.log('   Schema error:', JSON.stringify(schema.errors));
    }

    // 2. Simple query
    console.log('\n2. Fetching proposals (no orderBy)...');
    const propRes = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: SIMPLE_QUERY })
    });
    const proposals = await propRes.json();

    if (proposals.data?.proposals) {
        console.log(`   Found ${proposals.data.proposals.length} proposals:`);
        proposals.data.proposals.forEach(p => console.log(`   - ${p.marketName}`));
    } else {
        console.log('   Query error:', JSON.stringify(proposals.errors));
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
