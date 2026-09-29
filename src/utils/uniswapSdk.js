import { ethers } from "ethers";
import { isSafeWallet } from './ethersAdapters';
import { SAFE_TRANSACTION_SENT, assertReceiptSucceeded } from './txErrors.js';
import { minReceiveFromQuote } from './swapQuoteMath.js';
import { approvalAmountFor } from './approvalAmount';
import { quoteUniswapV3ExactInput } from './uniswapV3Quote.mjs';

// Universal Router addresses by chain
const UNIVERSAL_ROUTER_ADDRESSES = {
  1: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',      // Ethereum Mainnet
  137: '0x1095692a6237d83c6a72f3f5efedb9a670c49223',    // Polygon
  10: '0xb555edF5dcF85f42cEeF1f3630a52A108E55A654',     // Optimism
  42161: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5', // Arbitrum
  100: '0x1095692a6237d83c6a72f3f5efedb9a670c49223',    // Gnosis (if deployed)
};

// QuoterV2 addresses by chain
const QUOTER_V2_ADDRESSES = {
  1: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',      // Ethereum Mainnet
  137: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',    // Polygon
  10: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',     // Optimism
  42161: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // Arbitrum
  8453: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',  // Base
  100: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',    // Gnosis (assuming same pattern)
};

// Permit2 address (same on all chains)
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Universal Router Commands
const Commands = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0d,
  V4_SWAP: 0x10,
  SWEEP: 0x04,
  PAY_PORTION: 0x06,
};

// Recipients
const RECIPIENT_MSG_SENDER = '0x0000000000000000000000000000000000000002';

// Permit2 max values
const MAX_UINT160 = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffffffffffff");
const MAX_UINT48 = ethers.BigNumber.from("0xffffffffffff");
const PERMIT2_MAX_EXPIRATION = MAX_UINT48.toNumber();

// Runtime config gas limits (from runtime-chains.config.json)
const GAS_CONFIG = {
  1: {
    minPriorityFeeGwei: "0.04",
    maxFeeGwei: "150",
    gasLimits: {
      split: 1000000,
      merge: 1500000,
      swap: 350000,
      approve: 100000
    }
  },
  137: {
    minPriorityFeeGwei: "30",
    maxFeeGwei: "500",
    gasLimits: {
      split: 1500000,
      merge: 1500000,
      swap: 500000,
      approve: 100000
    }
  },
  100: {
    minPriorityFeeGwei: "1",
    maxFeeGwei: "50",
    gasLimits: {
      split: 1500000,
      merge: 1500000,
      swap: 500000,
      approve: 100000
    }
  }
};

// ABI fragments
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Viem-compatible ABI
const ERC20_ABI_VIEM = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }]
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  }
];

const PERMIT2_ABI = [
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)"
];

const PERMIT2_ABI_VIEM = [
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
  },
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
  }
];

const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

const UNIVERSAL_ROUTER_ABI_VIEM = [
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

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)"
];

/**
 * Get gas configuration for a specific chain
 */
function getGasConfig(chainId) {
  return GAS_CONFIG[chainId] || GAS_CONFIG[1]; // Default to Ethereum if chain not found
}

/**
 * Calculate gas price following SDK pattern
 */
async function calculateGasPrice(provider, chainId = 1) {
  const config = getGasConfig(chainId);
  const minPriorityFee = ethers.utils.parseUnits(config.minPriorityFeeGwei, "gwei");

  try {
    const feeData = await provider.getFeeData();

    // Use network's priority fee but ensure it meets minimum
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || minPriorityFee;
    if (maxPriorityFeePerGas.lt(minPriorityFee)) {
      maxPriorityFeePerGas = minPriorityFee;
    }

    // Calculate max fee with buffer
    let maxFeePerGas = feeData.maxFeePerGas;
    if (!maxFeePerGas) {
      // If no EIP-1559, use gas price + priority fee
      const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("20", "gwei");
      maxFeePerGas = gasPrice.add(maxPriorityFeePerGas);
    }

    // Apply max fee cap from config
    const maxFeeCap = ethers.utils.parseUnits(config.maxFeeGwei, "gwei");
    if (maxFeePerGas.gt(maxFeeCap)) {
      maxFeePerGas = maxFeeCap;
    }

    return { maxPriorityFeePerGas, maxFeePerGas };
  } catch (error) {
    console.warn("Error calculating gas price, using defaults:", error);
    return {
      maxPriorityFeePerGas: minPriorityFee,
      maxFeePerGas: ethers.utils.parseUnits(config.maxFeeGwei, "gwei")
    };
  }
}

/**
 * Check ERC20 approval to Permit2
 */
async function checkERC20Approval(tokenAddress, ownerAddress, provider, publicClient = null) {
  if (publicClient) {
    // Use viem
    const allowanceResult = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI_VIEM,
      functionName: 'allowance',
      args: [ownerAddress, PERMIT2_ADDRESS]
    });
    return ethers.BigNumber.from(allowanceResult.toString());
  } else {
    // Use ethers
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowance = await tokenContract.allowance(ownerAddress, PERMIT2_ADDRESS);
    return allowance;
  }
}

/**
 * Check Permit2 approval to Universal Router
 */
async function checkPermit2Approval(tokenAddress, ownerAddress, provider, chainId = 1, publicClient = null) {
  const routerAddress = UNIVERSAL_ROUTER_ADDRESSES[chainId];

  try {
    let amount, expiration, nonce;

    if (publicClient) {
      // Use viem
      const result = await publicClient.readContract({
        address: PERMIT2_ADDRESS,
        abi: PERMIT2_ABI_VIEM,
        functionName: 'allowance',
        args: [ownerAddress, tokenAddress, routerAddress]
      });
      [amount, expiration, nonce] = result;
    } else {
      // Use ethers
      const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, provider);
      [amount, expiration, nonce] = await permit2Contract.allowance(
        ownerAddress,
        tokenAddress,
        routerAddress
      );
    }

    const now = Math.floor(Date.now() / 1000);

    // Convert to appropriate types (handle both BigNumber and BigInt)
    let amountBN, expirationNum;

    // Handle amount (could be BigNumber or BigInt)
    if (typeof amount === 'bigint') {
      amountBN = ethers.BigNumber.from(amount.toString());
    } else {
      amountBN = amount; // Already a BigNumber
    }

    // Handle expiration (could be BigNumber, BigInt, or number)
    if (typeof expiration === 'bigint') {
      expirationNum = Number(expiration);
    } else if (typeof expiration === 'object' && expiration.toNumber) {
      expirationNum = expiration.toNumber();
    } else {
      expirationNum = Number(expiration);
    }

    // Check if approved: amount > 0 and not expired
    const isApproved = amountBN.gt(0) && expirationNum > now;

    // Check if this is a MAX approval
    const isMaxApproval = amountBN.gte(MAX_UINT160) && expirationNum >= Number(MAX_UINT48);

    console.log('[Permit2] Approval check:', {
      token: tokenAddress,
      owner: ownerAddress,
      router: routerAddress,
      amount: amountBN.toString(),
      amountHex: amountBN.toHexString(),
      expiration: expirationNum,
      expirationHex: '0x' + expirationNum.toString(16),
      now,
      isApproved,
      isMaxApproval,
      timeUntilExpiry: expirationNum - now,
      MAX_UINT160: MAX_UINT160.toString(),
      MAX_UINT48: MAX_UINT48.toString()
    });

    return {
      amount: amountBN,
      expiration: expirationNum,
      nonce: typeof nonce === 'object' && nonce.toNumber ? nonce.toNumber() : Number(nonce),
      isApproved
    };
  } catch (error) {
    console.error("Error checking Permit2 approval:", error);
    return {
      amount: ethers.BigNumber.from(0),
      expiration: 0,
      nonce: 0,
      isApproved: false
    };
  }
}

/**
 * Approve token to Permit2 (Step 1 of cartridge flow)
 */
export async function approveTokenToPermit2(tokenAddress, signer, walletClient = null, publicClient = null, amount, connector) {
  if (amount == null) throw new Error('Required approval amount is missing');
  const isEthersSigner = signer && signer.getChainId && typeof signer.getChainId === 'function' && !signer._isSigner;

  let chainId;
  if (isEthersSigner) {
    chainId = await signer.getChainId();
  } else {
    chainId = await publicClient.getChainId();
  }

  const config = getGasConfig(chainId);

  if (isEthersSigner) {
    // Use ethers
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const gasPrice = await calculateGasPrice(signer.provider, chainId);

    const tx = await tokenContract.approve(PERMIT2_ADDRESS, amount, {
      gasLimit: config.gasLimits.approve,
      ...gasPrice
    });

    return tx;
  } else {
    // Use viem
    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI_VIEM,
      functionName: 'approve',
      args: [PERMIT2_ADDRESS, amount.toString()]
    });

    // Check for Safe wallet
    if (walletClient && isSafeWallet(walletClient, connector)) {
      console.log('[approveTokenToPermit2] Safe wallet detected - skipping wait() and throwing SAFE_TRANSACTION_SENT');
      throw new Error(SAFE_TRANSACTION_SENT);
    }

    return { hash };
  }
}

/**
 * Approve Permit2 to Universal Router (Step 2 of cartridge flow)
 */
export async function approvePermit2ToRouter(tokenAddress, signer, amount, duration = 'max', walletClient = null, publicClient = null, chainId = null, connector) {
  if (amount == null) throw new Error('Required Permit2 approval amount is missing');
  const isEthersSigner = signer && signer.getChainId && typeof signer.getChainId === 'function' && !signer._isSigner;

  if (!chainId) {
    chainId = isEthersSigner ? await signer.getChainId() : await publicClient.getChainId();
  }

  const routerAddress = UNIVERSAL_ROUTER_ADDRESSES[chainId];
  const config = getGasConfig(chainId);

  // Calculate expiration
  let expiration;
  if (duration === 'max') {
    expiration = PERMIT2_MAX_EXPIRATION;
  } else {
    const now = Math.floor(Date.now() / 1000);
    const durationSeconds = typeof duration === 'number' ? duration : 31536000; // 1 year default
    expiration = Math.min(now + durationSeconds, PERMIT2_MAX_EXPIRATION);
  }

  let tx;

  if (isEthersSigner) {
    // Use ethers
    const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
    const gasPrice = await calculateGasPrice(signer.provider, chainId);

    tx = await permit2Contract.approve(
      tokenAddress,
      routerAddress,
      amount,
      expiration,
      {
        gasLimit: config.gasLimits.approve,
        ...gasPrice
      }
    );
  } else {
    // Use viem
    const hash = await walletClient.writeContract({
      address: PERMIT2_ADDRESS,
      abi: PERMIT2_ABI_VIEM,
      functionName: 'approve',
      args: [tokenAddress, routerAddress, amount.toString(), expiration]
    });

    tx = { hash };

    // Check for Safe wallet
    if (walletClient && isSafeWallet(walletClient, connector)) {
      console.log('[approvePermit2ToRouter] Safe wallet detected - skipping wait() and throwing SAFE_TRANSACTION_SENT');
      throw new Error(SAFE_TRANSACTION_SENT);
    }
  }

  return tx;
}

/**
 * Execute swap through Universal Router (Step 3 of cartridge flow)
 */
export async function executeUniswapV3Swap({
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  fee = 500, // 0.05% for conditional tokens
  recipient,
  signer,
  walletClient = null,
  publicClient = null,
  account = null,
  connector // wagmi useAccount() connector, for Safe detection
}) {
  const isEthersSigner = signer && signer.getChainId && typeof signer.getChainId === 'function' && !signer._isSigner;

  let chainId, routerAddress, ownerAddress;

  if (isEthersSigner) {
    chainId = await signer.getChainId();
    ownerAddress = await signer.getAddress();
  } else {
    chainId = await publicClient.getChainId();
    ownerAddress = account;
  }

  routerAddress = UNIVERSAL_ROUTER_ADDRESSES[chainId];
  const config = getGasConfig(chainId);

  const approvalDecimals = isEthersSigner
    ? await new ethers.Contract(tokenIn, ERC20_ABI, signer.provider).decimals()
    : await publicClient.readContract({ address: tokenIn, abi: ERC20_ABI_VIEM, functionName: 'decimals' });
  const approvalAmount = ethers.utils.parseUnits(amountIn.toString(), approvalDecimals);
  const [permit2Status, erc20Allowance] = await Promise.all([
    checkPermit2Approval(tokenIn, ownerAddress, isEthersSigner ? signer.provider : null, chainId, publicClient),
    checkERC20Approval(tokenIn, ownerAddress, isEthersSigner ? signer.provider : null, publicClient)
  ]);

  if (erc20Allowance.lt(approvalAmount)) {
      console.log('[UniswapSDK] ERC20 approval to Permit2 needed, approving...');
      const approveTx = await approveTokenToPermit2(tokenIn, signer, walletClient, publicClient, approvalAmount, connector);

      if (isEthersSigner) {
        await approveTx.wait();
      } else {
        assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash: approveTx.hash }), approveTx.hash);
      }
      console.log('[UniswapSDK] ERC20 approval to Permit2 completed');
  }

  if (!permit2Status.isApproved || permit2Status.amount.lt(approvalAmount)) {
    console.log('[UniswapSDK] Approving Permit2 to Universal Router...');
    const permit2Tx = await approvePermit2ToRouter(tokenIn, signer, approvalAmount, 'max', walletClient, publicClient, chainId, connector);

    if (isEthersSigner) {
      await permit2Tx.wait();
    } else {
      assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash: permit2Tx.hash }), permit2Tx.hash);
    }
    console.log('[UniswapSDK] Permit2 approval to Router completed');
  } else {
    console.log('[UniswapSDK] Permit2 allowance sufficient, proceeding with swap');
  }

  // Get token decimals
  let decimalsIn, decimalsOut, symbolIn, symbolOut;

  if (isEthersSigner) {
    const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer.provider);
    const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, signer.provider);

    [decimalsIn, decimalsOut, symbolIn, symbolOut] = await Promise.all([
      tokenInContract.decimals(),
      tokenOutContract.decimals(),
      tokenInContract.symbol(),
      tokenOutContract.symbol()
    ]);
  } else {
    // Use viem
    [decimalsIn, decimalsOut, symbolIn, symbolOut] = await Promise.all([
      publicClient.readContract({ address: tokenIn, abi: ERC20_ABI_VIEM, functionName: 'decimals' }),
      publicClient.readContract({ address: tokenOut, abi: ERC20_ABI_VIEM, functionName: 'decimals' }),
      publicClient.readContract({ address: tokenIn, abi: ERC20_ABI_VIEM, functionName: 'symbol' }),
      publicClient.readContract({ address: tokenOut, abi: ERC20_ABI_VIEM, functionName: 'symbol' })
    ]);
  }

  // Parse amounts
  const amountInWei = ethers.utils.parseUnits(amountIn.toString(), decimalsIn);
  const minAmountOutWei = ethers.utils.parseUnits(minAmountOut.toString(), decimalsOut);
  if (minAmountOutWei.isZero()) throw new Error('minAmountOut must come from a non-zero pool quote');

  // Build the path: tokenIn + fee (3 bytes) + tokenOut
  // Using ethers encodePacked equivalent
  const path = ethers.utils.solidityPack(
    ['address', 'uint24', 'address'],
    [tokenIn, fee, tokenOut]
  );

  // Encode V3_SWAP_EXACT_IN parameters
  const v3SwapParams = ethers.utils.defaultAbiCoder.encode(
    ['address', 'uint256', 'uint256', 'bytes', 'bool'],
    [
      recipient || RECIPIENT_MSG_SENDER,
      amountInWei,
      minAmountOutWei,
      path,
      true // payerIsUser
    ]
  );

  // Encode SWEEP parameters
  const sweepParams = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'uint256'],
    [
      tokenOut,
      recipient || ownerAddress,
      minAmountOutWei
    ]
  );

  // Build commands (following exact SDK pattern)
  const commands = ethers.utils.hexlify([Commands.V3_SWAP_EXACT_IN, Commands.SWEEP]);
  const inputs = [v3SwapParams, sweepParams];
  const deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000) + 1200); // 20 minutes

  let tx;

  if (isEthersSigner) {
    // Use ethers
    const gasPrice = await calculateGasPrice(signer.provider, chainId);
    const routerContract = new ethers.Contract(routerAddress, UNIVERSAL_ROUTER_ABI, signer);

    tx = await routerContract.execute(commands, inputs, deadline, {
      value: 0,
      gasLimit: config.gasLimits.swap,
      ...gasPrice
    });
  } else {
    // Use viem
    const hash = await walletClient.writeContract({
      address: routerAddress,
      abi: UNIVERSAL_ROUTER_ABI_VIEM,
      functionName: 'execute',
      args: [commands, inputs, deadline],
      value: BigInt(0)
    });

    tx = { hash };

    // Check for Safe wallet
    if (walletClient && isSafeWallet(walletClient, connector)) {
      console.log('[executeUniswapV3Swap] Safe wallet detected - skipping wait() and throwing SAFE_TRANSACTION_SENT');
      throw new Error(SAFE_TRANSACTION_SENT);
    }
  }

  console.log(`🔄 Swap executed: ${amountIn} ${symbolIn} → ${symbolOut}`);
  console.log(`📝 Transaction: ${tx.hash}`);

  return tx;
}

/**
 * Complete swap flow with all approvals (following cartridge pattern)
 */
export async function completeSwapFlow({
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  fee = 500,
  recipient,
  signer,
  onProgress
}) {
  const chainId = await signer.getChainId();
  const ownerAddress = await signer.getAddress();

  try {
    // Step 1: Check ERC20 approval to Permit2
    if (onProgress) onProgress({ step: 'checking', message: 'Checking approvals...' });

    const erc20Allowance = await checkERC20Approval(tokenIn, ownerAddress, signer.provider);
    const decimals = await new ethers.Contract(tokenIn, ERC20_ABI, signer.provider).decimals();
    const amountInWei = ethers.utils.parseUnits(amountIn.toString(), decimals);

    if (erc20Allowance.lt(amountInWei)) {
      if (onProgress) onProgress({ step: 'erc20_approve', message: 'Approving token to Permit2...' });

      const approveTx = await approveTokenToPermit2(tokenIn, signer, null, null, amountInWei);
      await approveTx.wait();

      if (onProgress) onProgress({ step: 'erc20_approved', message: 'Token approved to Permit2!' });
    }

    // Step 2: Check Permit2 approval to Universal Router
    const permit2Status = await checkPermit2Approval(tokenIn, ownerAddress, signer.provider, chainId);

    if (!permit2Status.isApproved || permit2Status.amount.lt(amountInWei)) {
      if (onProgress) onProgress({ step: 'permit2_approve', message: 'Approving Permit2 to Universal Router...' });

      const permit2Tx = await approvePermit2ToRouter(tokenIn, signer, amountInWei);
      await permit2Tx.wait();

      if (onProgress) onProgress({ step: 'permit2_approved', message: 'Permit2 approved to Router!' });
    }

    // Step 3: Execute the swap
    if (onProgress) onProgress({ step: 'swapping', message: 'Executing swap...' });

    const swapTx = await executeUniswapV3Swap({
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      fee,
      recipient,
      signer
    });

    const receipt = await swapTx.wait();

    if (onProgress) onProgress({
      step: 'complete',
      message: 'Swap completed!',
      receipt
    });

    return receipt;

  } catch (error) {
    if (onProgress) onProgress({
      step: 'error',
      message: `Error: ${error.message}`,
      error
    });
    throw error;
  }
}

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

/**
 * Check and approve if needed (helper for ConfirmSwapModal integration)
 */
export async function checkAndApproveForUniswapSDK(
  tokenAddress,
  spenderAddress, // Will be ignored, we use Permit2 flow
  amountToApprove,
  signer,
  onStepComplete,
  useUnlimitedApproval = false, // New parameter: false = exact amount, true = unlimited
  walletClient = null, // viem wallet client for mobile support
  publicClient = null, // viem public client for reading
  account = null, // user address for viem
  connector // wagmi useAccount() connector, for Safe detection
) {
  // Detect if we're using viem or ethers
  const isEthersSigner = signer && signer.getChainId && typeof signer.getChainId === 'function' && !signer._isSigner;

  let chainId;
  let ownerAddress;

  if (isEthersSigner) {
    chainId = await signer.getChainId();
    ownerAddress = await signer.getAddress();
  } else {
    // Using viem - get chainId from publicClient
    chainId = await publicClient.getChainId();
    ownerAddress = account;
  }

  try {
    console.log('[UniswapSDK] Checking approval status for token:', tokenAddress);

    // Check both ERC20 and Permit2 status upfront
    const [erc20Allowance, permit2Status] = await Promise.all([
      checkERC20Approval(tokenAddress, ownerAddress, isEthersSigner ? signer.provider : null, publicClient),
      checkPermit2Approval(tokenAddress, ownerAddress, isEthersSigner ? signer.provider : null, chainId, publicClient)
    ]);

    console.log('[UniswapSDK] Approval status:', {
      erc20ToPermit2: erc20Allowance.toString(),
      permit2Approved: permit2Status.isApproved,
      permit2Amount: permit2Status.amount.toString(),
      permit2Expiration: permit2Status.expiration
    });

    // Exact approvals are consumed, so both allowances must cover this trade.
    if (permit2Status.isApproved && permit2Status.amount.gte(amountToApprove) && erc20Allowance.gte(amountToApprove)) {
      console.log('[UniswapSDK] All approvals already in place, skipping');
      if (onStepComplete) {
        onStepComplete(1, true); // Step 1 already done
        onStepComplete(2, true); // Step 2 already done
      }
      return true;
    }

    // Step 1: Approve ERC20 to Permit2 if needed
    const needsERC20Approval = erc20Allowance.lt(amountToApprove);

    if (needsERC20Approval) {
      console.log(`[UniswapSDK] ERC20 approval needed (${useUnlimitedApproval ? 'unlimited' : 'exact amount'})`);
      if (onStepComplete) onStepComplete(1, false); // Step 1 starting

      const approvalAmount = approvalAmountFor(amountToApprove, useUnlimitedApproval);
      const permit2Address = PERMIT2_ADDRESS;

      if (isEthersSigner) {
        // Use ethers
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const approveTx = await tokenContract.approve(permit2Address, approvalAmount);
        await approveTx.wait();
      } else {
        // Use viem
        const hash = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI_VIEM,
          functionName: 'approve',
          args: [permit2Address, approvalAmount.toString()]
        });
        if (isSafeWallet(walletClient, connector)) {
          console.log('[UniswapSDK] Safe wallet detected - skipping wait() and throwing SAFE_TRANSACTION_SENT');
          throw new Error(SAFE_TRANSACTION_SENT);
        }
        assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
      }

      console.log(`[UniswapSDK] ERC20 approval completed (amount: ${approvalAmount.toString()})`);
      if (onStepComplete) onStepComplete(1, true); // Step 1 complete
    } else {
      console.log('[UniswapSDK] ERC20 approval sufficient, skipping step 1');
      if (onStepComplete) onStepComplete(1, true); // Step 1 already done
    }

    // Step 2: Approve Permit2 to Universal Router if needed
    if (!permit2Status.isApproved || permit2Status.amount.lt(amountToApprove)) {
      console.log('[UniswapSDK] Permit2 approval needed');
      if (onStepComplete) onStepComplete(2, false); // Step 2 starting

      const permit2Amount = approvalAmountFor(amountToApprove, useUnlimitedApproval, MAX_UINT160);
      const permit2Tx = await approvePermit2ToRouter(tokenAddress, signer, permit2Amount, 'max', walletClient, publicClient, chainId, connector);

      if (isEthersSigner) {
        await permit2Tx.wait();
      } else {
        assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash: permit2Tx.hash }), permit2Tx.hash);
      }

      console.log('[UniswapSDK] Permit2 approval completed');
      if (onStepComplete) onStepComplete(2, true); // Step 2 complete
    } else {
      console.log('[UniswapSDK] Permit2 already approved, skipping step 2');
      if (onStepComplete) onStepComplete(2, true); // Step 2 already done
    }

    return true;
  } catch (error) {
    console.error("Approval error:", error);
    throw error;
  }
}

/**
 * Execute swap for ConfirmSwapModal integration
 */
export async function executeSwapForUniswapSDK(
  inputToken,
  outputToken,
  inputAmount,
  quotedAmountOutRaw,
  recipient,
  signer,
  slippageTolerance = 0.005,
  walletClient = null,
  publicClient = null,
  account = null,
  outputDecimals = 18,
  connector // wagmi useAccount() connector, for Safe detection
) {
  const isEthersSigner = signer && signer.getChainId && typeof signer.getChainId === 'function' && !signer._isSigner;

  let chainId;
  if (isEthersSigner) {
    chainId = await signer.getChainId();
  } else {
    chainId = await publicClient.getChainId();
  }

  // Determine fee tier based on token type (conditional tokens use 500)
  const fee = 500; // 0.05% for conditional tokens

  const quotedAmountOut = ethers.BigNumber.from(quotedAmountOutRaw || 0);
  if (quotedAmountOut.isZero()) throw new Error('A non-zero on-chain quote is required for minOut');
  // Same formula as the confirm dialog's "Min. Receive" (tolerance in percent there)
  const minAmountWithSlippage = ethers.BigNumber.from(
    minReceiveFromQuote(quotedAmountOut.toString(), slippageTolerance * 100).toString()
  );

  try {
    const tx = await executeUniswapV3Swap({
      tokenIn: inputToken,
      tokenOut: outputToken,
      amountIn: inputAmount,
      minAmountOut: ethers.utils.formatUnits(minAmountWithSlippage, outputDecimals),
      fee,
      recipient: recipient || (isEthersSigner ? await signer.getAddress() : account),
      signer,
      walletClient,
      publicClient,
      account,
      connector
    });

    return tx;
  } catch (error) {
    console.error("Swap execution error:", error);
    throw error;
  }
}
