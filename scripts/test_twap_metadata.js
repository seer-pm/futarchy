#!/usr/bin/env node
/**
 * Test script to check TWAP metadata for a proposal from the subgraph
 * Uses the same query pattern as futarchy-complete-sdk
 * 
 * Usage: node scripts/test_twap_metadata.js [proposalAddress]
 */

const { REGISTRY_URL, CANDLES_ENDPOINTS } = require('./subgraph-endpoints');

const PROPOSAL_ADDRESS = process.argv[2] || '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';
const SUBGRAPH_URL = REGISTRY_URL;
const DEFAULT_AGGREGATOR = '0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1'.toLowerCase();

async function fetchProposalMetadata(proposalAddress) {
    console.log(`\n🔍 Fetching proposal metadata for: ${proposalAddress}`);
    console.log(`📡 Subgraph: ${SUBGRAPH_URL}\n`);

    const propId = proposalAddress.toLowerCase();

    // Query from SDK - uses proposalEntities with proposalAddress filter
    const query = `{
    proposalEntities(where: { 
      proposalAddress: "${propId}",
      organization_: { aggregator: "${DEFAULT_AGGREGATOR}" }
    }, first: 5) {
      id
      proposalAddress
      title
      description
      displayNameQuestion
      displayNameEvent
      owner
      editor
      metadata
      metadataURI
      createdAtTimestamp
      metadataEntries {
        id
        key
        value
      }
      organization {
        id
        name
        aggregator {
          id
        }
      }
    }
  }`;

    try {
        console.log('--- Query: proposalEntities by proposalAddress ---');
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();

        if (result.errors) {
            console.log('❌ GraphQL Error:', JSON.stringify(result.errors, null, 2));
            return;
        }

        const proposals = result.data?.proposalEntities || [];

        if (proposals.length === 0) {
            console.log('❌ No proposals found with this trading contract address');
            console.log('\n--- Trying without aggregator filter ---');

            const fallbackQuery = `{
        proposalEntities(where: { proposalAddress: "${propId}" }, first: 5) {
          id
          proposalAddress
          title
          displayNameQuestion
          metadata
          metadataEntries {
            key
            value
          }
          organization {
            id
            name
          }
        }
      }`;

            const fallbackRes = await fetch(SUBGRAPH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: fallbackQuery })
            });

            const fallbackResult = await fallbackRes.json();
            const fallbackProposals = fallbackResult.data?.proposalEntities || [];

            if (fallbackProposals.length === 0) {
                console.log('❌ Still no proposals found. This trading contract may not be linked to any organization.\n');
            } else {
                console.log(`✅ Found ${fallbackProposals.length} proposal(s) without aggregator filter:`);
                fallbackProposals.forEach((p, i) => logProposal(p, i));
            }
            return;
        }

        console.log(`✅ Found ${proposals.length} proposal(s):\n`);
        proposals.forEach((p, i) => logProposal(p, i));

    } catch (error) {
        console.error('❌ Error fetching data:', error);
    }
}

function logProposal(p, index) {
    console.log(`--- Proposal ${index + 1} ---`);
    console.log(`   Metadata Contract (id): ${p.id}`);
    console.log(`   Trading Contract (proposalAddress): ${p.proposalAddress}`);
    console.log(`   Question: ${p.displayNameQuestion || p.title}`);
    console.log(`   Organization: ${p.organization?.name || 'N/A'} (${p.organization?.id || 'N/A'})`);
    console.log(`   Raw metadata field: ${p.metadata || '(empty)'}`);

    console.log(`\n   📋 Metadata Entries (${p.metadataEntries?.length || 0}):`);
    if (p.metadataEntries?.length) {
        p.metadataEntries.forEach(e => console.log(`      - ${e.key}: ${e.value}`));

        // Look for TWAP fields in entries
        const twapFields = ['twapStartTimestamp', 'twapDurationHours', 'twapDescription'];
        const foundTwap = p.metadataEntries.filter(e => twapFields.includes(e.key));
        if (foundTwap.length) {
            console.log('\n   🕐 TWAP Fields from entries:');
            foundTwap.forEach(e => console.log(`      ${e.key}: ${e.value}`));
        }
    } else {
        console.log('      (none)');
    }

    // Parse metadata JSON
    if (p.metadata) {
        try {
            const meta = JSON.parse(p.metadata);
            console.log('\n   📋 Parsed metadata JSON:');
            console.log(JSON.stringify(meta, null, 2).split('\n').map(l => '      ' + l).join('\n'));

            console.log('\n   🕐 TWAP Fields from JSON:');
            console.log(`      - twapStartTimestamp: ${meta.twapStartTimestamp || '(not set)'}`);
            console.log(`      - twapDurationHours: ${meta.twapDurationHours || '(not set)'}`);
            console.log(`      - twapDescription: ${meta.twapDescription ? meta.twapDescription.slice(0, 80) + '...' : '(not set)'}`);

            if (meta.twapStartTimestamp) {
                const startDate = new Date(meta.twapStartTimestamp * 1000);
                console.log(`      - twapStartTimestamp as date: ${startDate.toISOString()}`);
            }
        } catch (e) {
            console.log(`\n   ⚠️ Could not parse metadata JSON: ${e.message}`);
        }
    }

    console.log('\n');
}

// Run
fetchProposalMetadata(PROPOSAL_ADDRESS);
