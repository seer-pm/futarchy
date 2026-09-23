/**
 * Registry Snapshot
 *
 * Every home-page loader needs the same three slices of the registry:
 * the aggregator, its organizations, and their proposals. They used to
 * be three sequential round trips repeated once per loader, which is
 * where the duplicate traffic came from.
 *
 * Two things make a single shared fetch possible:
 *
 *   1. Checkpoint accepts the three slices as root fields of one
 *      operation, and `proposalEntities` filters through the org
 *      relation (`organization_: { aggregator: ... }`), so the proposal
 *      query no longer depends on the org result.
 *   2. The payload is wallet-independent. Ownership and visibility
 *      rules are applied by the callers on top of this raw data, so one
 *      cache entry is correct for every caller and every wallet state.
 *
 * Sharing and caching are handled by services/requestCache.js.
 */

import { AGGREGATOR_SUBGRAPH_URL as SUBGRAPH_URL } from '../config/subgraphEndpoints';
import { cachedOnce, invalidateCache } from './requestCache';

const SNAPSHOT_QUERY = `
  query RegistrySnapshot($aggregatorId: String!) {
    aggregator(id: $aggregatorId) {
      id
      name
      description
      metadata
    }
    organizations(where: { aggregator: $aggregatorId }, first: 1000) {
      id
      name
      description
      metadata
      metadataURI
      owner
      editor
    }
    proposalEntities(where: { organization_: { aggregator: $aggregatorId } }, first: 1000) {
      id
      displayNameEvent
      displayNameQuestion
      description
      metadata
      metadataURI
      proposalAddress
      owner
      organization { id }
    }
  }
`;

/**
 * Drop cached registry data so the next read hits the network. Call after a
 * registry write (proposal/organization edit) to surface it immediately.
 *
 * @param {string} [aggregatorAddress] - omit to clear every aggregator
 */
export function invalidateRegistrySnapshot(aggregatorAddress) {
    invalidateCache(aggregatorAddress ? `registry:${String(aggregatorAddress).toLowerCase()}` : 'registry:');
}

/**
 * Fetch the aggregator, its organizations and their proposals in one
 * request. Shared and cached across all callers.
 *
 * @param {string} aggregatorAddress
 * @returns {Promise<{ aggregator: Object|null, organizations: Array, proposalEntities: Array }>}
 */
export function fetchRegistrySnapshot(aggregatorAddress) {
    const aggregatorId = String(aggregatorAddress || '').toLowerCase();
    if (!aggregatorId) {
        return Promise.resolve({ aggregator: null, organizations: [], proposalEntities: [] });
    }

    return cachedOnce(`registry:${aggregatorId}`, async () => {
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: SNAPSHOT_QUERY,
                variables: { aggregatorId },
            }),
        });

        const result = await response.json();
        if (result.errors) {
            throw new Error(result.errors[0]?.message || 'GraphQL query failed');
        }

        const data = result.data || {};
        return {
            aggregator: data.aggregator || null,
            organizations: data.organizations || [],
            proposalEntities: data.proposalEntities || [],
        };
    });
}

/**
 * Snapshot reshaped as the nested `{ ...aggregator, organizations: [{ ...org, proposals }] }`
 * object the registry callers expect.
 */
export async function fetchNestedRegistrySnapshot(aggregatorAddress) {
    const { aggregator, organizations, proposalEntities } = await fetchRegistrySnapshot(aggregatorAddress);
    if (!aggregator) {
        throw new Error(`Aggregator not found: ${aggregatorAddress}`);
    }

    const proposalsByOrg = new Map();
    for (const proposal of proposalEntities) {
        const orgId = proposal.organization?.id;
        if (!orgId) continue;
        if (!proposalsByOrg.has(orgId)) proposalsByOrg.set(orgId, []);
        proposalsByOrg.get(orgId).push(proposal);
    }

    return {
        ...aggregator,
        organizations: organizations.map(org => ({
            ...org,
            proposals: proposalsByOrg.get(org.id) || [],
        })),
    };
}

export default fetchRegistrySnapshot;
