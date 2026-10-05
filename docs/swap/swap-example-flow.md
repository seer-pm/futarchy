# Detailed Swap Workflow Example: GIP-143

This document provides a concrete, step-by-step walkthrough of a **100 sDAI** swap operation for the proposal **"GIP-143: Should the GnosisDAO Terminate karpatkey Treasury Management Services?"**.

**Scenario**:
*   **User**: Has **100 sDAI** in their wallet.
*   **Goal**: Buy **YES_GNO** (Long Gnosis if YES passes).
*   **Current State**: No split tokens (0 YES_sDAI, 0 NO_sDAI).
*   **Chain**: Gnosis Chain (100).

## 1. Initial Setup & Data Fetching

### 1.1 RPC Selection
The app first ensures a reliable connection using `getBestRpc`.
*   **Logic**: Pings available RPCs (e.g., `https://rpc.gnosischain.com`, `https://gnosis.drpc.org`) to find the one with the lowest latency.
*   **Selected RPC**: Let's assume `https://rpc.gnosischain.com`.

### 1.2 Configuration Loading
The app loads the proposal configuration (from the provided JSON).
*   **Proposal ID**: `0xa28614aa999117C555757D56A8178F271C24d7BA`
*   **Futarchy Router**: `0x7495a583ba85875d59407781b4958ED6e0E1228f`
*   **SushiSwap V3 Router**: `0x592abc3734cd0d458e6e44a2db2992a3d00283a4`

**Tokens**:
*   **Input Base**: sDAI (`0xaf204776c7245bF4147c2612BF6e5972Ee483701`)
*   **Intermediate (Split)**: YES_sDAI (`0xc8Ab2bdb2cAA0Fc30bcf6C54f273117E90f97D74`)
*   **Target**: YES_GNO (`0xeE41338963B5120cdf79e0B68149A228C0c0F73a`)

**Pool**:
*   **YES Pool**: `0xC53943533F0D7B709579d8574F2d651bed8265d2` (YES_GNO / YES_sDAI)

---

## 2. Estimation & Quoting (Pre-Transaction)

Before the user clicks "Confirm", the UI estimates the output.

### 2.1 Quote Fetching
The app calls `getAlgebraQuoteWithSlippage` (or `sushiswapV3Helper`).

*   **Input**: `100.0` (100 * 10^18 wei) of **YES_sDAI**.
    *   *Note: Even though the user has sDAI, we quote based on the post-split token (YES_sDAI) because that's what will actually be swapped.*
*   **Target**: **YES_GNO**.
*   **Call**: `Quoter.quoteExactInputSingle(...)`
    *   `tokenIn`: `0xc8Ab...` (YES_sDAI)
    *   `tokenOut`: `0xeE41...` (YES_GNO)
    *   `amountIn`: `100000000000000000000` (100e18)
    *   `limitSqrtPrice`: `0`

### 2.2 Output Calculation
*   **Result**: Let's say the quote returns `0.95` YES_GNO (assuming GNO price ~ $105).
*   **Slippage**: Calculated against the current pool price (from `slot0` or `globalState`).
*   **Price Impact**: Estimated based on liquidity.

**UI Display**: "Swap 100 sDAI for ~0.95 YES_GNO".

---

## 3. Execution Flow (Smart Swap)

When the user clicks **"Confirm Swap"**, `useFutarchy.js` orchestrates the following sequence.

### Step 1: Check & Add Collateral (The Split)

The app detects the user has **100 sDAI** but **0 YES_sDAI**. It needs to split sDAI to get the YES_sDAI required for the swap.

#### 1.1 Approve sDAI
*   **Check**: `sDAI.allowance(User, FutarchyRouter)`
*   **If < 100e18**:
    *   **Transaction 1**: `sDAI.approve(FutarchyRouter, MaxUint256)`
    *   **Status**: Waiting for confirmation... ✅

#### 1.2 Split Position
*   **Transaction 2**: `FutarchyRouter.splitPosition(...)`
    *   `proposal`: `0xa28614aa999117C555757D56A8178F271C24d7BA`
    *   `collateralToken`: `0xaf204776c7245bF4147c2612BF6e5972Ee483701` (sDAI)
    *   `amount`: `100000000000000000000` (100e18)
*   **Effect**:
    *   User sends **100 sDAI** to Router.
    *   User receives **100 YES_sDAI**.
    *   User receives **100 NO_sDAI**.
*   **Status**: "Collateral Added" ✅

---

### Step 2: The Swap

Now the user has **100 YES_sDAI**. The app proceeds to swap it for **YES_GNO**.

#### 2.1 Approve YES_sDAI
*   **Check**: `YES_sDAI.allowance(User, SushiSwapV3Router)`
*   **If < 100e18**:
    *   **Transaction 3**: `YES_sDAI.approve(SushiSwapV3Router, MaxUint256)`
    *   **Status**: Waiting for confirmation... ✅

#### 2.2 Execute Swap
*   **Transaction 4**: `SushiSwapV3Router.exactInputSingle(...)`
    *   `tokenIn`: `0xc8Ab...` (YES_sDAI)
    *   `tokenOut`: `0xeE41...` (YES_GNO)
    *   `fee`: Pool Fee (e.g., 3000 for 0.3%, or dynamic for Algebra)
    *   `recipient`: User Address
    *   `amountIn`: `100000000000000000000` (100e18)
    *   `amountOutMinimum`: `940000000000000000` (0.94 GNO - derived from quote minus slippage)
    *   `sqrtPriceLimitX96`: `0`
*   **Effect**:
    *   User sends **100 YES_sDAI**.
    *   User receives **~0.95 YES_GNO**.
*   **Status**: "Swap Complete" ✅

---

## 4. Final User State

After the process is complete:

1.  **sDAI**: -100 (Used for split)
2.  **YES_sDAI**: 0 (Swapped for YES_GNO)
3.  **NO_sDAI**: +100 (Leftover from split - acts as a hedge or cost)
4.  **YES_GNO**: +0.95 (Purchased)

**Net Position**: The user is now **Long Gnosis** conditional on **YES**, but also holds a **NO_sDAI** position (which pays out 1 sDAI if NO wins). This effectively creates a complex payoff profile specific to Futarchy markets.
