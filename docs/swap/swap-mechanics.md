# Futarchy Swap Mechanics: Quoting, Splitting & Approvals

This document explains the "under-the-hood" mechanics of how the Futarchy app handles quotes, splits, and approvals, specifically addressing how it optimizes for user balances and different chains.

## 1. Quoting Mechanisms

The app uses different quoting strategies depending on the chain to ensure accuracy and gas efficiency.

### 1.1 Algebra (Swapr) - Gnosis Chain
*   **Mechanism**: Uses `AlgebraQuoter`.
*   **Process**:
    1.  **Static Call**: It performs an `eth_call` (simulation) to the `quoteExactInputSingle` function on the Quoter contract.
    2.  **Inversion**: Since prediction markets often price things in "Cents" (e.g., 0.60 sDAI), but DEXs price in "Tokens per Token", the app automatically inverts the result to show a human-readable price.
    3.  **Slippage**: It fetches the pool's `globalState` (tick) to calculate the current spot price and compares it with the quoted execution price to warn about slippage.

### 1.2 Uniswap V3 - Ethereum Mainnet
*   **Mechanism**: Uses `QuoterV2`.
*   **Process**:
    1.  **Quote**: Calls `quoteExactInputSingle` on the Uniswap Quoter.
    2.  **Gas Estimation**: It also estimates the gas cost of the swap to give the user a "Net Output" (Output - Gas Cost).
    3.  **Path Finding**: For complex swaps, it might check multiple paths (though for Futarchy, it's usually a direct pool swap).

---

## 2. The "Smart Split" Logic

One of the most important features is the **Smart Split**. The app never splits more than necessary.

**Scenario**:
*   **Goal**: You want to swap **100 sDAI** worth of YES tokens.
*   **Your Wallet**:
    *   **sDAI**: 1000
    *   **YES_sDAI**: 5 (Leftover from a previous trade)
    *   **NO_sDAI**: 0

**The Calculation**:
1.  **Target Amount**: 100 YES_sDAI needed for the swap.
2.  **Existing Balance**: 5 YES_sDAI available.
3.  **Missing Amount**: `100 - 5 = 95`.
4.  **Action**: The app calculates that it only needs to split **95 sDAI**.

**The Flow**:
1.  **Split**: `FutarchyRouter.splitPosition(95 sDAI)`
    *   You send: 95 sDAI.
    *   You get: 95 YES_sDAI + 95 NO_sDAI.
2.  **Total Available**: `95 (new) + 5 (existing) = 100 YES_sDAI`.
3.  **Swap**: `Router.swap(100 YES_sDAI -> YES_GNO)`.

**Result**: You successfully executed a 100 token swap while only locking up 95 sDAI in new collateral.

---

## 3. Approvals: Standard vs. Max vs. Permit2

Approvals give the contracts permission to spend your tokens.

### 3.1 Standard Approval (Gnosis / Split)
*   **Used By**: `FutarchyRouter` (for splitting) and `SushiSwap/Algebra` (for swapping on Gnosis).
*   **How it works**: You send a transaction saying "Contract X can spend Y amount of my Token Z".
*   **"Max Approval"**:
    *   Instead of approving just `100`, you approve `2^256 - 1` (effectively infinite).
    *   **Benefit**: You only pay the gas for approval **once**. Future splits/swaps happen instantly without a second signature.
    *   **Risk**: If the contract were malicious (unlikely for verified Router contracts), it could drain your wallet.

### 3.2 Permit2 (Ethereum Mainnet)
*   **Used By**: `Uniswap Universal Router`.
*   **Problem**: Standard approvals cost gas every time you want to change the amount or spender.
*   **Solution (Permit2)**:
    1.  **One-Time Setup**: You do a Standard Approval of "Max" to the **Permit2 Contract**.
    2.  **Per-Swap**: When you swap, you sign a **Message** (off-chain, free) saying "Permit2, please let Universal Router spend 100 tokens right now".
    3.  **Execution**: The Router submits your signature + the swap. Permit2 verifies the signature and moves the tokens.
    *   **Benefit**: Cheaper, safer (approvals expire), and better UX for frequent traders.

---

## 4. Verification: SushiSwap V3

**Confirmed**: The `ConfirmSwapModal` **does** use SushiSwap V3.

*   **Logic**:
    *   If `selectedSwapMethod === 'sushiswap'`, the app calls `executeSushiV3RouterSwap`.
    *   It uses the `SUSHISWAP_V3_ROUTER` address defined in your config.
    *   It handles the specific `exactInputSingle` params required by SushiSwap's V3 implementation.

This ensures that on chains like Gnosis (where SushiSwap V3 is dominant), the app uses the most liquid and efficient pools available.
