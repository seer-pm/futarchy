# Hero Market Page Liquidity Documentation

## Overview

This document explains how the futarchy-web application manages liquidity pools, generates "add liquidity" links, and integrates with decentralized exchanges (DEXes) on different blockchain networks.

---

## How Liquidity Works in the Market Page

### Network-Based DEX Routing

The application automatically detects which blockchain network you're using and routes to the appropriate DEX:

| Network | DEX | Pool Type |
|---------|-----|-----------|
| **Ethereum (Chain ID: 1)** | Uniswap V3 | Concentrated Liquidity |
| **Gnosis Chain (Chain ID: 100)** | Swapr V3 (Algebra Protocol) | Concentrated Liquidity |

---

## Example: Ethereum to Gnosis Chain Flow

### Scenario: Adding 100 GNO to a Pool

Let's walk through what happens when a user wants to add liquidity:

**Step 1: User visits the Market Page**
- The page displays all available pools for the current proposal
- Pools are organized into three categories (explained below)

**Step 2: User clicks "Add Liquidity" for a pool**
- The app detects the network (Ethereum or Gnosis Chain)
- Generates the appropriate external link

**For Ethereum:**
```
https://app.uniswap.org/positions/create/v3?
  currencyA=0xToken1Address
  &currencyB=0xToken2Address
  &chain=ethereum
  &fee={"feeAmount":500,"tickSpacing":10,"isDynamic":false}
  &priceRangeState={"fullRange":true}
```

**For Gnosis Chain:**
```
https://v3.swapr.eth.limo/#/add/
  0xToken1Address/
  0xToken2Address/
  select-pair
```

**Step 3: User is redirected to external DEX**
- Uniswap V3 interface (for Ethereum)
- Swapr V3 interface (for Gnosis Chain)
- Token addresses are pre-filled

**Step 4: User provides liquidity amount (e.g., 100 GNO)**
- DEX checks if pool exists, creates if necessary
- User approves tokens for spending
- Liquidity is added to the pool
- User receives an NFT representing their position

---

## Three Types of Liquidity Pools

The market page showcases three categories of pools for each proposal:

### 1. Conditional Pools (Outcome Correlation Pairs)

These pools pair conditional tokens from the **same outcome**:

```
YES GNO / YES sDAI
NO GNO / NO sDAI
```

**Purpose:** Allow traders to swap between different assets while maintaining the same outcome prediction.

**Example:** If you believe Ethereum will go to V3, you can swap your YES_GNO tokens for YES_sDAI tokens without changing your prediction.

**Token Addresses (example):**
- Token A: `YES_GNO` (wrapped conditional token)
- Token B: `YES_sDAI` (wrapped conditional token)

**Pool Address (Gnosis Chain):**
- YES pool: `0xF336F812Db1ad142F22A9A4dd43D40e64B478361`
- NO pool: `0xfbf1BE5CE2f9056dAaB1C368EC241ad7Be3507A8`

---

### 2. Prediction Pools (Outcome vs Base Currency)

These pools pair outcome tokens with the **base currency** (typically sDAI):

```
YES sDAI / sDAI
NO sDAI / sDAI
```

**Purpose:** Allow users to bet directly on outcomes by trading base currency for outcome tokens.

**Example:** You can swap 100 sDAI for YES_sDAI tokens if you believe the outcome will happen, or NO_sDAI tokens if you believe it won't.

**Token Addresses (example):**
- Token A: `YES_sDAI` (wrapped conditional token)
- Token B: `sDAI` (base currency: `0xaf204776c7245bF4147c2612BF6e5972Ee483701`)

**Pool Address (Gnosis Chain):**
- YES pool: `0x19109DB1e35a9Ba50807aedDa244dCfFc634EF6F`
- NO pool: `0xb0F38743e0d55D60d5F84112eDFb15d985a4415e`

---

### 3. Company Token Pools (Company Outcome vs Base Currency)

These pools pair company outcome tokens with the **base currency**:

```
YES GNO / sDAI
NO GNO / sDAI
```

**Purpose:** Allow direct trading of company outcome tokens against stable currency.

**Example:** You can swap 100 GNO worth of YES_GNO tokens for sDAI, or vice versa.

**Token Addresses (example):**
- Token A: `YES_GNO` (wrapped conditional token)
- Token B: `sDAI` (base currency)

**Pool Address:** Dynamically discovered via Algebra Factory

---

## How "Add Liquidity" Links are Generated

### Code Location
[MarketPageShowcase.jsx](../src/components/futarchyFi/marketPage/MarketPageShowcase.jsx)

### URL Generation Function

```javascript
const createSwaprUrl = (tokenA, tokenB) => {
  if (config?.chainId === 1) {
    // ETHEREUM MAINNET → Uniswap V3
    const feeParam = encodeURIComponent(JSON.stringify({
      feeAmount: 500,      // 0.05% fee tier
      tickSpacing: 10,
      isDynamic: false
    }));

    const priceRangeParam = encodeURIComponent(JSON.stringify({
      fullRange: true,     // Full range liquidity
      minPrice: "",
      maxPrice: "",
      initialPrice: ""
    }));

    return `https://app.uniswap.org/positions/create/v3?currencyA=${tokenA}&currencyB=${tokenB}&chain=ethereum&fee=${feeParam}&priceRangeState=${priceRangeParam}`;
  }

  // GNOSIS CHAIN → Swapr V3 (Algebra Protocol)
  return `https://v3.swapr.eth.limo/#/add/${tokenA}/${tokenB}/select-pair`;
};
```

### Key Parameters

**For Uniswap V3 (Ethereum):**
- `currencyA` & `currencyB`: Token addresses
- `feeAmount`: 500 (0.05% trading fee)
- `fullRange`: true (liquidity across entire price range)
- `chain`: ethereum

**For Swapr V3 (Gnosis Chain):**
- Token addresses in URL path
- Pool parameters set on Swapr interface
- Dynamic fee tier selection

---

## Pool Address Discovery

### How the App Finds Pool Addresses

Pools aren't hardcoded—they're discovered dynamically using the Algebra Factory contract:

```javascript
// File: src/components/refactor/utils/poolUtils.js

export const findPoolByPair = async (tokenA, tokenB) => {
  const factory = await getAlgebraFactory();
  const poolAddress = await factory.poolByPair(tokenA, tokenB);
  return poolAddress;
};
```

**Algebra Factory Address (Gnosis Chain):**
`0x91fd594c46d8b01e62dbdebed2401dde01817834`

**Position Manager (NFT-PM):**
`0x91fd594c46d8b01e62dbdebed2401dde01817834`

**Swapr V3 Router:**
`0xffb643e73f280b97809a8b41f7232ab401a04ee1`

---

## Complete Liquidity Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Opens Market Page                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. App Detects Network                                      │
│    • Ethereum (Chain 1) → Uniswap V3                        │
│    • Gnosis Chain (Chain 100) → Swapr V3                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Loads Token Addresses from Config                        │
│    • Base Tokens: sDAI, GNO                                 │
│    • Conditional Tokens: YES_sDAI, NO_sDAI, YES_GNO, NO_GNO│
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Constructs Pool Categories                               │
│    • Conditional Pools (YES/YES, NO/NO pairs)              │
│    • Prediction Pools (Outcome vs Currency)                │
│    • Company Pools (Company Outcome vs Currency)           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Generates External DEX Links                             │
│    • Token addresses pre-filled                             │
│    • Fee tiers configured                                   │
│    • Price range set to full range                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. User Clicks "Add Liquidity"                              │
│    → Opens Uniswap V3 or Swapr V3 interface                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. External DEX Checks Pool Existence                       │
│    • Queries Algebra Factory: poolByPair(tokenA, tokenB)   │
│    • If pool doesn't exist → Creates new pool              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. User Provides Liquidity                                  │
│    Example: 100 GNO + equivalent sDAI                       │
│    • Approves tokens for spending                           │
│    • Sets price range (or uses full range)                  │
│    • Confirms transaction                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Position Manager Mints Liquidity NFT                     │
│    • User receives NFT representing their position          │
│    • Liquidity is now active in the pool                    │
│    • User earns trading fees from swaps                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Automated Pool Creation (CLI)

The application includes a CLI tool for automated pool creation and management:

### Location
[algebra-cli.js](../swapr/algebra-cli.js)

### Commands

```bash
# Create a new proposal with pools
npm run futarchy:create

# Automated pool setup from config
npm run futarchy:auto futarchy-config.json

# Full automation workflow
npm run automate

# Preview automation (dry run)
npm run automate-dry

# Generate pool API files
npm run generate-pools

# Execute pool creation API calls
npm run call-pool-apis

# Preview API calls
npm run call-pool-apis-dry
```

### Pool Creation Process

**Step 1: Check if pool exists**
```javascript
const poolAddress = await factory.poolByPair(tokenA, tokenB);
if (poolAddress === '0x0000000000000000000000000000000000000000') {
  // Pool doesn't exist, need to create
}
```

**Step 2: Create and initialize pool**
```javascript
await positionManager.createAndInitializePoolIfNecessary(
  token0Address,
  token1Address,
  sqrtPriceX96,  // Initial price encoded as sqrt(price) * 2^96
  gasOptions
);
```

**Step 3: Mint liquidity position**
```javascript
await positionManager.mint({
  token0,
  token1,
  tickLower: -887220,   // Full range
  tickUpper: 887220,    // Full range
  amount0Desired: '1000000000000000000',  // 1.0 token0
  amount1Desired: '1000000000000000000',  // 1.0 token1
  amount0Min: 0,
  amount1Min: 0,
  recipient: walletAddress,
  deadline: Math.floor(Date.now() / 1000) + 60 * 20  // 20 minutes
});
```

**Step 4: Collect fees (optional)**
```javascript
await positionManager.collect({
  tokenId: positionNftId,
  recipient: walletAddress,
  amount0Max: MaxUint128,
  amount1Max: MaxUint128
});
```

---

## Smart Contract Configuration

### Gnosis Chain (Chain ID: 100)

**Base Tokens:**
- **sDAI** (Savings DAI): `0xaf204776c7245bF4147c2612BF6e5972Ee483701`
- **GNO** (Gnosis Token): `0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb`

**DEX Contracts:**
- **Algebra Factory**: `0x91fd594c46d8b01e62dbdebed2401dde01817834`
- **Position Manager**: `0x91fd594c46d8b01e62dbdebed2401dde01817834`
- **Swapr V3 Router**: `0xffb643e73f280b97809a8b41f7232ab401a04ee1`
- **CoW Swap Settlement**: `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`

**Known Pool Addresses:**
- **YES Prediction Pool**: `0x19109DB1e35a9Ba50807aedDa244dCfFc634EF6F`
- **NO Prediction Pool**: `0xb0F38743e0d55D60d5F84112eDFb15d985a4415e`
- **YES Conditional Pool**: `0xF336F812Db1ad142F22A9A4dd43D40e64B478361`
- **NO Conditional Pool**: `0xfbf1BE5CE2f9056dAaB1C368EC241ad7Be3507A8`

### Ethereum Mainnet (Chain ID: 1)

**DEX Contracts:**
- **Uniswap V3 Factory**: `0x1F98431c8aD98523631AE4a59f267346ea31F984`
- **Uniswap V3 Position Manager**: `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`
- **Uniswap V3 Router**: `0xE592427A0AEce92De3Edee1F18E0157C05861564`
- **Universal Router**: `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD`

---

## Fee Configuration

### Trading Fees

| Pool Type | Fee Tier | Percentage |
|-----------|----------|------------|
| Conditional Pools | 500 | 0.05% |
| Prediction Pools | 500 | 0.05% |
| Company Token Pools | 500 | 0.05% |

The 0.05% fee tier matches the Uniswap V3 standard for stablecoin pairs and is used across all pool types.

### Gas Configuration

From `algebra-cli.js`:

```javascript
const GAS_LIMITS = {
  CREATE_POOL: 16_000_000,
  MINT_POSITION: 15_000_000,
  SWAP: 350_000,
  APPROVAL: 100_000
};
```

---

## Token Approval Flow

Before adding liquidity, tokens must be approved:

**Step 1: ERC20 Approval**
```javascript
await tokenContract.approve(
  positionManagerAddress,
  MaxUint256  // Unlimited approval
);
```

**Step 2: (Uniswap V3 only) Permit2 Approval**
```javascript
await tokenContract.approve(
  permit2Address,
  MaxUint256
);
```

**Step 3: (Uniswap V3 only) Permit2 to Universal Router**
```javascript
await permit2Contract.approve(
  tokenAddress,
  universalRouterAddress,
  MaxUint160,
  MaxUint48
);
```

---

## Pool Discovery and Classification

### File Location
[poolUtils.js](../src/components/refactor/utils/poolUtils.js)

### Pool Type Detection

```javascript
export const detectPoolType = (tokenA, tokenB, tokenASymbol, tokenBSymbol) => {
  const isTokenAConditional = tokenASymbol.startsWith('YES_') ||
                               tokenASymbol.startsWith('NO_');
  const isTokenBConditional = tokenBSymbol.startsWith('YES_') ||
                               tokenBSymbol.startsWith('NO_');

  if (isTokenAConditional && !isTokenBConditional) {
    return 'PREDICTION_MARKET';  // Outcome + base token
  }

  if (isTokenAConditional && isTokenBConditional) {
    return 'CONDITIONAL_CORRELATED';  // YES + YES or NO + NO
  }

  if (!isTokenAConditional && !isTokenBConditional) {
    return 'REGULAR_POOL';  // Two base tokens
  }

  return 'UNKNOWN';
};
```

### Discovering All Pools for a Proposal

```javascript
export const discoverFutarchyPools = async (proposalTokens) => {
  const pools = [];

  // 1-2: Prediction pools (YES/NO outcome vs currency)
  pools.push(await findPoolByPair(yesTokenCurrency, baseCurrency));
  pools.push(await findPoolByPair(noTokenCurrency, baseCurrency));

  // 3-4: Conditional pools (YES/YES, NO/NO cross-asset)
  pools.push(await findPoolByPair(yesTokenCompany, yesTokenCurrency));
  pools.push(await findPoolByPair(noTokenCompany, noTokenCurrency));

  // 5-6: Company token pools (YES/NO company vs currency)
  pools.push(await findPoolByPair(yesTokenCompany, baseCurrency));
  pools.push(await findPoolByPair(noTokenCompany, baseCurrency));

  return pools.filter(p => p !== '0x0000000000000000000000000000000000000000');
};
```

---

## UI Components

### Market Page Showcase
[MarketPageShowcase.jsx](../src/components/futarchyFi/marketPage/MarketPageShowcase.jsx)

**Features:**
- Displays all pools with token pair names
- "Add Liquidity" button with external DEX link
- "View Pool" button to see pool details
- Organized into collapsible sections (Conditional, Prediction, Company)
- Network-aware DEX routing

**Modal Display:**
```javascript
<button onClick={() => window.open(createSwaprUrl(tokenA, tokenB), '_blank')}>
  Add Liquidity →
</button>
```

---

## Example Workflow: Adding 100 GNO Liquidity on Gnosis Chain

**Step 1:** User visits market page for a proposal

**Step 2:** User sees pool options:
- YES GNO / YES sDAI (Conditional Pool)
- NO GNO / NO sDAI (Conditional Pool)
- YES GNO / sDAI (Company Token Pool) ← User selects this
- NO GNO / sDAI (Company Token Pool)
- YES sDAI / sDAI (Prediction Pool)
- NO sDAI / sDAI (Prediction Pool)

**Step 3:** User clicks "Add Liquidity" for "YES GNO / sDAI" pool

**Step 4:** Browser opens Swapr V3 interface:
```
https://v3.swapr.eth.limo/#/add/
0x[YES_GNO_ADDRESS]/
0xaf204776c7245bF4147c2612BF6e5972Ee483701/
select-pair
```

**Step 5:** Swapr interface shows:
- Token A: YES_GNO
- Token B: sDAI
- Pool status: Active (or "Create Pool" if doesn't exist)

**Step 6:** User enters amounts:
- 100 YES_GNO tokens
- Equivalent sDAI (calculated by Swapr based on current price)

**Step 7:** User clicks "Approve YES_GNO"
- Transaction 1: Approve YES_GNO spending

**Step 8:** User clicks "Approve sDAI"
- Transaction 2: Approve sDAI spending

**Step 9:** User clicks "Add Liquidity"
- Transaction 3: Mint liquidity position
- Gas cost: ~15,000,000 gas units

**Step 10:** User receives NFT
- NFT represents liquidity position
- Can view position in Swapr interface
- Earns 0.05% fee on all trades in pool

**Step 11:** User returns to futarchy-web
- Market page now shows updated pool liquidity
- User's position is tracked on Swapr, not in futarchy-web

---

## Key Files Reference

| File | Purpose |
|------|---------|
| [MarketPageShowcase.jsx](../src/components/futarchyFi/marketPage/MarketPageShowcase.jsx) | UI for displaying pools and liquidity links |
| [poolUtils.js](../src/components/refactor/utils/poolUtils.js) | Pool discovery and classification |
| [addresses.js](../src/components/refactor/constants/addresses.js) | Known pool and contract addresses |
| [algebra-cli.js](../swapr/algebra-cli.js) | Automated pool creation CLI |
| [liquidityManager.js](../src/futarchyJS/liquidityManager.js) | Legacy SushiSwap V2 liquidity management |
| [uniswapV3Helper.js](../src/utils/uniswapV3Helper.js) | Uniswap V3 protocol integration |
| [swaprSdk.js](../src/utils/swaprSdk.js) | Swapr SDK integration |

---

## Troubleshooting

### Pool Not Found
- Check if pool exists using `findPoolByPair(tokenA, tokenB)`
- Pool may need to be created using CLI or DEX interface
- Verify token addresses are correct

### Transaction Fails
- Ensure sufficient gas (15M+ for pool operations)
- Check token approvals are set
- Verify token balances are sufficient

### Wrong DEX Interface
- Verify network in wallet (Ethereum vs Gnosis Chain)
- App should auto-detect network
- Force refresh if network changed

---

## Future Enhancements

Potential improvements to liquidity system:

1. **In-app liquidity provision** - Add liquidity without leaving futarchy-web
2. **LP position tracking** - Display user's liquidity positions on market page
3. **Fee earnings display** - Show accumulated fees from providing liquidity
4. **Multi-network support** - Expand to Arbitrum, Optimism, Polygon
5. **Alternative DEX integrations** - Support Balancer, Curve for specialized pools
6. **Dynamic fee tiers** - Adjust fees based on volatility and volume

---

## Conclusion

The futarchy-web liquidity system provides a sophisticated integration with leading DEXes (Uniswap V3 and Swapr V3) to enable seamless liquidity provision for conditional token markets. By automatically routing users to the appropriate DEX based on their network and pre-filling token addresses, the system reduces friction and makes liquidity provision accessible to all participants.

The three-tier pool structure (Conditional, Prediction, and Company Token pools) provides multiple ways for users to participate in markets and earn fees, while the automated CLI tools enable efficient pool creation and management for proposal creators.
