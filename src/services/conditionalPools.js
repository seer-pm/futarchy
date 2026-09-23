/**
 * Conditional Pools
 *
 * The CONDITIONAL (YES/NO wrapped-token) pools of a proposal, fetched once
 * and shared.
 *
 * The chart and the trades panel both need this list and used to ask for it
 * separately with near-identical queries — one wanted `price` and
 * `isInverted`, the other only the identity fields. This asks for the union,
 * so a single response serves both.
 *
 * The proposal ID is inlined as a string literal rather than passed as a
 * GraphQL variable: the /candles/graphql proxy chain-prefixes IDs by matching
 * literals like `proposal: "0x…"`, and does not look at variables.
 */

import { SUBGRAPH_ENDPOINTS } from '../config/subgraphEndpoints';
import { cachedOnce } from './requestCache';

const buildQuery = (proposalId) => `{
      pools(where: { proposal: "${proposalId}", type: "CONDITIONAL" }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
      }
    }`;

/**
 * @param {number} chainId
 * @param {string} proposalId
 * @returns {Promise<Array<Object>>} pool rows (empty when unavailable)
 * @throws when the endpoint is unknown or the query fails
 */
export function fetchConditionalPools(chainId, proposalId) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];
    if (!endpoint) {
        return Promise.reject(new Error(`Unsupported chain: ${chainId}`));
    }
    if (!proposalId) {
        return Promise.reject(new Error('No proposal ID provided'));
    }

    const id = proposalId.toLowerCase();

    return cachedOnce(`candles:conditional-pools:${chainId}:${id}`, async () => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: buildQuery(id) }),
        });

        const result = await response.json();
        if (result.errors) {
            throw new Error(result.errors[0]?.message || 'GraphQL query failed');
        }

        return result.data?.pools || [];
    });
}

export default fetchConditionalPools;
