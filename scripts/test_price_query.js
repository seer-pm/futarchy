const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];

const PROPOSAL_ID = "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc";

const QUERY = `
  query GetProposalPools($proposalId: ID!) {
    proposal(id: $proposalId) {
      currencyToken { symbol }
      pools {
        id
        outcomeSide
        liquidity
        volumeToken0
        volumeToken1
        token0 { symbol decimals role }
        token1 { symbol decimals role }
        token0Price
        token1Price
      }
    }
  }
`;

async function testQuery() {
    console.log("Testing query with Price fields...");
    try {
        const response = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: QUERY,
                variables: { proposalId: PROPOSAL_ID.toLowerCase() }
            })
        });

        const result = await response.json();
        if (result.errors) {
            console.error("Subgraph Errors:", JSON.stringify(result.errors, null, 2));
        } else {
            console.log("Success! Data:", JSON.stringify(result.data, null, 2));
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

testQuery();
