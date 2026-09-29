// UniswapRouterCartridge.js - Universal Router Operations Cartridge for Uniswap V3/V4
// Supports swaps through the Universal Router on Polygon and other chains

import {
    parseUnits,
    formatUnits,
    parseEther,
    formatEther,
    encodePacked,
    encodeAbiParameters,
    toHex,
    concatHex
} from 'viem';
import { waitForSafeTxReceipt } from '../../src/utils/waitForSafeTxReceipt';
import { isSafeTransactionSent } from '../../src/utils/txErrors';

const MAX_UINT256 = (2n ** 256n) - 1n;
const MAX_UINT160 = (2n ** 160n) - 1n;
const MAX_UINT48 = (2n ** 48n) - 1n;
const PERMIT2_MAX_EXPIRATION = Number(MAX_UINT48);

// =============================================================================
// UNIVERSAL ROUTER CONSTANTS
// =============================================================================

// Universal Router addresses by chain
export const UNIVERSAL_ROUTER_ADDRESSES = {
    1: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',      // Ethereum Mainnet
    137: '0x1095692A6237d83C6a72F3F5eFEdb9A670C49223',    // Polygon
    10: '0xb555edF5dcF85f42cEeF1f3630a52A108E55A654',     // Optimism
    42161: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5', // Arbitrum
    100: '0x1095692A6237d83C6a72F3F5eFEdb9A670C49223',    // Gnosis (if deployed)
};

// Permit2 addresses (same on all chains)
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Universal Router Commands
export const Commands = {
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
export const RECIPIENT_MSG_SENDER = '0x0000000000000000000000000000000000000002';

// =============================================================================
// ABI FRAGMENTS
// =============================================================================

export const UNIVERSAL_ROUTER_ABI = [
    {
        type: 'function',
        name: 'execute',
        stateMutability: 'payable',
        inputs: [
            { name: 'commands', type: 'bytes' },
            { name: 'inputs', type: 'bytes[]' },
            { name: 'deadline', type: 'uint256' }
        ],
        outputs: []
    }
];

export const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }]
    },
    {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }]
    }
];

export const PERMIT2_ABI = [
    {
        type: 'function',
        name: 'allowance',
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
        type: 'function',
        name: 'approve',
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

// Helper to check for Safe wallet
const isSafeWallet = (walletClient) => {
    const connectorName = walletClient?.connector?.name?.toLowerCase();
    const connectorId = walletClient?.connector?.id?.toLowerCase();
    return connectorName === 'safe' || connectorId === 'safe';
};

// =============================================================================
// UNISWAP ROUTER CARTRIDGE CLASS
// =============================================================================

export class UniswapRouterCartridge {
    constructor(options = {}) {
        this.name = 'UniswapRouterCartridge';
        this.chainId = options.chainId || 137; // Default to Polygon
        this.routerAddress = options.routerAddress || UNIVERSAL_ROUTER_ADDRESSES[this.chainId];
        this.permit2Address = options.permit2Address || PERMIT2_ADDRESS;
        this.defaultFee = options.defaultFee || 500; // 0.05%

        // Define operations this cartridge provides
        this.operations = {
            'uniswap.universal.checkApprovals': this.checkApprovals.bind(this),
            'uniswap.universal.approveToken': this.approveToken.bind(this),
            'uniswap.universal.approvePermit2': this.approvePermit2.bind(this),
            'uniswap.universal.swapV3': this.swapV3.bind(this),
            'uniswap.universal.completeSwap': this.completeSwap.bind(this),
            'uniswap.universal.getQuote': this.getQuote.bind(this),
            'uniswap.universal.testSwap': this.testSwap.bind(this)
        };

        console.log(`🦄 ${this.name} initialized`);
        console.log(`📍 Chain ID: ${this.chainId}`);
        console.log(`📍 Universal Router: ${this.routerAddress}`);
        console.log(`📍 Permit2: ${this.permit2Address}`);
    }

    getSupportedOperations() {
        return Object.keys(this.operations);
    }

    supports(operation) {
        return operation in this.operations;
    }

    async* execute(operation, args, viemClients) {
        if (!this.supports(operation)) {
            yield {
                status: 'error',
                message: `Operation '${operation}' not supported by ${this.name}`,
                error: `Supported operations: ${this.getSupportedOperations().join(', ')}`
            };
            return;
        }

        try {
            yield* this.operations[operation](args, viemClients);
        } catch (error) {
            yield {
                status: 'error',
                message: `${operation} failed: ${error.message}`,
                error: error.message
            };
        }
    }

    // =============================================================================
    // OPERATIONS
    // =============================================================================

    /**
     * Check approval status for both ERC20 and Permit2
     */
    async* checkApprovals(args, { publicClient, account }) {
        const { tokenAddress } = args;

        yield {
            status: 'pending',
            message: 'Checking approval status...',
            step: 'check'
        };

        try {
            // Get the actual address string from account (could be object or string)
            const accountAddress = account.address || account;

            // Check ERC20 allowance to Permit2
            const erc20Allowance = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [accountAddress, this.permit2Address]
            });

            // Check Permit2 allowance to Universal Router
            const [amount, expiration, nonce] = await publicClient.readContract({
                address: this.permit2Address,
                abi: PERMIT2_ABI,
                functionName: 'allowance',
                args: [accountAddress, tokenAddress, this.routerAddress]
            });

            const now = Math.floor(Date.now() / 1000);
            const expirationNum = Number(expiration);
            const isPermit2Approved = amount > 0n && expirationNum > now;

            // Get token info
            const [symbol, decimals, balance] = await Promise.all([
                publicClient.readContract({
                    address: tokenAddress,
                    abi: ERC20_ABI,
                    functionName: 'symbol'
                }),
                publicClient.readContract({
                    address: tokenAddress,
                    abi: ERC20_ABI,
                    functionName: 'decimals'
                }),
                publicClient.readContract({
                    address: tokenAddress,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [accountAddress]
                })
            ]);

            yield {
                status: 'success',
                message: 'Approval status checked',
                step: 'complete',
                data: {
                    tokenAddress,
                    symbol,
                    decimals,
                    balance: balance.toString(),
                    balanceFormatted: formatUnits(balance, decimals),
                    erc20Allowance: erc20Allowance.toString(),
                    erc20Approved: erc20Allowance > 0n,
                    permit2Amount: amount.toString(),
                    permit2Expiration: expirationNum,
                    permit2Approved: isPermit2Approved,
                    needsERC20Approval: erc20Allowance === 0n,
                    needsPermit2Approval: !isPermit2Approved
                }
            };
        } catch (error) {
            yield {
                status: 'error',
                message: `Failed to check approvals: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Approve token to Permit2
     */
    async* approveToken(args, { publicClient, walletClient, account }) {
        const { tokenAddress, amount = 'max', useBlockExplorer = false } = args;
        const owner = account?.address || account;
        const spender = this.permit2Address;
        let amountWei;
        let hash;

        yield {
            status: 'pending',
            message: 'Approving token to Permit2...',
            step: 'prepare'
        };

        try {
            amountWei = amount === 'max' ? MAX_UINT256 : parseEther(amount.toString());

            yield {
                status: 'pending',
                message: 'Waiting for user confirmation...',
                step: 'confirm'
            };

            hash = await walletClient.writeContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [spender, amountWei],
                account
            });

            yield {
                status: 'pending',
                message: 'Transaction submitted, waiting for confirmation...',
                step: 'wait',
                data: { transactionHash: hash }
            };

            let receipt;
            if (isSafeWallet(walletClient)) {
                if (!useBlockExplorer) {
                    throw new Error("SAFE_TRANSACTION_SENT");
                } else {
                    const chainId = await publicClient.getChainId();
                    receipt = await waitForSafeTxReceipt({
                        chainId,
                        safeTxHash: hash,
                        publicClient
                    });
                }
            } else {
                receipt = await publicClient.waitForTransactionReceipt({
                    hash,
                    timeout: 180_000,
                    confirmations: 1
                });
            }

            yield {
                status: 'success',
                message: 'Token approved to Permit2!',
                step: 'complete',
                data: {
                    transactionHash: hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed
                }
            };
        } catch (error) {
            if (hash) {
                try {
                    const allowance = await publicClient.readContract({
                        address: tokenAddress,
                        abi: ERC20_ABI,
                        functionName: 'allowance',
                        args: [owner, spender]
                    });
                    if (amountWei !== undefined && allowance >= amountWei) {
                        yield {
                            status: 'success',
                            message: 'Token approval detected (receipt unavailable from RPC).',
                            step: 'complete',
                            data: {
                                transactionHash: hash,
                                warning: 'Allowance reflects approval, but the RPC did not return a receipt. Double-check on-chain if needed.'
                            }
                        };
                        return;
                    }
                } catch (verifyError) {
                    console.warn('ERC20 allowance verification after approval failure failed:', verifyError.message);
                }
            }

            yield {
                status: 'error',
                message: `Approval failed: ${error.message}`,
                error: error.message,
                data: hash ? { transactionHash: hash } : undefined
            };
        }
    }

    /**
     * Approve Permit2 to Universal Router
     */
    async* approvePermit2(args, { publicClient, walletClient, account }) {
        const { tokenAddress, amount = 'max', duration = 'max', useBlockExplorer = false } = args; // near-infinite default expiration
        const owner = account?.address || account;
        const amountWei = amount === 'max' ? MAX_UINT160 : parseEther(amount.toString());
        const nowSec = Math.floor(Date.now() / 1000);
        let expirationSeconds;
        if (duration === 'max') {
            expirationSeconds = PERMIT2_MAX_EXPIRATION;
        } else {
            const durationSeconds = typeof duration === 'bigint' ? Number(duration) : Number(duration || 0);
            const targetExpiration = nowSec + Math.max(durationSeconds, 0);
            expirationSeconds = Math.min(targetExpiration, PERMIT2_MAX_EXPIRATION);
        }
        let hash;

        yield {
            status: 'pending',
            message: 'Approving Permit2 to Universal Router...',
            step: 'prepare'
        };

        try {
            yield {
                status: 'pending',
                message: 'Waiting for user confirmation...',
                step: 'confirm'
            };

            hash = await walletClient.writeContract({
                address: this.permit2Address,
                abi: PERMIT2_ABI,
                functionName: 'approve',
                args: [tokenAddress, this.routerAddress, amountWei, BigInt(expirationSeconds)],
                account
            });

            yield {
                status: 'pending',
                message: 'Transaction submitted, waiting for confirmation...',
                step: 'wait',
                data: { transactionHash: hash }
            };

            let receipt;
            if (isSafeWallet(walletClient)) {
                if (!useBlockExplorer) {
                    throw new Error("SAFE_TRANSACTION_SENT");
                } else {
                    const chainId = await publicClient.getChainId();
                    receipt = await waitForSafeTxReceipt({
                        chainId,
                        safeTxHash: hash,
                        publicClient
                    });
                }
            } else {
                receipt = await publicClient.waitForTransactionReceipt({
                    hash,
                    timeout: 180_000,
                    confirmations: 1
                });
            }

            yield {
                status: 'success',
                message: 'Permit2 approved to Universal Router!',
                step: 'complete',
                data: {
                    transactionHash: hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed
                }
            };
        } catch (error) {
            if (hash) {
                try {
                    const [currentAmount, currentExpiration] = await publicClient.readContract({
                        address: this.permit2Address,
                        abi: PERMIT2_ABI,
                        functionName: 'allowance',
                        args: [owner, tokenAddress, this.routerAddress]
                    });
                    const currentExpirationNum = Number(currentExpiration);
                    const now = Math.floor(Date.now() / 1000);
                    if (currentAmount >= amountWei && currentExpirationNum > now) {
                        yield {
                            status: 'success',
                            message: 'Permit2 approval detected (receipt unavailable from RPC).',
                            step: 'complete',
                            data: {
                                transactionHash: hash,
                                warning: 'Allowance reflects Permit2 approval, but the RPC did not return a receipt. Confirm via explorer if needed.'
                            }
                        };
                        return;
                    }
                } catch (verifyError) {
                    console.warn('Permit2 allowance verification after approval failure failed:', verifyError.message);
                }
            }

            yield {
                status: 'error',
                message: `Permit2 approval failed: ${error.message}`,
                error: error.message,
                data: hash ? { transactionHash: hash } : undefined
            };
        }
    }

    /**
     * Execute V3 swap through Universal Router
     */
    async* swapV3(args, { publicClient, walletClient, account }) {
        const {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut = '0',
            fee = this.defaultFee,
            deadline,
            recipient,
            exactApproval = true, // Default to exact approval for safety
            useBlockExplorer = false
        } = args;

        // Import parseEther at the top of the function
        const parseEther = (value) => {
            const [whole, decimal = ''] = value.toString().split('.');
            const paddedDecimal = decimal.padEnd(18, '0').slice(0, 18);
            return BigInt(whole + paddedDecimal);
        };

        yield {
            status: 'pending',
            message: 'Preparing V3 swap...',
            step: 'prepare'
        };

        try {
            // Get the actual address string from account (could be object or string)
            const accountAddress = account.address || account;

            // Check and refresh Permit2 approval if expired
            yield {
                status: 'pending',
                message: 'Checking Permit2 approval...',
                step: 'check_permit2'
            };

            const [permit2Amount, permit2ExpirationRaw] = await publicClient.readContract({
                address: this.permit2Address,
                abi: PERMIT2_ABI,
                functionName: 'allowance',
                args: [accountAddress, tokenIn, this.routerAddress]
            });
            const permit2Expiration = Number(permit2ExpirationRaw);

            const now = Math.floor(Date.now() / 1000);
            if (permit2Amount === 0n || permit2Expiration <= now) {
                yield {
                    status: 'pending',
                    message: 'Permit2 approval expired, renewing...',
                    step: 'renew_permit2'
                };

                // First check ERC20 approval to Permit2
                const erc20Allowance = await publicClient.readContract({
                    address: tokenIn,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [accountAddress, this.permit2Address]
                });

                const amountWei = parseEther(amountIn.toString());

                if (erc20Allowance < amountWei) {
                    // Need to approve token to Permit2 first
                    yield {
                        status: 'pending',
                        message: 'Approving token to Permit2...',
                        step: 'approve_to_permit2'
                    };

                    const approveAmount = exactApproval ? amountWei : (2n ** 256n - 1n);

                    const approveHash = await walletClient.writeContract({
                        address: tokenIn,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [this.permit2Address, approveAmount],
                        account
                    });

                    if (isSafeWallet(walletClient)) {
                        if (!useBlockExplorer) {
                            throw new Error("SAFE_TRANSACTION_SENT");
                        } else {
                            const chainId = await publicClient.getChainId();
                            await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: approveHash,
                                publicClient
                            });
                        }
                    } else {
                        await publicClient.waitForTransactionReceipt({ hash: approveHash });
                    }
                    yield {
                        status: 'pending',
                        message: 'ERC20 approval to Permit2 completed',
                        step: 'erc20_approved'
                    };
                }

                // Now approve Permit2 to Universal Router
                const newExpiration = now + 31536000; // 1 year from now
                const permit2AmountToApprove = exactApproval ? amountWei : (2n ** 160n - 1n);

                try {
                    const permit2Hash = await walletClient.writeContract({
                        address: this.permit2Address,
                        abi: PERMIT2_ABI,
                        functionName: 'approve',
                        args: [tokenIn, this.routerAddress, permit2AmountToApprove, BigInt(newExpiration)],
                        account
                    });

                    if (permit2Hash) {
                        if (isSafeWallet(walletClient)) {
                            if (!useBlockExplorer) {
                                throw new Error("SAFE_TRANSACTION_SENT");
                            } else {
                                const chainId = await publicClient.getChainId();
                                await waitForSafeTxReceipt({
                                    chainId,
                                    safeTxHash: permit2Hash,
                                    publicClient
                                });
                            }
                        } else {
                            await publicClient.waitForTransactionReceipt({ hash: permit2Hash });
                        }
                        yield {
                            status: 'pending',
                            message: 'Permit2 approval renewed successfully!',
                            step: 'permit2_renewed'
                        };
                    }
                } catch (permitError) {
                    // If permit2 approval fails, it might already be approved
                    // Check again before failing
                    const [checkAmount, checkExpiration] = await publicClient.readContract({
                        address: this.permit2Address,
                        abi: PERMIT2_ABI,
                        functionName: 'allowance',
                        args: [accountAddress, tokenIn, this.routerAddress]
                    });

                    if (checkAmount > 0n && checkExpiration > now) {
                        yield {
                            status: 'pending',
                            message: 'Permit2 already approved, continuing...',
                            step: 'permit2_already_approved'
                        };
                    } else {
                        throw permitError;
                    }
                }
            }
            // Get token decimals
            const [decimalsIn, decimalsOut, symbolIn, symbolOut] = await Promise.all([
                publicClient.readContract({
                    address: tokenIn,
                    abi: ERC20_ABI,
                    functionName: 'decimals'
                }),
                publicClient.readContract({
                    address: tokenOut,
                    abi: ERC20_ABI,
                    functionName: 'decimals'
                }),
                publicClient.readContract({
                    address: tokenIn,
                    abi: ERC20_ABI,
                    functionName: 'symbol'
                }),
                publicClient.readContract({
                    address: tokenOut,
                    abi: ERC20_ABI,
                    functionName: 'symbol'
                })
            ]);

            // Parse amounts
            const amountInWei = parseUnits(amountIn.toString(), decimalsIn);
            const minAmountOutWei = parseUnits(minAmountOut.toString(), decimalsOut);

            // Build the path: tokenIn + fee (3 bytes) + tokenOut
            const path = encodePacked(
                ['address', 'uint24', 'address'],
                [tokenIn, fee, tokenOut]
            );

            // V3_SWAP_EXACT_IN parameters
            const v3SwapParams = encodeAbiParameters(
                [
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'path', type: 'bytes' },
                    { name: 'payerIsUser', type: 'bool' }
                ],
                [
                    recipient || RECIPIENT_MSG_SENDER,
                    amountInWei,
                    minAmountOutWei,
                    path,
                    true
                ]
            );

            // SWEEP parameters (sweep output token to recipient)
            const sweepParams = encodeAbiParameters(
                [
                    { name: 'token', type: 'address' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountMinimum', type: 'uint256' }
                ],
                [
                    tokenOut,
                    recipient || accountAddress,
                    minAmountOutWei
                ]
            );

            // Build commands
            const commands = concatHex([
                toHex(Commands.V3_SWAP_EXACT_IN, { size: 1 }),
                toHex(Commands.SWEEP, { size: 1 })
            ]);

            const inputs = [v3SwapParams, sweepParams];
            const swapDeadline = deadline || BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

            yield {
                status: 'pending',
                message: `Swapping ${amountIn} ${symbolIn} for ${symbolOut}...`,
                step: 'swap',
                data: {
                    tokenIn,
                    tokenOut,
                    amountIn,
                    minAmountOut,
                    fee,
                    path
                }
            };

            // Check if we should force send
            const forceSend = args.forceSend || false;

            let hash;
            if (forceSend) {
                console.log('⚠️  FORCE SENDING TRANSACTION WITHOUT GAS ESTIMATION');
                console.log('📍 This will likely fail on-chain but you can see it on Polygonscan');

                // Force send with manual gas parameters
                hash = await walletClient.writeContract({
                    address: this.routerAddress,
                    abi: UNIVERSAL_ROUTER_ABI,
                    functionName: 'execute',
                    args: [commands, inputs, swapDeadline],
                    account,
                    value: 0n,
                    gas: 500000n, // Manual gas limit
                    gasPrice: 50000000000n // 50 gwei - using legacy gas for simplicity
                });

                yield {
                    status: 'pending',
                    message: '⚠️ FORCED TRANSACTION SENT - may fail on-chain',
                    step: 'forced_send',
                    data: { transactionHash: hash }
                };
            } else {
                // Normal send with gas estimation
                hash = await walletClient.writeContract({
                    address: this.routerAddress,
                    abi: UNIVERSAL_ROUTER_ABI,
                    functionName: 'execute',
                    args: [commands, inputs, swapDeadline],
                    account,
                    value: 0n
                });
            }

            yield {
                status: 'pending',
                message: 'Transaction submitted, waiting for confirmation...',
                step: 'wait',
                data: { transactionHash: hash }
            };

            try {
                let receipt;
                if (isSafeWallet(walletClient)) {
                    if (!useBlockExplorer) {
                        throw new Error("SAFE_TRANSACTION_SENT");
                    } else {
                        const chainId = await publicClient.getChainId();
                        receipt = await waitForSafeTxReceipt({
                            chainId,
                            safeTxHash: hash,
                            publicClient
                        });
                    }
                } else {
                    receipt = await publicClient.waitForTransactionReceipt({
                        hash,
                        timeout: 60_000, // 60 second timeout
                        confirmations: 1
                    });
                }

                yield {
                    status: 'success',
                    message: `Swap successful! Traded ${amountIn} ${symbolIn} for ${symbolOut}`,
                    step: 'complete',
                    data: {
                        transactionHash: hash,
                        blockNumber: receipt.blockNumber,
                        gasUsed: receipt.gasUsed,
                        explorerUrl: this.chainId === 1 ?
                            `https://etherscan.io/tx/${hash}` :
                            `https://polygonscan.com/tx/${hash}`
                    }
                };
            } catch (waitError) {
                // If we can't wait for receipt, but we have a hash, consider it successful
                console.warn('Warning: Could not wait for transaction receipt:', waitError.message);
                console.log('Transaction hash:', hash);

                yield {
                    status: 'success',
                    message: `Swap submitted! Hash: ${hash}`,
                    step: 'complete',
                    data: {
                        transactionHash: hash,
                        explorerUrl: this.chainId === 1 ?
                            `https://etherscan.io/tx/${hash}` :
                            `https://polygonscan.com/tx/${hash}`,
                        warning: 'Could not confirm transaction receipt - check explorer'
                    }
                };
            }
        } catch (error) {
            yield {
                status: 'error',
                message: `Swap failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Test a swap with small amount
     */
    async* testSwap(args, { publicClient, walletClient, account }) {
        const { tokenIn, tokenOut } = args;

        yield {
            status: 'pending',
            message: 'Preparing test swap with minimal amount...',
            step: 'prepare'
        };

        // Use very small test amount
        const testAmount = '0.00000001';
        const { amountIn, fee = this.defaultFee } = args;

        yield {
            status: 'pending',
            message: 'Getting quote...',
            step: 'quote'
        };

        // This is a placeholder - in reality, you'd call a quoter contract
        yield {
            status: 'success',
            message: 'Quote retrieved (placeholder)',
            step: 'complete',
            data: {
                tokenIn,
                tokenOut,
                amountIn,
                fee,
                estimatedOut: 'N/A (quoter not implemented)',
                note: 'Implement quoter contract calls for accurate quotes'
            }
        };
    }
    /**
     * Complete swap flow with approval checks
     */
    async* completeSwap(args, viemClients) {
        const { tokenIn, tokenOut, amountIn, exactApproval = true, useBlockExplorer = false } = args;
        const { publicClient, account } = viemClients;

        yield {
            status: 'pending',
            message: 'Starting complete swap flow...',
            step: 'start'
        };

        // Step 1: Check approvals
        yield* this.checkApprovals({ tokenAddress: tokenIn }, viemClients);

        // Step 2: Get current approval status
        const owner = account?.address || account;
        const erc20Allowance = await publicClient.readContract({
            address: tokenIn,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [owner, this.permit2Address]
        });

        // Step 3: Approve to Permit2 if needed
        if (erc20Allowance === 0n) {
            const approveAmount = exactApproval ? amountIn : 'max';
            yield* this.approveToken({ tokenAddress: tokenIn, amount: approveAmount, useBlockExplorer }, viemClients);
        }

        // Step 4: Check Permit2 approval
        const [amount, expiration] = await publicClient.readContract({
            address: this.permit2Address,
            abi: PERMIT2_ABI,
            functionName: 'allowance',
            args: [owner, tokenIn, this.routerAddress]
        });

        const now = Math.floor(Date.now() / 1000);
        if (amount === 0n || expiration < now) {
            const approveAmount = exactApproval ? amountIn : 'max';
            yield* this.approvePermit2({ tokenAddress: tokenIn, amount: approveAmount, useBlockExplorer }, viemClients);
        }

        // Step 5: Execute swap
        try {
            yield* this.swapV3(args, viemClients);
        } catch (error) {
            if (isSafeTransactionSent(error)) throw error;
            throw error; // Re-throw other errors or handle them
        }
    }
}

export function createUniswapRouterCartridge(options = {}) {
    return new UniswapRouterCartridge(options);
}
