const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];
const PROPOSAL_ID = "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc";
const QUERY = `
  query GetProposalPools($proposalId: ID!) {
     proposal(id: $proposalId) {
      pools {
        id
        tick
        sqrtPrice
      }
    }
  }
`;
// Note: Algebra might use 'globalState' or different field names. Standard V3 is 'tick', 'sqrtPrice'.
// Let's try standard first.

async function testQuery() {
    try {
        const response = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ query: QUERY, variables: { proposalId: PROPOSAL_ID.toLowerCase() } }),
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(e); }
}
testQuery();
