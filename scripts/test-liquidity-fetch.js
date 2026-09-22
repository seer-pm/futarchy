#!/usr/bin/env node
/**
 * Test script to debug liquidity fetching for proposals
 * 
 * Usage: node scripts/test-liquidity-fetch.js [proposalId]
 * 
 * Default: AAVE proposal 0xfb45ae9d8e5874e85b8e23d735eb9718efef47fa
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const PROPOSAL_ID = process.argv[2] || '0xfb45ae9d8e5874e85b8e23d735eb9718efef47fa';

// Subgraph endpoints
const AGGREGATOR_SUBGRAPH_URL = REGISTRY_URL;

const SUBGRAPH_ENDPOINTS = CANDLES_ENDPOINTS;

async function fetchFromSubgraph(url, query, variables = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });
    return response.json();
}

async function getProposalFromRegistry(proposalId) {
    console.log('\n📋 Step 1: Fetching proposal from Registry Subgraph...');
    console.log(`   Looking for: ${proposalId}`);
    console.log(`   Registry URL: ${AGGREGATOR_SUBGRAPH_URL}`);

    // First try by ID (metadata contract address)
    const queryById = `
        query GetProposal($id: ID!) {
            proposalEntity(id: $id) {
                id
                displayNameQuestion
                displayNameEvent
                description
                proposalAddress
                metadata
                metadataURI
                owner
                organization {
                    id
                    name
                    metadata
                }
            }
        }
    `;

    let result = await fetchFromSubgraph(AGGREGATOR_SUBGRAPH_URL, queryById, { id: proposalId.toLowerCase() });

    if (result.errors) {
        console.error('   ❌ Error:', result.errors[0]?.message);
        return null;
    }

    let proposal = result.data?.proposalEntity;

    // If not found by ID, try searching by proposalAddress (trading contract)
    if (!proposal) {
        console.log('   ⚠️ Not found by ID, searching by proposalAddress...');

        const queryByTradingAddress = `
            query GetProposalByAddress($addr: Bytes!) {
                proposalEntities(where: { proposalAddress: $addr }) {
                    id
                    displayNameQuestion
                    displayNameEvent
                    description
                    proposalAddress
                    metadata
                    metadataURI
                    owner
                    organization {
                        id
                        name
                        metadata
                    }
                }
            }
        `;

        result = await fetchFromSubgraph(AGGREGATOR_SUBGRAPH_URL, queryByTradingAddress, { addr: proposalId.toLowerCase() });

        if (result.errors) {
            console.error('   ❌ Error:', result.errors[0]?.message);
            return null;
        }

        proposal = result.data?.proposalEntities?.[0];
    }

    if (!proposal) {
        console.error('   ❌ Proposal not found in Registry');
        return null;
    }

    console.log('   ✅ Found proposal:', proposal.displayNameQuestion);
    console.log('   📦 Proposal Address (trading):', proposal.proposalAddress);
    console.log('   🏢 Organization:', proposal.organization?.name);

    // Parse metadata to get chain
    let chain = 100; // Default Gnosis
    try {
        if (proposal.metadata) {
            const meta = JSON.parse(proposal.metadata);
            console.log('   📝 Proposal Metadata:', JSON.stringify(meta, null, 2));
            if (meta.chain) {
                chain = parseInt(meta.chain);
            }
        }
        if (proposal.organization?.metadata) {
            const orgMeta = JSON.parse(proposal.organization.metadata);
            console.log('   🏢 Org Metadata:', JSON.stringify(orgMeta, null, 2));
            if (!proposal.metadata?.includes('chain') && orgMeta.chain) {
                chain = parseInt(orgMeta.chain);
            }
        }
    } catch (e) {
        console.log('   ⚠️ Could not parse metadata:', e.message);
    }

    console.log(`   🔗 Detected Chain: ${chain} (${chain === 1 ? 'Ethereum Mainnet' : 'Gnosis Chain'})`);

    return { ...proposal, chain };
}

async function getPoolsFromSubgraph(proposalAddress, chainId) {
    console.log('\n📊 Step 2: Fetching pools from Chain Subgraph...');
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];

    if (!endpoint) {
        console.error(`   ❌ No subgraph endpoint for chain ${chainId}`);
        return null;
    }

    console.log(`   Chain: ${chainId} (${chainId === 1 ? 'Ethereum Mainnet' : 'Gnosis Chain'})`);
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   Proposal Address: ${proposalAddress}`);

    // Query for proposal with pools (uses pools array, not yesPool/noPool)
    const query = `
        query GetProposalPools($id: ID!) {
            proposal(id: $id) {
                id
                marketName
                currencyToken { symbol }
                pools {
                    id
                    name
                    type
                    outcomeSide
                    token0
                    token1
                    liquidity
                    sqrtPrice
                    price
                    volumeToken0
                    volumeToken1
                }
            }
        }
    `;

    const result = await fetchFromSubgraph(endpoint, query, { id: proposalAddress.toLowerCase() });

    if (result.errors) {
        console.error('   ❌ Subgraph Error:', result.errors[0]?.message);
        return null;
    }

    const proposal = result.data?.proposal;
    if (!proposal) {
        console.log('   ⚠️ Proposal not found in chain subgraph, trying pools directly...');
        return await getPoolsDirectly(proposalAddress, endpoint);
    }

    return proposal;
}

async function getPoolsDirectly(proposalAddress, endpoint) {
    console.log('   🔍 Querying pools directly by proposal address...');

    // Try to find pools that might be associated with this proposal
    const query = `
        query GetPools {
            pools(first: 20, orderBy: createdAtTimestamp, orderDirection: desc) {
                id
                token0
                token1
                liquidity
                sqrtPrice
                totalValueLockedToken0
                totalValueLockedToken1
                totalValueLockedUSD
                volumeUSD
            }
        }
    `;

    const result = await fetchFromSubgraph(endpoint, query, {});

    if (result.errors) {
        console.error('   ❌ Error fetching pools:', result.errors[0]?.message);
        return null;
    }

    console.log(`   📦 Found ${result.data?.pools?.length || 0} pools in subgraph`);

    if (result.data?.pools?.length > 0) {
        console.log('\n   Recent pools:');
        result.data.pools.slice(0, 5).forEach((pool, i) => {
            console.log(`   ${i + 1}. ${pool.id}`);
            console.log(`      Liquidity: ${pool.liquidity}`);
            console.log(`      TVL USD: ${pool.totalValueLockedUSD}`);
        });
    }

    return { pools: result.data?.pools || [] };
}

async function checkSubgraphHealth(chainId) {
    console.log(`\n🏥 Step 3: Checking subgraph health for chain ${chainId}...`);
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];

    const query = `
        query Health {
            _meta {
                block {
                    number
                    timestamp
                }
                hasIndexingErrors
            }
        }
    `;

    const result = await fetchFromSubgraph(endpoint, query, {});

    if (result.errors) {
        console.error('   ❌ Health check failed:', result.errors[0]?.message);
        return;
    }

    const meta = result.data?._meta;
    if (meta) {
        console.log('   📊 Subgraph Status:');
        console.log(`      Block: ${meta.block?.number}`);
        if (meta.block?.timestamp) {
            const date = new Date(meta.block.timestamp * 1000);
            console.log(`      Time: ${date.toISOString()}`);
        }
        console.log(`      Has Errors: ${meta.hasIndexingErrors}`);
    }
}

async function testPoolDataQuery(poolAddress, chainId) {
    console.log(`\n🔬 Step 4: Direct pool query for ${poolAddress}...`);
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];

    const query = `
        query GetPool($id: ID!) {
            pool(id: $id) {
                id
                token0
                token1
                liquidity
                sqrtPrice
                tick
                totalValueLockedToken0
                totalValueLockedToken1
                totalValueLockedUSD
                volumeUSD
                volumeToken0
                volumeToken1
                feeTier
                createdAtTimestamp
                createdAtBlockNumber
            }
        }
    `;

    const result = await fetchFromSubgraph(endpoint, query, { id: poolAddress.toLowerCase() });

    if (result.errors) {
        console.error('   ❌ Error:', result.errors[0]?.message);
        return null;
    }

    const pool = result.data?.pool;
    if (!pool) {
        console.log('   ⚠️ Pool not found');
        return null;
    }

    console.log('   ✅ Pool found:');
    console.log(`      Token0: ${pool.token0}`);
    console.log(`      Token1: ${pool.token1}`);
    console.log(`      Liquidity: ${pool.liquidity}`);
    console.log(`      sqrtPrice: ${pool.sqrtPrice}`);
    console.log(`      TVL Token0: ${pool.totalValueLockedToken0}`);
    console.log(`      TVL Token1: ${pool.totalValueLockedToken1}`);
    console.log(`      TVL USD: ${pool.totalValueLockedUSD}`);
    console.log(`      Volume USD: ${pool.volumeUSD}`);

    return pool;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('     LIQUIDITY FETCH DEBUG TEST');
    console.log('═══════════════════════════════════════════════════════════════');

    try {
        // Step 1: Get proposal from Registry
        const proposal = await getProposalFromRegistry(PROPOSAL_ID);
        if (!proposal) {
            console.log('\n❌ Could not fetch proposal from Registry');
            process.exit(1);
        }

        const chainId = proposal.chain;
        const tradingAddress = proposal.proposalAddress;

        // Step 2: Check subgraph health
        await checkSubgraphHealth(chainId);

        // Step 3: Get pools from chain subgraph
        const poolData = await getPoolsFromSubgraph(tradingAddress, chainId);

        if (poolData) {
            console.log('\n📊 Pool Data Result:');
            console.log(JSON.stringify(poolData, null, 2));

            // Step 4: Query pools directly if we have addresses
            if (poolData.yesPool?.id) {
                await testPoolDataQuery(poolData.yesPool.id, chainId);
            }
            if (poolData.noPool?.id) {
                await testPoolDataQuery(poolData.noPool.id, chainId);
            }
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('     TEST COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
