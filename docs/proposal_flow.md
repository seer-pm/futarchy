# Proposal Creation & Liquidity Setup Flow on Gnosis Chain

This document outlines the technical flow for creating a Futarchy proposal and setting up the required liquidity pools on Gnosis Chain, as implemented in the `futarchy-sdk`.

## 1. Overview

The process consists of three main phases:
1.  **Proposal Creation**: Deploying a new `FutarchyProposal` contract via the factory.
2.  **Token Regulation**: Splitting collateral tokens into conditional tokens (YES/NO outcomes).
3.  **Liquidity Orchestration**: Creating and seeding 6 distinct Algebra liquidity pools to enable trading and price discovery.

## 2. Contracts Involved

| Contract Name | Role |
| :--- | :--- |
| **FutarchyFactory** | Deploys new proposal contracts. |
| **FutarchyProposal** | The main proposal contract. Holds the market parameters, collateral tokens, and refers to conditional tokens. |
| **FutarchyAdapter** | Handles splitting (collateral -> conditional) and merging (conditional -> collateral) of positions. |
| **Algebra PositionManager** | Manages liquidity positions (NFTs) on the decentralized exchange (Swapr/Algebra). |
| **Algebra Factory** | Deploys the actual liquidity pool contracts for token pairs. |

## 3. Configuration & Semi-Auto Mode

The system supports a "Semi-Auto Mode" to streamline the complex setup. This is driven by a configuration object (often loaded from a JSON file) containing:

*   **`spotPrice`**: Current price of the Company Token in terms of Currency Token.
*   **`eventProbability`**: Initial estimated probability of a "YES" outcome (e.g., 0.5).
*   **`impact`**: Expected positive impact on price if "YES" (e.g., 5%).
*   **`liquidityAmounts`**: Array defining how much liquidity to provide for each of the 6 pools.

When `autoMode` is enabled, the script calculates the target initial prices for all pools based on these 3 parameters preventing arbitrage opportunities at genesis.

## 4. Step-by-Step Flow

### Phase 1: Create Proposal
1.  **Input**: Market name, tokens (Company/Currency), opening time, etc.
2.  **Action**: Call `FutarchyFactory.createProposal(...)`.
3.  **Output**: Address of the new `FutarchyProposal` contract.

### Phase 2: Resolve Tokens
The script queries the new Proposal contract to identify the 4 Outcome Tokens:
*   **YES_COMPANY**
*   **NO_COMPANY**
*   **YES_CURRENCY**
*   **NO_CURRENCY**

### Phase 3: The "Six Pools" Setup
To fully enable futarchy signaling, 6 distinct pools are created. The SDK iterates through this list, ensuring each is created and funded.

| Pool # | Pair | Type | Purpose |
| :--- | :--- | :--- | :--- |
| **1** | `YES_COMPANY` / `YES_CURRENCY` | **Price-Correlated** | Trades expected company price *given* YES. |
| **2** | `NO_COMPANY` / `NO_CURRENCY` | **Price-Correlated** | Trades expected company price *given* NO. |
| **3** | `YES_COMPANY` / `CURRENCY` | Expected Value | Trades value of YES outcome for Company. |
| **4** | `NO_COMPANY` / `CURRENCY` | Expected Value | Trades value of NO outcome for Company. |
| **5** | `YES_CURRENCY` / `CURRENCY` | **Prediction Market** | Direct probability of YES outcome. |
| **6** | `NO_CURRENCY` / `CURRENCY` | **Prediction Market** | Direct probability of NO outcome. |

### Phase 4: Token Splitting & Liquidity Provision
For each pool, the SDK performs the following:

1.  **Calculate Amounts**: Determines required amounts of Token A and Token B based on the target price (derived from spot/probability config) and desired liquidity depth.
2.  **Check Balance**: Verifies if the wallet holds the specific outcome tokens (e.g., `YES_COMPANY`).
3.  **Split (If Needed)**:
    *   If the wallet lacks `YES_COMPANY`, it calls `FutarchyAdapter.splitPosition(...)`.
    *   It wraps the underlying collateral (e.g., `Company Token`) into the Conditional Tokens (`YES_COMPANY` + `NO_COMPANY`).
4.  **Create Pool**: Calls `PositionManager.createAndInitializePoolIfNecessary` to deploy the Algebra pool and set the initial square root price.
5.  **Add Liquidity**: Calls `PositionManager.mint` to deposit tokens and create the liquidity position.

## 5. Technical details on "Split"
Splitting is atomic. You cannot mint just "YES"; you must mint "YES" and "NO" together by locking collateral.
*   **Input**: 100 Company Tokens.
*   **Action**: `splitPosition` on Adapter.
*   **Output**: 100 `YES_COMPANY` + 100 `NO_COMPANY`.


The SDK automatically handles this regulation: if you need to provide liquidity for Pool 1 (`YES_COMPANY` / `YES_CURRENCY`), it will split enough Company Tokens to get the `YES` side and enough Currency Tokens to get the `YES` side.

## 6. Technical Deep Dive

### Token Ordering & AMM Logic
Algebra pools (like Uniswap V3) order tokens by address (lexicographical sort) to determine `token0` and `token1`. The "Price" is always expressed as `amount1 / amount0`.

The SDK must reconcile your **Logical Pair** (e.g., "Company vs Currency") with the **AMM's Physical Pair**.

**Example:**
*   **Company Token (C)**: `0xBBBB...`
*   **Currency Token (D)**: `0xAAAA...`

If you want to create a pool for **C / D**:
1.  **Logical**: Base = C, Quote = D. Target Price: 10 D per C.
2.  **Physical**:
    *   `token0` = `0xAAAA...` (Currency) [Because 0xA < 0xB]
    *   `token1` = `0xBBBB...` (Company)
3.  **Inversion**:
    *   The AMM sees the price as `Company / Currency`.
    *   Target AMM Price = 1 / 10 = 0.1 C per D.
    *   The SDK detects this inversion (`isLogicalOrderSameAsAMM = false`) and automatically inverts the initialization price (`sqrtPriceX96`) and the liquidity amounts input.

### Transaction Data Usage (The "Bytes")
When "Splitting" tokens, the SDK calls the specific Gnosis Chain contract. Here is how the transaction data is constructed for a split.

**Function**: `splitPosition(address proposal, address collateralToken, uint256 amount)`
**Signature**: `splitPosition(address,address,uint256)`
**Selector**: `0x(first 4 bytes of keccak256(signature))`

**Example Payload construction:**
Config:
*   Proposal: `0x1234567890123456789012345678901234567890`
*   Collateral: `0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFAB`
*   Amount: `1000` (1000 wei)

**Data Bytes (Calldata):**
```text
0x[Selector]
  [0000000000000000000000001234567890123456789012345678901234567890] (Proposal Address - Padded to 32 bytes)
  [000000000000000000000000ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFAB] (Collateral Address - Padded to 32 bytes)
  [00000000000000000000000000000000000000000000000000000000000003E8] (Amount 1000 in hex - Padded to 32 bytes)
```
This raw byte sequence is what is actually sent in the `data` field of the Gnosis Chain transaction.

### Gas Configuration (Gnosis Chain)
The SDK uses a tuned gas configuration specifically for Gnosis Chain (Chain ID 100) to ensure reliability.

*   **Gas Price**: Default `2.0 gwei` (or `auto` for EIP-1559).
*   **Gas Limits**:
    *   `CREATE_PROPOSAL`: **5,000,000** (Complex factory operation)
    *   `SPLIT_TOKENS`: **15,000,000** (High limit to handle Gnosis Safe/multicall overhead if needed)
    *   `CREATE_POOL`: **16,000,000** (Near block limit approx 17M, ensuring complex pool initialization never OOGs)
    *   `MINT_POSITION`: **15,000,000**


This aggressive gas configuration is critical because `createPool` involves heavy bytecode deployment and initialization logic that can easily fail with standard wallet estimates.

## 7. Deployed Contracts on Gnosis Chain (100)

These are the actual contract addresses used by the SDK for the Mainnet (Gnosis Chain) deployment.

| Role | User Term | Contract Name | Address |
| :--- | :--- | :--- | :--- |
| **Proposal Creator** | "Futarchy Proposal Creator" | **FutarchyFactory** | `0xa6cB18FCDC17a2B44E5cAd2d80a6D5942d30a345` |
| **Splitter/Redeemer** | "Futarchy Router to split" | **FutarchyAdapter** | `0x7495a583ba85875d59407781b4958ED6e0E1228f` |
| **Liquidity & Pools** | "Create pool / Mint position" | **Algebra PositionManager** | `0x91fd594c46d8b01e62dbdebed2401dde01817834` |
| **Swapping** | "Swap" | **Swapr Router (V3)** | `0xffb643e73f280b97809a8b41f7232ab401a04ee1` |

**Note**: The "Router" terminology can be ambiguous.
*   To **Split** tokens (Collateral -> Conditional), we call `splitPosition` on the **FutarchyAdapter**.
*   To **Swap** tokens (Trade), we call the **Swapr Router**.


