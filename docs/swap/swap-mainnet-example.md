# Mainnet Swap Workflow Analysis: USDS & TSLAon

This document analyzes the swap workflow for **Chain 1 (Ethereum Mainnet)**, specifically for the proposal **"Will Tesla shareholders approve the 2025 CEO Performance Award?"**.

**Scenario**:
*   **User**: Has **100 USDS** on Mainnet.
*   **Goal**: Buy **YES_TSLAon** (Long Tesla).
*   **Chain**: Ethereum Mainnet (1).

## 1. Key Differences: Mainnet vs. Gnosis

| Feature | Gnosis Chain (100) | Ethereum Mainnet (1) |
| :--- | :--- | :--- |
| **Base Token** | sDAI / xDAI | USDS (`0xdC03...`) |
| **Swap Router** | SushiSwap V3 / Algebra | **Universal Router** (`0x66a9...`) |
| **Approvals (Swap)** | Standard ERC20 | **Permit2** (`0x000...BA3`) |
| **Approvals (Split)** | Standard ERC20 | Standard ERC20 |
| **Gas Costs** | Low (< $0.01) | High ($5 - $50+) |

---

## 2. Contract Addresses (Mainnet)

Based on the provided proposal data:

*   **Futarchy Router**: `0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc`
*   **Universal Router**: `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` (Standard Mainnet Deployment)
*   **Permit2**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

**Tokens**:
*   **Base (USDS)**: `0xdC035D45d973E3EC169d2276DDab16f1e407384F`
*   **Split (YES_USDS)**: `0x87f94FaBA3e8FD5fbb9f49F7e9Ab24E8fC6E7B7E`
*   **Target (YES_TSLAon)**: `0x192e4580d85dc767F81F8AD02428F042E3c1074e`

---

## 3. Step-by-Step Workflow

### Step 1: The Split (Standard ERC20)
The user holds **USDS** and needs **YES_USDS** to swap. This interaction happens with the **Futarchy Router**.

1.  **Approve USDS**:
    *   **Call**: `USDS.approve(FutarchyRouter, Amount)`
    *   **Why**: The Futarchy Router needs permission to pull USDS to split it.
    *   **Note**: This is a *standard* ERC20 approval, NOT Permit2. `FutarchyCartridge.js` uses standard `approve`.

2.  **Split Position**:
    *   **Call**: `FutarchyRouter.splitPosition(Proposal, USDS, Amount)`
    *   **Result**: User sends 100 USDS -> Receives 100 YES_USDS + 100 NO_USDS.

### Step 2: The Swap (Permit2 + Universal Router)
Now the user holds **YES_USDS** and wants to swap for **YES_TSLAon**. This interaction uses the **Universal Router** via `uniswapSdk.js`.

1.  **Approve YES_USDS to Permit2**:
    *   **Call**: `YES_USDS.approve(Permit2, MaxUint)`
    *   **Why**: Universal Router uses Permit2 for token transfers. The user must first allow Permit2 to control their YES_USDS.
    *   **Frequency**: One-time per token.

2.  **Permit2 Signature / Allowance**:
    *   **Call**: `Permit2.approve(YES_USDS, UniversalRouter, Amount, Expiration)`
    *   **Why**: This authorizes the Universal Router to pull the specific amount from the user via Permit2.

3.  **Execute Swap**:
    *   **Call**: `UniversalRouter.execute(Commands, Inputs)`
    *   **Commands**: `V3_SWAP_EXACT_IN` (0x00) + `SWEEP` (0x04).
    *   **Path**: YES_USDS -> [Fee] -> YES_TSLAon.
    *   **Result**: User sends 100 YES_USDS -> Receives ~95 YES_TSLAon.

---

## 4. Technical Analysis: Why this works on Chain 1

The architecture is designed to be chain-agnostic regarding the **Futarchy** logic, while adapting the **Swap** logic to the chain's best-in-class DEX.

1.  **FutarchySDK (`FutarchyCartridge.js`)**:
    *   Uses standard `viem` / `ethers` contract calls.
    *   `splitPosition` and `mergePositions` are standard contract interactions that work identically on Gnosis and Mainnet, provided the `FutarchyRouter` is deployed (which it is: `0xAc9B...`).

2.  **UniswapSDK (`uniswapSdk.js`)**:
    *   Specifically checks `chainId`.
    *   If `chainId === 1` (Mainnet), it defaults to using the **Universal Router** and **Permit2** flow.
    *   It handles the extra complexity of Permit2 approvals automatically (checking allowance -> approving Permit2 -> approving Router).

3.  **Gas Optimization**:
    *   On Mainnet, `Permit2` allows for batched approvals and signature-based permissions, which can save gas compared to multiple standard approvals if used correctly (though the initial setup requires an on-chain approval).
    *   The `UniversalRouter` allows executing multiple commands (Swap + Sweep) in a single transaction.

## 5. Conclusion

Yes, the system is fully capable of handling Chain 1 (Mainnet). The key distinction is the **Swap** step:
*   **Gnosis**: Uses SushiSwap/Algebra (Standard Approvals).
*   **Mainnet**: Uses Universal Router (Permit2 Flow).

The **Split/Merge** logic remains consistent (Standard Approvals) across both chains.
