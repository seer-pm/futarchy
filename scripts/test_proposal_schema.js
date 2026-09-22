/**
 * Test Subgraph Proposal Schema
 * 
 * Introspection to discover Proposal entity fields
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const ENDPOINT = CANDLES_ENDPOINTS[100];
const proposalId = '0x781df62F78A8636049A644eeedbC490d67C40cFf'.toLowerCase();

async function introspectProposal() {
    console.log('=== Introspecting Proposal Schema ===\n');

    // Introspection query to see Proposal fields
    const introspectionQuery = `{
      __type(name: "Proposal") {
        fields {
          name
          type { 
            name 
            kind 
            ofType { name }
          }
        }
      }
    }`;

    const res1 = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: introspectionQuery })
    });
    const schemaData = await res1.json();

    console.log('Proposal Entity Fields:');
    if (schemaData.data?.__type?.fields) {
        schemaData.data.__type.fields.forEach(field => {
            const typeName = field.type.ofType?.name || field.type.name || field.type.kind;
            console.log(`  - ${field.name}: ${typeName}`);
        });
    } else {
        console.log('No Proposal entity found or introspection not supported');
        console.log(JSON.stringify(schemaData, null, 2));
    }

    // Now query the actual proposal with ALL potential fields
    console.log('\n=== Querying Proposal Data ===');
    console.log(`Proposal ID: ${proposalId}\n`);

    const proposalQuery = `{
      proposal(id: "${proposalId}") {
        id
        marketName
      }
      
      pools(where: { proposal: "${proposalId}" }) {
        id
        name
        type
        outcomeSide
        token0 { id symbol }
        token1 { id symbol }
      }
    }`;

    const res2 = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: proposalQuery })
    });
    const proposalData = await res2.json();

    console.log('Proposal Data:');
    console.log(JSON.stringify(proposalData.data?.proposal, null, 2));

    console.log('\nPools Found:', proposalData.data?.pools?.length || 0);

    if (proposalData.data?.pools?.length > 0) {
        console.log('\nTokens Available from Pools:');
        const tokens = new Map();
        proposalData.data.pools.forEach(pool => {
            if (pool.token0) tokens.set(pool.token0.id, pool.token0.symbol);
            if (pool.token1) tokens.set(pool.token1.id, pool.token1.symbol);
        });
        tokens.forEach((symbol, address) => {
            console.log(`  ${symbol.padEnd(15)} ${address}`);
        });
    } else {
        console.log('\n⚠️ No pools found - need to check Proposal contract directly for tokens');

        // Try to query Proposal with more fields
        const fullProposalQuery = `{
          proposal(id: "${proposalId}") {
            id
            marketName
          }
        }`;

        const res3 = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: fullProposalQuery })
        });
        const fullData = await res3.json();
        console.log('\nFull Proposal Query Result:');
        console.log(JSON.stringify(fullData, null, 2));
    }
}

introspectProposal().catch(console.error);
