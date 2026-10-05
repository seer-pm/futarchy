import { ethers } from "ethers";
import { quoteUniswapV3ExactInput } from './uniswapV3Quote.mjs';

/**
 * Get quote from QuoterV2 for accurate pricing with price impact
 * Returns amountOut and sqrtPriceX96After for price impact calculation
 */
export async function getUniswapV3QuoteWithPriceImpact({
  tokenIn,
  tokenOut,
  amountIn,
  fee = 500,
  provider,
  chainId = 1,
  slippageBps = 50
}) {
  if (chainId !== 1) throw new Error(`Uniswap V3 depth quotes are not configured for chain ${chainId}`);

  const quote = await quoteUniswapV3ExactInput({
    provider,
    tokenIn,
    tokenOut,
    amountIn,
    fee,
    slippageBps
  });

  return {
    amountOut: quote.amountOutRaw,
    amountOutRaw: quote.amountOutRaw,
    amountOutFormatted: quote.amountOutFormatted,
    minimumReceived: quote.minimumAmountOutRaw,
    minimumReceivedFormatted: quote.minimumAmountOutFormatted,
    sqrtPriceX96After: quote.sqrtPriceX96After,
    initializedTicksCrossed: quote.initializedTicksCrossed,
    gasEstimate: quote.gasEstimate,
    effectivePrice: quote.executionRate,
    priceImpact: quote.priceImpactPct,
    priceImpactPct: quote.priceImpactPct,
    currentSpotRate: quote.currentSpotRate,
    decimalsIn: quote.decimalsIn,
    decimalsOut: quote.decimalsOut,
    poolAddress: quote.poolAddress,
    feeTier: quote.feeTier
  };
}

/**
 * Calculate price from sqrtPriceX96
 * Price = (sqrtPriceX96 / 2^96)^2
 */
export function sqrtPriceX96ToPrice(sqrtPriceX96) {
  const Q96 = ethers.BigNumber.from(2).pow(96);
  const sqrtPrice = ethers.BigNumber.from(sqrtPriceX96);

  // Price = (sqrtPrice / 2^96)^2
  // To avoid precision loss, we calculate: (sqrtPrice^2) / (2^192)
  const sqrtPriceSquared = sqrtPrice.mul(sqrtPrice);
  const Q192 = Q96.mul(Q96);

  // Convert to decimal for display
  const price = parseFloat(sqrtPriceSquared.toString()) / parseFloat(Q192.toString());

  return price;
}

/**
 * Calculate price impact from before/after sqrt prices
 * Price impact % = ((priceAfter - priceBefore) / priceBefore) * 100
 */
export function calculatePriceImpactFromSqrtPrice(sqrtPriceX96Before, sqrtPriceX96After) {
  try {
    const priceBefore = sqrtPriceX96ToPrice(sqrtPriceX96Before);
    const priceAfter = sqrtPriceX96ToPrice(sqrtPriceX96After);

    const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;

    console.log('[PriceImpact] Calculation:', {
      sqrtPriceX96Before: sqrtPriceX96Before.toString(),
      sqrtPriceX96After: sqrtPriceX96After.toString(),
      priceBefore,
      priceAfter,
      priceImpact: priceImpact.toFixed(4) + '%'
    });

    return priceImpact;
  } catch (error) {
    console.error('[PriceImpact] Error calculating:', error);
    return null;
  }
}

/**
 * Get current pool sqrt price (for before-trade comparison)
 */
export async function getPoolSqrtPrice(tokenIn, tokenOut, fee, provider, chainId) {
  try {
    // Uniswap V3 Pool ABI (just the slot0 function)
    const POOL_ABI = [
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ];

    // Uniswap V3 Factory to get pool address
    const FACTORY_ABI = [
      "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
    ];

    const FACTORY_ADDRESSES = {
      1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      137: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      10: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      42161: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      100: '0x1F98431c8aD98523631AE4a59f267346ea31F984'
    };

    const factoryAddress = FACTORY_ADDRESSES[chainId];
    if (!factoryAddress) {
      throw new Error(`No Uniswap V3 factory for chain ${chainId}`);
    }

    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
    const poolAddress = await factory.getPool(tokenIn, tokenOut, fee);

    if (poolAddress === ethers.constants.AddressZero) {
      throw new Error(`No pool found for ${tokenIn}/${tokenOut} with fee ${fee}`);
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const slot0 = await pool.slot0();

    return {
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      tick: slot0.tick.toString(),
      poolAddress
    };
  } catch (error) {
    console.error('[PoolSqrtPrice] Error:', error);
    throw error;
  }
}
