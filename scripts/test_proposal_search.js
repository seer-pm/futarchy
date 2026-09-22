/**
 * Test script to explore proposal schema on subgraphs
 * Run: node scripts/test_proposal_search.js
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

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

// Simple query to get proposals
const PROPOSALS_QUERY = `
    query GetProposals {
        proposals(first: 5) {
            id
            marketName
        }
    }
`;

// Search query to test
const SEARCH_QUERY = `
    query SearchProposals($term: String!) {
        proposals(first: 10, where: { marketName_contains_nocase: $term }) {
            id
            marketName
        }
    }
`;

async function fetchSubgraph(endpoint, query, variables = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });
    return await response.json();
}

async function main() {
    console.log('=== Testing Proposal Subgraph Schema ===\n');

    for (const [chainId, endpoint] of Object.entries(SUBGRAPH_ENDPOINTS)) {
        console.log(`\n--- Chain ${chainId} ---`);
        console.log(`Endpoint: ${endpoint}\n`);

        // 1. Introspect schema
        console.log('1. Introspecting Proposal type...');
        const schema = await fetchSubgraph(endpoint, INTROSPECTION_QUERY);
        if (schema.data?.__type?.fields) {
            console.log('   Fields:', schema.data.__type.fields.map(f => f.name).join(', '));
        } else {
            console.log('   Error:', JSON.stringify(schema.errors || 'No type found'));
        }

        // 2. Get sample proposals
        console.log('\n2. Fetching sample proposals...');
        const proposals = await fetchSubgraph(endpoint, PROPOSALS_QUERY);
        if (proposals.data?.proposals) {
            console.log(`   Found ${proposals.data.proposals.length} proposals:`);
            proposals.data.proposals.forEach(p => {
                console.log(`   - ${p.marketName || p.id}`);
            });
        } else {
            console.log('   Error:', JSON.stringify(proposals.errors || 'No proposals'));
        }

        // 3. Test search
        console.log('\n3. Testing search for "GNO"...');
        const search = await fetchSubgraph(endpoint, SEARCH_QUERY, { term: 'GNO' });
        if (search.data?.proposals) {
            console.log(`   Found ${search.data.proposals.length} results`);
            search.data.proposals.forEach(p => {
                console.log(`   - ${p.marketName || p.id}`);
            });
        } else {
            console.log('   Error:', JSON.stringify(search.errors || 'No results'));
        }
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
