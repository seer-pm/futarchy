// The registry metadata of a categorical proposal's root, as the app reads it
// (src/adapters/registryAdapter.js): the market page only shows the follow-up
// proposals it lists in `chainedProposals` (src/utils/proposalFamily.js).
// Shared by categorical-other-chain.js and categorical-pools.js.
// REGISTRY_GRAPHQL_URL and NEXT_PUBLIC_FUTARCHY_AGGREGATOR override the
// registry, as in the app. A failed read throws: it is never taken for a root
// that lists nothing.
const REGISTRY_URL = process.env.REGISTRY_GRAPHQL_URL || 'https://api.futarchy.seer.pm/registry/graphql';
const AGGREGATOR = (process.env.NEXT_PUBLIC_FUTARCHY_AGGREGATOR || '0xAb9C4ffdA083f10959a21bD4D4b1AE62713c582d').toLowerCase();

/**
 * The root's ProposalMetadata in the aggregator, with its parsed metadata and
 * `chainedProposals` (lowercase), or null when the root is not registered there.
 */
async function registryEntry(root) {
  const query = `{ proposalEntities(where: { proposalAddress: "${root.toLowerCase()}" }) { id metadata metadataURI organization { aggregator { id } } } }`;
  const response = await fetch(REGISTRY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!response.ok) throw new Error(`registry: HTTP ${response.status}`);
  const { data, errors } = await response.json();
  if (errors) throw new Error(`registry: ${errors[0].message}`);
  const entity = data.proposalEntities.find((e) => e.organization?.aggregator?.id?.toLowerCase() === AGGREGATOR);
  if (!entity) return null;
  const metadata = entity.metadata ? JSON.parse(entity.metadata) : {};
  const listed = Array.isArray(metadata.chainedProposals) ? metadata.chainedProposals.map((a) => a.toLowerCase()) : [];
  return { address: entity.id, metadata, metadataURI: entity.metadataURI ?? '', listed };
}

module.exports = { AGGREGATOR, registryEntry };
