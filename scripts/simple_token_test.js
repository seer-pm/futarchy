// Simple test - just output JSON

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const ENDPOINT = CANDLES_ENDPOINTS[100];
const proposalId = '0x781df62F78A8636049A644eeedbC490d67C40cFf'.toLowerCase();

async function main() {
    const query = `{
      proposal(id: "${proposalId}") {
        id
        marketName
        companyToken { id symbol decimals }
        currencyToken { id symbol decimals }
        outcomeTokens { id symbol decimals }
        pools { id name type outcomeSide }
      }
    }`;

    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
main();
