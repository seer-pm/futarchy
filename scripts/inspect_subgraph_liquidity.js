const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

// Gnosis Chain Subgraph Endpoint
const ENDPOINT = CANDLES_ENDPOINTS[100];

const PROPOSAL_ID = '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';

async function fetchProposalPools() {
    const query = `{
        proposal(id: "${PROPOSAL_ID.toLowerCase()}") {
            id
            pools {
                id
                name
                type
                outcomeSide
                price
                liquidity
                token0 {
                  symbol
                  decimals
                }
                token1 {
                  symbol
                  decimals
                }
            }
        }
    }`;

    console.log('Querying subgraph for proposal:', PROPOSAL_ID);

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.errors) {
            console.error('Subgraph Errors:', JSON.stringify(result.errors, null, 2));
            return;
        }

        if (!result.data || !result.data.proposal) {
            console.log('No proposal found.');
            return;
        }

        const pools = result.data.proposal.pools;
        console.log(`Found ${pools.length} pools connected to this proposal.`);
        console.log('---------------------------------------------------');

        pools.forEach(pool => {
            console.log(`Address:     ${pool.id}`);
            console.log(`Name:        ${pool.name}`);
            console.log(`Type:        ${pool.type}`);
            console.log(`Outcome:     ${pool.outcomeSide ? pool.outcomeSide.toUpperCase() : 'N/A'}`);
            console.log(`Liquidity:   ${pool.liquidity}`);
            console.log(`Price:       ${pool.price}`);
            console.log(`Tokens:      ${pool.token0.symbol} / ${pool.token1.symbol}`);
            console.log('---------------------------------------------------');
        });

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

fetchProposalPools();
