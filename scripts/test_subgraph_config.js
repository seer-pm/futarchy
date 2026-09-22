/**
 * Test Subgraph Contract Config
 * 
 * This script tests fetching proposal/market config from The Graph subgraph
 * as an alternative to Supabase.
 * 
 * Usage: node scripts/test_subgraph_config.js [proposalAddress] [chainId]
 * 
 * Example:
 *   node scripts/test_subgraph_config.js 0x781df62F78A8636049A644eeedbC490d67C40cFf 100
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

/**
 * Query the subgraph for proposal data
 */
async function fetchProposalFromSubgraph(proposalAddress, chainId) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];
    if (!endpoint) {
        throw new Error(`No subgraph endpoint for chain ${chainId}`);
    }

    // Lowercase for GraphQL
    const proposalId = proposalAddress.toLowerCase();

    // Query for proposal with all related pools and tokens
    const query = `
    {
      # Try to get proposal directly by ID
      proposal(id: "${proposalId}") {
        id
        marketName
      }
      
      # Get all pools for this proposal
      pools(where: { proposal: "${proposalId}" }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
        proposal {
          id
          marketName
        }
      }
    }
    `;

    console.log(`\n📡 Querying subgraph for chain ${chainId}...`);
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   Proposal: ${proposalId}\n`);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        throw new Error('GraphQL query failed');
    }

    return result.data;
}

/**
 * Transform subgraph data to match useContractConfig format
 */
function transformToContractConfig(subgraphData, proposalAddress, chainId) {
    const { proposal, pools } = subgraphData;

    // If no pools found, this proposal might not exist yet
    if (!pools || pools.length === 0) {
        return {
            found: false,
            proposalId: proposalAddress,
            chainId,
            message: 'No pools found for this proposal - it may not be indexed yet'
        };
    }

    // Extract unique tokens from pools
    const tokensMap = new Map();
    pools.forEach(pool => {
        if (pool.token0) tokensMap.set(pool.token0.id, pool.token0);
        if (pool.token1) tokensMap.set(pool.token1.id, pool.token1);
    });

    // Identify base tokens (likely company/currency) - tokens without YES/NO prefix
    const baseTokens = [];
    const conditionalTokens = { yes: [], no: [] };

    tokensMap.forEach(token => {
        if (token.symbol.startsWith('YES_')) {
            conditionalTokens.yes.push(token);
        } else if (token.symbol.startsWith('NO_')) {
            conditionalTokens.no.push(token);
        } else {
            baseTokens.push(token);
        }
    });

    // Categorize pools
    const conditionalPools = { yes: null, no: null };
    const predictionPools = { yes: null, no: null };
    const expectedValuePools = { yes: null, no: null };

    pools.forEach(pool => {
        const outcome = pool.outcomeSide?.toLowerCase();
        if (pool.type === 'CONDITIONAL') {
            if (outcome === 'yes') conditionalPools.yes = pool;
            else if (outcome === 'no') conditionalPools.no = pool;
        } else if (pool.type === 'PREDICTION') {
            if (outcome === 'yes') predictionPools.yes = pool;
            else if (outcome === 'no') predictionPools.no = pool;
        } else if (pool.type === 'EXPECTED_VALUE') {
            if (outcome === 'yes') expectedValuePools.yes = pool;
            else if (outcome === 'no') expectedValuePools.no = pool;
        }
    });

    // Try to identify company and currency tokens
    // Company token: appears in conditional pool paired with currency
    // Currency token: often sDAI, GHO, etc.
    let companyToken = null;
    let currencyToken = null;

    baseTokens.forEach(token => {
        const symbol = token.symbol.toLowerCase();
        if (symbol.includes('dai') || symbol.includes('usdc') || symbol.includes('gho')) {
            currencyToken = token;
        } else {
            companyToken = token;
        }
    });

    // Build config similar to useContractConfig format
    return {
        found: true,
        proposalId: proposalAddress,
        chainId,
        market_name: proposal?.marketName || pools[0]?.proposal?.marketName || 'Unknown',

        // Token addresses
        company_token: companyToken?.id || null,
        company_symbol: companyToken?.symbol || null,
        currency_token: currencyToken?.id || null,
        currency_symbol: currencyToken?.symbol || null,

        // Conditional tokens (YES/NO wrapped versions)
        conditional_tokens: {
            yes_company: conditionalTokens.yes.find(t => !t.symbol.toLowerCase().includes('dai'))?.id || null,
            yes_currency: conditionalTokens.yes.find(t => t.symbol.toLowerCase().includes('dai'))?.id || null,
            no_company: conditionalTokens.no.find(t => !t.symbol.toLowerCase().includes('dai'))?.id || null,
            no_currency: conditionalTokens.no.find(t => t.symbol.toLowerCase().includes('dai'))?.id || null,
        },

        // Pool addresses and prices
        conditional_pools: {
            yes: conditionalPools.yes ? {
                address: conditionalPools.yes.id,
                name: conditionalPools.yes.name,
                price: conditionalPools.yes.price,
                token0: conditionalPools.yes.token0?.id,
                token1: conditionalPools.yes.token1?.id
            } : null,
            no: conditionalPools.no ? {
                address: conditionalPools.no.id,
                name: conditionalPools.no.name,
                price: conditionalPools.no.price,
                token0: conditionalPools.no.token0?.id,
                token1: conditionalPools.no.token1?.id
            } : null
        },

        prediction_pools: {
            yes: predictionPools.yes ? {
                address: predictionPools.yes.id,
                name: predictionPools.yes.name,
                price: predictionPools.yes.price
            } : null,
            no: predictionPools.no ? {
                address: predictionPools.no.id,
                name: predictionPools.no.name,
                price: predictionPools.no.price
            } : null
        },

        expected_value_pools: {
            yes: expectedValuePools.yes ? {
                address: expectedValuePools.yes.id,
                name: expectedValuePools.yes.name,
                price: expectedValuePools.yes.price
            } : null,
            no: expectedValuePools.no ? {
                address: expectedValuePools.no.id,
                name: expectedValuePools.no.name,
                price: expectedValuePools.no.price
            } : null
        },

        // Raw pool data for debugging
        _raw_pools: pools,
        _raw_tokens: Array.from(tokensMap.values())
    };
}

/**
 * Pretty print the config
 */
function printConfig(config) {
    console.log('═'.repeat(80));
    console.log('  SUBGRAPH CONTRACT CONFIG');
    console.log('═'.repeat(80));

    if (!config.found) {
        console.log(`\n❌ ${config.message}`);
        return;
    }

    console.log(`\n📋 PROPOSAL INFO`);
    console.log(`   ID:          ${config.proposalId}`);
    console.log(`   Chain:       ${config.chainId}`);
    console.log(`   Market Name: ${config.market_name}`);

    console.log(`\n🪙 BASE TOKENS`);
    console.log(`   Company:     ${config.company_symbol || 'Not identified'} (${config.company_token || 'N/A'})`);
    console.log(`   Currency:    ${config.currency_symbol || 'Not identified'} (${config.currency_token || 'N/A'})`);

    console.log(`\n🎯 CONDITIONAL POOLS (Wrapped tokens trade)`);
    if (config.conditional_pools.yes) {
        console.log(`   YES Pool:    ${config.conditional_pools.yes.address}`);
        console.log(`                ${config.conditional_pools.yes.name}`);
        console.log(`                Price: ${config.conditional_pools.yes.price}`);
    } else {
        console.log(`   YES Pool:    Not found`);
    }
    if (config.conditional_pools.no) {
        console.log(`   NO Pool:     ${config.conditional_pools.no.address}`);
        console.log(`                ${config.conditional_pools.no.name}`);
        console.log(`                Price: ${config.conditional_pools.no.price}`);
    } else {
        console.log(`   NO Pool:     Not found`);
    }

    console.log(`\n📊 PREDICTION POOLS (Probability markets)`);
    if (config.prediction_pools.yes) {
        console.log(`   YES Pool:    ${config.prediction_pools.yes.address}`);
        console.log(`                ${config.prediction_pools.yes.name}`);
        console.log(`                Price: ${config.prediction_pools.yes.price}`);
    } else {
        console.log(`   YES Pool:    Not found`);
    }
    if (config.prediction_pools.no) {
        console.log(`   NO Pool:     ${config.prediction_pools.no.address}`);
        console.log(`                ${config.prediction_pools.no.name}`);
        console.log(`                Price: ${config.prediction_pools.no.price}`);
    } else {
        console.log(`   NO Pool:     Not found`);
    }

    console.log(`\n💎 EXPECTED VALUE POOLS`);
    if (config.expected_value_pools.yes) {
        console.log(`   YES Pool:    ${config.expected_value_pools.yes.address}`);
        console.log(`                ${config.expected_value_pools.yes.name}`);
    } else {
        console.log(`   YES Pool:    Not found`);
    }
    if (config.expected_value_pools.no) {
        console.log(`   NO Pool:     ${config.expected_value_pools.no.address}`);
        console.log(`                ${config.expected_value_pools.no.name}`);
    } else {
        console.log(`   NO Pool:     Not found`);
    }

    console.log(`\n🔗 ALL TOKENS FOUND (${config._raw_tokens.length}):`);
    config._raw_tokens.forEach(token => {
        console.log(`   ${token.symbol.padEnd(15)} ${token.id}`);
    });

    console.log(`\n🏊 ALL POOLS FOUND (${config._raw_pools.length}):`);
    config._raw_pools.forEach(pool => {
        console.log(`   [${pool.type.padEnd(14)}] [${(pool.outcomeSide || 'N/A').padEnd(3)}] ${pool.name}`);
        console.log(`                           ${pool.id}`);
    });

    console.log('\n' + '═'.repeat(80));
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const proposalAddress = args[0] || '0x781df62F78A8636049A644eeedbC490d67C40cFf';
    const chainId = parseInt(args[1] || '100');

    console.log('\n🔍 Testing Subgraph Contract Config Fetcher');
    console.log('─'.repeat(80));

    try {
        const subgraphData = await fetchProposalFromSubgraph(proposalAddress, chainId);
        const config = transformToContractConfig(subgraphData, proposalAddress, chainId);
        printConfig(config);

        // Output JSON for integration testing
        console.log('\n📦 JSON Output (for integration):');
        console.log(JSON.stringify(config, null, 2));

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
