/**
 * Subgraph to Supabase Format Transformer
 * 
 * Transforms subgraph proposal data to match the exact Supabase market_events format
 * so useContractConfig and all other components consume it without changes.
 * 
 * Usage: node scripts/test_subgraph_to_supabase.js [proposalAddress] [chainId]
 */

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

// Chain-specific constants
const CHAIN_CONFIG = {
    1: {
        factoryAddress: '0xf9369c0F7a84CAC3b7Ef78c837cF7313309D3678',
        routerAddress: '0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc',
        futarchyAdapter: '0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc'
    },
    100: {
        factoryAddress: '0xa6cB18FCDC17a2B44E5cAd2d80a6D5942d30a345',
        routerAddress: '0x7495a583ba85875d59407781b4958ED6e0E1228f',
        futarchyAdapter: '0x7495a583ba85875d59407781b4958ED6e0E1228f'
    }
};

/**
 * Query subgraph for proposal data
 */
async function fetchFromSubgraph(proposalAddress, chainId) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];
    const proposalId = proposalAddress.toLowerCase();

    const query = `{
      proposal(id: "${proposalId}") {
        id
        marketName
        companyToken { id symbol decimals }
        currencyToken { id symbol decimals }
        outcomeTokens { id symbol decimals }
        pools { 
          id 
          name 
          type 
          outcomeSide 
          price
          token0 { id symbol }
          token1 { id symbol }
        }
      }
    }`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const result = await response.json();
    return result.data?.proposal;
}

/**
 * Transform subgraph data to Supabase market_events format
 */
function transformToSupabaseFormat(subgraphData, proposalAddress, chainId) {
    if (!subgraphData) {
        return null;
    }

    const config = CHAIN_CONFIG[chainId];
    const { marketName, companyToken, currencyToken, outcomeTokens, pools } = subgraphData;

    // Find outcome tokens by matching with base token symbols
    const yesCompany = outcomeTokens?.find(t =>
        t.symbol === `YES_${companyToken?.symbol}` ||
        (t.symbol.startsWith('YES_') && t.symbol.includes(companyToken?.symbol))
    );
    const noCompany = outcomeTokens?.find(t =>
        t.symbol === `NO_${companyToken?.symbol}` ||
        (t.symbol.startsWith('NO_') && t.symbol.includes(companyToken?.symbol))
    );
    const yesCurrency = outcomeTokens?.find(t =>
        t.symbol === `YES_${currencyToken?.symbol}` ||
        (t.symbol.startsWith('YES_') && t.symbol.includes(currencyToken?.symbol))
    );
    const noCurrency = outcomeTokens?.find(t =>
        t.symbol === `NO_${currencyToken?.symbol}` ||
        (t.symbol.startsWith('NO_') && t.symbol.includes(currencyToken?.symbol))
    );

    // Find pools by type and outcome side
    const conditionalYes = pools?.find(p => p.type === 'CONDITIONAL' && p.outcomeSide?.toUpperCase() === 'YES');
    const conditionalNo = pools?.find(p => p.type === 'CONDITIONAL' && p.outcomeSide?.toUpperCase() === 'NO');
    const predictionYes = pools?.find(p => p.type === 'PREDICTION' && p.outcomeSide?.toUpperCase() === 'YES');
    const predictionNo = pools?.find(p => p.type === 'PREDICTION' && p.outcomeSide?.toUpperCase() === 'NO');

    // Build the Supabase-compatible format
    return {
        id: proposalAddress,
        title: marketName,
        type: 'proposal',
        proposal_markdown: marketName,
        metadata: {
            chain: chainId,
            title: marketName,
            marketName: marketName,

            companyTokens: {
                base: companyToken ? {
                    tokenName: companyToken.symbol,
                    tokenSymbol: companyToken.symbol,
                    wrappedCollateralTokenAddress: companyToken.id
                } : null,
                yes: yesCompany ? {
                    tokenName: yesCompany.symbol,
                    tokenSymbol: yesCompany.symbol,
                    wrappedCollateralTokenAddress: yesCompany.id
                } : null,
                no: noCompany ? {
                    tokenName: noCompany.symbol,
                    tokenSymbol: noCompany.symbol,
                    wrappedCollateralTokenAddress: noCompany.id
                } : null
            },

            currencyTokens: {
                base: currencyToken ? {
                    tokenName: currencyToken.symbol,
                    tokenSymbol: currencyToken.symbol,
                    wrappedCollateralTokenAddress: currencyToken.id
                } : null,
                yes: yesCurrency ? {
                    tokenName: yesCurrency.symbol,
                    tokenSymbol: yesCurrency.symbol,
                    wrappedCollateralTokenAddress: yesCurrency.id
                } : null,
                no: noCurrency ? {
                    tokenName: noCurrency.symbol,
                    tokenSymbol: noCurrency.symbol,
                    wrappedCollateralTokenAddress: noCurrency.id
                } : null
            },

            factoryAddress: config.factoryAddress,
            routerAddress: config.routerAddress,
            futarchyAdapter: config.futarchyAdapter,
            proposalAddress: proposalAddress,

            conditional_pools: {
                yes: conditionalYes ? { address: conditionalYes.id } : null,
                no: conditionalNo ? { address: conditionalNo.id } : null
            },

            prediction_pools: {
                yes: predictionYes ? { address: predictionYes.id } : null,
                no: predictionNo ? { address: predictionNo.id } : null
            }
        },
        event_status: 'open',
        visibility: 'public',
        resolution_status: 'open',
        resolution_outcome: null,
        expiration_time: null
    };
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const proposalAddress = args[0] || '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';
    const chainId = parseInt(args[1] || '100');

    console.log('Fetching from subgraph...');
    console.log('Proposal:', proposalAddress);
    console.log('Chain:', chainId);
    console.log('');

    const subgraphData = await fetchFromSubgraph(proposalAddress, chainId);

    if (!subgraphData) {
        console.log('ERROR: Proposal not found in subgraph');
        return;
    }

    const supabaseFormat = transformToSupabaseFormat(subgraphData, proposalAddress, chainId);

    console.log('=== SUPABASE-COMPATIBLE FORMAT ===');
    console.log(JSON.stringify(supabaseFormat, null, 2));
}

main().catch(console.error);
