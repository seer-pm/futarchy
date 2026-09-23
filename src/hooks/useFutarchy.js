/**
 * @fileoverview Futarchy Market Management Hook
 * 
 * This hook provides functionality for interacting with Futarchy markets, including:
 * - Position management (opening, closing, tracking)
 * - Token swaps between currency (SDAI) and company (GNO) tokens
 * - Balance tracking and auto-refresh capabilities
 * - Surplus position calculations and management
 * 
 * Key Concepts:
 * - Currency Tokens: SDAI tokens split into YES_SDAI and NO_SDAI
 * - Company Tokens: GNO tokens split into YES_GNO and NO_GNO
 * - Surplus: When there's an imbalance between YES and NO tokens
 * - Position Closing: Converting surplus positions back to base tokens
 * 
 * @module useFutarchy
 */

import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useAccount } from 'wagmi';
import { useBalanceManager } from "./useBalanceManager";
import { getRpcProvider } from "../utils/getBestRpc";
import {
  getProviderAndSigner,
  formatTokenAmount,
  parseTokenAmount,
  validateTokenAmount,
  getTransactionStatus,
  estimateGas,
  handleTransactionError
} from "./useFutarchyUtils";
import {
  TOKEN_CONFIG,
  TRANSACTION_SETTINGS,
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  CONTRACT_ADDRESSES
} from "./useFutarchyConfig";
import {
  MERGE_CONFIG,
  SUSHISWAP_V2_ROUTER,
  BASE_TOKENS_CONFIG,
  MARKET_ADDRESS,
  FUTARCHY_ROUTER_ADDRESS,
  ERC20_ABI,
  FUTARCHY_ROUTER_ABI,
  UNISWAP_V3_POOL_ABI,
  POOL_CONFIG_YES,
  POOL_CONFIG_NO,
  SDAI_CONTRACT_RATE,
  SDAI_RATE_PROVIDER_ABI
} from "../components/futarchyFi/marketPage/constants/contracts";
import { fetchSushiSwapRoute, executeSushiSwapRoute } from "../utils/sushiswapHelper";
import { SUSHISWAP_V3_ROUTER, checkAndApproveTokenForV3Swap, executeV3Swap } from "../utils/sushiswapV3Helper";
import { approvalAmountFor } from "../utils/approvalAmount";

// Add these constants for SushiSwap V2
const SUSHISWAP_V2_FACTORY = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
const SUSHISWAP_V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];
const SUSHISWAP_V2_PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];
const WXDAI_ADDRESS = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

/**
 * Main Futarchy hook for managing positions and executing swaps
 * 
 * @param {Object} config - Configuration options
 * @param {boolean} config.useSushiV3 - Whether to use SushiSwap V3 for swaps (defaults to true)
 * @returns {Object} Futarchy management functions and state
 * @property {Object} balances - Current token balances for all positions
 * @property {boolean} loading - Whether an operation is in progress
 * @property {string} error - Error message if operation fails
 * @property {string} status - Current operation status
 * @property {Function} smartSwap - Execute a smart swap between tokens
 * @property {Function} closePositions - Close surplus positions
 * @property {Function} updateBalances - Refresh token balances
 * @property {Function} getTotalAvailableBalance - Calculate total available balance
 * @property {Function} startAutoRefresh - Start auto-refreshing balances
 * @property {Function} stopAutoRefresh - Stop auto-refreshing balances
 * @property {Function} getPosition - Get detailed position information
 * @property {Function} canCloseCurrency - Check if currency position can be closed
 * @property {Function} addCollateral - Add tokens as collateral
 * @property {Function} removeCollateral - Remove collateral
 * @property {Object} poolPrices - Current pool prices
 */
export const useFutarchy = (config = {}) => {
  // Extract configuration with defaults
  const { useSushiV3 = true, useUnlimitedApproval = false } = config;

  // Get current chain from wagmi
  const { chain } = useAccount();
  const chainId = chain?.id || 100; // Default to Gnosis (100)

  // State Management
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [poolPrices, setPoolPrices] = useState({
    yesCompanyPrice: null,
    noCompanyPrice: null,
    sdaiPrice: null,
    yesCurrencyInXdai: null,
    noCurrencyInXdai: null,
    eventProbability: null,
    loading: true,
    error: null,
    lastUpdated: null
  });
  
  // Balance Management Hook
  const {
    balances,
    updateBalances,
    startAutoRefresh,
    stopAutoRefresh
  } = useBalanceManager();

  /**
   * Update status message and optionally log to console
   * @param {string} message - Status message to set
   * @param {boolean} shouldLog - Whether to log to console
   */
  const handleStatus = (message, shouldLog = true) => {
    setStatus(message);
    if (shouldLog) console.log(message);
  };

  /**
   * Check and handle token approval for swaps
   * @param {string} tokenAddress - Address of token to be approved 
   * @param {string} spenderAddress - Address of contract to approve
   * @param {ethers.BigNumber} amount - Amount to approve
   * @param {Function} onApprovalStart - Callback when approval starts
   * @param {Function} onApprovalComplete - Callback when approval completes
   * @returns {Promise<boolean>} - Whether approval was needed and successful
   */
  const checkAndApproveTokenForSwap = async (
    tokenAddress, 
    spenderAddress, 
    amount,
    onApprovalStart,
    onApprovalComplete
  ) => {
    try {
      const { signer } = getProviderAndSigner();
      const userAddress = await signer.getAddress();

      // Create token contract
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function approve(address spender, uint256 amount) returns (bool)"
        ],
        signer
      );

      // Check current allowance
      const currentAllowance = await tokenContract.allowance(userAddress, spenderAddress);
      
      console.log('Checking swap allowance:', {
        token: tokenAddress,
        spender: spenderAddress,
        currentAllowance: currentAllowance.toString(),
        requiredAmount: amount.toString(),
        hasEnoughAllowance: currentAllowance.gte(amount)
      });

      // If allowance is sufficient, return early
      if (currentAllowance.gte(amount)) {
        console.log('Token already approved for swap');
        return false; // No approval was needed
      }

      // Otherwise, request approval
      console.log('Insufficient allowance for swap, approving token...');
      handleStatus('Approving token for swap...', true);
      onApprovalStart?.();
      
      const approveTx = await tokenContract.approve(
        spenderAddress,
        approvalAmountFor(amount, useUnlimitedApproval),
        { 
          gasLimit: 100000,
          type: 2,
          maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        }
      );
      
      handleStatus('Waiting for approval confirmation...', true);
      await approveTx.wait();
      
      handleStatus('Token approved for swap', true);
      onApprovalComplete?.();
      return true; // Approval was needed and successful
      
    } catch (error) {
      console.error('Token approval for swap failed:', error);
      throw new Error(`Failed to approve token for swap: ${error.message}`);
    }
  };

  /**
   * Execute a smart swap between tokens with automatic collateral management
   * 
   * This function handles:
   * 1. Adding required collateral if needed
   * 2. Determining correct token pairs for the swap
   * 3. Fetching optimal swap routes for V2 or using direct swap for V3
   * 4. Executing the swap transaction
   * 
   * @param {Object} params - Swap parameters
   * @param {string} params.tokenType - Type of token ('currency' or 'company')
   * @param {string} params.amount - Amount to swap
   * @param {boolean} params.eventHappens - Whether swapping YES or NO tokens
   * @param {string} params.action - Swap action ('buy' or 'sell')
   * @param {Function} params.onStart - Callback when operation starts
   * @param {Function} params.onStatus - Callback for status updates
   * @param {Function} params.onCollateralNeeded - Callback when collateral is needed, receives amount parameter
   * @param {Function} params.onCollateralAdded - Callback when collateral is added
   * @param {Function} params.onSwapStart - Callback when swap starts
   * @param {Function} params.onSwapApprovalNeeded - Callback when swap approval is needed
   * @param {Function} params.onSwapApprovalComplete - Callback when swap approval completes
   * @param {Function} params.onSwapComplete - Callback when swap completes
   * @param {Function} params.onError - Callback when error occurs
   * @param {Function} params.onCollateralApprovalNeeded - Callback when collateral approval is needed, receives tokenSymbol and amount parameters
   * @param {Function} params.onCollateralApprovalComplete - Callback when collateral approval completes
   * @param {string} params.explicitTokenIn - Optional explicit token input address
   * @param {string} params.explicitTokenOut - Optional explicit token output address
   * @returns {Promise<Object>} Swap result
   */
  const smartSwap = async ({
    tokenType,
    amount,
    eventHappens,
    action,
    onStart,
    onCollateralNeeded,
    onCollateralAdded,
    onSwapStart,
    onSwapApprovalNeeded,
    onSwapApprovalComplete,
    onSwapComplete,
    onError,
    onCollateralApprovalNeeded,
    onCollateralApprovalComplete,
    explicitTokenIn,
    explicitTokenOut
  }) => {
    try {
      setLoading(true);
      setError(null);
      
      // Initialize swapReceipt to null to ensure it's always defined
      let swapReceipt = null;

      // Get provider and signer first
      const { provider, signer } = getProviderAndSigner();
      const userAddress = await signer.getAddress();

      console.log('Smart swap initiated with params:', {
        tokenType,
        amount,
        eventHappens,
        action,
        userAddress,
        useSushiV3
      });

      // Convert amount to BigNumber with full precision
      const amountBN = ethers.utils.parseUnits(amount, 18);
      
      onStart?.();
      handleStatus(`Checking position balances for ${eventHappens ? 'YES' : 'NO'} ${TOKEN_CONFIG[tokenType].symbol}...`, false);

      // Get current position and total available balance
      const position = getPosition(tokenType);
      const walletBalance = balances[tokenType].wallet;
      const walletBalanceBN = ethers.utils.parseUnits(walletBalance.formatted, 18);
      
      // Get the correct position balance based on eventHappens
      const currentPositionBalance = eventHappens ? position.yes : position.no;
      const currentPositionBalanceBN = ethers.utils.parseUnits(currentPositionBalance || '0', 18);

      console.log('Initial balance check:', {
        requestedAmount: amount,
        requestedAmountWei: amountBN.toString(),
        walletBalance: walletBalance.formatted,
        walletBalanceWei: walletBalanceBN.toString(),
        positionType: eventHappens ? 'YES' : 'NO',
        positionBalance: currentPositionBalance,
        positionBalanceWei: currentPositionBalanceBN.toString(),
        allPositions: {
          yes: position.yes,
          no: position.no
        }
      });

      // Check if we need to add collateral
      let needsCollateral = false;
      let additionalCollateralNeeded = '0';

      // For both buy and sell actions, we only check against position balance
      if (amountBN.gt(currentPositionBalanceBN)) {
        // Calculate how much additional collateral we need
        const diffBN = amountBN.sub(currentPositionBalanceBN);
        additionalCollateralNeeded = ethers.utils.formatUnits(diffBN, 18);
        needsCollateral = true;
        console.log('Need additional collateral:', {
          needed: additionalCollateralNeeded,
          amountRequested: amount,
          positionType: eventHappens ? 'YES' : 'NO',
          positionBalance: currentPositionBalance,
          action,
          reason: `Insufficient position balance for ${action}`
        });
      }

      console.log('Collateral check result:', {
        needsCollateral,
        additionalCollateralNeeded,
        action,
        tokenType,
        positionBalance: currentPositionBalance,
        requestedAmount: amount
      });

      // If we need more collateral and the amount is valid
      if (needsCollateral && parseFloat(additionalCollateralNeeded) > 0) {
        console.log('Additional collateral needed, preparing to add...');
        console.log('Additional collateral details:', {
          additionalCollateralNeeded,
          tokenType,
          market: CONTRACT_ADDRESSES.market,
          tokenAddress: TOKEN_CONFIG[tokenType].address
        });
        
        handleStatus(`Adding ${additionalCollateralNeeded} ${TOKEN_CONFIG[tokenType].symbol} as collateral...`, true);
        onCollateralNeeded?.(additionalCollateralNeeded);

        // Split position using Futarchy Router
        const futarchyRouter = new ethers.Contract(
          CONTRACT_ADDRESSES.futarchyRouter,
          ["function splitPosition(address,address,uint256)"],
          signer
        );

        const additionalCollateralBN = ethers.utils.parseUnits(additionalCollateralNeeded, 18);
        
        // Check and handle token approval for the base token before splitting
        const baseTokenContract = new ethers.Contract(
          TOKEN_CONFIG[tokenType].address,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)"
          ],
          signer
        );
        
        // Check current allowance
        const currentAllowance = await baseTokenContract.allowance(userAddress, CONTRACT_ADDRESSES.futarchyRouter);
        
        console.log('Checking collateral token allowance:', {
          token: TOKEN_CONFIG[tokenType].address,
          spender: CONTRACT_ADDRESSES.futarchyRouter,
          currentAllowance: currentAllowance.toString(),
          requiredAmount: additionalCollateralBN.toString(),
          hasEnoughAllowance: currentAllowance.gte(additionalCollateralBN)
        });
        
        // If allowance is insufficient, request approval
        if (currentAllowance.lt(additionalCollateralBN)) {
          // Clear status and set prominent approval message
          handleStatus(`TOKEN APPROVAL NEEDED: Please approve ${TOKEN_CONFIG[tokenType].symbol} before adding collateral`, true);
          console.log('🔑 TOKEN APPROVAL REQUIRED before collateral can be added');
          
          // Trigger the approval callback with the token type and amount
          onCollateralApprovalNeeded?.(TOKEN_CONFIG[tokenType].symbol, additionalCollateralNeeded);
          
          // If previous allowance exists but is insufficient, reset it to 0 first
          if (currentAllowance.gt(0)) {
            console.log(`Resetting ${TOKEN_CONFIG[tokenType].symbol} token allowance`);
            const resetTx = await baseTokenContract.approve(CONTRACT_ADDRESSES.futarchyRouter, 0, {
              gasLimit: 100000,
              type: 2,
              maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
              maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
            });
            await resetTx.wait();
          }
          
          // Now approve the max amount to save gas on future transactions
          try {
            handleStatus(`Please confirm the approval transaction in your wallet...`, true);
            
            const approveTx = await baseTokenContract.approve(
              CONTRACT_ADDRESSES.futarchyRouter,
              approvalAmountFor(additionalCollateralBN, useUnlimitedApproval),
              { 
                gasLimit: 100000,
                type: 2,
                maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
              }
            );
            
            handleStatus('Approval transaction submitted - waiting for confirmation...', true);
            await approveTx.wait();
            handleStatus(`✅ ${TOKEN_CONFIG[tokenType].symbol} successfully approved! Now adding collateral...`, true);
            onCollateralApprovalComplete?.();
          } catch (approvalError) {
            console.error('Token approval failed:', approvalError);
            handleStatus(`TOKEN APPROVAL FAILED: ${approvalError.message}`, true);
            throw new Error(`Failed to approve ${TOKEN_CONFIG[tokenType].symbol}: ${approvalError.message}`);
          }
        } else {
          // If already approved, log that information
          console.log(`${TOKEN_CONFIG[tokenType].symbol} already approved for router`);
          handleStatus(`${TOKEN_CONFIG[tokenType].symbol} already approved, proceeding with adding collateral...`, true);
        }

        console.log('Preparing split transaction with:', {
          market: CONTRACT_ADDRESSES.market,
          tokenAddress: TOKEN_CONFIG[tokenType].address,
          amount: additionalCollateralBN.toString(),
          gasLimit: 700000
        });

        try {
          handleStatus(`Please confirm splitting ${additionalCollateralNeeded} ${TOKEN_CONFIG[tokenType].symbol} into YES/NO positions...`, true);
          
          const splitTx = await futarchyRouter.splitPosition(
            CONTRACT_ADDRESSES.market,
            TOKEN_CONFIG[tokenType].address,
            additionalCollateralBN,
            { gasLimit: 700000 }
          );

          handleStatus(`Split transaction sent, waiting for confirmation...`, true);
          console.log('Split transaction sent:', splitTx.hash);
          
          const receipt = await splitTx.wait(TRANSACTION_SETTINGS.CONFIRMATION_BLOCKS);
          console.log('Split transaction confirmed:', receipt);
          
          handleStatus(`Successfully split ${additionalCollateralNeeded} ${TOKEN_CONFIG[tokenType].symbol} into YES/NO positions`, true);
          onCollateralAdded?.();

          // Update balances after collateral addition
          await updateBalances();
          const updatedPosition = getPosition(tokenType);
          console.log('Position after collateral addition:', updatedPosition);
        } catch (splitError) {
          console.error('Split transaction failed:', splitError);
          throw new Error(`Failed to split ${TOKEN_CONFIG[tokenType].symbol} into YES/NO positions: ${splitError.message}`);
        }
      }

      // Determine tokens for swap
      let tokenIn, tokenOut;
      
      // Use explicit tokens if provided, otherwise calculate them
      if (explicitTokenIn && explicitTokenOut) {
        tokenIn = explicitTokenIn;
        tokenOut = explicitTokenOut;
        console.log('Using explicit tokens for swap:', { tokenIn, tokenOut });
      } else if (action === 'buy') {
        tokenIn = eventHappens
          ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
        
        tokenOut = eventHappens
          ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress;
      } else {
        tokenIn = eventHappens
          ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress;
        
        tokenOut = eventHappens
          ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
      }

      // Log token configuration
      console.log('Swap token configuration:', {
        action,
        eventHappens,
        tokenIn,
        tokenOut,
        amount: amountBN.toString(),
        useSushiV3
      });

      // Execute swap through SushiSwap
      handleStatus(`Preparing swap...`, true);
      onSwapStart?.();

      if (useSushiV3) {
        // Use SushiSwap V3 for the swap
        console.log('Using SushiSwap V3 for swap');
        
        // Check and approve token for V3 swap
        await checkAndApproveTokenForV3Swap({
          signer,
          tokenAddress: tokenIn,
          amount: amountBN,
          eventHappens,
          onApprovalNeeded: () => {
            handleStatus(`TOKEN APPROVAL NEEDED: Please approve token for SushiSwap V3 pool swap`, true);
            onSwapApprovalNeeded?.();
          },
          onApprovalComplete: () => {
            handleStatus(`✅ Token successfully approved for SushiSwap V3 pool swap!`, true);
            onSwapApprovalComplete?.();
          },
          useUnlimitedApproval
        });

        // After approval completes and before the swap
        handleStatus(`Please confirm the V3 Router swap in your wallet...`, true);
        
        // Execute the V3 swap
        const tx = await executeV3Swap({
          signer,
          tokenIn,
          tokenOut,
          amount: amountBN,
          eventHappens,
          options: {
            gasLimit: 400000,
            gasPrice: ethers.utils.parseUnits("0.97", "gwei")
          }
        });

        handleStatus(`V3 Router swap transaction submitted: ${tx.hash}`, true);
        if (onSwapComplete) onSwapComplete(tx);

        if (tx.isCowSwapOrder) {
          handleStatus(`CoW Swap order submitted. Order ID: ${tx.hash}`, true);
          swapReceipt = { status: 1, transactionHash: tx.hash };
        } else {
          handleStatus(`Waiting for router swap confirmation...`, true);
          swapReceipt = await tx.wait(TRANSACTION_SETTINGS.CONFIRMATION_BLOCKS);
          handleStatus(`V3 Router swap confirmed! Hash: ${swapReceipt.transactionHash}`, true);
        }
      } else {
        // Use SushiSwap V2 for the swap (original implementation)
        console.log('Using SushiSwap V2 for swap');

        console.log('USEFUTARCHY tokenIn', tokenIn);
        console.log('USEFUTARCHY tokenOut', tokenOut);
        console.log('USEFUTARCHY amount', amountBN.toString());
        console.log('USEFUTARCHY userAddress', userAddress);
        console.log('USEFUTARCHY feeReceiver', "0xca226bd9c754F1283123d32B2a7cF62a722f8ADa");
        
        // Get optimal swap route
        const routeData = await fetchSushiSwapRoute({
          tokenIn,
          tokenOut,
          amount: amountBN,
          userAddress,
          feeReceiver: "0xca226bd9c754F1283123d32B2a7cF62a722f8ADa"
        });

        // Check and approve token for swap before executing
        await checkAndApproveTokenForSwap(
          tokenIn,
          routeData.routeProcessorAddr,
          amountBN,
          onSwapApprovalNeeded,
          onSwapApprovalComplete
        );

        handleStatus(`Please confirm the swap in your wallet...`, true);
        
        // Execute the swap
        const tx = await executeSushiSwapRoute({
          signer,
          routeData,
          options: {
            gasLimit: 400000,
            gasPrice: ethers.utils.parseUnits("0.97", "gwei")
          }
        });

        handleStatus(`Swap transaction submitted: ${tx.hash}`, true);
        if (onSwapComplete) onSwapComplete(tx);
        
        handleStatus(`Waiting for router swap confirmation...`, true);
        swapReceipt = await tx.wait(TRANSACTION_SETTINGS.CONFIRMATION_BLOCKS);
        
        handleStatus(`Swap confirmed! Hash: ${swapReceipt.transactionHash}`, true);
      }
      
      // Update balances and manage auto-refresh
      await updateBalances();
      startAutoRefresh();
      
      setTimeout(() => {
        stopAutoRefresh();
      }, 30000);

      return { success: true, receipt: swapReceipt };
      
    } catch (err) {
      console.error('Smart swap error:', err);
      const errorMessage = handleTransactionError(err);
      setError(errorMessage);
      handleStatus(`Error: ${errorMessage}`, true);
      onError?.(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Close surplus positions by swapping them for matching tokens
   * 
   * This function:
   * 1. Checks for available surplus
   * 2. Determines correct token pairs based on surplus type
   * 3. Executes the swap to close the position
   * 
   * Important: When closing positions, we always match the surplus type
   * - NO_SDAI surplus is swapped for NO_GNO
   * - YES_SDAI surplus is swapped for YES_GNO
   * - NO_GNO surplus is swapped for NO_SDAI
   * - YES_GNO surplus is swapped for YES_SDAI
   * 
   * @param {string} tokenType - Type of token ('currency' or 'company')
   * @returns {Promise<Object>} Close position result
   */
  const closePositions = async (tokenType) => {
    try {
      setLoading(true);
      setError(null);

      const position = getPosition(tokenType);

      console.log('Starting closePositions with:', {
        tokenType,
        position,
        surplusAmount: position.surplus.amount,
        surplusType: position.surplus.type,
        hasYesSurplus: position.surplus.hasYesSurplus,
        hasNoSurplus: position.surplus.hasNoSurplus
      });

      // Validate surplus exists
      if (position.surplus.amount === '0') {
        throw new Error("No surplus to close");
      }

      startAutoRefresh();

      // For closing positions, we're always selling the surplus token
      const action = 'sell';
      
      // Determine eventHappens based on surplus type
      // For currency positions:
      // - If we have NO_SDAI surplus (hasNoSurplus = true), we want NO_GNO (eventHappens = false)
      // - If we have YES_SDAI surplus (hasYesSurplus = true), we want YES_GNO (eventHappens = true)
      const eventHappens = position.surplus.hasYesSurplus;

      // Determine the exact tokens for the swap to prevent reversal
      const tokenIn = tokenType === 'currency' 
        ? (eventHappens 
            ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress  // YES_SDAI
            : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress)  // NO_SDAI
        : (eventHappens
            ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress   // YES_GNO
            : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress);  // NO_GNO
      
      const tokenOut = tokenType === 'currency'
        ? (eventHappens
            ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress   // YES_GNO
            : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress)   // NO_GNO
        : (eventHappens
            ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress  // YES_SDAI
            : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress); // NO_SDAI

      // Log the token selection logic
      console.log('Token selection for closing position:', {
        tokenType,
        surplusType: position.surplus.type,
        hasYesSurplus: position.surplus.hasYesSurplus,
        hasNoSurplus: position.surplus.hasNoSurplus,
        eventHappens,
        tokenIn,
        tokenOut
      });

      await smartSwap({
        tokenType,
        amount: position.surplus.amount,
        eventHappens,
        action: 'sell',
        // Pass explicit token addresses to prevent reversal
        explicitTokenIn: tokenIn,
        explicitTokenOut: tokenOut,
        onStart: () => handleStatus(`Closing ${position.surplus.type} ${tokenType} position surplus:`, false),
        onCollateralNeeded: (additionalNeeded) => handleStatus(`Adding ${additionalNeeded} as collateral...`, true),
        onCollateralAdded: () => handleStatus(`Successfully added collateral!`, true),
        onSwapStart: () => handleStatus(`Closing ${position.surplus.type} position:`, false),
        onSwapComplete: (tx) => {
          console.log(`${position.surplus.type} position close status:`, tx.hash);
          handleStatus(`Closing ${position.surplus.type} position: ${tx.hash}`, false);
        }
      });
      
      await updateBalances();
      console.log('Balances after position closure:', balances[tokenType]);

      setTimeout(() => {
        stopAutoRefresh();
      }, 30000);

      return { success: true };

    } catch (err) {
      console.error('Close positions error:', err);
      const errorMessage = handleTransactionError(err);
      setError(errorMessage);
      stopAutoRefresh();
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate total available balance including wallet and position
   * @param {string} tokenType - Type of token
   * @param {boolean} eventHappens - Whether to check YES or NO position
   * @returns {Object} Total balance information
   */
  const getTotalAvailableBalance = useCallback((tokenType, eventHappens) => {
    const tokenBalances = balances[tokenType];
    const walletBalance = ethers.BigNumber.from(tokenBalances.wallet.amount);
    const positionBalance = parseTokenAmount(
      eventHappens ? tokenBalances.collateral.yes : tokenBalances.collateral.no,
      TOKEN_CONFIG[tokenType].decimals
    );

    const total = walletBalance.add(positionBalance);
    return {
      raw: total,
      formatted: ethers.utils.formatUnits(total, TOKEN_CONFIG[tokenType].decimals)
    };
  }, [balances]);

  /**
   * Get detailed position information including surplus calculations
   * @param {string} tokenType - Type of token
   * @returns {Object} Position details
   */
  const getPosition = useCallback((tokenType) => {
    const positions = balances[tokenType].collateral;
    const yesAmount = positions.yes;
    const noAmount = positions.no;
    
    // Use BigNumber for precise calculations
    const yesBN = ethers.utils.parseUnits(yesAmount || '0', 18);
    const noBN = ethers.utils.parseUnits(noAmount || '0', 18);
    
    // Calculate difference maintaining precision
    const diffBN = yesBN.sub(noBN);
    
    // Determine surplus type
    const hasYesSurplus = diffBN.gt(0);
    const hasNoSurplus = diffBN.lt(0);
    
    // Get absolute surplus amount with full precision
    const surplusAmount = hasYesSurplus 
      ? ethers.utils.formatUnits(diffBN, 18)
      : ethers.utils.formatUnits(diffBN.mul(ethers.constants.NegativeOne), 18);
    
    // Log the calculation for debugging
  
    
    return {
      yes: yesAmount,
      no: noAmount,
      surplus: {
        amount: surplusAmount,
        type: hasYesSurplus ? 'YES' : 'NO',
        hasYesSurplus,
        hasNoSurplus
      },
      total: ethers.utils.formatUnits(yesBN.lt(noBN) ? yesBN : noBN, 18)
    };
  }, [balances]);

  /**
   * Check if currency position can be closed
   * Currency can only be closed if company has surplus in opposite direction
   * @returns {boolean} Whether currency position can be closed
   */
  const canCloseCurrency = useCallback(() => {
    const currencyPosition = getPosition('currency');
    const companyPosition = getPosition('company');
    
    if (companyPosition.surplus.amount === '0') return false;
    
    return (currencyPosition.surplus.hasYesSurplus && companyPosition.surplus.hasNoSurplus) ||
           (currencyPosition.surplus.hasNoSurplus && companyPosition.surplus.hasYesSurplus);
  }, [getPosition]);

  /**
   * Adds collateral by splitting tokens into position pairs
   * 
   * @param {string} tokenType - Type of token ('currency' or 'company')
   * @param {string} amount - Amount of tokens to add as collateral
   * @param {Object} callbacks - Callback functions for different stages
   * @returns {Promise<void>}
   */
  const addCollateral = async (tokenType, amount, callbacks = {}) => {
    try {
      setLoading(true);
      setError(null);

      // Get provider and signer
      const { provider, signer } = getProviderAndSigner();
      const userAddress = await signer.getAddress();

      callbacks.onStart?.();

      // Convert amount to BigNumber
      const amountBN = ethers.utils.parseUnits(amount, 18);

      // Get base token config based on token type
      const baseToken = tokenType === 'currency' 
        ? BASE_TOKENS_CONFIG.currency
        : BASE_TOKENS_CONFIG.company;

      // Create token contract
      const tokenContract = new ethers.Contract(baseToken.address, ERC20_ABI, signer);
      
      // Check base token balance
      const balance = await tokenContract.balanceOf(userAddress);
      if (balance.lt(amountBN)) {
        const errorMsg = `Insufficient ${baseToken.symbol} balance`;
        handleStatus(errorMsg, true);
        setError(errorMsg);
        callbacks.onError?.(new Error(errorMsg));
        throw new Error(errorMsg);
      }

      // Check and approve token if needed
      const allowance = await tokenContract.allowance(userAddress, FUTARCHY_ROUTER_ADDRESS);
      
      // If allowance is insufficient, request approval
      if (allowance.lt(amountBN)) {
        handleStatus(`Approving ${baseToken.symbol} for splitting...`);
        
        // If previous allowance exists but is insufficient, reset it to 0 first
        // This is a security measure for certain ERC20 tokens
        if (allowance.gt(0)) {
          console.log(`Resetting ${baseToken.symbol} token allowance`);
          const resetTx = await tokenContract.approve(FUTARCHY_ROUTER_ADDRESS, 0, {
            gasLimit: 100000,
            type: 2,
            maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
          });
          await resetTx.wait();
        }
        
        // Approve the exact requirement unless unlimited approval was explicitly selected.
        try {
          const approveTx = await tokenContract.approve(
            FUTARCHY_ROUTER_ADDRESS,
            approvalAmountFor(amountBN, useUnlimitedApproval),
            { 
              gasLimit: 100000,
              type: 2,
              maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
              maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
            }
          );
          
          callbacks.onApprove?.(approveTx);
          
          // Wait for approval to be confirmed
          await approveTx.wait();
          handleStatus(`${baseToken.symbol} approved successfully`);
        } catch (approvalError) {
          const errorMsg = `Failed to approve ${baseToken.symbol}: ${approvalError.message}`;
          handleStatus(errorMsg, true);
          setError(errorMsg);
          callbacks.onError?.(approvalError);
          throw approvalError;
        }
      }

      // Create Futarchy Router contract
      const futarchyRouter = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      handleStatus(`Splitting ${amount} ${baseToken.symbol} into position tokens...`);
      
      // Execute split position transaction
      try {
        const splitTx = await futarchyRouter.splitPosition(
          MARKET_ADDRESS,
          baseToken.address,
          amountBN,
          { 
            gasLimit: 2000000, // High fixed gas limit
            type: 2, // EIP-1559 transaction
            maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
          }
        );
        
        callbacks.onSplit?.(splitTx);
        
        // Wait for transaction confirmation
        const receipt = await splitTx.wait();
        console.log('Split position successful:', receipt.transactionHash);
        
        // Update balances after successful split
        await updateBalances();
        
        callbacks.onComplete?.(receipt);
        handleStatus('Successfully added collateral', true);
      } catch (splitError) {
        const errorMsg = `Failed to split position: ${splitError.message}`;
        handleStatus(errorMsg, true);
        setError(errorMsg);
        callbacks.onError?.(splitError);
        throw splitError;
      }
      
    } catch (err) {
      console.error('Add collateral error:', err);
      const errorMessage = handleTransactionError(err);
      setError(errorMessage);
      callbacks.onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Removes collateral by merging position tokens back to base tokens
   * 
   * @param {string} tokenType - Type of token ('currency' or 'company')
   * @param {string} amount - Amount of collateral to remove
   * @param {Object} callbacks - Callback functions for different stages
   * @returns {Promise<void>}
   */
  const removeCollateral = async (tokenType, amount, callbacks = {}) => {
    try {
      setLoading(true);
      setError(null);

      // Get provider and signer
      const { provider, signer } = getProviderAndSigner();
      const userAddress = await signer.getAddress();

      callbacks.onStart?.();

      // Convert amount to BigNumber
      const amountBN = ethers.utils.parseUnits(amount, 18);

      // Get configs based on token type
      const configs = tokenType === 'currency' 
        ? {
            yes: MERGE_CONFIG.currencyPositions.yes,
            no: MERGE_CONFIG.currencyPositions.no,
            baseToken: BASE_TOKENS_CONFIG.currency
          }
        : {
            yes: MERGE_CONFIG.companyPositions.yes,
            no: MERGE_CONFIG.companyPositions.no,
            baseToken: BASE_TOKENS_CONFIG.company
          };

      // Helper function to check and approve token if needed
      const checkAndApproveToken = async (tokenAddress, tokenType) => {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        
        // First check token balance
        const balance = await token.balanceOf(userAddress);
        if (balance.lt(amountBN)) {
          console.log(`Insufficient ${tokenType} token balance`);
          return false;
        }

        // Then check allowance
        const allowance = await token.allowance(userAddress, FUTARCHY_ROUTER_ADDRESS);
        
        // If allowance is already sufficient, skip approval
        if (allowance.gte(amountBN)) {
          console.log(`${tokenType} token already approved`);
          return true;
        }

        // If previous allowance exists but is insufficient, we need to reset it to 0 first
        // This is a security measure for certain ERC20 tokens
        if (allowance.gt(0)) {
          console.log(`Resetting ${tokenType} token allowance`);
          const resetTx = await token.approve(FUTARCHY_ROUTER_ADDRESS, 0);
          await resetTx.wait();
        }

        // Now approve the required amount
        handleStatus(`Approving ${tokenType} token for router...`, true);
        if (tokenType === 'YES') callbacks.onYesApprove?.();
        if (tokenType === 'NO') callbacks.onNoApprove?.();
        
        const approvalTx = await token.approve(
          FUTARCHY_ROUTER_ADDRESS,
          approvalAmountFor(amountBN, useUnlimitedApproval),
          { 
            gasLimit: 100000,
            type: 2,
            maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
          }
        );
        await approvalTx.wait();
        return true;
      };

      // Check and approve YES token if needed
      handleStatus('Checking YES token approval...', true);
      const yesApproved = await checkAndApproveToken(
        configs.yes.wrap.wrappedCollateralTokenAddress,
        'YES'
      );
      if (!yesApproved) {
        throw new Error('Failed to approve YES token');
      }

      // Check and approve NO token if needed
      handleStatus('Checking NO token approval...', true);
      const noApproved = await checkAndApproveToken(
        configs.no.wrap.wrappedCollateralTokenAddress,
        'NO'
      );
      if (!noApproved) {
        throw new Error('Failed to approve NO token');
      }

      // Call mergePositions on router
      handleStatus('Merging positions...', true);
      
      const routerContract = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      console.log('Merging positions via router:', {
        proposal: MARKET_ADDRESS,
        collateralToken: configs.baseToken.address,
        amount: ethers.utils.formatEther(amountBN)
      });

      const mergeTx = await routerContract.mergePositions(
        MARKET_ADDRESS,
        configs.baseToken.address,
        amountBN,
        { 
          gasLimit: 700000,
          type: 2,
          maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        }
      );

      callbacks.onMerge?.(mergeTx);
      
      // Wait for transaction confirmation
      const receipt = await mergeTx.wait();
      console.log('Merge successful:', receipt.transactionHash);

      // Update balances after successful merge
      await updateBalances();
      
      callbacks.onComplete?.(receipt);
      handleStatus('Successfully removed collateral', true);

    } catch (err) {
      console.error('Remove collateral error:', err);
      const errorMessage = handleTransactionError(err);
      setError(errorMessage);
      callbacks.onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate price from sqrtPriceX96 value
   * @param {BigNumber} sqrtPriceX96 - The square root price in Q96 format from Uniswap V3 Pool
   * @param {Number} tokenCompanySlot - The token slot (0 or 1) to determine if price needs to be inverted
   * @returns {Number} The calculated price
   */
  const calculatePriceFromSqrtPriceX96 = useCallback((sqrtPriceX96, tokenCompanySlot) => {
    // Convert sqrtPriceX96 to ethers BigNumber if it's not already
    const sqrtPriceX96BN = ethers.BigNumber.isBigNumber(sqrtPriceX96) 
      ? sqrtPriceX96 
      : ethers.BigNumber.from(sqrtPriceX96);
    
    // For simplicity, we'll convert to a decimal string and use JavaScript math
    const sqrtPriceStr = ethers.utils.formatUnits(sqrtPriceX96BN, 0);
    const sqrtPrice = parseFloat(sqrtPriceStr);
    const price = (sqrtPrice * sqrtPrice) / 2**192;
    
    // If tokenCompanySlot is 1, we need to invert the price
    return tokenCompanySlot === 1 ? 1 / price : price;
  }, []);

  /**
   * Fetch the SDAI to USD rate from the rate provider contract
   * This uses the getRate function and converts the result to a decimal by dividing by 10^18
   */
  const fetchSdaiPrice = useCallback(async () => {
    try {
      // Get provider with correct RPC for current chain
      // Shared provider — see utils/getBestRpc.js. Building one per call cost
      // a network-detection round trip each time, and this runs on a timer.
      const provider = getRpcProvider(chainId);
      
      // Create contract instance for SDAI rate provider
      const sdaiRateContract = new ethers.Contract(
        SDAI_CONTRACT_RATE,
        SDAI_RATE_PROVIDER_ABI,
        provider
      );
      
      // Fetch the rate
      const rate = await sdaiRateContract.getRate();
      
      // Convert to decimal (divide by 10^18)
      const sdaiPrice = parseFloat(ethers.utils.formatUnits(rate, 18));
      
      console.log('SDAI price fetched:', sdaiPrice);
      
      return sdaiPrice;
    } catch (error) {
      console.error('Error fetching SDAI price:', error);
      return null;
    }
  }, [chainId]);

  /**
   * Fetch currency token prices in terms of XDAI from SushiSwap V2
   * This will get the YES_SDAI and NO_SDAI prices in XDAI
   */
  const fetchCurrencyPricesInXdai = useCallback(async () => {
    try {
      // Use a provider with correct RPC for current chain
      // Shared provider — see utils/getBestRpc.js. Building one per call cost
      // a network-detection round trip each time, and this runs on a timer.
      const provider = getRpcProvider(chainId);
      
      // Create factory contract instance
      const factory = new ethers.Contract(
        SUSHISWAP_V2_FACTORY,
        SUSHISWAP_V2_FACTORY_ABI,
        provider
      );
      
      // Get YES token price (YES_SDAI to WXDAI)
      const yesPairAddress = await factory.getPair(
        WXDAI_ADDRESS,
        MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
      );
      
      // Get NO token price (NO_SDAI to WXDAI)
      const noPairAddress = await factory.getPair(
        WXDAI_ADDRESS,
        MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress
      );
      
      console.log('Currency token pairs:', {
        yesPairAddress,
        noPairAddress
      });
      
      let yesCurrencyInXdai = null;
      let noCurrencyInXdai = null;

      // Calculate YES_SDAI price in XDAI if pair exists
      if (yesPairAddress !== "0x0000000000000000000000000000000000000000") {
        const yesPair = new ethers.Contract(yesPairAddress, SUSHISWAP_V2_PAIR_ABI, provider);
        const yesToken0 = await yesPair.token0();
        const [yesReserve0, yesReserve1] = await yesPair.getReserves();
        
        // Calculate price based on which token is token0
        const yesTokenAddress = MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress;
        
        // Invert the calculation to get YES_SDAI per XDAI instead of XDAI per YES_SDAI
        yesCurrencyInXdai = yesTokenAddress.toLowerCase() === yesToken0.toLowerCase()
          ? ethers.utils.formatEther(yesReserve0) / ethers.utils.formatEther(yesReserve1)
          : ethers.utils.formatEther(yesReserve1) / ethers.utils.formatEther(yesReserve0);
          
        console.log('YES_SDAI per XDAI:', yesCurrencyInXdai);
      }

      // Calculate NO_SDAI price in XDAI if pair exists
      if (noPairAddress !== "0x0000000000000000000000000000000000000000") {
        const noPair = new ethers.Contract(noPairAddress, SUSHISWAP_V2_PAIR_ABI, provider);
        const noToken0 = await noPair.token0();
        const [noReserve0, noReserve1] = await noPair.getReserves();
        
        // Calculate price based on which token is token0
        const noTokenAddress = MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
        
        // Invert the calculation to get NO_SDAI per XDAI instead of XDAI per NO_SDAI
        noCurrencyInXdai = noTokenAddress.toLowerCase() === noToken0.toLowerCase()
          ? ethers.utils.formatEther(noReserve0) / ethers.utils.formatEther(noReserve1)
          : ethers.utils.formatEther(noReserve1) / ethers.utils.formatEther(noReserve0);
          
        console.log('NO_SDAI per XDAI:', noCurrencyInXdai);
      }
      
      return { yesCurrencyInXdai, noCurrencyInXdai };
    } catch (error) {
      console.error('Error fetching currency prices in XDAI:', error);
      return { yesCurrencyInXdai: null, noCurrencyInXdai: null };
    }
  }, [chainId]);

  /**
   * Fetch the latest pool prices directly from Uniswap V3 pool contracts
   * This uses the slot0 function to get the sqrtPriceX96 value
   */
  const fetchPoolPrices = useCallback(async () => {
    try {
      setPoolPrices(prev => ({ ...prev, loading: true, error: null }));

      // Get provider with correct RPC for current chain
      // Shared provider — see utils/getBestRpc.js. Building one per call cost
      // a network-detection round trip each time, and this runs on a timer.
      const provider = getRpcProvider(chainId);
      
      // Create contract instances
      const yesPoolContract = new ethers.Contract(
        POOL_CONFIG_YES.address,
        UNISWAP_V3_POOL_ABI,
        provider
      );
      
      const noPoolContract = new ethers.Contract(
        POOL_CONFIG_NO.address,
        UNISWAP_V3_POOL_ABI,
        provider
      );
      
      // Fetch all data in parallel: YES pool, NO pool, SDAI price, and currency prices in XDAI
      const [yesSlot0, noSlot0, sdaiPrice, currencyPrices] = await Promise.all([
        yesPoolContract.slot0(),
        noPoolContract.slot0(),
        fetchSdaiPrice(),
        fetchCurrencyPricesInXdai()
      ]);
      
      // Calculate prices
      const yesCompanyPrice = calculatePriceFromSqrtPriceX96(
        yesSlot0.sqrtPriceX96, 
        POOL_CONFIG_YES.tokenCompanySlot
      );
      
      const noCompanyPrice = calculatePriceFromSqrtPriceX96(
        noSlot0.sqrtPriceX96, 
        POOL_CONFIG_NO.tokenCompanySlot
      );
      
      // Calculate event probability based on YES currency price and SDAI rate
      let eventProbability = null;
      if (currencyPrices.yesCurrencyInXdai && sdaiPrice) {
        // Calculate probability as YES / SDAI rate
        eventProbability = currencyPrices.yesCurrencyInXdai / sdaiPrice;
        // Ensure probability is between 0 and 1
        eventProbability = Math.max(0, Math.min(1, eventProbability));
        console.log('Event probability calculated:', eventProbability);
      }
      
      // Update state with new prices
      setPoolPrices({
        yesCompanyPrice,
        noCompanyPrice,
        sdaiPrice,
        yesCurrencyInXdai: currencyPrices.yesCurrencyInXdai,
        noCurrencyInXdai: currencyPrices.noCurrencyInXdai,
        eventProbability,
        loading: false,
        error: null,
        lastUpdated: new Date()
      });
      
      return { 
        yesCompanyPrice, 
        noCompanyPrice, 
        sdaiPrice,
        yesCurrencyInXdai: currencyPrices.yesCurrencyInXdai,
        noCurrencyInXdai: currencyPrices.noCurrencyInXdai,
        eventProbability
      };
    } catch (error) {
      console.error('Error fetching pool prices:', error);
      setPoolPrices(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to fetch pool prices'
      }));
      return { 
        yesCompanyPrice: null, 
        noCompanyPrice: null, 
        sdaiPrice: null,
        yesCurrencyInXdai: null,
        noCurrencyInXdai: null,
        eventProbability: null
      };
    }
  }, [calculatePriceFromSqrtPriceX96, fetchSdaiPrice, fetchCurrencyPricesInXdai, chainId]);

  // Fetch pool prices on initial load
  useEffect(() => {
    fetchPoolPrices();
    
    // Set up polling interval for price updates
    const interval = setInterval(() => {
      fetchPoolPrices();
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchPoolPrices]);

  return {
    balances,
    loading,
    error,
    status,
    smartSwap,
    closePositions,
    updateBalances,
    getTotalAvailableBalance,
    startAutoRefresh,
    stopAutoRefresh,
    getPosition,
    canCloseCurrency,
    addCollateral,
    removeCollateral,
    poolPrices,
    fetchPoolPrices
  };
};
