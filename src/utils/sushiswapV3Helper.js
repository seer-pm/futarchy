import { ethers } from 'ethers';
// Add CoW SDK imports
import { CowSdk, OrderKind } from '@gnosis.pm/cow-sdk';
// Add necessary config imports if not already present
import {
  BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG,
  // ... other necessary config imports
} from '../components/futarchyFi/marketPage/constants/contracts'; // Adjust path if needed
import { isSafeWallet } from './ethersAdapters';
import { SAFE_TRANSACTION_SENT, isSafeTransactionSent } from './txErrors';
import { approvalAmountFor } from './approvalAmount';

/**
 * Feature Flag for CoW Swap
 */
const USE_COWSWAP = true; // Set to true to default to CoW Swap

/**
 * CoW Protocol Vault Relayer address on Gnosis Chain (mainnet)
 */
const COW_VAULT_RELAYER_ADDRESS = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

/**
 * SushiSwap V3 Router address
 */
export const SUSHISWAP_V3_ROUTER = "0x592abc3734cd0d458e6e44a2db2992a3d00283a4";

/**
 * SushiSwap V3 Router ABI for swap function
 */
const SUSHISWAP_V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn)",
  "function swap(address pool, address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes data) external returns (int256, int256)"
];

/**
 * Uniswap V3 Pool ABI for token positions
 */
const UNISWAP_V3_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes data) external returns (int256, int256)"
];

/**
 * Pool configuration for V3 swaps
 */
export const V3_POOL_CONFIG = {
  YES: {
    address: "0x9a14d28909f42823ee29847f87a15fb3b6e8aed3",
    tokenCurrencySlot: 1, // 0 or 1, indicates which slot (token0 or token1) the currency token occupies
    tokenCompanySlot: 0,  // 0 or 1, indicates which slot the company token occupies
    fee: 10000            // Fee tier (1% = 10000)
  },
  NO: {
    address: "0x6E33153115Ab58dab0e0F1E3a2ccda6e67FA5cD7",
    tokenCurrencySlot: 0, // For NO pool, currency token is in slot 0
    tokenCompanySlot: 1,  // For NO pool, company token is in slot 1
    fee: 10000            // Fee tier (1% = 10000)
  }
};

/**
 * sqrtPriceLimitX96 values for different swap directions
 * - MIN_SQRT_RATIO + 1 for swapping token0 -> token1 (zeroForOne = true)
 * - MAX_SQRT_RATIO - 1 for swapping token1 -> token0 (zeroForOne = false)
 */
const MIN_SQRT_RATIO = "4295128740";
const MAX_SQRT_RATIO = "1461446703485210103287273052203988822378723970341";

/**
 * Check and handle token approval for V3 swap
 * @param {Object} params - Parameters for token approval
 * @param {Object} params.signer - Ethers signer
 * @param {string} params.tokenAddress - Address of token to approve
 * @param {string} params.amount - Amount to approve
 * @param {boolean} params.eventHappens - Whether this is a YES or NO pool swap
 * @param {Function} params.onApprovalNeeded - Callback when approval is needed
 * @param {Function} params.onApprovalComplete - Callback when approval completes
 * @param {string} params.spenderAddressOverride - Optional spender address override
 * @param {Object} params.publicClient - Wagmi public client for reading blockchain state
 * @returns {Promise<boolean>} Whether approval was needed and completed
 */
export const checkAndApproveTokenForV3Swap = async ({
  signer,
  tokenAddress,
  amount,
  eventHappens,
  onApprovalNeeded,
  onApprovalComplete,
  spenderAddressOverride = null,
  publicClient = null,
  walletClient = null, // Add walletClient param
  connector, // wagmi useAccount() connector, for Safe detection
  useUnlimitedApproval = false // Default to false - approve only exact amount
}) => {
  // Define checksummedTokenAddress outside try-catch for proper scoping
  let checksummedTokenAddress;
  let spenderAddress;
  let spenderName;

  try {
    // Detailed debugging logs for token approval
    console.log('=== APPROVAL FUNCTION ENTRY ===');
    console.log('Signer type received:', {
      signerType: signer._isSigner ? 'custom' : 'ethers',
      hasProvider: !!signer.provider,
      signerMethods: Object.keys(signer),
      isEthersSigner: signer instanceof ethers.Signer
    });
    console.log('Token Address to Approve:', tokenAddress);
    console.log('Amount to Approve:', amount.toString());
    console.log('USE_COWSWAP Flag:', USE_COWSWAP);
    console.log('Has publicClient for reading:', !!publicClient);
    console.log('Has walletClient:', !!walletClient);
    if (spenderAddressOverride) {
      console.log('Spender Address Override Provided:', spenderAddressOverride);
    }
    console.log('================================');

    console.log('[DEBUG] About to call signer.getAddress()...');
    const userAddress = await signer.getAddress();
    console.log('[DEBUG] signer.getAddress() successful, got:', userAddress);

    // Determine the spender address based on the feature flag
    if (spenderAddressOverride) {
      spenderAddress = spenderAddressOverride;
      // Attempt to determine name based on known addresses
      if (spenderAddress.toLowerCase() === SUSHISWAP_V3_ROUTER.toLowerCase()) {
        spenderName = 'SushiSwap V3 Router (Override)';
      } else if (spenderAddress.toLowerCase() === COW_VAULT_RELAYER_ADDRESS.toLowerCase()) {
        spenderName = 'CoW Protocol Vault Relayer (Override)';
      } else {
        spenderName = 'Custom Spender (Override)';
      }
    } else {
      // Default logic based on USE_COWSWAP flag
      spenderAddress = USE_COWSWAP ? COW_VAULT_RELAYER_ADDRESS : SUSHISWAP_V3_ROUTER;
      spenderName = USE_COWSWAP ? 'CoW Protocol Vault Relayer' : 'SushiSwap V3 Router';
    }

    console.log(`Target Spender for Approval: ${spenderName} (${spenderAddress})`);

    // Create token contract (ensure address is checksummed)
    checksummedTokenAddress = ethers.utils.getAddress(tokenAddress);

    // Try to get token info for better debugging - but make it optional
    let tokenSymbol = 'Unknown', tokenName = 'Unknown';
    try {
      // Use publicClient if available for reading token info (more reliable)
      if (publicClient) {
        try {
          tokenSymbol = await publicClient.readContract({
            address: checksummedTokenAddress,
            abi: [{ "inputs": [], "name": "symbol", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" }],
            functionName: 'symbol'
          });
        } catch (e) {
          console.log('Could not get token symbol via publicClient:', e.message);
        }

        try {
          tokenName = await publicClient.readContract({
            address: checksummedTokenAddress,
            abi: [{ "inputs": [], "name": "name", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" }],
            functionName: 'name'
          });
        } catch (e) {
          console.log('Could not get token name via publicClient:', e.message);
        }
      } else {
        // Fallback to ethers contract approach
        const infoContract = new ethers.Contract(
          checksummedTokenAddress,
          [
            "function symbol() view returns (string)",
            "function name() view returns (string)"
          ],
          signer
        );

        try {
          tokenSymbol = await infoContract.symbol();
        } catch (e) {
          console.log('Could not get token symbol via ethers:', e.message);
        }

        try {
          tokenName = await infoContract.name();
        } catch (e) {
          console.log('Could not get token name via ethers:', e.message);
        }
      }

      console.log('Token Info:', { symbol: tokenSymbol, name: tokenName });
    } catch (error) {
      console.log('Could not retrieve token info:', error.message);
    }

    // Check current allowance for the spender - USE PUBLICCLIENT IF AVAILABLE
    let currentAllowance;
    try {
      if (publicClient) {
        console.log('[DEBUG] Using publicClient to check allowance...');
        const allowanceResult = await publicClient.readContract({
          address: checksummedTokenAddress,
          abi: [{ "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" }],
          functionName: 'allowance',
          args: [userAddress, spenderAddress]
        });
        currentAllowance = ethers.BigNumber.from(allowanceResult.toString());
        console.log('[DEBUG] Got allowance via publicClient:', currentAllowance.toString());
      } else {
        console.log('[DEBUG] Using ethers contract to check allowance...');
        const tokenContract = new ethers.Contract(
          checksummedTokenAddress,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)"
          ],
          signer
        );
        currentAllowance = await tokenContract.allowance(userAddress, spenderAddress);
        console.log('[DEBUG] Got allowance via ethers contract:', currentAllowance.toString());
      }
    } catch (error) {
      console.warn('Could not check current allowance, assuming zero:', error.message);
      currentAllowance = ethers.BigNumber.from(0);
    }

    console.log(`Checking V3 swap allowance for ${spenderName}:`, {
      token: checksummedTokenAddress,
      tokenSymbol: tokenSymbol || 'Unknown',
      tokenName: tokenName || 'Unknown',
      spender: spenderAddress,
      currentAllowance: currentAllowance.toString(),
      requiredAmount: amount.toString(),
      hasEnoughAllowance: currentAllowance.gte(amount)
    });

    const needsApproval = currentAllowance.lt(amount);

    if (!needsApproval) {
      console.log(`Token already approved for ${spenderName} - sufficient allowance exists`);
      return false; // No approval was needed
    }

    // Otherwise, request approval
    console.log(`=== INSUFFICIENT ALLOWANCE DETECTED FOR ${spenderName} ===`);
    console.log('Token:', checksummedTokenAddress, tokenSymbol || 'Unknown');
    console.log('Current allowance:', currentAllowance.toString());
    console.log('Required amount:', amount.toString());
    console.log(`Initiating approval transaction for ${spenderName}...`);
    console.log('=====================================', `(Target: ${spenderName})`);

    onApprovalNeeded?.();

    // Create token contract for approval transaction
    const tokenContract = new ethers.Contract(
      checksummedTokenAddress,
      [
        "function approve(address spender, uint256 amount) returns (bool)"
      ],
      signer
    );

    // Approve with either exact amount or unlimited based on user preference
    const approvalAmount = approvalAmountFor(amount, useUnlimitedApproval);
    console.log(`Approval amount: ${useUnlimitedApproval ? 'MaxUint256 (unlimited)' : amount.toString() + ' (exact)'}`);

    const approveTx = await tokenContract.approve(
      spenderAddress,
      approvalAmount,
      {
        gasLimit: 3000000,
      }
    );

    console.log('Approval transaction submitted:', approveTx.hash);

    // Check for Safe wallet
    if (walletClient && isSafeWallet(walletClient, connector)) {
      console.log('[checkAndApproveTokenForV3Swap] Safe wallet detected - skipping wait() and throwing SAFE_TRANSACTION_SENT');
      throw new Error(SAFE_TRANSACTION_SENT);
    }

    console.log('Waiting for confirmation...');

    await approveTx.wait();

    console.log('=== APPROVAL CONFIRMED ===');
    console.log('Token:', checksummedTokenAddress, tokenSymbol || 'Unknown');
    console.log(`Now approved for ${spenderName}:`, spenderAddress);
    console.log('==========================');

    onApprovalComplete?.();
    return true; // Approval was needed and successful

  } catch (error) {
    // A Safe queued the approval: pass the signal through untouched so callers
    // recognise it instead of showing it as a failure.
    if (isSafeTransactionSent(error)) throw error;
    console.error('=== TOKEN APPROVAL ERROR ===');
    console.error('Token address:', checksummedTokenAddress || tokenAddress);
    console.error('Spender address targeted:', spenderAddress || 'Not determined yet');
    console.error('Error details:', error);
    console.error('==========================');
    throw new Error(`Failed to approve token for ${spenderName || 'unknown spender'}: ${error.message}`);
  }
};

// ---> NEW Dedicated V3 Router Swap Function <---
/**
 * Executes a swap directly using the SushiSwap V3 Router contract.
 */
export const executeSushiV3RouterSwap = async ({
  signer,
  tokenIn,
  tokenOut,
  amount,
  eventHappens, // Determines which pool (YES/NO) to use
  options = {}
}) => {
  console.log('=== Executing Swap via SushiSwap V3 Router (Direct Function) ===');
  try {
    const userAddress = await signer.getAddress();

    // Determine pool config based on outcome
    const poolConfig = eventHappens ? V3_POOL_CONFIG.YES : V3_POOL_CONFIG.NO;
    const poolAddress = poolConfig.address;
    if (!poolAddress) throw new Error(`Pool address not found for eventHappens=${eventHappens}`);

    // Create V3 Router contract instance
    const routerContract = new ethers.Contract(
      SUSHISWAP_V3_ROUTER,
      SUSHISWAP_V3_ROUTER_ABI,
      signer
    );

    // Get pool token order to determine swap direction
    const poolContract = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, signer);
    const token0Address = await poolContract.token0();
    // const token1Address = await poolContract.token1(); // Not strictly needed below

    // Determine swap direction
    const zeroForOne = tokenIn.toLowerCase() === token0Address.toLowerCase();

    // Set price limit (using broad limits for market order)
    const sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO;

    console.log('Direct V3 Router Swap parameters:', {
      router: SUSHISWAP_V3_ROUTER, pool: poolAddress, recipient: userAddress, zeroForOne,
      amountSpecified: amount.toString(), sqrtPriceLimitX96, data: "0x"
    });

    // Prepare transaction options
    const txOptions = {
      gasLimit: 50000000, // Keep existing default or pass via options
      gasPrice: options.gasPrice || ethers.utils.parseUnits("0.97", "gwei"),
      ...options,
    };

    // Execute the swap on the V3 router
    const tx = await routerContract.swap(
      poolAddress,
      userAddress,
      zeroForOne,
      amount,
      sqrtPriceLimitX96,
      "0x",
      txOptions
    );

    console.log('Direct V3 Router Swap transaction sent:', tx.hash);
    return tx; // Return the actual transaction object

  } catch (error) {
    console.error('Direct Sushi V3 Router Swap execution failed:', error);
    throw error; // Re-throw the error
  }
};
// ---> END NEW Dedicated Function <---

/**
 * Execute a swap using CoW Swap (primarily) or falling back to V3 Router.
 * Note: The internal V3 fallback is less likely to be used now with the explicit toggle.
 */
export const executeV3Swap = async ({ // Keep original signature for CoW path
  signer,
  tokenIn,
  tokenOut,
  amount,
  eventHappens,
  // forceV3Router = false, // This flag is no longer needed here
  options = {}
}) => {
  // console.log(`Executing V3 Swap Helper: USE_COWSWAP=${USE_COWSWAP}`); // Keep log if desired

  // --- Check if CoW Swap path should be taken ---
  // Removed forceV3Router flag check, relies only on USE_COWSWAP
  if (USE_COWSWAP) {
    console.log('=== Executing Swap via CoW Swap ===');
    try {
      const chainId = await signer.getChainId();
      if (chainId !== 100) {
        console.warn(`CoW Swap selected but chain is ${chainId}. Falling back to SushiSwap V3 Router (internal fallback).`);
        // Call the NEW dedicated V3 function for the internal fallback
        return executeSushiV3RouterSwap({ signer, tokenIn, tokenOut, amount, eventHappens, options });
      } else {
        // ... existing CoW Swap getQuote, signOrder, sendOrder logic ...
        // This part is unchanged and returns the mock tx object with Order ID
        const cowSdk = new CowSdk(chainId, { signer });
        // ... (quote fetching, validation, order building, signing, submission) ...
        const quoteParams = {
          kind: OrderKind.SELL,
          sellToken: tokenIn,
          buyToken: tokenOut,
          amount: amount.toString(),
          userAddress: await signer.getAddress(),
          validTo: Math.floor(Date.now() / 1000) + 3600,
          receiver: await signer.getAddress(),
          partiallyFillable: false,
        };
        const quoteResponse = await cowSdk.cowApi.getQuote(quoteParams);
        const { quote } = quoteResponse;
        if (!quote || !quote.sellAmount || !quote.buyAmount || !quote.feeAmount) {
          throw new Error('Received invalid or incomplete quote from CoW Swap API.');
        }
        if (ethers.BigNumber.from(quote.feeAmount).isZero()) {
          console.warn('[CoW Swap Debug] CoW Swap Quote returned a zero feeAmount.');
          // Do not throw error here for zero fee, let submission handle potential issues
        }
        const order = {
          kind: OrderKind.SELL,
          partiallyFillable: false,
          sellToken: quote.sellToken,
          buyToken: quote.buyToken,
          receiver: quote.receiver,
          sellAmount: amount.toString(), // Use the original intended sell amount
          buyAmount: quote.buyAmount,
          validTo: quote.validTo,
          appData: quote.appData,
          feeAmount: "0", // Force based on previous findings
        };
        const signedOrder = await cowSdk.signOrder(order);
        const orderId = await cowSdk.cowApi.sendOrder({ order: { ...order, ...signedOrder }, owner: await signer.getAddress() });
        // -----
        console.log('[CoW Swap Debug] Returning CoW Swap order object for Order ID:', orderId);
        return {
          hash: orderId,
          isCowSwapOrder: true,
          wait: async () => {
            throw new Error(
              'Cannot call wait() on a CoW Swap order. Use CoW API polling to track order status.'
            );
          },
          confirmations: 0
        };
      }
    } catch (error) {
      // ... existing CoW Swap error handling (parsing specific API errors) ...
      let errorMessage = error.message;
      if (error.response?.data?.description) {
        errorMessage = `CoW Swap Error: ${error.response.data.description} (Code: ${error.response.data.errorType})`;
      } else if (error.body) {
        try {
          const parsedBody = JSON.parse(error.body);
          if (parsedBody?.description) {
            errorMessage = `CoW Swap Error: ${parsedBody.description} (Code: ${parsedBody.errorType})`;
          }
        } catch (parseError) { /* Ignore */ }
      }
      console.error("[COWSWAP DEBUG ERROR] CoW Swap path failed:", errorMessage, error);
      // ---> REMOVED SushiV3Router fallback - throw original error <-----
      throw error; // Re-throw the original CoW Swap error
    }
  } else {
    // --- Original SushiSwap V3 Execution Path (if USE_COWSWAP is false) ---
    console.log('USE_COWSWAP is false, executing directly via SushiSwap V3 Router.');
    // Call the NEW dedicated V3 function
    return executeSushiV3RouterSwap({ signer, tokenIn, tokenOut, amount, eventHappens, options });
  }
};

// ---> NEW Dedicated V3 Direct Redemption Function <---
/**
 * Executes a redemption swap directly using the SushiSwap V3 Router.
 * (Logic extracted from the original executeRedemptionSwap fallback)
 */
export const executeSushiV3DirectRedemption = async ({
  signer,
  tokenAddress, // Position token being sold
  amount,
  poolAddress, // The specific V3 pool address
  tokenBaseSlot, // Info about which token (0 or 1) is the base currency in this pool
  options = {}
}) => {
  console.log('=== Executing Redemption via SushiSwap V3 Router (Direct Function) ===');
  if (!signer || !tokenAddress || !amount || !poolAddress || tokenBaseSlot === undefined) {
    console.error('Missing required parameters for SushiSwap V3 direct redemption');
    throw new Error('Missing required parameters for SushiSwap V3 direct redemption');
  }
  try {
    const userAddress = await signer.getAddress();

    // Create router contract instance
    const routerContract = new ethers.Contract(
      SUSHISWAP_V3_ROUTER,
      SUSHISWAP_V3_ROUTER_ABI,
      signer
    );

    // Get pool info (optional here if we trust tokenBaseSlot, but good practice)
    // const poolContract = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, signer);
    // const token0Address = await poolContract.token0();
    // const token1Address = await poolContract.token1();
    // console.log('Direct Redemption Pool Info:', { pool: poolAddress, token0: token0Address, token1: token1Address, baseSlot: tokenBaseSlot });

    // Determine swap direction based on which slot holds the base currency
    // If base is token1 (slot 1), we are selling token0 (position) -> zeroForOne = true
    // If base is token0 (slot 0), we are selling token1 (position) -> zeroForOne = false
    const zeroForOne = tokenBaseSlot === 1;

    // Set price limits (using broad limits)
    const sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO;

    console.log('Direct V3 Redemption Swap Parameters:', {
      pool: poolAddress, zeroForOne, amount: amount.toString(), sqrtPriceLimitX96
    });

    // Prepare transaction options
    const txOptions = {
      gasLimit: 50000000, // Use a reasonable default or pass via options
      gasPrice: options.gasPrice || ethers.utils.parseUnits("0.97", "gwei"),
      ...options,
    };

    // Execute the swap
    const tx = await routerContract.swap(
      poolAddress,        // pool address
      userAddress,        // recipient
      zeroForOne,         // swap direction
      amount,             // amount of position token to swap
      sqrtPriceLimitX96,  // price limit
      "0x",               // empty data
      txOptions
    );

    console.log('Direct V3 Redemption transaction sent:', tx.hash);
    return tx; // Return the actual transaction object
  } catch (error) {
    console.error('Direct V3 Redemption failed:', error);
    throw error;
  }
};
// ---> END NEW Dedicated Function <---

/**
 * Execute a redemption swap using CoW Swap (primarily)
 * The internal V3 fallback is less relevant now the modal controls the path.
 */
export const executeRedemptionSwap = async ({ // Keep signature focused on CoW path needs
  signer,
  tokenAddress, // This is the position token being sold (sellToken)
  amount,
  // poolAddress, // Less relevant for CoW path execution, remove if not needed by CoW SDK
  // tokenBaseSlot, // Less relevant for CoW path execution, remove if not needed by CoW SDK
  options = {}
}) => {
  // --- CoW Swap Execution Path for Redemption ---
  // Removed the !USE_COWSWAP check, assuming this is called when CoW is selected/intended
  console.log('=== Executing Redemption via CoW Swap ===');
  try {
    const userAddress = await signer.getAddress();
    const chainId = await signer.getChainId();

    if (chainId !== 100) {
      // Maybe throw error instead of falling back if called explicitly for CoW?
      console.error(`CoW Swap Redemption called on unsupported chain ID: ${chainId}.`);
      throw new Error(`CoW Swap Redemption not supported on chain ID ${chainId}`);
      // OR: Call the direct V3 redemption as a fallback (but modal should control this)
      // console.warn(`CoW Swap helper called on unsupported chain ${chainId}. Falling back to direct V3 redemption.`);
      // const poolConfig = ... // Need logic to get pool config here if falling back
      // return executeSushiV3DirectRedemption({ signer, tokenAddress, amount, poolAddress: ..., tokenBaseSlot: ..., options });
    }

    const cowSdk = new CowSdk(chainId, { signer });
    const quoteAmount = amount.toString();

    // Determine sellToken and buyToken for redemption
    const sellToken = tokenAddress;
    const buyToken = DEFAULT_BASE_TOKENS_CONFIG?.currency?.address; // Assuming base currency target
    if (!buyToken) {
      throw new Error('Could not determine base currency token address for redemption.');
    }

    // ... existing CoW Swap getQuote, signOrder, sendOrder logic ...
    // Define the quote parameters correctly
    const quoteParams = {
      kind: OrderKind.SELL,
      sellToken: sellToken,
      buyToken: buyToken,
      // Use sellAmountBeforeFee as required by the API for SELL orders
      sellAmountBeforeFee: quoteAmount,
      userAddress: userAddress,
      validTo: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
      receiver: userAddress, // Send redeemed tokens to user
      partiallyFillable: false, // Require full fill
      // Revert appData back to being a pre-stringified string for direct API call
      appData: JSON.stringify({
        appCode: 'Futarchy',
        environment: 'production',
        metadata: {}
      }),
      from: userAddress, // Explicitly set from address
      // Add other potentially relevant fields from working examples
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
      signingScheme: 'eip712',
      onchainOrder: false,
      priceQuality: 'verified' // Request a verified price if possible
    };

    console.log('[CoW Swap Debug] Redemption Quote Params (Attempt 2):', quoteParams);

    // ---> Bypass SDK getQuote, use direct fetch <---
    let quote;
    try {
      const quoteApiUrl = `https://api.cow.fi/xdai/api/v1/quote`; // Use correct Gnosis Chain endpoint
      const fetchResponse = await fetch(quoteApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteParams) // Send the constructed params
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        console.error('[CoW Swap Error] Direct fetch quote failed:', {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          body: errorText
        });
        throw new Error(`Failed to fetch CoW Swap quote: ${fetchResponse.status} ${errorText.substring(0, 100)}`);
      }

      const quoteResponseData = await fetchResponse.json();
      quote = quoteResponseData.quote; // Extract the quote object
      console.log('[CoW Swap Debug] Direct fetch quote response success:', quoteResponseData);

    } catch (fetchError) {
      console.error('[CoW Swap Error] Direct fetch quote threw an error:', fetchError);
      throw fetchError; // Re-throw
    }
    // ---> End Direct Fetch <---

    // --- Add Quote Validation ---
    if (!quote || !quote.sellAmount || !quote.buyAmount || !quote.feeAmount) {
      console.error('[CoW Swap Error] Received invalid or incomplete quote from CoW Swap API for redemption.', quoteResponseData);
      throw new Error('Received invalid or incomplete quote from CoW Swap API for redemption.');
    }
    if (ethers.BigNumber.from(quote.feeAmount).isZero()) {
      console.warn('[CoW Swap Debug] CoW Swap Redemption Quote returned a zero feeAmount.');
    }
    console.log('[CoW Swap Debug] Received Redemption Quote:', quote);
    // --- End Quote Validation ---

    // Construct the order object using the quote data
    const order = {
      kind: OrderKind.SELL,
      partiallyFillable: false,
      sellToken: quote.sellToken,
      buyToken: quote.buyToken,
      receiver: quote.receiver,
      sellAmount: amount.toString(), // Use the original intended sell amount
      buyAmount: quote.buyAmount,
      validTo: quote.validTo,
      appData: quote.appData,
      feeAmount: "0", // Force fee to 0 based on previous findings/needs
    };

    console.log('[COWSWAP DEBUG] Order object BEFORE signing:', order);

    let signedOrder;
    try {
      signedOrder = await cowSdk.signOrder(order);
      console.log('[COWSWAP DEBUG] SignedOrder object AFTER signing:', signedOrder);
    } catch (signError) {
      console.error('[COWSWAP DEBUG ERROR] Signing failed:', signError);
      throw signError;
    }

    const orderToSend = { ...order, ...signedOrder };
    console.log('[COWSWAP DEBUG] Combined Order object BEFORE sending:', orderToSend);

    let orderId;
    try {
      orderId = await cowSdk.cowApi.sendOrder({ order: orderToSend, owner: userAddress });
    } catch (sendError) {
      console.error('[COWSWAP DEBUG ERROR] Sending failed:', sendError);
      if (sendError.response) {
        console.error('[COWSWAP DEBUG ERROR] API Response Status:', sendError.response.status);
        try {
          const rawText = await sendError.response.text();
          console.error('[COWSWAP DEBUG ERROR] Raw API Response Body:', rawText);
        } catch (textError) {
          console.error('[COWSWAP DEBUG ERROR] API Response Data (fallback):', sendError.response.data);
        }
      } else {
        console.error('[COWSWAP DEBUG ERROR] No response object found in sendError.');
      }
      throw sendError;
    }

    console.log('[CoW Swap Debug] Redemption returning CoW Swap order object for Order ID:', orderId);
    return {
      hash: orderId,
      isCowSwapOrder: true,
      wait: async () => {
        throw new Error(
          'Cannot call wait() on a CoW Swap order. Use CoW API polling to track order status.'
        );
      },
      confirmations: 0
    };

  } catch (error) {
    // ... existing CoW Swap redemption error handling ...
    console.error('[CoW Swap Error] Redemption execution failed:', error);
    // Optionally attempt internal fallback? Or just throw?
    // For now, just re-throw the CoW error.
    throw error;
  }
  // Removed the original V3 fallback logic from here, as it's now in executeSushiV3DirectRedemption
};

// Swapr (Algebra) router address and ABI
export const SWAPR_V3_ROUTER = '0xffb643e73f280b97809a8b41f7232ab401a04ee1';
const SWAPR_V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 limitSqrtPrice)) payable returns (uint256)'
];

// Helper function to fetch Algebra pool price
async function fetchAlgebraPoolPrice(tokenIn, tokenOut, provider) {
  // For now, return null to avoid the price calculation issue
  // This needs proper implementation based on the actual pool configuration
  console.warn('fetchAlgebraPoolPrice not fully implemented, returning null');
  return null;
}

// Helper: execute Swapr exactInputSingle
export async function executeAlgebraExactSingle({
  signer,
  tokenIn,
  tokenOut,
  amount,
  slippageBps = 50, // Default to 0.5% slippage
  deadline = Math.floor(Date.now() / 1000) + 3600,
  decimals = 18,
  minOutputAmount = null // Optional: pass pre-calculated minimum output
}) {
  console.log('=== Executing Algebra exactInputSingle ===');

  // Ensure addresses are properly checksummed
  const checksummedTokenIn = ethers.utils.getAddress(tokenIn);
  const checksummedTokenOut = ethers.utils.getAddress(tokenOut);

  const routerContract = new ethers.Contract(SWAPR_V3_ROUTER, SWAPR_V3_ROUTER_ABI, signer);

  // Determine amountIn based on input type
  let amountIn;
  if (ethers.BigNumber.isBigNumber(amount)) {
    amountIn = amount;
  } else {
    amountIn = ethers.utils.parseUnits(amount.toString(), decimals);
  }

  // Calculate amountOutMinimum with slippage protection
  let amountOutMinimum;
  if (minOutputAmount) {
    // Use pre-calculated minimum if provided (already includes slippage)
    amountOutMinimum = ethers.BigNumber.isBigNumber(minOutputAmount)
      ? minOutputAmount
      : ethers.utils.parseUnits(minOutputAmount.toString(), decimals);
    console.log('Using pre-calculated amountOutMinimum:', {
      minOutputAmount: ethers.utils.formatUnits(amountOutMinimum, decimals),
      minOutputAmountWei: amountOutMinimum.toString()
    });
  } else {
    // Calculate a reasonable minimum based on the slippageBps to provide some protection
    // This prevents MEV attacks and unexpected slippage
    const slippageMultiplier = 10000 - slippageBps; // e.g., 9950 for 0.5% slippage
    // Use 95% of expected output as a conservative fallback when no quote is available
    const conservativeSlippageMultiplier = 9500; // 5% slippage as fallback
    amountOutMinimum = amountIn.mul(conservativeSlippageMultiplier).div(10000);
    console.warn('No minimum output amount specified, using conservative 5% slippage protection:', {
      amountIn: ethers.utils.formatUnits(amountIn, decimals),
      amountOutMinimum: ethers.utils.formatUnits(amountOutMinimum, decimals),
      amountOutMinimumWei: amountOutMinimum.toString()
    });
  }

  // IMPORTANT: For Algebra pools, limitSqrtPrice works differently than Uniswap V3
  // Algebra uses limitSqrtPrice = 0 to indicate no price limit (market order)
  // This is the safest approach for exactInputSingle swaps
  let limitSqrtPrice = ethers.BigNumber.from(0);

  // Log token ordering for debugging
  const token0 = checksummedTokenIn.toLowerCase() < checksummedTokenOut.toLowerCase() ? checksummedTokenIn : checksummedTokenOut;
  const token1 = checksummedTokenIn.toLowerCase() < checksummedTokenOut.toLowerCase() ? checksummedTokenOut : checksummedTokenIn;
  const zeroForOne = checksummedTokenIn.toLowerCase() === token0.toLowerCase();

  console.log('Token ordering debug:', {
    token0,
    token1,
    tokenIn: checksummedTokenIn,
    tokenOut: checksummedTokenOut,
    zeroForOne,
    limitSqrtPriceInfo: 'Using 0 for no price limit (Algebra standard)'
  });

  const params = {
    tokenIn: checksummedTokenIn,
    tokenOut: checksummedTokenOut,
    recipient: await signer.getAddress(),
    deadline,
    amountIn,
    amountOutMinimum,
    limitSqrtPrice
  };

  console.log('Algebra swap parameters:', {
    tokenIn: checksummedTokenIn,
    tokenOut: checksummedTokenOut,
    token0,
    token1,
    zeroForOne,
    amountIn: amountIn.toString(),
    amountOutMinimum: amountOutMinimum.toString(),
    limitSqrtPrice: limitSqrtPrice.toString(),
    deadline,
    recipient: params.recipient
  });

  try {
    // Execute the transaction and wait for it to be sent
    const tx = await routerContract.exactInputSingle(params, { gasLimit: 500000 });

    console.log('Algebra transaction sent:', tx.hash);

    // Ensure the transaction object has the correct properties
    if (!tx.hash) {
      throw new Error('Transaction hash not found in Algebra execution response');
    }

    // Return the transaction object - ethers will handle the wait() method
    return tx;

  } catch (error) {
    console.error('Algebra exactInputSingle execution failed:', error);
    throw error;
  }
}
