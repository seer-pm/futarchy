# Token Mapping API Integration Guide (JavaScript-Only Projects)

**Target Audience:** External projects calling Supabase/Market APIs without React hooks or frontend dependencies.

---

## Overview

This guide explains how to parse the `metadata` JSON from Supabase `market_event` table and construct liquidity pool pairs for display in your JavaScript application.

**Key Points:**
- No React required - Pure JavaScript logic
- Direct API consumption from Supabase
- Token pair construction from JSON metadata
- Pool address and token mapping

---

## 1. Fetching Market Data from Supabase

### API Endpoint Structure

```javascript
// Example: Fetch a single market event
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';

async function fetchMarketEvent(proposalId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/market_event?id=eq.${proposalId}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const data = await response.json();
  return data[0]; // Returns single market event
}
```

### Sample Response Structure

```json
{
  "id": "0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a",
  "title": "Will KIP-81 be approved?",
  "tokens": "PNK, sDAI",
  "pool_yes": "0x37b60f4E9A31A64cCc0024dce7D0fD07eAA0F7B3",
  "pool_no": "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
  "metadata": {
    "chain": 100,
    "companyTokens": { ... },
    "currencyTokens": { ... },
    "conditional_pools": { ... },
    "prediction_pools": { ... }
  }
}
```

---

## 2. Understanding the Metadata Structure

### Core Token Configuration

```javascript
const metadata = {
  // Network configuration
  "chain": 100,  // 100 = Gnosis Chain, 1 = Ethereum

  // CURRENCY TOKENS (typically stablecoin like sDAI)
  "currencyTokens": {
    "base": {
      "tokenSymbol": "sDAI",
      "tokenName": "Savings DAI",
      "wrappedCollateralTokenAddress": "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
      "decimals": 18
    },
    "yes": {
      "tokenSymbol": "YES_sDAI",
      "tokenName": "YES_sDAI",
      "wrappedCollateralTokenAddress": "0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3"
    },
    "no": {
      "tokenSymbol": "NO_sDAI",
      "tokenName": "NO_sDAI",
      "wrappedCollateralTokenAddress": "0xAA4AF50Eb0566B17A6fD169E91a0a376aDAeb76e"
    }
  },

  // COMPANY TOKENS (asset being predicted, e.g., PNK, GNO)
  "companyTokens": {
    "base": {
      "tokenSymbol": "PNK",
      "tokenName": "Kleros",
      "wrappedCollateralTokenAddress": "0x37b60f4E9A31A64cCc0024dce7D0fD07eAA0F7B3",
      "decimals": 18
    },
    "yes": {
      "tokenSymbol": "YES_PNK",
      "tokenName": "YES_PNK",
      "wrappedCollateralTokenAddress": "0x912032f925297Bf6a5a37172dDF822D6c13D576E"
    },
    "no": {
      "tokenSymbol": "NO_PNK",
      "tokenName": "NO_PNK",
      "wrappedCollateralTokenAddress": "0xe7e08944be291967C18e0D9A6E639fDB6A6b13a0"
    }
  },

  // CONDITIONAL POOLS (YES vs YES, NO vs NO cross-asset pairs)
  "conditional_pools": {
    "yes": {
      "address": "0x36D46321ca07e822A6B71E31046dbB4A6f09E415",
      "tokenCompanySlot": 0  // 0 = company token at position 0, 1 = at position 1
    },
    "no": {
      "address": "0x462BB6bB0261B2159b0e3cc763a1499e29afc1F8",
      "tokenCompanySlot": 1
    }
  },

  // PREDICTION POOLS (Outcome token vs Base token)
  "prediction_pools": {
    "yes": {
      "address": "0xfEa7F91D491F51197aeb9C6AB0cBCb67A4db806A",
      "tokenBaseSlot": 1  // 0 = base at position 0, 1 = base at position 1
    },
    "no": {
      "address": "0xF04367c02Ee90A52658e37415DCeC42d668f9E7B",
      "tokenBaseSlot": 1
    }
  }
}
```

---

## 3. Token Extraction Functions

### Pure JavaScript Parser (No React)

```javascript
/**
 * Parse metadata and extract base tokens
 * @param {Object} metadata - Raw metadata from Supabase
 * @returns {Object} Structured token configuration
 */
function parseTokenConfiguration(metadata) {
  // Ensure metadata is an object (might be string in some cases)
  const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

  // Validate required fields
  if (!meta.currencyTokens || !meta.companyTokens) {
    throw new Error('Missing required token configuration in metadata');
  }

  return {
    // Base tokens (non-conditional)
    currency: {
      address: meta.currencyTokens.base.wrappedCollateralTokenAddress,
      symbol: meta.currencyTokens.base.tokenSymbol,
      name: meta.currencyTokens.base.tokenName,
      decimals: meta.currencyTokens.base.decimals || 18
    },
    company: {
      address: meta.companyTokens.base.wrappedCollateralTokenAddress,
      symbol: meta.companyTokens.base.tokenSymbol,
      name: meta.companyTokens.base.tokenName,
      decimals: meta.companyTokens.base.decimals || 18
    },

    // Conditional tokens (YES/NO outcomes)
    yesCurrency: {
      address: meta.currencyTokens.yes.wrappedCollateralTokenAddress,
      symbol: meta.currencyTokens.yes.tokenSymbol,
      name: meta.currencyTokens.yes.tokenName
    },
    noCurrency: {
      address: meta.currencyTokens.no.wrappedCollateralTokenAddress,
      symbol: meta.currencyTokens.no.tokenSymbol,
      name: meta.currencyTokens.no.tokenName
    },
    yesCompany: {
      address: meta.companyTokens.yes.wrappedCollateralTokenAddress,
      symbol: meta.companyTokens.yes.tokenSymbol,
      name: meta.companyTokens.yes.tokenName
    },
    noCompany: {
      address: meta.companyTokens.no.wrappedCollateralTokenAddress,
      symbol: meta.companyTokens.no.tokenSymbol,
      name: meta.companyTokens.no.tokenName
    },

    // Pool addresses
    conditionalPools: meta.conditional_pools,
    predictionPools: meta.prediction_pools,
    basePool: meta.base_pool
  };
}
```

---

## 4. Pool Pair Construction

### Building Pool Pairs for UI Display

```javascript
/**
 * Construct all pool pairs from metadata
 * @param {Object} metadata - Raw metadata from Supabase
 * @returns {Object} Three categories of pool pairs
 */
function constructPoolPairs(metadata) {
  const tokens = parseTokenConfiguration(metadata);

  return {
    // CONDITIONAL POOLS: Same outcome, different assets
    // (YES Company vs YES Currency, NO Company vs NO Currency)
    conditionalPools: [
      {
        id: 'conditional-yes',
        name: `YES ${tokens.company.symbol} / YES ${tokens.currency.symbol}`,
        description: 'Swap between YES outcome tokens across different assets',
        poolAddress: tokens.conditionalPools.yes.address,
        tokenA: {
          address: tokens.yesCompany.address,
          symbol: tokens.yesCompany.symbol,
          name: tokens.yesCompany.name
        },
        tokenB: {
          address: tokens.yesCurrency.address,
          symbol: tokens.yesCurrency.symbol,
          name: tokens.yesCurrency.name
        },
        tokenCompanySlot: tokens.conditionalPools.yes.tokenCompanySlot,
        type: 'CONDITIONAL'
      },
      {
        id: 'conditional-no',
        name: `NO ${tokens.company.symbol} / NO ${tokens.currency.symbol}`,
        description: 'Swap between NO outcome tokens across different assets',
        poolAddress: tokens.conditionalPools.no.address,
        tokenA: {
          address: tokens.noCompany.address,
          symbol: tokens.noCompany.symbol,
          name: tokens.noCompany.name
        },
        tokenB: {
          address: tokens.noCurrency.address,
          symbol: tokens.noCurrency.symbol,
          name: tokens.noCurrency.name
        },
        tokenCompanySlot: tokens.conditionalPools.no.tokenCompanySlot,
        type: 'CONDITIONAL'
      }
    ],

    // PREDICTION POOLS: Outcome token vs Base currency
    // (Bet directly on YES or NO)
    predictionPools: [
      {
        id: 'prediction-yes',
        name: `YES ${tokens.currency.symbol} / ${tokens.currency.symbol}`,
        description: 'Trade base currency for YES outcome tokens',
        poolAddress: tokens.predictionPools.yes.address,
        tokenA: {
          address: tokens.yesCurrency.address,
          symbol: tokens.yesCurrency.symbol,
          name: tokens.yesCurrency.name
        },
        tokenB: {
          address: tokens.currency.address,
          symbol: tokens.currency.symbol,
          name: tokens.currency.name
        },
        tokenBaseSlot: tokens.predictionPools.yes.tokenBaseSlot,
        type: 'PREDICTION'
      },
      {
        id: 'prediction-no',
        name: `NO ${tokens.currency.symbol} / ${tokens.currency.symbol}`,
        description: 'Trade base currency for NO outcome tokens',
        poolAddress: tokens.predictionPools.no.address,
        tokenA: {
          address: tokens.noCurrency.address,
          symbol: tokens.noCurrency.symbol,
          name: tokens.noCurrency.name
        },
        tokenB: {
          address: tokens.currency.address,
          symbol: tokens.currency.symbol,
          name: tokens.currency.name
        },
        tokenBaseSlot: tokens.predictionPools.no.tokenBaseSlot,
        type: 'PREDICTION'
      }
    ],

    // COMPANY TOKEN POOLS: Company outcome vs Base currency
    // (Trade company conditional tokens for stable currency)
    companyTokenPools: [
      {
        id: 'company-yes',
        name: `YES ${tokens.company.symbol} / ${tokens.currency.symbol}`,
        description: 'Trade YES company tokens for stable currency',
        poolAddress: null, // May need to be discovered via factory
        tokenA: {
          address: tokens.yesCompany.address,
          symbol: tokens.yesCompany.symbol,
          name: tokens.yesCompany.name
        },
        tokenB: {
          address: tokens.currency.address,
          symbol: tokens.currency.symbol,
          name: tokens.currency.name
        },
        type: 'COMPANY_TOKEN'
      },
      {
        id: 'company-no',
        name: `NO ${tokens.company.symbol} / ${tokens.currency.symbol}`,
        description: 'Trade NO company tokens for stable currency',
        poolAddress: null, // May need to be discovered via factory
        tokenA: {
          address: tokens.noCompany.address,
          symbol: tokens.noCompany.symbol,
          name: tokens.noCompany.name
        },
        tokenB: {
          address: tokens.currency.address,
          symbol: tokens.currency.symbol,
          name: tokens.currency.name
        },
        type: 'COMPANY_TOKEN'
      }
    ]
  };
}
```

---

## 5. Generating DEX Liquidity Links

### Network-Aware URL Generation

```javascript
/**
 * Generate "Add Liquidity" link based on chain
 * @param {string} tokenA - Token A address
 * @param {string} tokenB - Token B address
 * @param {number} chainId - Chain ID (1 = Ethereum, 100 = Gnosis)
 * @returns {string} External DEX URL
 */
function generateLiquidityUrl(tokenA, tokenB, chainId) {
  if (chainId === 1) {
    // ETHEREUM → Uniswap V3
    const feeParam = encodeURIComponent(JSON.stringify({
      feeAmount: 500,      // 0.05% fee
      tickSpacing: 10,
      isDynamic: false
    }));

    const priceRangeParam = encodeURIComponent(JSON.stringify({
      priceInverted: false,
      fullRange: true,
      minPrice: "",
      maxPrice: "",
      initialPrice: ""
    }));

    const depositParam = encodeURIComponent(JSON.stringify({
      exactField: "TOKEN0",
      exactAmounts: {}
    }));

    return `https://app.uniswap.org/positions/create/v3?currencyA=${tokenA}&currencyB=${tokenB}&chain=ethereum&fee=${feeParam}&hook=undefined&priceRangeState=${priceRangeParam}&depositState=${depositParam}`;
  }

  // GNOSIS CHAIN → Swapr V3
  return `https://v3.swapr.eth.limo/#/add/${tokenA}/${tokenB}/select-pair`;
}

/**
 * Generate "Swap" link based on chain
 */
function generateSwapUrl(inputToken, outputToken, chainId) {
  if (!inputToken || !outputToken) return null;

  if (chainId === 1) {
    return `https://app.uniswap.org/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
  }

  return `https://v3.swapr.eth.limo/#/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
}
```

---

## 6. Understanding Token Slots

### What is `tokenCompanySlot`?

The `tokenCompanySlot` indicates which position (0 or 1) the **company token** occupies in the Uniswap V3 pool.

**Why it matters:**
- Uniswap V3 pools store tokens as `token0` and `token1`
- Price is always calculated as `sqrt(token1 / token0)`
- To get correct price, you need to know which position holds which token

**Example:**

```javascript
// YES Conditional Pool
{
  "poolAddress": "0x36D46321ca07e822A6B71E31046dbB4A6f09E415",
  "tokenCompanySlot": 0  // Company token (YES_PNK) is at position 0
}

// Pool layout:
// token0 = YES_PNK (company)
// token1 = YES_sDAI (currency)

// sqrtPriceX96 represents: sqrt(YES_sDAI / YES_PNK)
// To get YES_PNK price: INVERT the ratio
```

```javascript
// NO Conditional Pool
{
  "poolAddress": "0x462BB6bB0261B2159b0e3cc763a1499e29afc1F8",
  "tokenCompanySlot": 1  // Company token (NO_PNK) is at position 1
}

// Pool layout:
// token0 = NO_sDAI (currency)
// token1 = NO_PNK (company)

// sqrtPriceX96 represents: sqrt(NO_PNK / NO_sDAI)
// To get NO_PNK price: USE the ratio directly
```

### What is `tokenBaseSlot`?

The `tokenBaseSlot` indicates which position (0 or 1) the **base token** (currency) occupies in the prediction pool.

**Used for:**
- Determining swap direction (`zeroForOne`)
- Calculating correct input/output amounts

```javascript
// YES Prediction Pool
{
  "poolAddress": "0xfEa7F91D491F51197aeb9C6AB0cBCb67A4db806A",
  "tokenBaseSlot": 1  // Base token (sDAI) is at position 1
}

// Pool layout:
// token0 = YES_sDAI (conditional)
// token1 = sDAI (base)

// To swap sDAI → YES_sDAI: zeroForOne = false (swap token1 → token0)
// To swap YES_sDAI → sDAI: zeroForOne = true (swap token0 → token1)
```

---

## 7. Complete Example: Fetching and Displaying Pools

```javascript
/**
 * Complete workflow example
 */
async function displayMarketPools(proposalId) {
  try {
    // 1. Fetch market event from Supabase
    const marketEvent = await fetchMarketEvent(proposalId);

    // 2. Parse metadata
    const metadata = typeof marketEvent.metadata === 'string'
      ? JSON.parse(marketEvent.metadata)
      : marketEvent.metadata;

    // 3. Construct pool pairs
    const pools = constructPoolPairs(metadata);

    // 4. Generate liquidity URLs for each pool
    const chainId = metadata.chain || 100;

    const result = {
      marketInfo: {
        id: marketEvent.id,
        title: marketEvent.title,
        tokens: marketEvent.tokens,
        chain: chainId
      },

      conditionalPools: pools.conditionalPools.map(pool => ({
        ...pool,
        liquidityUrl: generateLiquidityUrl(pool.tokenA.address, pool.tokenB.address, chainId),
        swapUrl: generateSwapUrl(pool.tokenA.address, pool.tokenB.address, chainId)
      })),

      predictionPools: pools.predictionPools.map(pool => ({
        ...pool,
        liquidityUrl: generateLiquidityUrl(pool.tokenA.address, pool.tokenB.address, chainId),
        swapUrl: generateSwapUrl(pool.tokenA.address, pool.tokenB.address, chainId)
      })),

      companyTokenPools: pools.companyTokenPools.map(pool => ({
        ...pool,
        liquidityUrl: generateLiquidityUrl(pool.tokenA.address, pool.tokenB.address, chainId),
        swapUrl: generateSwapUrl(pool.tokenA.address, pool.tokenB.address, chainId)
      }))
    };

    return result;

  } catch (error) {
    console.error('Error fetching market pools:', error);
    throw error;
  }
}

// Usage
displayMarketPools('0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a')
  .then(result => {
    console.log('Market Info:', result.marketInfo);
    console.log('Conditional Pools:', result.conditionalPools);
    console.log('Prediction Pools:', result.predictionPools);
    console.log('Company Token Pools:', result.companyTokenPools);
  });
```

### Expected Output Structure

```json
{
  "marketInfo": {
    "id": "0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a",
    "title": "Will KIP-81 be approved?",
    "tokens": "PNK, sDAI",
    "chain": 100
  },
  "conditionalPools": [
    {
      "id": "conditional-yes",
      "name": "YES PNK / YES sDAI",
      "description": "Swap between YES outcome tokens across different assets",
      "poolAddress": "0x36D46321ca07e822A6B71E31046dbB4A6f09E415",
      "tokenA": {
        "address": "0x912032f925297Bf6a5a37172dDF822D6c13D576E",
        "symbol": "YES_PNK",
        "name": "YES_PNK"
      },
      "tokenB": {
        "address": "0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3",
        "symbol": "YES_sDAI",
        "name": "YES_sDAI"
      },
      "tokenCompanySlot": 0,
      "type": "CONDITIONAL",
      "liquidityUrl": "https://v3.swapr.eth.limo/#/add/0x912032f925297Bf6a5a37172dDF822D6c13D576E/0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3/select-pair",
      "swapUrl": "https://v3.swapr.eth.limo/#/swap?inputCurrency=0x912032f925297Bf6a5a37172dDF822D6c13D576E&outputCurrency=0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3"
    },
    {
      "id": "conditional-no",
      "name": "NO PNK / NO sDAI",
      "poolAddress": "0x462BB6bB0261B2159b0e3cc763a1499e29afc1F8",
      "tokenA": { /* ... */ },
      "tokenB": { /* ... */ },
      "tokenCompanySlot": 1,
      "liquidityUrl": "https://v3.swapr.eth.limo/#/add/...",
      "swapUrl": "https://v3.swapr.eth.limo/#/swap?..."
    }
  ],
  "predictionPools": [ /* ... */ ],
  "companyTokenPools": [ /* ... */ ]
}
```

---

## 8. Token Address Lookup Map

### Building a Quick Reference

```javascript
/**
 * Create a token address → symbol lookup map
 * Useful for displaying trade history
 */
function createTokenLookupMap(metadata) {
  const tokens = parseTokenConfiguration(metadata);

  const lookupMap = {};

  // Add all token addresses (lowercase for case-insensitive lookup)
  lookupMap[tokens.currency.address.toLowerCase()] = tokens.currency.symbol;
  lookupMap[tokens.company.address.toLowerCase()] = tokens.company.symbol;
  lookupMap[tokens.yesCurrency.address.toLowerCase()] = tokens.yesCurrency.symbol;
  lookupMap[tokens.noCurrency.address.toLowerCase()] = tokens.noCurrency.symbol;
  lookupMap[tokens.yesCompany.address.toLowerCase()] = tokens.yesCompany.symbol;
  lookupMap[tokens.noCompany.address.toLowerCase()] = tokens.noCompany.symbol;

  return lookupMap;
}

// Usage
const tokenMap = createTokenLookupMap(metadata);
const tokenAddress = '0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3';
const tokenSymbol = tokenMap[tokenAddress.toLowerCase()]; // "YES_sDAI"
```

---

## 9. Validation Helpers

### Ensuring Metadata is Complete

```javascript
/**
 * Validate metadata has all required fields
 * @param {Object} metadata - Metadata to validate
 * @returns {Object} Validation result
 */
function validateMetadata(metadata) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!metadata.currencyTokens) {
    errors.push('Missing currencyTokens configuration');
  } else {
    if (!metadata.currencyTokens.base?.wrappedCollateralTokenAddress) {
      errors.push('Missing currency base token address');
    }
    if (!metadata.currencyTokens.yes?.wrappedCollateralTokenAddress) {
      errors.push('Missing YES currency token address');
    }
    if (!metadata.currencyTokens.no?.wrappedCollateralTokenAddress) {
      errors.push('Missing NO currency token address');
    }
  }

  if (!metadata.companyTokens) {
    errors.push('Missing companyTokens configuration');
  } else {
    if (!metadata.companyTokens.base?.wrappedCollateralTokenAddress) {
      errors.push('Missing company base token address');
    }
    if (!metadata.companyTokens.yes?.wrappedCollateralTokenAddress) {
      errors.push('Missing YES company token address');
    }
    if (!metadata.companyTokens.no?.wrappedCollateralTokenAddress) {
      errors.push('Missing NO company token address');
    }
  }

  // Pool configurations
  if (!metadata.conditional_pools?.yes?.address) {
    warnings.push('Missing YES conditional pool address');
  }
  if (!metadata.conditional_pools?.no?.address) {
    warnings.push('Missing NO conditional pool address');
  }
  if (!metadata.prediction_pools?.yes?.address) {
    warnings.push('Missing YES prediction pool address');
  }
  if (!metadata.prediction_pools?.no?.address) {
    warnings.push('Missing NO prediction pool address');
  }

  // Token slot validations
  if (metadata.conditional_pools?.yes &&
      metadata.conditional_pools.yes.tokenCompanySlot !== 0 &&
      metadata.conditional_pools.yes.tokenCompanySlot !== 1) {
    warnings.push('Invalid tokenCompanySlot for YES conditional pool (must be 0 or 1)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Usage
const validation = validateMetadata(metadata);
if (!validation.isValid) {
  console.error('Invalid metadata:', validation.errors);
} else if (validation.warnings.length > 0) {
  console.warn('Metadata warnings:', validation.warnings);
}
```

---

## 10. Real-World Example (PNK/Kleros Market)

### Input: Supabase API Response

```json
{
  "id": "0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a",
  "title": "Will KIP-81 be approved?",
  "tokens": "PNK, sDAI",
  "metadata": {
    "chain": 100,
    "companyTokens": {
      "base": { "wrappedCollateralTokenAddress": "0x37b60f4E9A31A64cCc0024dce7D0fD07eAA0F7B3", "tokenSymbol": "PNK" },
      "yes": { "wrappedCollateralTokenAddress": "0x912032f925297Bf6a5a37172dDF822D6c13D576E", "tokenSymbol": "YES_PNK" },
      "no": { "wrappedCollateralTokenAddress": "0xe7e08944be291967C18e0D9A6E639fDB6A6b13a0", "tokenSymbol": "NO_PNK" }
    },
    "currencyTokens": {
      "base": { "wrappedCollateralTokenAddress": "0xaf204776c7245bF4147c2612BF6e5972Ee483701", "tokenSymbol": "sDAI" },
      "yes": { "wrappedCollateralTokenAddress": "0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3", "tokenSymbol": "YES_sDAI" },
      "no": { "wrappedCollateralTokenAddress": "0xAA4AF50Eb0566B17A6fD169E91a0a376aDAeb76e", "tokenSymbol": "NO_sDAI" }
    },
    "conditional_pools": {
      "yes": { "address": "0x36D46321ca07e822A6B71E31046dbB4A6f09E415", "tokenCompanySlot": 0 },
      "no": { "address": "0x462BB6bB0261B2159b0e3cc763a1499e29afc1F8", "tokenCompanySlot": 1 }
    },
    "prediction_pools": {
      "yes": { "address": "0xfEa7F91D491F51197aeb9C6AB0cBCb67A4db806A", "tokenBaseSlot": 1 },
      "no": { "address": "0xF04367c02Ee90A52658e37415DCeC42d668f9E7B", "tokenBaseSlot": 1 }
    }
  }
}
```

### Output: Processed Pool Data

```javascript
const result = await displayMarketPools('0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a');

// result.conditionalPools[0] (YES Conditional)
{
  "id": "conditional-yes",
  "name": "YES PNK / YES sDAI",
  "poolAddress": "0x36D46321ca07e822A6B71E31046dbB4A6f09E415",
  "tokenA": {
    "address": "0x912032f925297Bf6a5a37172dDF822D6c13D576E",
    "symbol": "YES_PNK"
  },
  "tokenB": {
    "address": "0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3",
    "symbol": "YES_sDAI"
  },
  "tokenCompanySlot": 0,
  "liquidityUrl": "https://v3.swapr.eth.limo/#/add/0x912032f925297Bf6a5a37172dDF822D6c13D576E/0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3/select-pair"
}

// result.predictionPools[0] (YES Prediction)
{
  "id": "prediction-yes",
  "name": "YES sDAI / sDAI",
  "poolAddress": "0xfEa7F91D491F51197aeb9C6AB0cBCb67A4db806A",
  "tokenA": {
    "address": "0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3",
    "symbol": "YES_sDAI"
  },
  "tokenB": {
    "address": "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    "symbol": "sDAI"
  },
  "tokenBaseSlot": 1,
  "liquidityUrl": "https://v3.swapr.eth.limo/#/add/0xa0A4259eE71831628b7224CcFc1880eeB7E26cc3/0xaf204776c7245bF4147c2612BF6e5972Ee483701/select-pair"
}

// result.companyTokenPools[0] (YES Company)
{
  "id": "company-yes",
  "name": "YES PNK / sDAI",
  "tokenA": {
    "address": "0x912032f925297Bf6a5a37172dDF822D6c13D576E",
    "symbol": "YES_PNK"
  },
  "tokenB": {
    "address": "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    "symbol": "sDAI"
  },
  "liquidityUrl": "https://v3.swapr.eth.limo/#/add/0x912032f925297Bf6a5a37172dDF822D6c13D576E/0xaf204776c7245bF4147c2612BF6e5972Ee483701/select-pair"
}
```

---

## 11. Quick Reference: Token Mapping Flow

```
Supabase API Response
  └─ market_event.metadata (JSON)
       │
       ├─ metadata.currencyTokens.base.wrappedCollateralTokenAddress → Currency Base Token
       ├─ metadata.currencyTokens.yes.wrappedCollateralTokenAddress → YES Currency Token
       ├─ metadata.currencyTokens.no.wrappedCollateralTokenAddress → NO Currency Token
       ├─ metadata.companyTokens.base.wrappedCollateralTokenAddress → Company Base Token
       ├─ metadata.companyTokens.yes.wrappedCollateralTokenAddress → YES Company Token
       ├─ metadata.companyTokens.no.wrappedCollateralTokenAddress → NO Company Token
       │
       ├─ metadata.conditional_pools.yes → { address, tokenCompanySlot }
       ├─ metadata.conditional_pools.no → { address, tokenCompanySlot }
       ├─ metadata.prediction_pools.yes → { address, tokenBaseSlot }
       └─ metadata.prediction_pools.no → { address, tokenBaseSlot }
            │
            ▼
       JavaScript Parser
       (parseTokenConfiguration)
            │
            ▼
       Pool Pair Constructor
       (constructPoolPairs)
            │
            ├─ Conditional Pools: YES_Company/YES_Currency, NO_Company/NO_Currency
            ├─ Prediction Pools: YES_Currency/Currency, NO_Currency/Currency
            └─ Company Pools: YES_Company/Currency, NO_Company/Currency
                 │
                 ▼
            URL Generator
            (generateLiquidityUrl)
                 │
                 └─ External DEX Links (Uniswap V3 or Swapr V3)
```

---

## 12. Common Pitfalls

### Issue 1: Case Sensitivity in Token Addresses
```javascript
// ❌ Wrong - won't match
tokenMap['0xAF204776c7245bF4147c2612BF6e5972Ee483701']

// ✅ Correct - always lowercase
tokenMap['0xaf204776c7245bf4147c2612bf6e5972ee483701']
```

### Issue 2: Metadata as String vs Object
```javascript
// Always handle both cases
const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
```

### Issue 3: Missing Pool Addresses
```javascript
// Always validate before constructing URLs
if (!pool.poolAddress || pool.poolAddress === '0x0000000000000000000000000000000000000000') {
  console.warn('Pool not deployed yet');
  return null;
}
```

### Issue 4: Wrong Token Slot Interpretation
```javascript
// ❌ Wrong - assumes company is always token0
const price = reserve1 / reserve0;

// ✅ Correct - checks tokenCompanySlot
const price = tokenCompanySlot === 0
  ? reserve1 / reserve0  // Company is token0
  : reserve0 / reserve1; // Company is token1
```

---

## 13. Summary: Essential Functions

For a JavaScript-only project, you need these three core functions:

```javascript
// 1. Fetch market data
const marketEvent = await fetchMarketEvent(proposalId);

// 2. Construct pool pairs
const pools = constructPoolPairs(marketEvent.metadata);

// 3. Generate DEX links
const liquidityUrl = generateLiquidityUrl(tokenA, tokenB, chainId);
```

All other functions are helpers for:
- Validation (`validateMetadata`)
- Token lookup (`createTokenLookupMap`)
- Error handling

---

## Conclusion

This guide provides everything needed to integrate futarchy market data into a JavaScript-only application without React or frontend dependencies. The core pattern is:

1. **Fetch** market event from Supabase API
2. **Parse** the `metadata` JSON to extract token addresses
3. **Construct** pool pairs using the token addresses
4. **Generate** external DEX links for liquidity provision

All code examples are pure JavaScript (ES6+) and can be used in Node.js, browser, or any JavaScript runtime.
