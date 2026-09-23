/**
 * Proposal Market Data
 *
 * A proposal's tokens and pools from the candles indexer, fetched once and
 * shared.
 *
 * The market page had two consumers asking for the same three root fields
 * with different selections: useContractConfig wanted names and prices,
 * usePoolData wanted reserves, volume and ticks. This asks for the union of
 * both selections, so one response serves both. The extra fields cost far
 * less than a second round trip.
 *
 * IDs are inlined as string literals rather than passed as GraphQL
 * variables: the /candles/graphql proxy chain-prefixes IDs by matching
 * literals like `proposal: "0x…"`, and does not look at variables.
 */

import { SUBGRAPH_ENDPOINTS } from '../config/subgraphEndpoints';
import { cachedOnce } from './requestCache';

const buildQuery = (proposalId) => `{
    proposal(id: "${proposalId}") {
        id
        marketName
        companyToken { id }
        currencyToken { id }
    }
    whitelistedTokens(where: { proposal: "${proposalId}" }, first: 100) {
        id
        symbol
        decimals
        role
    }
    pools(where: { proposal: "${proposalId}" }, first: 100) {
        id
        name
        type
        outcomeSide
        price
        liquidity
        volumeToken0
        volumeToken1
        tick
        token0 { id symbol decimals role }
        token1 { id symbol decimals role }
    }
}`;

/**
 * @param {number} chainId
 * @param {string} proposalAddress
 * @returns {Promise<{proposal: Object|null, whitelistedTokens: Array, pools: Array}|null>}
 *   null when the chain is unsupported or the query fails
 */
export function fetchProposalMarketData(chainId, proposalAddress) {
    const endpoint = SUBGRAPH_ENDPOINTS[chainId];
    if (!endpoint || !proposalAddress) return Promise.resolve(null);

    const proposalId = proposalAddress.toLowerCase();

    return cachedOnce(`candles:proposal-market:${chainId}:${proposalId}`, async () => {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: buildQuery(proposalId) }),
            });

            const result = await response.json();
            if (result.errors) {
                console.error('[ProposalMarketData] GraphQL errors:', result.errors);
                return null;
            }

            return {
                proposal: result.data?.proposal || null,
                whitelistedTokens: result.data?.whitelistedTokens || [],
                pools: result.data?.pools || [],
            };
        } catch (error) {
            console.error('[ProposalMarketData] Fetch error:', error);
            return null;
        }
    });
}

export default fetchProposalMarketData;
