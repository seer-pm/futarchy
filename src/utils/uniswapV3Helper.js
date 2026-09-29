import { ethers } from 'ethers';
import { isSafeWallet } from './ethersAdapters';
import { approvalAmountFor } from './approvalAmount';

/**
 * Uniswap V3 Helper for Ethereum Mainnet
 * Following the same pattern as sushiswapV3Helper.js and futarchy-sdk gas management
 */

/**
 * Ethereum Mainnet Contract Addresses
 */
export const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // SwapRouter on Ethereum
export const UNISWAP_UNIVERSAL_ROUTER = "0x66a9893cc07d91d95644aedd05d03f95e1dba8af"; // Universal Router on Ethereum
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Permit2 on Ethereum
export const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59F267346ea31F984"; // V3 Factory on Ethereum
export const UNISWAP_V3_NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // NFT Position Manager

/**
 * Uniswap V3 SwapRouter ABI for exactInputSingle
 */
const UNISWAP_V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)"
];

/**
 * Permit2 ABI for approval management
 */
const PERMIT2_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' }
    ],
    outputs: []
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' }
    ]
  }
];

/**
 * Universal Router ABI for execute function
 */
const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: []
  }
];

/**
 * Pool configuration for Uniswap V3 on Ethereum
 * These would be the actual pool addresses for YES/NO tokens on mainnet
 */
export const UNISWAP_V3_POOL_CONFIG = {
  YES: {
    // These addresses would need to be updated with actual mainnet pool addresses
    address: "0x0000000000000000000000000000000000000000", // Placeholder - needs actual pool
    fee: 500, // 0.05% fee tier (SDK uses this for conditional tokens)
    tokenCurrencySlot: 0,
    tokenCompanySlot: 1
  },
  NO: {
    address: "0x0000000000000000000000000000000000000000", // Placeholder - needs actual pool
    fee: 500, // 0.05% fee tier (SDK uses this for conditional tokens)
    tokenCurrencySlot: 0,
    tokenCompanySlot: 1
  }
};

/**
 * Helper to calculate gas prices dynamically (following futarchy-sdk pattern)
 */
const calculateGasPrice = async (provider, chainId = 1) => {
  // Get current fee data from network
  const feeData = await provider.getFeeData().catch(() => ({}));

  console.log('Network fee data:', {
    gasPrice: feeData.gasPrice ? ethers.utils.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : 'N/A',
    maxFeePerGas: feeData.maxFeePerGas ? ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : 'N/A',
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'N/A'
  });

  // Minimum priority fee for Ethereum (0.04 gwei like futarchy-sdk)
  const minPriorityFee = ethers.utils.parseUnits("0.04", "gwei");

  // For priority fee: use network suggestion or minimum
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || minPriorityFee;
  if (maxPriorityFeePerGas.lt(minPriorityFee)) {
    maxPriorityFeePerGas = minPriorityFee;
  }

  // For max fee: use network's suggestion directly, or calculate from gas price
  let maxFeePerGas;
  if (feeData.maxFeePerGas) {
    // Use network's EIP-1559 suggestion
    maxFeePerGas = feeData.maxFeePerGas;
  } else if (feeData.gasPrice) {
    // Use legacy gas price + buffer
    maxFeePerGas = feeData.gasPrice.mul(120).div(100); // Add 20% buffer
  } else {
    // Fallback: ensure at least 2x priority fee
    maxFeePerGas = maxPriorityFeePerGas.mul(2);
  }

  // Ensure maxFeePerGas is reasonable (between 0.08 gwei and 150 gwei)
  const absoluteMin = ethers.utils.parseUnits("0.08", "gwei"); // At least 0.08 gwei
  const absoluteMax = ethers.utils.parseUnits("150", "gwei");  // Cap at 150 gwei

  if (maxFeePerGas.lt(absoluteMin)) {
    maxFeePerGas = absoluteMin;
  }
  if (maxFeePerGas.gt(absoluteMax)) {
    maxFeePerGas = absoluteMax;
  }

  console.log('Calculated gas prices:', {
    maxPriorityFeePerGas: ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei') + ' gwei',
    maxFeePerGas: ethers.utils.formatUnits(maxFeePerGas, 'gwei') + ' gwei'
  });

  return {
    maxPriorityFeePerGas,
    maxFeePerGas
  };
};

/**
 * Check and handle token approval for Uniswap V3 with Permit2
 * @param {Object} params - Parameters for token approval
 * @param {Object} params.signer - Ethers signer
 * @param {string} params.tokenAddress - Address of token to approve
 * @param {string} params.amount - Amount to approve
 * @param {boolean} params.usePermit2 - Whether to use Permit2 (true for Ethereum)
 * @param {Function} params.onApprovalNeeded - Callback when approval is needed
 * @param {Function} params.onApprovalComplete - Callback when approval completes
 * @param {Object} params.publicClient - Wagmi public client for reading blockchain state
 * @returns {Promise<boolean>} Whether approval was needed and completed
 */
export const checkAndApproveTokenForUniswapV3 = async ({
  signer,
  tokenAddress,
  amount,
  usePermit2 = true, // Default to true for Ethereum mainnet
  onApprovalNeeded,
  onApprovalComplete,
  publicClient = null,
  walletClient = null, // Add walletClient param
  connector, // wagmi useAccount() connector, for Safe detection
  useUnlimitedApproval = false
}) => {
  let checksummedTokenAddress;
  let spenderAddress;
  let spenderName;

  try {
    console.log('=== UNISWAP V3 APPROVAL ENTRY ===');
    console.log('Token Address:', tokenAddress);
    console.log('Amount:', amount.toString());
    console.log('Use Permit2:', usePermit2);
    console.log('Has walletClient:', !!walletClient);
    console.log('================================');

    const userAddress = await signer.getAddress();
    console.log('User Address:', userAddress);

    // Determine spender based on Permit2 usage
    if (usePermit2) {
      // For Ethereum: First approve to Permit2, then Permit2 approves to Universal Router
      spenderAddress = PERMIT2_ADDRESS;
      spenderName = 'Permit2';
    } else {
      // Direct approval to SwapRouter (fallback option)
      spenderAddress = UNISWAP_V3_ROUTER;
      spenderName = 'Uniswap V3 SwapRouter';
    }

    console.log(`Target Spender: ${spenderName} (${spenderAddress})`);

    // Checksum the token address
    checksummedTokenAddress = ethers.utils.getAddress(tokenAddress);

    // Check current allowance
    let currentAllowance;
    const ERC20_ABI = [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)"
    ];

    if (publicClient) {
      console.log('Using publicClient to check allowance...');
      const allowanceResult = await publicClient.readContract({
        address: checksummedTokenAddress,
        abi: [{ "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" }],
        functionName: 'allowance',
        args: [userAddress, spenderAddress]
      });
      currentAllowance = ethers.BigNumber.from(allowanceResult.toString());
    } else {
      console.log('Using ethers contract to check allowance...');
      const tokenContract = new ethers.Contract(checksummedTokenAddress, ERC20_ABI, signer);
      currentAllowance = await tokenContract.allowance(userAddress, spenderAddress);
    }

    console.log('Current Allowance:', currentAllowance.toString());
    console.log('Required Amount:', amount.toString());

    const hasEnoughAllowance = currentAllowance.gte(amount);

    // Check if we need ERC20 approval
    if (hasEnoughAllowance) {
      console.log('ERC20 allowance sufficient:', {
        isPermit2: usePermit2,
        currentAllowance: currentAllowance.toString()
      });

      // If using Permit2, also check Permit2 allowance to Universal Router
      if (usePermit2) {
        console.log('Checking Permit2 allowance to Universal Router...');

        let permit2Allowance = ethers.BigNumber.from(0);
        let permit2Expiration = 0;
        const currentTime = Math.floor(Date.now() / 1000);

        if (publicClient) {
          try {
            const result = await publicClient.readContract({
              address: PERMIT2_ADDRESS,
              abi: PERMIT2_ABI,
              functionName: 'allowance',
              args: [userAddress, checksummedTokenAddress, UNISWAP_UNIVERSAL_ROUTER]
            });
            permit2Allowance = ethers.BigNumber.from(result.amount.toString());
            permit2Expiration = Number(result.expiration);
            console.log('Permit2 allowance check:', {
              amount: permit2Allowance.toString(),
              expiration: permit2Expiration,
              expired: permit2Expiration <= currentTime
            });
          } catch (e) {
            console.log('Could not check Permit2 allowance:', e.message);
          }
        } else {
          const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
          try {
            const result = await permit2Contract.allowance(userAddress, checksummedTokenAddress, UNISWAP_UNIVERSAL_ROUTER);
            permit2Allowance = ethers.BigNumber.from(result.amount.toString());
            permit2Expiration = Number(result.expiration);
            console.log('Permit2 allowance check:', {
              amount: permit2Allowance.toString(),
              expiration: permit2Expiration,
              expired: permit2Expiration <= currentTime
            });
          } catch (e) {
            console.log('Could not check Permit2 allowance:', e.message);
          }
        }

        // Need approval if amount insufficient OR expired
        const needsPermit2Approval = permit2Allowance.lt(amount) || permit2Expiration <= currentTime;

        if (needsPermit2Approval) {
          console.log('Need Permit2 approval:', {
            reason: permit2Allowance.lt(amount) ? 'insufficient amount' : 'expired',
            currentAllowance: permit2Allowance.toString(),
            requiredAmount: amount.toString(),
            expired: permit2Expiration <= currentTime
          });
          console.log('Need Permit2 approval to Universal Router');
          onApprovalNeeded?.();

          // Get gas prices dynamically
          const { maxPriorityFeePerGas, maxFeePerGas } = await calculateGasPrice(signer.provider);

          // Approve Permit2 to spend tokens on Universal Router.
          const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
          const MAX_UINT160 = ethers.BigNumber.from(2).pow(160).sub(1);
          const permit2ApprovalAmount = approvalAmountFor(amount, useUnlimitedApproval, MAX_UINT160);
          // Set expiration to max allowed by Permit2 (type(uint48).max)
          const MAX_EXPIRATION = 281474976710655; // 2^48 - 1
          const oneYearFromNow = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
          const expiration = Math.min(oneYearFromNow, MAX_EXPIRATION);

          const tx = await permit2Contract.approve(
            checksummedTokenAddress,
            UNISWAP_UNIVERSAL_ROUTER,
            permit2ApprovalAmount,
            expiration,
            {
              maxPriorityFeePerGas,
              maxFeePerGas,
              gasLimit: 100000
            }
          );

          console.log('Permit2 approval transaction:', tx.hash);

          // Check for Safe wallet
          if (walletClient && isSafeWallet(walletClient, connector)) {
            console.log('[checkAndApproveTokenForUniswapV3] Safe wallet detected (Permit2) - skipping wait() and throwing SAFE_TRANSACTION_SENT');
            throw new Error("SAFE_TRANSACTION_SENT");
          }

          await tx.wait();
          console.log('Permit2 approval confirmed for:', {
            token: checksummedTokenAddress,
            spender: UNISWAP_UNIVERSAL_ROUTER,
            amount: permit2ApprovalAmount.toString(),
            expiration: new Date(expiration * 1000).toISOString()
          });

          onApprovalComplete?.();
          return true;
        } else {
          console.log('Permit2 already approved - skipping:', {
            currentAllowance: permit2Allowance.toString(),
            expiration: new Date(permit2Expiration * 1000).toISOString()
          });
        }
      }

      return false; // No approval needed
    }

    // Need ERC20 approval
    console.log('=== INSUFFICIENT ALLOWANCE DETECTED ===');
    console.log('Initiating approval transaction...');

    onApprovalNeeded?.();

    // Create token contract and approve
    const tokenContract = new ethers.Contract(checksummedTokenAddress, ERC20_ABI, signer);

    const approvalAmount = approvalAmountFor(amount, useUnlimitedApproval);

    // Get gas prices dynamically
    const { maxPriorityFeePerGas, maxFeePerGas } = await calculateGasPrice(signer.provider);

    const tx = await tokenContract.approve(spenderAddress, approvalAmount, {
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasLimit: 100000
    });
    console.log('Approval transaction:', tx.hash);

    // Check for Safe wallet
    if (walletClient && isSafeWallet(walletClient, connector)) {
      console.log('[checkAndApproveTokenForUniswapV3] Safe wallet detected (ERC20) - skipping wait() and throwing SAFE_TRANSACTION_SENT');
      throw new Error("SAFE_TRANSACTION_SENT");
    }

    const receipt = await tx.wait();
    console.log('Approval confirmed:', receipt.transactionHash);

    // If using Permit2, also set up Permit2 -> Universal Router approval
    if (usePermit2) {
      console.log('Setting up Permit2 -> Universal Router approval...');

      // Get fresh gas prices for second transaction
      const { maxPriorityFeePerGas: gasPriority2, maxFeePerGas: gasMax2 } = await calculateGasPrice(signer.provider);

      const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
      const MAX_UINT160 = ethers.BigNumber.from(2).pow(160).sub(1);
      const permit2ApprovalAmount = approvalAmountFor(amount, useUnlimitedApproval, MAX_UINT160);
      // Set expiration to max allowed by Permit2 (type(uint48).max)
      const MAX_EXPIRATION = 281474976710655; // 2^48 - 1
      const oneYearFromNow = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
      const expiration = Math.min(oneYearFromNow, MAX_EXPIRATION);

      const permit2Tx = await permit2Contract.approve(
        checksummedTokenAddress,
        UNISWAP_UNIVERSAL_ROUTER,
        permit2ApprovalAmount,
        expiration,
        {
          maxPriorityFeePerGas: gasPriority2,
          maxFeePerGas: gasMax2,
          gasLimit: 100000
        }
      );

      console.log('Permit2 approval transaction:', permit2Tx.hash);

      // Check for Safe wallet
      if (walletClient && isSafeWallet(walletClient, connector)) {
        console.log('[checkAndApproveTokenForUniswapV3] Safe wallet detected (Permit2-2) - skipping wait() and throwing SAFE_TRANSACTION_SENT');
        throw new Error("SAFE_TRANSACTION_SENT");
      }

      await permit2Tx.wait();
      console.log('Permit2 approval confirmed');
    }

    onApprovalComplete?.();
    return true;

  } catch (error) {
    console.error('Error in Uniswap V3 approval:', error);
    throw error;
  }
};

/**
 * Execute a Uniswap V3 swap using exactInputSingle
 * @param {Object} params - Swap parameters
 * @param {Object} params.signer - Ethers signer
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {uint24} params.fee - Pool fee (500, 3000, or 10000)
 * @param {string} params.recipient - Recipient address
 * @param {BigNumber} params.amountIn - Input amount
 * @param {BigNumber} params.amountOutMinimum - Minimum output amount
 * @param {boolean} params.useUniversalRouter - Use Universal Router instead of SwapRouter
 * @returns {Promise<Object>} Transaction receipt
 */
export const executeUniswapV3Swap = async ({
  signer,
  tokenIn,
  tokenOut,
  fee = 500, // Default to 0.05% fee tier (SDK standard for conditional tokens)
  recipient,
  amountIn,
  amountOutMinimum,
  useUniversalRouter = false
}) => {
  try {
    if (ethers.BigNumber.from(amountOutMinimum || 0).isZero()) {
      throw new Error('amountOutMinimum must come from a non-zero pool quote');
    }
    console.log('=== EXECUTING UNISWAP V3 SWAP ===');
    console.log('Token In:', tokenIn);
    console.log('Token Out:', tokenOut);
    console.log('Amount In:', amountIn.toString());
    console.log('Min Amount Out:', amountOutMinimum.toString());
    console.log('Fee Tier:', fee);
    console.log('Use Universal Router:', useUniversalRouter);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
    const sqrtPriceLimitX96 = 0; // No price limit

    // Get gas prices dynamically
    const { maxPriorityFeePerGas, maxFeePerGas } = await calculateGasPrice(signer.provider);

    if (useUniversalRouter) {
      // Use Universal Router with commands (following futarchy-sdk pattern)
      console.log('Using Universal Router...');

      // Command constants matching SDK
      const COMMAND_V3_SWAP_EXACT_IN = 0x00;
      const COMMAND_SWEEP = 0x04;
      const RECIPIENT_MSG_SENDER = '0x0000000000000000000000000000000000000002';

      // Use 500 (0.05%) fee for conditional tokens like SDK does
      const actualFee = fee === 3000 ? 500 : fee;

      // Create encoded path: tokenIn -> fee -> tokenOut
      const path = ethers.utils.solidityPack(
        ['address', 'uint24', 'address'],
        [tokenIn, actualFee, tokenOut]
      );

      // V3_SWAP_EXACT_IN parameters (matching SDK exactly)
      const v3SwapParams = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [RECIPIENT_MSG_SENDER, amountIn, amountOutMinimum, path, true] // payerIsUser = true
      );

      // SWEEP parameters (sweep output token to recipient)
      const sweepParams = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [tokenOut, recipient || await signer.getAddress(), amountOutMinimum]
      );

      // Build commands bytes - must be a bytes string not just hex
      // SDK uses [0x00, 0x04] which becomes 0x0004
      const commandsArray = [COMMAND_V3_SWAP_EXACT_IN, COMMAND_SWEEP];
      const commands = ethers.utils.hexlify(commandsArray);
      console.log('Commands bytes:', commands, 'from array:', commandsArray); // Should be 0x0004

      // Inputs array
      const inputs = [v3SwapParams, sweepParams];

      const universalRouter = new ethers.Contract(
        UNISWAP_UNIVERSAL_ROUTER,
        UNIVERSAL_ROUTER_ABI,
        signer
      );

      console.log('Universal Router call details:', {
        router: UNISWAP_UNIVERSAL_ROUTER,
        commands,
        inputsLength: inputs.length,
        deadline: deadline.toString(),
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        fee: actualFee
      });

      const tx = await universalRouter.execute(
        commands,
        inputs,
        deadline,
        {
          maxPriorityFeePerGas,
          maxFeePerGas,
          gasLimit: 350000 // From futarchy-sdk Ethereum config for swaps
        }
      );

      console.log('Universal Router swap transaction:', tx.hash);
      const receipt = await tx.wait();
      console.log('Swap confirmed via Universal Router');
      return receipt;

    } else {
      // Use standard SwapRouter
      console.log('Using SwapRouter...');

      const swapRouter = new ethers.Contract(
        UNISWAP_V3_ROUTER,
        UNISWAP_V3_ROUTER_ABI,
        signer
      );

      const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: recipient || await signer.getAddress(),
        deadline,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96
      };

      console.log('Swap parameters:', params);

      const tx = await swapRouter.exactInputSingle(params, {
        maxPriorityFeePerGas,
        maxFeePerGas,
        gasLimit: 350000 // From futarchy-sdk Ethereum config for swaps
      });
      console.log('SwapRouter transaction:', tx.hash);

      const receipt = await tx.wait();
      console.log('Swap confirmed via SwapRouter');
      return receipt;
    }

  } catch (error) {
    console.error('Error executing Uniswap V3 swap:', error);
    throw error;
  }
};

/**
 * Get quote for Uniswap V3 swap
 * This would typically use the Quoter contract
 */
export const getUniswapV3Quote = async ({
  tokenIn,
  tokenOut,
  fee = 3000,
  amountIn,
  provider
}) => {
  try {
    // Quoter V2 address on Ethereum
    const QUOTER_V2_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

    const QUOTER_ABI = [
      "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ];

    const quoter = new ethers.Contract(QUOTER_V2_ADDRESS, QUOTER_ABI, provider);

    const params = {
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      sqrtPriceLimitX96: 0
    };

    // Note: This is a state-changing call, so it needs to be done via staticCall
    const result = await quoter.callStatic.quoteExactInputSingle(params);

    return {
      amountOut: result.amountOut,
      gasEstimate: result.gasEstimate
    };

  } catch (error) {
    console.error('Error getting Uniswap V3 quote:', error);
    throw error;
  }
};

/**
 * Helper to determine if we should use Permit2 based on chain
 */
export const shouldUsePermit2 = (chainId) => {
  // Use Permit2 on Ethereum mainnet and Polygon
  return chainId === 1 || chainId === 137;
};

/**
 * Helper to get the correct router address based on configuration
 */
export const getUniswapRouterAddress = (useUniversalRouter = false) => {
  return useUniversalRouter ? UNISWAP_UNIVERSAL_ROUTER : UNISWAP_V3_ROUTER;
};

/**
 * Uniswap V3 NonfungiblePositionManager ABI
 */
export const NFPM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

/**
 * Get user's Uniswap V3 positions for a specific pool
 * @param {Object} params - Parameters
 * @param {Object} params.provider - Ethers provider
 * @param {string} params.userAddress - User address
 * @param {string} params.token0 - Token 0 address
 * @param {string} params.token1 - Token 1 address
 * @param {number} params.fee - Fee tier
 * @returns {Promise<Array>} Array of position objects with tokenId, liquidity, and link
 */
export const getUserPositions = async ({
  provider,
  userAddress,
  token0,
  token1,
  fee = 500,
  managerAddress = UNISWAP_V3_NFT_POSITION_MANAGER // Allow overriding the manager address (e.g. for Swapr)
}) => {
  if (!provider || !userAddress || !token0 || !token1) return [];

  try {
    const nfpmContract = new ethers.Contract(managerAddress, NFPM_ABI, provider);
    const balance = await nfpmContract.balanceOf(userAddress);

    if (balance.eq(0)) return [];

    // Safety check: deeply iterating many positions (RPC heavy) causes timeouts/lag.
    // If user has > 50 positions, we abort and ask them to check manually.
    if (balance.gt(50)) {
      throw new Error("TOO_MANY_POSITIONS");
    }

    const positions = [];
    const targetA = token0.toLowerCase();
    const targetB = token1.toLowerCase();
    const targetFee = Number(fee);

    // Loop through all positions
    for (let i = 0; i < balance.toNumber(); i++) {
      try {
        const tokenId = await nfpmContract.tokenOfOwnerByIndex(userAddress, i);
        const position = await nfpmContract.positions(tokenId);

        const posToken0 = position.token0.toLowerCase();
        const posToken1 = position.token1.toLowerCase();
        const posFee = Number(position.fee);

        // Check match
        const isMatch =
          (posFee === targetFee) &&
          ((posToken0 === targetA && posToken1 === targetB) ||
            (posToken0 === targetB && posToken1 === targetA));

        if (isMatch && position.liquidity.gt(0)) {
          // Also check if liquidity > 0 to only show active positions? 
          // Or show all. The user requested "remove liquidity", so likely active ones.
          // Let's include 0 liquidity ones too as "Closed" if needed, but for now filtering liquidity > 0 is safer for "manage" context.
          // Actually, let's return all matching positions.
          positions.push({
            tokenId: tokenId.toString(),
            liquidity: position.liquidity.toString(),
            token0: posToken0,
            token1: posToken1,
            fee: posFee,
            link: `https://app.uniswap.org/pools/${tokenId}`
          });
        }
      } catch (err) {
        console.warn(`Error fetching position at index ${i}`, err);
      }
    }

    return positions;
  } catch (error) {
    console.error("Error fetching user positions:", error);
    return [];
  }
};
