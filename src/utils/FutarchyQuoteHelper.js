import { ethers } from "ethers";
import { selectSwapDeltas } from "./swapQuoteMath.js";

/**
 * @title Futarchy Quote Helper
 * @notice Simple utility to get swap quotes from the FutarchyArbitrageHelper.
 */

// 🚀 CONFIGURATION
export const HELPER_ADDRESS = "0xe32bfb3DD8bA4c7F82dADc4982c04Afa90027EFb"; // Verified Gnosis Contract (With endSqrtPrice & Inversion)
const HELPER_ABI = [
    "function simulateQuote(address proposal, bool isYesPool, uint8 inputType, uint256 amountIn) external returns (tuple(int256 amount0Delta, int256 amount1Delta, uint160 startSqrtPrice, uint160 endSqrtPrice, bytes debugReason, bool isToken0Outcome))"
];

/**
 * Get a detailed swap quote for a Futarchy Proposal.
 * 
 * @param {Object} params - The parameters object.
 * @param {string} params.proposal - Address of the proposal.
 * @param {string} params.amount - Amount to swap as a string (e.g. "1.5").
 * @param {boolean} params.isYesPool - TRUE for YES Pool, FALSE for NO Pool.
 * @param {boolean} params.isInputCompanyToken - TRUE if selling Company Token (Outcome), FALSE if selling Currency (Collateral).
 * @param {number} params.slippagePercentage - Slippage tolerance (e.g. 0.03 for 3%).
 * @param {Object} provider - Ethers.js Provider or Signer.
 * 
 * @returns {Promise<Object>} JSON object with quote details.
 */
export async function getSwapQuote({ proposal, amount, isYesPool, isInputCompanyToken, slippagePercentage }, provider) {
    if (!provider) {
        throw new Error("Provider required for getSwapQuote");
    }

    // 1. Setup
    const helper = new ethers.Contract(HELPER_ADDRESS, HELPER_ABI, provider);

    // Handle empty or invalid amount
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return null;
    }

    const amountBig = ethers.utils.parseEther(amount); // v5 uses utils.parseEther

    // 2. Determine Input Type
    // Contract expects: 0 = Company Token, 1 = Currency Token
    const inputType = isInputCompanyToken ? 0 : 1;

    // 3. Simulate (StaticCall is CRITICAL)
    // The simulate call uses ~6.8M gas in practice. Stay below the Gnosis
    // block gas limit (~17M) — public RPCs like gnosis-rpc.publicnode.com
    // reject eth_call with gas > block limit ("Block gas limit exceeded").
    const txOverrides = { gasLimit: 12_000_000 };

    let result;
    try {
        result = await helper.callStatic.simulateQuote(proposal, isYesPool, inputType, amountBig, txOverrides); // v5 uses callStatic
    } catch (error) {
        console.error("Simulation Failed:", error.message);
        // Keep the original error (code, reason) so callers can tell an RPC
        // failure from a reverted simulation.
        const wrapped = new Error(`Quote simulation failed: ${error.reason || error.code || 'unknown error'}`);
        wrapped.cause = error;
        wrapped.code = error.code;
        wrapped.reason = error.reason;
        throw wrapped;
    }

    // 4. Parse Results
    // Pool-side deltas: positive = paid into the pool (input), negative =
    // paid out (output). A thin pool that stops at its price limit consumes
    // less than amountIn — flagged as a partial fill.
    const { amountOut: amountOutRaw, amountInConsumed, isPartialFill } = selectSwapDeltas({
        amount0Delta: result.amount0Delta.toString(),
        amount1Delta: result.amount1Delta.toString(),
        amountIn: amountBig.toString(),
    });
    const amountOutBig = ethers.BigNumber.from(amountOutRaw.toString());

    // 5. Calculations
    const expectedReceive = ethers.utils.formatEther(amountOutBig);

    // Min Receive = Expected * (1 - slippage), using BigNumber for precision
    const slippageBps = Math.round(slippagePercentage * 10000);
    const minReceiveBN = amountOutBig.mul(10000 - slippageBps).div(10000);
    const minReceive = ethers.utils.formatEther(minReceiveBN);

    // Prices
    const amountInNum = Number(amount);
    const amountOutNum = Number(expectedReceive);

    // Execution Price should always be "Currency per Asset" (Collateral / Outcome)
    // If Selling Asset (Input=Asset, Output=Currency): Price = Out/In
    // If Buying Asset (Input=Currency, Output=Asset):  Price = In/Out
    let executionPriceVal = 0;
    if (amountInNum > 0 && amountOutNum > 0) {
        if (isInputCompanyToken) {
            executionPriceVal = amountOutNum / amountInNum;
        } else {
            executionPriceVal = amountInNum / amountOutNum;
        }
    }

    // Current Pool Price (from sqrtPrice)
    const startSqrtPrice = result.startSqrtPrice;
    let currentPoolPrice = calculatePriceFromSqrt(startSqrtPrice);

    // Price After
    const endSqrtPrice = result.endSqrtPrice;
    let priceAfterNum = 0;
    if (endSqrtPrice.gt(0)) {
        priceAfterNum = calculatePriceFromSqrt(endSqrtPrice);
    }

    // Inversion Logic
    // isToken0Outcome: T0=Outcome, T1=Currency -> Price = T1/T0 = Curr/Out (Correct)
    // !isToken0Outcome: T0=Currency, T1=Outcome -> Price = T1/T0 = Out/Curr (Inverted)
    let isInverted = false;
    if (!result.isToken0Outcome) {
        currentPoolPrice = (currentPoolPrice > 0) ? 1 / currentPoolPrice : 0;
        priceAfterNum = (priceAfterNum > 0) ? 1 / priceAfterNum : 0;
        isInverted = true;
    }

    return {
        expectedReceive: expectedReceive,
        minReceive: minReceive,
        slippagePct: slippagePercentage,
        currentPoolPrice: currentPoolPrice.toFixed(6),
        priceAfter: priceAfterNum.toFixed(6),
        executionPrice: executionPriceVal.toFixed(6),
        startSqrtPrice: startSqrtPrice.toString(),
        endSqrtPrice: endSqrtPrice.toString(),
        isInverted: isInverted,
        // The pool could not absorb the whole amount (it hit its price limit)
        partialFill: isPartialFill,
        // Raw big ints if needed
        raw: {
            amountIn: amountBig.toString(), // Convert to string for safety in JSON
            amountInConsumed: amountInConsumed.toString(),
            amountOut: amountOutBig.toString()
        }
    };
}

// Internal: Calc Price from SqrtX96
function calculatePriceFromSqrt(sqrtPriceX96) {
    // Price = (sqrtPrice / 2^96) ^ 2

    // Ethers v5: Convert to string/number carefully for price math
    // Precision: JS Number is double precision (15-17 digits), usually enough for prices
    const sqrtPriceStr = sqrtPriceX96.toString();
    const curr = Number(sqrtPriceStr) / (2 ** 96);
    return curr * curr;
}
