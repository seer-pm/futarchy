# Subgraph Liquidity & Volume Integration

This document outlines the architecture for fetching and displaying **Liquidity** and **Volume** data in the Futarchy application, specifically addressing the transition to using The Graph subgraph as the primary data source.

## 1. The Problem
Previous implementations relied on:
1.  **Hardcoded Pool Addresses**: The frontend configuration pointed to specific pool addresses (e.g., `POOL_CONFIG_YES.address`).
    *   *Issue*: If the configured pool was an initial empty deployment or a deprecating pool, the UI would show **0 Liquidity** even if a new, high-liquidity pool existed for the same market.
2.  **Legacy API / Candles**: Volume calculation relied on summing `candle.volumeUSD`.
    *   *Issue*: The subgraph candles often returned `0` for `volumeUSD` even when trades occurred, leading to "0 Volume" in the UI.

## 2. The Solution: Smart Pool Selection

We implemented a robust **"Smart Fetch"** strategy in the `usePoolData` hook. Instead of blindly trusting the configured pool address, the application now dynamically discovers the best pools directly from the subgraph.

### A. Workflow
1.  **Identify Proposal**: The hook uses the `proposalId` (e.g., `0x45e...`) from the market configuration.
2.  **Query All Pools**: It queries the subgraph for *all* pools associated with that proposal.
3.  **Filter & Sort**:
    *   It groups pools by Outcome Side (`YES` / `NO`).
    *   It sorts pools by **Liquidity**.
    *   It automatically selects the pool with the **highest liquidity** for each side.
4.  **Fallback**: If Smart Fetch fails or returns no data, it gracefully falls back to the hardcoded addresses in the config.

### B. Endpoint
*   **URL**: `https://api.studio.thegraph.com/query/1718249/algebra-proposals-candles/version/latest`
*   *Note*: Ensure you use `version/latest` to get the most up-to-date data.

### C. The Resolution Cascade
The `usePoolData` hook follows a strict priority to ensure the best data is always shown:
1.  **Smart Subgraph Fetch**: Queries by Proposal ID. Tries to find the highest liquidity pools.
    *   *If valid data found* → **STOP & USE**.
2.  **Config Subgraph Fetch**: Queries by the hardcoded pool addresses in `POOL_CONFIG`.
    *   *If valid data found* → **STOP & USE**.
3.  **Legacy API Fallback**: If both subgraph methods fail or return 0 liquidity...
    *   *Automatic Action* → Fetch data from the **Legacy Tickspread API**.
    
This ensures that if the subgraph is down or incomplete, the UI degrades gracefully to the legacy source.

## 3. Intelligent Data Aggregation (Roles & Math)

To match the expected UI values (e.g. TVL in USD/Collateral) rather than raw internal parameters, we implemented a sophisticated aggregation strategy.

### A. Role-Based Token Identification
Instead of guessing which token is the collateral based on symbols, we use the `role` field from the subgraph.
*   **Roles Checked**: `COLLATERAL`, `CURRENCY`, `YES_CURRENCY`, `NO_CURRENCY`.
*   **Logic**:
    1.  Iterate pools.
    2.  Check `token0.role` and `token1.role`.
    3.  Identify the **Currency Token** (the stable assets).
    4.  Accumulate **Volume** *only* for that Currency Token to avoid double counting or unit mismatches.

### B. Liquidity Valuation Formula (Tick-Based)
Raw Subgraph Liquidity ($L$) is an internal Uniswap V3 parameter. The UI expects the **Value** of that liquidity in terms of the collateral (e.g., sDAI).
Since direct price fields (`token0Price`) were missing in the subgraph, we derive the price from the **Tick**.

**The Formula:**
$$ \text{Liquid Value} = L \times \sqrt{Price} $$
Where:
$$ \sqrt{Price} = 1.0001^{\frac{tick}{2}} $$

*   **Why?** $L$ is roughly $\frac{\text{Amount}}{\sqrt{Price}}$. To get Amount (Value), we multiply $L \times \sqrt{Price}$.
*   **Example from Debugging**:
    *   Raw $L \approx 13,000$ (scaled).
    *   Price $\approx 115$.
    *   $\sqrt{Price} \approx 10.7$.
    *   $13,000 \times 10.7 \approx 139,000$.
    *   Matches user expectation ($138k$).

## 4. GraphQL Query Structure

We fetch `tick`, `liquidity`, and `role` to support this logic.

```graphql
query GetProposalPools($proposalId: ID!) {
  proposal(id: $proposalId) {
    currencyToken { symbol }
    pools {
      id
      outcomeSide
      liquidity   # Raw L parameter
      tick        # Used to derive Price
      volumeToken0
      volumeToken1
      token0 { symbol decimals role }
      token1 { symbol decimals role }
    }
  }
}
```

## 5. Usage in Code

### `src/hooks/usePoolData.js`
The core logic resides here.
*   **`useYesNoPoolData`**: Main hook used by the UI. It orchestrates the Smart Fetch.
*   **`fetchBestPoolsForProposal`**: The function that executes the query and sorting logic.
*   **`formatSubgraphPoolData`**: Normalizes the raw subgraph data into the app's `volume` and `liquidity` format, utilizing the intelligent volume logic.

## 6. Verification
A script is available to verify the logic in isolation:
*   **Path**: `scripts/test_smart_pool_selection.js`
*   **Usage**: `node scripts/test_smart_pool_selection.js`
*   **Function**: Queries the subgraph for a hardcoded proposal ID and prints the selected YES/NO pools and their volume/liquidity.

## 7. Data Source Override (Debugging)
To compare data between the Subgraph and the Legacy API (Supabase/Tickspread), you can use a URL query parameter to force a specific source.

*   **Default**: Uses Subgraph (Smart Fetch).
*   **Force Legacy**: Append `?trackLiquidityVolume=tickspread` or `?trackLiquidityVolume=supabase` to the URL.
    *   *Example*: `http://localhost:3000/markets/0x...?trackLiquidityVolume=tickspread`
    *   *Effect*: The UI will ignore the subgraph and fetch data from the configured Tickspread/Supabase endpoint. The "Source" badge will update to reflect this.
*   **Force Subgraph**: Append `?trackLiquidityVolume=subgraph`.
