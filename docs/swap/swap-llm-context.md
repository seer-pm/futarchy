# Futarchy Swap System: LLM & Developer Context

This document serves as the **Master Context** for the Futarchy Swap workflow. It compacts the architectural logic, chain-specific strategies, and "Smart Split" mechanics into a single reference, linking to detailed technical specifications and real-world examples.

## 1. Core Concept: The "Split-Swap"
Unlike standard AMMs, Futarchy markets require **Outcome Tokens** (YES/NO) to trade. Users typically hold **Collateral** (sDAI, USDS).
*   **The Flow**: `Collateral` -> **Split** -> `YES + NO` -> **Swap** -> `Target Outcome`.
*   **The Goal**: User wants exposure to *one* side (e.g., YES). The system splits collateral and sells the *unwanted* side (NO) or swaps the *wanted* side (YES) for more exposure.

## 2. The "Smart Split" Algorithm
To minimize capital inefficiency, we never split more than necessary.
*   **Formula**: `SplitAmount = Max(0, RequiredInput - CurrentBalance)`
*   **Example**:
    *   **Goal**: Swap 100 YES tokens.
    *   **Wallet**: Holds 5 YES tokens.
    *   **Action**: Split only **95** Collateral (getting 95 YES + 95 NO).
    *   **Result**: 5 (Held) + 95 (Minted) = 100 YES available for swap.

---

## 3. Chain Strategies & Architecture

### A. Gnosis Chain (Chain ID: 100)
**Strategy**: Standard ERC20 Approvals + Direct Router Interaction.
*   **Router**: SushiSwap V3 (`0x592a...`) or Algebra/Swapr (`0xffb6...`).
*   **Approvals**: Standard `approve(Router, amount)`.
*   **Flow**: `Approve Collateral` -> `Split` -> `Approve Outcome Token` -> `Swap`.

**Reference Files**:
*   **Architecture**: [swap-architecture-chain-100.md](./swap-architecture-chain-100.md) (Contract Addresses, Mermaid Diagrams)
*   **MetaMask Example**: [swap-metamask-example-chain-100-swapr.md](./swap-metamask-example-chain-100-swapr.md) (Exact call data for GIP-143/Swapr)

### B. Ethereum Mainnet (Chain ID: 1)
**Strategy**: Permit2 + Universal Router.
*   **Router**: Universal Router (`0x66a9...`).
*   **Approvals**: **Permit2** (`0x0000...`).
*   **Flow**: `Approve Collateral` -> `Split` -> `Approve Permit2 (One-time)` -> `Permit2 Signature` -> `UniversalRouter.execute`.

**Reference Files**:
*   **Architecture**: [swap-architecture-chain-1.md](./swap-architecture-chain-1.md) (Contract Addresses, Mermaid Diagrams)
*   **MetaMask Example**: [swap-metamask-example-chain-1.md](./swap-metamask-example-chain-1.md) (Exact call data for Tesla/Universal Router)

---

## 4. Canonical Test Cases (Real Data)

Use these scenarios to verify logic.

| Scenario | Chain | Market | Tokens | Key Feature |
| :--- | :--- | :--- | :--- | :--- |
| **GIP-143** | 100 | `0xa286...7BA` | sDAI -> YES_GNO | Standard Approval, Swapr/Sushi |
| **Tesla Vote** | 1 | `0xAc9B...8Dc` | USDS -> YES_TSLAon | Permit2, Universal Router |

## 5. Quick Reference: Contract Signatures

**Split (Both Chains)**:
`FutarchyRouter.splitPosition(proposal, collateral, amount)`

**Swap (Chain 100)**:
`Router.exactInputSingle(params)`

**Swap (Chain 1)**:
`UniversalRouter.execute(commands, inputs)`
*   Commands: `0x00` (V3 Swap) + `0x04` (Sweep)
