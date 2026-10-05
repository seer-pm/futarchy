# MetaMask Interaction Example: Chain 100 (GIP-143 via Swapr)

This document illustrates the **exact function calls** a user will sign in MetaMask for a **Swapr (Algebra)** trade on Gnosis Chain.

## Scenario
*   **Market**: GIP-143 (Karpatkey Termination)
*   **User Goal**: Swap **100 YES_sDAI** for **YES_GNO**.
*   **Current Wallet**:
    *   **sDAI**: 1000 (Sufficient collateral)
    *   **YES_sDAI**: 5 (Existing position)
*   **DEX**: Swapr (Algebra)

## Smart Split Logic
The system detects the user needs **100 YES_sDAI** but already has **5**.
*   **Missing Amount**: 100 - 5 = **95 YES_sDAI**.
*   **Action**: Split **95 sDAI** (Collateral) to mint the missing 95 YES_sDAI.

---

## Transaction Sequence

### 1. Approve sDAI (If needed)
*Standard ERC20 Approval for the Futarchy Router to spend sDAI.*

*   **Contract**: `0xaf204776c7245bF4147c2612BF6e5972Ee483701` (sDAI)
*   **Function**: `approve`
*   **Spender**: `0x7495a583ba85875d59407781b4958ED6e0E1228f` (FutarchyRouter)
*   **Amount**: `95000000000000000000` (95 sDAI) or `MaxUint256`

### 2. Split Position (The "Smart Split")
*Splitting exactly 95 sDAI to reach the target of 100 YES_sDAI.*

*   **Contract**: `0x7495a583ba85875d59407781b4958ED6e0E1228f` (FutarchyRouter)
*   **Function**: `splitPosition`
*   **Payload (Decoded)**:
    *   `proposal`: `0xa28614aa999117C555757D56A8178F271C24d7BA` (GIP-143)
    *   `collateralToken`: `0xaf204776c7245bF4147c2612BF6e5972Ee483701` (sDAI)
    *   `amount`: `95000000000000000000` (**95 Ether**)

### 3. Approve YES_sDAI for Swapr
*Standard ERC20 Approval. Unlike Mainnet, there is NO Permit2 here.*

*   **Contract**: `0xc8Ab2bdb2cAA0Fc30bcf6C54f273117E90f97D74` (YES_sDAI)
*   **Function**: `approve`
*   **Spender**: `0xffb643e73f280b97809a8b41f7232ab401a04ee1` (Swapr Algebra Router)
*   **Amount**: `100000000000000000000` (100 Ether) or `MaxUint256`

### 4. Execute Swap (Swapr Router)
*Swapping the total 100 YES_sDAI (5 existing + 95 split).*

*   **Contract**: `0xffb643e73f280b97809a8b41f7232ab401a04ee1` (Swapr Router)
*   **Function**: `exactInputSingle`
*   **Value**: `0 ETH`
*   **Inputs (Struct)**:
    *   `tokenIn`: `0xc8Ab2bdb2cAA0Fc30bcf6C54f273117E90f97D74` (YES_sDAI)
    *   `tokenOut`: `0xeE41338963B5120cdf79e0B68149A228C0c0F73a` (YES_GNO)
    *   `recipient`: `[User Wallet Address]`
    *   `deadline`: `[Timestamp]` (e.g., Now + 20 mins)
    *   `amountIn`: `100000000000000000000` (**100 Ether**)
    *   `amountOutMinimum`: `940000000000000000` (0.94 YES_GNO - 1% Slippage)
    *   `limitSqrtPrice`: `0` (Market Order - No Price Limit)

---

## Key Differences from Mainnet
1.  **No Permit2**: You approve the Router directly.
2.  **Simpler Flow**: 4 Steps (Approve -> Split -> Approve -> Swap) vs 5 Steps on Mainnet (Permit2 adds a step).
3.  **Router Address**: Uses the Algebra Router (`0xffb6...`), not Universal Router.
