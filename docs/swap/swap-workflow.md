# Futarchy Swap Workflow Documentation

This document details the complete swap workflow within the Futarchy application, focusing on the `ConfirmSwapModal` component, `useFutarchy` hook, and interactions with various DEX SDKs and the Futarchy Router.

## 1. Overview

The swap functionality allows users to trade between **Currency Tokens** (e.g., sDAI) and **Company Tokens** (e.g., GNO) within the context of a Futarchy market. The system supports "Smart Swaps" which automatically handle:
1.  **Collateral Management**: Checking balances and splitting base tokens into YES/NO positions if needed.
2.  **Route Optimization**: Selecting the best swap method (Uniswap V3, Algebra, SushiSwap).
3.  **Execution**: Performing the swap via the appropriate router.

## 2. Core Components

### 2.1 `ConfirmSwapModal.jsx`
*   **Role**: The UI orchestrator. It manages the user's journey through the swap steps.
*   **Key Responsibilities**:
    *   Displays transaction steps (e.g., "Adding Collateral", "Processing Swap").
    *   Handles user approvals (Token -> Spender).
    *   Delegates execution to specific handler functions based on the selected method (`cowswap`, `algebra`, `uniswap`, `sushiswap`).
    *   Manages "Redeem" logic for closing positions.

### 2.2 `useFutarchy.js`
*   **Role**: The central hook for Futarchy logic.
*   **Key Responsibilities**:
    *   **`smartSwap`**: The main function called by the UI. It coordinates the entire flow:
        1.  Checks existing position balances.
        2.  Calculates `additionalCollateralNeeded`.
        3.  Calls `FutarchyRouter.splitPosition` if collateral is needed.
        4.  Executes the actual token swap using the chosen DEX.
    *   **`closePositions`**: Logic to swap surplus outcome tokens back to base tokens (e.g., YES_SDAI -> YES_GNO).

## 3. Swap Methods & SDKs

The application supports multiple DEX integrations, each with its own flow.

### 3.1 Uniswap V3 (via Universal Router)
*   **File**: `src/utils/uniswapSdk.js`
*   **Supported Chains**: Mainnet (1), Polygon (137), Optimism (10), Arbitrum (42161), Base (8453), Gnosis (100).
*   **Router**: Uses the **Universal Router** contract.
*   **Approval Flow (Permit2)**:
    1.  **ERC20 Approval**: User approves the token for the `Permit2` contract (`0x000...BA3`).
    2.  **Permit2 Approval**: User approves `Permit2` to spend tokens via the `UniversalRouter`.
*   **Execution**:
    *   Constructs commands: `V3_SWAP_EXACT_IN` + `SWEEP`.
    *   Calls `UniversalRouter.execute()`.
*   **Quoting**: Uses `QuoterV2` to fetch quotes and calculate price impact.

### 3.2 Algebra (Swapr)
*   **File**: `src/utils/algebraQuoter.js`
*   **Supported Chains**: Gnosis Chain (100).
*   **Router**: Interacts with Algebra's contracts (similar to Uniswap V3 but optimized).
*   **Optimization**: Custom implementation to reduce RPC calls (1-2 calls vs 420+ in the official SDK).
*   **Flow**:
    1.  Fetches token decimals/symbols.
    2.  Calls `AlgebraQuoter.quoteExactInputSingle` (via `callStatic`).
    3.  Fetches pool `globalState` to calculate slippage and price impact.
    4.  **Inversion Logic**: Automatically inverts prices to always show "Currency per Company" (e.g., sDAI per GNO).

### 3.3 SushiSwap V3
*   **File**: `src/utils/sushiswapV3Helper.js`
*   **Supported Chains**: Gnosis Chain (100).
*   **Router**: `SUSHISWAP_V3_ROUTER` (`0x592a...`).
*   **Flow**:
    1.  Standard ERC20 Approval (Token -> Router).
    2.  Executes swap via `exactInputSingle` or similar V3 methods.

## 4. Futarchy Mechanics (Collateral)

Before a swap can occur, the user often needs "Outcome Tokens" (YES/NO tokens). If they only have the "Base Token" (e.g., sDAI), the system performs a **Split**.

### 4.1 Splitting Position
*   **Contract**: `FutarchyRouter` (`0x7495...`).
*   **Function**: `splitPosition(proposal, collateralToken, amount)`.
*   **Process**:
    1.  User approves `FutarchyRouter` to spend Base Token.
    2.  `FutarchyRouter` takes Base Token and mints equal amounts of YES and NO tokens.
    3.  User now has the required Outcome Token to swap.

### 4.2 Merging/Redeeming
*   **Contract**: `FutarchyRouter`.
*   **Function**: `mergePositions` or `redeemProposal`.
*   **Process**:
    *   **Merge**: Combines equal amounts of YES and NO tokens back into the Base Token.
    *   **Redeem**: After a market resolves, allows holders of the winning outcome to claim the collateral.

## 5. Chain Configuration

The application is designed to be multi-chain but is currently heavily configured for **Gnosis Chain (Chain ID 100)**.

### 5.1 Gnosis Chain (100)
*   **Primary Chain**: Most contracts and pools are defined for Gnosis.
*   **Contracts**:
    *   `FUTARCHY_ROUTER`: `0x7495a583ba85875d59407781b4958ED6e0E1228f`
    *   `SUSHISWAP_V3_ROUTER`: `0x592abc3734cd0d458e6e44a2db2992a3d00283a4`
    *   `ALGEBRA_QUOTER`: `0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7`
*   **Tokens**:
    *   Currency: sDAI (`0xaf20...`)
    *   Company: GNO (`0x9C58...`)

### 5.2 Mainnet (1) & Others
*   **Uniswap SDK**: The `uniswapSdk.js` file contains addresses for Mainnet, Optimism, Arbitrum, etc., allowing the app to potentially support these chains for standard Uniswap swaps, provided the Futarchy contracts are deployed there.

## 6. Key Files Reference

| Component | File Path | Description |
|-----------|-----------|-------------|
| **UI Modal** | `src/components/futarchyFi/marketPage/ConfirmSwapModal.jsx` | Main swap UI and step management. |
| **Logic Hook** | `src/hooks/useFutarchy.js` | Core logic for collateral checks and swap orchestration. |
| **Uniswap SDK** | `src/utils/uniswapSdk.js` | Universal Router and Permit2 integration. |
| **Algebra SDK** | `src/utils/algebraQuoter.js` | Optimized Algebra/Swapr interaction. |
| **Contracts** | `src/components/futarchyFi/marketPage/constants/contracts.js` | Address registry and ABIs. |
