# Subgraph Endpoint Locations - CENTRALIZED ✅

All subgraph endpoints are now centralized in a **single source of truth**:

## 📍 Configuration File

```
src/config/subgraphEndpoints.js
```

## Endpoints Configured

| Name | Variable | Description |
|------|----------|-------------|
| **Candles (Chain 1)** | `SUBGRAPH_ENDPOINTS[1]` | Ethereum/Uniswap candle data |
| **Candles (Chain 100)** | `SUBGRAPH_ENDPOINTS[100]` | Gnosis/Algebra candle data |
| **Registry** | `AGGREGATOR_SUBGRAPH_URL` | Organization/Proposal metadata |

## Files Using This Config

All these files now **import** from the central config:

| File | Import Used |
|------|-------------|
| `src/hooks/useSubgraphData.js` | `SUBGRAPH_ENDPOINTS` |
| `src/hooks/useSearchProposals.js` | `SUBGRAPH_ENDPOINTS` |
| `src/hooks/usePoolData.js` | `getSubgraphEndpoint(100)` |
| `src/utils/subgraphTradesClient.js` | `SUBGRAPH_ENDPOINTS` |
| `src/adapters/subgraphConfigAdapter.js` | `SUBGRAPH_ENDPOINTS` |
| `src/adapters/registryAdapter.js` | `AGGREGATOR_SUBGRAPH_URL` |
| `src/services/subgraphClient.js` | `SUBGRAPH_ENDPOINTS` |

## To Change Endpoints

Just edit `src/config/subgraphEndpoints.js`:

```javascript
// Change this for candle data (YES/NO pools, trades, chart)
export const SUBGRAPH_ENDPOINTS = {
    1: 'https://...',   // Ethereum
    100: 'http://...'   // Gnosis ← Change here for local dev
};

// Change this for organization/proposal registry
export const AGGREGATOR_SUBGRAPH_URL = 'http://...';
```

**One ring to rule them all!** 💍
