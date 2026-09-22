// Run transformer and write to JSON file

const { CANDLES_ENDPOINTS } = require('./subgraph-endpoints');
const fs = require('fs');

const SUBGRAPH_ENDPOINTS = {
    1: CANDLES_ENDPOINTS[1],
    100: CANDLES_ENDPOINTS[100]
};

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
        pools { id name type outcomeSide price }
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

function transformToSupabaseFormat(data, proposalAddress, chainId) {
    if (!data) return null;

    const config = CHAIN_CONFIG[chainId];
    const { marketName, companyToken, currencyToken, outcomeTokens, pools } = data;

    const yesCompany = outcomeTokens?.find(t => t.symbol.startsWith('YES_') && !t.symbol.toLowerCase().includes('dai'));
    const noCompany = outcomeTokens?.find(t => t.symbol.startsWith('NO_') && !t.symbol.toLowerCase().includes('dai'));
    const yesCurrency = outcomeTokens?.find(t => t.symbol.startsWith('YES_') && t.symbol.toLowerCase().includes('dai'));
    const noCurrency = outcomeTokens?.find(t => t.symbol.startsWith('NO_') && t.symbol.toLowerCase().includes('dai'));

    const conditionalYes = pools?.find(p => p.type === 'CONDITIONAL' && p.outcomeSide?.toUpperCase() === 'YES');
    const conditionalNo = pools?.find(p => p.type === 'CONDITIONAL' && p.outcomeSide?.toUpperCase() === 'NO');
    const predictionYes = pools?.find(p => p.type === 'PREDICTION' && p.outcomeSide?.toUpperCase() === 'YES');
    const predictionNo = pools?.find(p => p.type === 'PREDICTION' && p.outcomeSide?.toUpperCase() === 'NO');

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
                base: companyToken ? { tokenName: companyToken.symbol, tokenSymbol: companyToken.symbol, wrappedCollateralTokenAddress: companyToken.id } : null,
                yes: yesCompany ? { tokenName: yesCompany.symbol, tokenSymbol: yesCompany.symbol, wrappedCollateralTokenAddress: yesCompany.id } : null,
                no: noCompany ? { tokenName: noCompany.symbol, tokenSymbol: noCompany.symbol, wrappedCollateralTokenAddress: noCompany.id } : null
            },
            currencyTokens: {
                base: currencyToken ? { tokenName: currencyToken.symbol, tokenSymbol: currencyToken.symbol, wrappedCollateralTokenAddress: currencyToken.id } : null,
                yes: yesCurrency ? { tokenName: yesCurrency.symbol, tokenSymbol: yesCurrency.symbol, wrappedCollateralTokenAddress: yesCurrency.id } : null,
                no: noCurrency ? { tokenName: noCurrency.symbol, tokenSymbol: noCurrency.symbol, wrappedCollateralTokenAddress: noCurrency.id } : null
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

async function main() {
    const proposalAddress = process.argv[2] || '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC';
    const chainId = parseInt(process.argv[3] || '100');

    const data = await fetchFromSubgraph(proposalAddress, chainId);
    const result = transformToSupabaseFormat(data, proposalAddress, chainId);

    fs.writeFileSync('subgraph_as_supabase.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Written to subgraph_as_supabase.json');
}

main();
