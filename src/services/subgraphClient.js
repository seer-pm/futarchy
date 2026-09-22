/**
 * Subgraph Client
 * 
 * Pure fetch logic for querying The Graph subgraphs.
 * No React dependencies - can be used in Node.js or browser.
 */

// Import config (works in both ESM and CommonJS)
let SUBGRAPH_ENDPOINTS;
try {
  // ESM import
  const config = await import('../config/subgraphEndpoints.js');
  SUBGRAPH_ENDPOINTS = config.SUBGRAPH_ENDPOINTS;
} catch {
  // Will be set by the factory function for Node.js
  SUBGRAPH_ENDPOINTS = null;
}

/**
 * GraphQL query templates
 */
const QUERIES = {
  /**
   * Get all pools for a proposal
   */
  GET_POOLS_FOR_PROPOSAL: `
    query GetPoolsForProposal($proposalId: String!) {
      pools(where: { proposal: $proposalId }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        proposal {
          id
          marketName
        }
      }
    }
  `,

  /**
   * Get CONDITIONAL pools for a proposal (YES/NO wrapped token pools)
   */
  GET_CONDITIONAL_POOLS: `
    query GetConditionalPools($proposalId: String!) {
      pools(where: { proposal: $proposalId, type: "CONDITIONAL" }) {
        id
        name
        type
        outcomeSide
        price
        isInverted
        proposal {
          id
          marketName
        }
      }
    }
  `,

  /**
   * Get candles for a pool
   * @param period - Candle period in seconds (60=1m, 300=5m, 900=15m, 3600=1h, 86400=1d)
   */
  GET_CANDLES: `
    query GetCandles($poolId: String!, $limit: Int!, $period: BigInt!) {
      candles(
        where: { pool: $poolId, period: $period }
        first: $limit
        orderBy: periodStartUnix
        orderDirection: desc
      ) {
        periodStartUnix
        period
        open
        high
        low
        close
        volumeUSD
      }
    }
  `,

  /**
   * Get proposal info
   */
  GET_PROPOSAL: `
    query GetProposal($proposalId: String!) {
      proposal(id: $proposalId) {
        id
        marketName
        companyToken { id symbol }
        currencyToken { id symbol }
        pools {
          id
          name
          type
          outcomeSide
        }
      }
    }
  `
};

/**
 * Execute a GraphQL query against a subgraph
 * 
 * @param {string} endpoint - The subgraph endpoint URL
 * @param {string} query - The GraphQL query
 * @param {Object} variables - Query variables
 * @returns {Promise<Object>} The query result
 */
async function executeQuery(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

/**
 * Create a subgraph client for a specific chain
 * 
 * @param {number} chainId - The chain ID
 * @param {Object} endpoints - Optional custom endpoints (for testing)
 * @returns {Object} Client with query methods
 */
function createSubgraphClient(chainId, endpoints = null) {
  const endpointConfig = endpoints || SUBGRAPH_ENDPOINTS;

  if (!endpointConfig) {
    throw new Error('SUBGRAPH_ENDPOINTS not configured. Import failed.');
  }

  const endpoint = endpointConfig[chainId];

  if (!endpoint) {
    throw new Error(`Chain ${chainId} is not supported. Supported chains: ${Object.keys(endpointConfig).join(', ')}`);
  }

  return {
    chainId,
    endpoint,

    /**
     * Get all pools for a proposal
     * @param {string} proposalId - Proposal address (will be lowercased)
     */
    async getPoolsForProposal(proposalId) {
      const data = await executeQuery(endpoint, QUERIES.GET_POOLS_FOR_PROPOSAL, {
        proposalId: proposalId.toLowerCase()
      });
      return data.pools || [];
    },

    /**
     * Get CONDITIONAL pools (YES/NO wrapped token pools) for a proposal
     * @param {string} proposalId - Proposal address (will be lowercased)
     */
    async getConditionalPools(proposalId) {
      const data = await executeQuery(endpoint, QUERIES.GET_CONDITIONAL_POOLS, {
        proposalId: proposalId.toLowerCase()
      });
      return data.pools || [];
    },

    /**
     * Get candles for a pool
     * @param {string} poolId - Pool address (will be lowercased)
     * @param {number} limit - Maximum number of candles to fetch
     * @param {number} period - Candle period in seconds (default: 3600 for 1h)
     */
    async getCandles(poolId, limit = 500, period = 3600) {
      const data = await executeQuery(endpoint, QUERIES.GET_CANDLES, {
        poolId: poolId.toLowerCase(),
        limit,
        period: String(period)  // BigInt needs to be passed as string
      });
      return data.candles || [];
    },

    /**
     * Get proposal info
     * @param {string} proposalId - Proposal address (will be lowercased)
     */
    async getProposal(proposalId) {
      const data = await executeQuery(endpoint, QUERIES.GET_PROPOSAL, {
        proposalId: proposalId.toLowerCase()
      });
      return data.proposal || null;
    },

    /**
     * Get complete chart data for a proposal
     * Fetches CONDITIONAL pools and their candles
     * @param {string} proposalId - Proposal address
     * @param {number} candleLimit - Maximum candles per pool
     * @param {number} period - Candle period in seconds (default: 3600 for 1h)
     */
    async getChartData(proposalId, candleLimit = 500, period = 3600) {
      // Step 1: Get CONDITIONAL pools
      const pools = await this.getConditionalPools(proposalId);

      const yesPool = pools.find(p => p.outcomeSide === 'YES') || null;
      const noPool = pools.find(p => p.outcomeSide === 'NO') || null;

      // Step 2: Fetch candles for each pool (with period filter)
      const [yesCandles, noCandles] = await Promise.all([
        yesPool ? this.getCandles(yesPool.id, candleLimit, period) : Promise.resolve([]),
        noPool ? this.getCandles(noPool.id, candleLimit, period) : Promise.resolve([])
      ]);

      return {
        yesPool,
        noPool,
        yesCandles,
        noCandles,
        proposalId: proposalId.toLowerCase()
      };
    }
  };
}

// Export for ESM
export { createSubgraphClient, executeQuery, QUERIES };

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSubgraphClient,
    executeQuery,
    QUERIES
  };
}
