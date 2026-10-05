# Algebra Quoter Direct Implementation Research

## Problem Statement
The `@swapr/sdk` makes **hundreds of RPC calls** (420+ observed) for a single quote, causing CORS errors and performance issues. We need to bypass the SDK and call the Algebra Quoter contract directly.

## Contract Addresses (Gnosis Chain - Chain ID 100)

```javascript
const ALGEBRA_QUOTER = "0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7";
const ALGEBRA_ROUTER = "0xfFB643E73f280B97809A8b41f7232AB401a04ee1";
const MULTICALL = "0xc4B85BaF01cD7D1C8F08a8539ba96C205782BBcf";
const POOL_DEPLOYER = "0xC1b576AC6Ec749d5Ace1787bF9Ec6340908ddB47";
```

## Required ABIs

### 1. Quoter Contract (Most Important)

```javascript
const ALGEBRA_QUOTER_ABI = [
  // Single-hop quote (exact input)
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",

  // Multi-hop quote (exact input) - path encoded as packed addresses
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)",

  // Single-hop quote (exact output)
  "function quoteExactOutputSingle(address tokenIn, address tokenOut, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)",

  // Multi-hop quote (exact output)
  "function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn)"
];
```

### 2. Pool Contract (For Additional Info)

```javascript
const ALGEBRA_POOL_ABI = [
  // Get current pool state
  "function globalState() external view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)",

  // Get current liquidity
  "function liquidity() external view returns (uint128)",

  // Get token addresses
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];
```

### 3. Token Contract (Standard ERC20)

```javascript
const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function balanceOf(address) external view returns (uint256)"
];
```

## How Swapr SDK Works (Current Flow)

### Step 1: Token Setup
- Converts native tokens to wrapped (e.g., XDAI → WXDAI)
- Validates token addresses

### Step 2: Route Discovery (THIS IS WHERE IT MAKES TOO MANY CALLS)
```javascript
// SDK creates multiple routes using base tokens
const BASE_TOKENS = [WXDAI, USDC, WETH, GNO];

// For each pair, it:
1. Computes pool address using CREATE2
2. Calls pool.globalState() to check if pool exists
3. Calls pool.liquidity() to check if pool has liquidity
4. Repeats for EVERY possible route combination
```

### Step 3: Batch Quote (Using Multicall)
- Creates multicall payload with all routes
- Calls quoter for each route
- **THIS IS STILL TOO MANY CALLS**

### Step 4: Best Route Selection
- Compares all quotes
- Returns best route with maximum output

## Direct Implementation (Efficient)

### Minimum RPC Calls Required

**For single-hop direct quote:**
```
1 RPC call: quoter.quoteExactInputSingle()
```

**For quote with pool info:**
```
1 RPC call: pool.globalState() (optional, for fee info)
1 RPC call: quoter.quoteExactInputSingle()
Total: 2 RPC calls
```

### Implementation Code

```javascript
import { ethers } from 'ethers';

const ALGEBRA_QUOTER = "0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7";

const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

/**
 * Get quote directly from Algebra Quoter
 * Makes only 1 RPC call!
 */
export async function getAlgebraQuoteDirect({
  tokenIn,
  tokenOut,
  amountIn,
  provider
}) {
  const quoterContract = new ethers.Contract(
    ALGEBRA_QUOTER,
    QUOTER_ABI,
    provider
  );

  try {
    // Use callStatic since quoter functions aren't view functions
    const amountOut = await quoterContract.callStatic.quoteExactInputSingle(
      tokenIn,
      tokenOut,
      amountIn,
      0  // sqrtPriceLimitX96 = 0 means no price limit
    );

    return amountOut;
  } catch (error) {
    console.error('Quoter call failed:', error);
    throw error;
  }
}
```

### With Slippage Calculation

```javascript
export async function getAlgebraQuoteWithSlippage({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps = 50, // 0.5%
  provider,
  poolAddress // Optional: for getting current pool price
}) {
  // 1. Get quote (1 RPC call)
  const amountOut = await getAlgebraQuoteDirect({
    tokenIn,
    tokenOut,
    amountIn,
    provider
  });

  // 2. Calculate minimum amount with slippage
  const slippageFactor = ethers.BigNumber.from(10000 - slippageBps);
  const minAmountOut = amountOut.mul(slippageFactor).div(10000);

  // 3. Optional: Get current pool price for slippage calculation
  let currentPrice = null;
  if (poolAddress) {
    const poolContract = new ethers.Contract(
      poolAddress,
      ["function globalState() external view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)"],
      provider
    );

    const globalState = await poolContract.globalState();
    const sqrtPriceX96 = globalState.price;

    // Convert sqrtPriceX96 to actual price
    const Q96 = ethers.BigNumber.from(2).pow(96);
    const sqrtPriceSquared = sqrtPriceX96.mul(sqrtPriceX96);
    const Q192 = Q96.mul(Q96);
    currentPrice = parseFloat(sqrtPriceSquared.toString()) / parseFloat(Q192.toString());
  }

  return {
    amountOut: amountOut.toString(),
    minAmountOut: minAmountOut.toString(),
    currentPrice,
    slippageBps
  };
}
```

## Key Differences from SDK

| Aspect | Swapr SDK | Direct Implementation |
|--------|-----------|----------------------|
| RPC Calls | 420+ | 1-2 |
| Routes Checked | Multiple (all base pairs) | Single direct route |
| Pool Discovery | Yes (expensive) | No (uses known pool address) |
| Multicall | Yes | No (not needed for single quote) |
| Duration | 8+ seconds | <500ms |
| CORS Issues | Yes (too many calls) | No |

## Important Notes

### 1. callStatic Required
The quoter functions are NOT `view` functions, so you must use `callStatic`:
```javascript
// ❌ WRONG - Will fail
const quote = await quoter.quoteExactInputSingle(...);

// ✅ CORRECT
const quote = await quoter.callStatic.quoteExactInputSingle(...);
```

### 2. Token Order Doesn't Matter
Unlike direct pool interactions, the Quoter handles token ordering internally. You don't need to sort tokens.

### 3. sqrtPriceLimitX96 Parameter
- Set to `0` for no price limit (recommended for quotes)
- Used to set maximum/minimum acceptable price during swap execution
- Not relevant for quote-only operations

### 4. Gas Limit
SDK uses 2,000,000 gas limit for quote calls, but actual quote uses very little gas since it's `callStatic`.

### 5. Revert Strings
If quote fails, check for:
- `"LOK"` - Pool is locked
- `"IIA"` - Insufficient input amount
- `"AS"` - Price limit reached (if using sqrtPriceLimitX96 != 0)

## Migration Plan

### Step 1: Create New Utility
Create `src/utils/algebraQuoter.js` with direct quoter implementation

### Step 2: Update ConfirmSwapModal
Replace `getSwaprV3QuoteWithPriceImpact()` calls with `getAlgebraQuoteDirect()`

### Step 3: Remove SDK Dependency
Can optionally remove `@swapr/sdk` from `package.json` after migration

### Step 4: Test
Verify quotes match previous SDK quotes (they should be identical)

## Testing Checklist

- [ ] Single-hop quote works (tokenA → tokenB)
- [ ] Quote matches SDK quote (within 0.01%)
- [ ] Only 1-2 RPC calls made (check Network tab)
- [ ] No CORS errors
- [ ] Quote completes in <500ms
- [ ] Slippage calculation correct
- [ ] Error handling for reverts
- [ ] Works with all token pairs (YES/NO pools)

## References

- Algebra Quoter Contract: [0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7](https://gnosisscan.io/address/0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7)
- Algebra Docs: [docs.algebra.finance](https://docs.algebra.finance)
- Gnosis Chain Explorer: [gnosisscan.io](https://gnosisscan.io)
