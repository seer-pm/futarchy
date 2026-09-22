const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fetch = require('node-fetch');

const SUBGRAPH_ENDPOINT = CANDLES_ENDPOINTS[100];

const PROPOSAL_POOLS_QUERY = `
  query GetProposalPools($proposalId: ID!) {
    proposal(id: $proposalId) {
      pools {
        id
        outcomeSide
        liquidity
        volumeToken0
        volumeToken1
        token0 { symbol decimals }
        token1 { symbol decimals }
      }
    }
  }
`;

// Helper to format a raw subgraph pool into our app's data structure
const formatSubgraphPoolData = (pool) => {
    if (!pool) return { volume: 0, liquidity: { amount: 0, isRaw: true } };

    // Intelligent Volume Aggregation
    let volumeTotal = 0;

    const t0Sym = pool.token0?.symbol?.toLowerCase() || '';
    const t1Sym = pool.token1?.symbol?.toLowerCase() || '';

    // Check for common collateral identifiers in symbols
    const isCollateral = (sym) => sym.includes('sdai') || sym.includes('usdc') || sym.includes('dai') || sym.includes('xdai');

    if (isCollateral(t0Sym)) {
        volumeTotal += parseFloat(pool.volumeToken0 || 0);
    }

    if (isCollateral(t1Sym)) {
        volumeTotal += parseFloat(pool.volumeToken1 || 0);
    }

    // Fallback: If neither looks like collateral coverage, sum both (or just take token1 as default)
    if (!isCollateral(t0Sym) && !isCollateral(t1Sym)) {
        volumeTotal = parseFloat(pool.volumeToken1 || 0);
    }

    return {
        volume: volumeTotal,
        liquidity: {
            amount: pool.liquidity,
            token: 'Raw',
            isRaw: true,
            _debug_pool_id: pool.id, // Added for debug
            _debug_token0: t0Sym,
            _debug_token1: t1Sym
        }
    };
};

const fetchBestPoolsForProposal = async (proposalId) => {
    console.log(`Fetching pools for proposal: ${proposalId}`);
    try {
        const response = await fetch(SUBGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: PROPOSAL_POOLS_QUERY,
                variables: { proposalId: proposalId.toLowerCase() }
            })
        });

        const result = await response.json();
        if (result.errors) {
            console.error('Errors:', result.errors);
            return null;
        }

        if (!result.data || !result.data.proposal) {
            console.error('No proposal data found');
            return null;
        }

        const pools = result.data.proposal.pools || [];
        console.log(`Found ${pools.length} pools total.`);

        // Helper to find best pool for a side
        const getBestPool = (side) => {
            const sidePools = pools.filter(p => p.outcomeSide === side);
            console.log(`  Side ${side}: ${sidePools.length} pools.`);

            if (sidePools.length === 0) return null;

            // Log for debugging
            sidePools.forEach(p => console.log(`    - Pool ${p.id}: Liq=${p.liquidity}`));

            // Sort by liquidity
            const sorted = sidePools.sort((a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity));
            const best = sorted[0];
            console.log(`    => Best: ${best.id} (Liq=${best.liquidity})`);
            return best;
        };

        const yesPool = getBestPool('YES');
        const noPool = getBestPool('NO');

        if (!yesPool && !noPool) {
            console.log('No pools found for YES or NO');
            return null;
        }

        return {
            yesPool: formatSubgraphPoolData(yesPool),
            noPool: formatSubgraphPoolData(noPool)
        };

    } catch (e) {
        console.error('Error fetching pools for proposal:', e);
        return null;
    }
};

// Run it
const TEST_PROPOSAL_ID = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';

(async () => {
    console.log('--- START TEST ---');
    const result = await fetchBestPoolsForProposal(TEST_PROPOSAL_ID);
    console.log('\n--- RESULT ---');
    console.log(JSON.stringify(result, null, 2));
})();
