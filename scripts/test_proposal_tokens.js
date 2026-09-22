/**
 * Test Subgraph - Discover Tokens for Pool Creation
 * 
 * For proposals WITHOUT pools, we can still get the tokens from the Proposal entity!
 * 
 * Usage: node scripts/test_proposal_tokens.js [proposalAddress] [chainId]
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

async function fetchProposalTokens(proposalAddress, chainId) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];
    const proposalId = proposalAddress.toLowerCase();

    console.log('═'.repeat(70));
    console.log('  DISCOVERING TOKENS FOR POOL CREATION');
    console.log('═'.repeat(70));
    console.log(`\nProposal: ${proposalAddress}`);
    console.log(`Chain:    ${chainId} (${chainId === 1 ? 'Ethereum' : 'Gnosis'})`);
    console.log(`Endpoint: ${endpoint}\n`);

    // Query the Proposal with ALL token-related fields
    const query = `{
      proposal(id: "${proposalId}") {
        id
        marketName
        companyToken {
          id
          symbol
          decimals
        }
        currencyToken {
          id
          symbol
          decimals
        }
        outcomeTokens {
          id
          symbol
          decimals
        }
        pools {
          id
          name
          type
          outcomeSide
        }
      }
    }`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        return;
    }

    const proposal = result.data?.proposal;

    if (!proposal) {
        console.log('❌ Proposal not found in subgraph');
        return;
    }

    // Display proposal info
    console.log('─'.repeat(70));
    console.log('📋 PROPOSAL INFO');
    console.log('─'.repeat(70));
    console.log(`Market Name: ${proposal.marketName}`);
    console.log(`Pools Found: ${proposal.pools?.length || 0}`);

    // Display base tokens
    console.log('\n─'.repeat(70));
    console.log('🪙 BASE TOKENS (from Proposal entity)');
    console.log('─'.repeat(70));

    const companyToken = proposal.companyToken;
    const currencyToken = proposal.currencyToken;

    if (companyToken) {
        console.log(`Company Token:  ${companyToken.symbol}`);
        console.log(`                ${companyToken.id}`);
        console.log(`                Decimals: ${companyToken.decimals}`);
    } else {
        console.log('Company Token:  NOT FOUND');
    }

    if (currencyToken) {
        console.log(`\nCurrency Token: ${currencyToken.symbol}`);
        console.log(`                ${currencyToken.id}`);
        console.log(`                Decimals: ${currencyToken.decimals}`);
    } else {
        console.log('\nCurrency Token: NOT FOUND');
    }

    // Display outcome tokens (conditional YES/NO tokens)
    console.log('\n─'.repeat(70));
    console.log('🎯 OUTCOME TOKENS (conditional YES/NO wrapped tokens)');
    console.log('─'.repeat(70));

    const outcomeTokens = proposal.outcomeTokens || [];

    const yesTokens = outcomeTokens.filter(t => t.symbol.startsWith('YES_'));
    const noTokens = outcomeTokens.filter(t => t.symbol.startsWith('NO_'));

    console.log(`\nYES Tokens (${yesTokens.length}):`);
    yesTokens.forEach(t => {
        console.log(`  ${t.symbol.padEnd(15)} ${t.id}`);
    });

    console.log(`\nNO Tokens (${noTokens.length}):`);
    noTokens.forEach(t => {
        console.log(`  ${t.symbol.padEnd(15)} ${t.id}`);
    });

    // Determine which pools need to be created
    console.log('\n─'.repeat(70));
    console.log('🏊 POOLS STATUS');
    console.log('─'.repeat(70));

    const existingPools = proposal.pools || [];
    const poolTypes = ['CONDITIONAL', 'PREDICTION', 'EXPECTED_VALUE'];
    const sides = ['YES', 'NO'];

    const poolStatus = {};
    poolTypes.forEach(type => {
        poolStatus[type] = { YES: null, NO: null };
    });

    existingPools.forEach(pool => {
        const side = pool.outcomeSide?.toUpperCase();
        if (poolStatus[pool.type] && side) {
            poolStatus[pool.type][side] = pool;
        }
    });

    // Print status table
    console.log('\n| Type           | YES Pool       | NO Pool        |');
    console.log('|----------------|----------------|----------------|');
    poolTypes.forEach(type => {
        const yesStatus = poolStatus[type].YES ? '✅ EXISTS' : '❌ NEEDS CREATE';
        const noStatus = poolStatus[type].NO ? '✅ EXISTS' : '❌ NEEDS CREATE';
        console.log(`| ${type.padEnd(14)} | ${yesStatus.padEnd(14)} | ${noStatus.padEnd(14)} |`);
    });

    // If pools need to be created, show which tokens to use
    const needsPoolCreation = poolTypes.some(type =>
        !poolStatus[type].YES || !poolStatus[type].NO
    );

    if (needsPoolCreation && companyToken && currencyToken) {
        console.log('\n─'.repeat(70));
        console.log('🔧 POOLS TO CREATE (token pairs)');
        console.log('─'.repeat(70));

        // Find YES_COMPANY, YES_CURRENCY, NO_COMPANY, NO_CURRENCY
        const yesCompany = yesTokens.find(t => t.symbol.includes(companyToken.symbol) ||
            t.symbol === `YES_${companyToken.symbol}`);
        const yesCurrency = yesTokens.find(t => t.symbol.includes(currencyToken.symbol) ||
            t.symbol === `YES_${currencyToken.symbol}`);
        const noCompany = noTokens.find(t => t.symbol.includes(companyToken.symbol) ||
            t.symbol === `NO_${companyToken.symbol}`);
        const noCurrency = noTokens.find(t => t.symbol.includes(currencyToken.symbol) ||
            t.symbol === `NO_${currencyToken.symbol}`);

        console.log('\nInferred Token Mapping:');
        console.log(`  YES_COMPANY:  ${yesCompany?.symbol || 'NOT FOUND'} (${yesCompany?.id || 'N/A'})`);
        console.log(`  YES_CURRENCY: ${yesCurrency?.symbol || 'NOT FOUND'} (${yesCurrency?.id || 'N/A'})`);
        console.log(`  NO_COMPANY:   ${noCompany?.symbol || 'NOT FOUND'} (${noCompany?.id || 'N/A'})`);
        console.log(`  NO_CURRENCY:  ${noCurrency?.symbol || 'NOT FOUND'} (${noCurrency?.id || 'N/A'})`);

        // Show 6-pool structure
        console.log('\n6-Pool Structure:');
        console.log('┌────┬────────────────┬────────────────┬────────────────────────┐');
        console.log('│ #  │ Token0         │ Token1         │ Pool Purpose           │');
        console.log('├────┼────────────────┼────────────────┼────────────────────────┤');

        const poolConfigs = [
            { num: 1, t0: yesCompany, t1: yesCurrency, purpose: 'YES Conditional' },
            { num: 2, t0: noCompany, t1: noCurrency, purpose: 'NO Conditional' },
            { num: 3, t0: yesCompany, t1: currencyToken, purpose: 'YES Expected Value' },
            { num: 4, t0: noCompany, t1: currencyToken, purpose: 'NO Expected Value' },
            { num: 5, t0: yesCurrency, t1: currencyToken, purpose: 'YES Prediction' },
            { num: 6, t0: noCurrency, t1: currencyToken, purpose: 'NO Prediction' },
        ];

        poolConfigs.forEach(cfg => {
            const t0 = cfg.t0?.symbol?.padEnd(14) || 'N/A'.padEnd(14);
            const t1 = cfg.t1?.symbol?.padEnd(14) || 'N/A'.padEnd(14);
            const exists = existingPools.some(p =>
                (p.token0?.id === cfg.t0?.id && p.token1?.id === cfg.t1?.id) ||
                (p.token0?.id === cfg.t1?.id && p.token1?.id === cfg.t0?.id)
            );
            const status = exists ? '✅' : '❌';
            console.log(`│ ${cfg.num}  │ ${t0} │ ${t1} │ ${cfg.purpose.padEnd(22)} │`);
        });
        console.log('└────┴────────────────┴────────────────┴────────────────────────┘');

        // JSON output for integration
        console.log('\n═'.repeat(70));
        console.log('📦 JSON CONFIG (for pool creation)');
        console.log('═'.repeat(70));

        const config = {
            proposalId: proposal.id,
            chainId,
            marketName: proposal.marketName,
            baseTokens: {
                company: companyToken,
                currency: currencyToken
            },
            conditionalTokens: {
                yesCompany,
                yesCurrency,
                noCompany,
                noCurrency
            },
            missingPools: poolTypes.flatMap(type =>
                sides.filter(side => !poolStatus[type][side])
                    .map(side => ({ type, side }))
            ),
            ammConfig: chainId === 1
                ? {
                    type: 'uniswap',
                    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
                    feeTier: 3000
                }
                : {
                    type: 'algebra',
                    positionManager: '0x91fd594c46d8b01e62dbdebed2401dde01817834'
                }
        };

        console.log(JSON.stringify(config, null, 2));
    }

    console.log('\n' + '═'.repeat(70));
}

// Main
const args = process.argv.slice(2);
const proposalAddress = args[0] || '0x781df62F78A8636049A644eeedbC490d67C40cFf';
const chainId = parseInt(args[1] || '100');

fetchProposalTokens(proposalAddress, chainId).catch(console.error);
