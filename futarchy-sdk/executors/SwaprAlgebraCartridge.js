// SwaprAlgebraCartridge.js - Swapr V3 Algebra Pool Operations Cartridge

import { parseEther, formatEther } from 'viem';
import { waitForSafeTxReceipt } from '../../src/utils/waitForSafeTxReceipt';
import { isSafeTransactionSent } from '../../src/utils/txErrors';

// =============================================================================
// SWAPR V3 CONSTANTS
// =============================================================================

/**
 * Swapr V3 Router address on Gnosis Chain
 */
export const SWAPR_V3_ROUTER = '0xffb643e73f280b97809a8b41f7232ab401a04ee1';

// Swapr V3 Router ABI for exactInputSingle and exactOutputSingle
export const SWAPR_V3_ROUTER_ABI = [
    {
        "name": "exactInputSingle",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    { "name": "tokenIn", "type": "address" },
                    { "name": "tokenOut", "type": "address" },
                    { "name": "recipient", "type": "address" },
                    { "name": "deadline", "type": "uint256" },
                    { "name": "amountIn", "type": "uint256" },
                    { "name": "amountOutMinimum", "type": "uint256" },
                    { "name": "limitSqrtPrice", "type": "uint160" }
                ]
            }
        ],
        "outputs": [{ "name": "amountOut", "type": "uint256" }]
    },
    {
        "name": "exactOutputSingle",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    { "name": "tokenIn", "type": "address" },
                    { "name": "tokenOut", "type": "address" },
                    { "name": "fee", "type": "uint24" },
                    { "name": "recipient", "type": "address" },
                    { "name": "deadline", "type": "uint256" },
                    { "name": "amountOut", "type": "uint256" },
                    { "name": "amountInMaximum", "type": "uint256" },
                    { "name": "limitSqrtPrice", "type": "uint160" }
                ]
            }
        ],
        "outputs": [{ "name": "amountIn", "type": "uint256" }]
    }
];

// ERC20 ABI for approval checks
export const ERC20_ABI = [
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount", "type": "uint256" }
        ],
        "outputs": [{ "name": "", "type": "bool" }]
    },
    {
        "name": "allowance",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            { "name": "owner", "type": "address" },
            { "name": "spender", "type": "address" }
        ],
        "outputs": [{ "name": "", "type": "uint256" }]
    },
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{ "name": "account", "type": "address" }],
        "outputs": [{ "name": "", "type": "uint256" }]
    }
];

// Helper to check for Safe wallet
const isSafeWallet = (walletClient) => {
    const connectorName = walletClient?.connector?.name?.toLowerCase();
    const connectorId = walletClient?.connector?.id?.toLowerCase();
    return connectorName === 'safe' || connectorId === 'safe';
};

// =============================================================================
// SWAPR ALGEBRA CARTRIDGE CLASS
// =============================================================================

export class SwaprAlgebraCartridge {
    constructor() {
        this.name = 'SwaprAlgebraCartridge';
        this.routerAddress = SWAPR_V3_ROUTER;
        this.routerName = 'Swapr V3 Router';

        // Define operations this cartridge provides
        this.operations = {
            'swapr.swap': this.swap.bind(this),
            'swapr.swapExactOut': this.swapExactOut.bind(this),
            'swapr.checkApproval': this.checkApproval.bind(this),
            'swapr.approve': this.approve.bind(this),
            'swapr.completeSwap': this.completeSwap.bind(this),
            'swapr.completeSwapExactOut': this.completeSwapExactOut.bind(this)
        };

        console.log(`🔄 ${this.name} initialized with ${Object.keys(this.operations).length} operations`);
        console.log(`📍 Swapr V3 Router: ${this.routerAddress}`);
    }

    // Get list of supported operations
    getSupportedOperations() {
        return Object.keys(this.operations);
    }

    // Check if an operation is supported
    supports(operation) {
        return operation in this.operations;
    }

    // Execute an operation (called by ViemExecutor)
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
    // SWAPR ALGEBRA OPERATIONS
    // =============================================================================

    /**
     * Check token approval for Swapr V3 Router
     */
    async* checkApproval(args, { publicClient, account }) {
        const { tokenAddress } = args;

        yield { status: 'pending', message: `Checking ${this.routerName} approval...`, step: 'check' };

        try {
            const allowance = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [account, this.routerAddress]
            });

            const balance = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [account]
            });

            yield {
                status: 'success',
                message: 'Approval status checked',
                step: 'complete',
                data: {
                    allowance: allowance.toString(),
                    allowanceFormatted: formatEther(allowance),
                    balance: balance.toString(),
                    balanceFormatted: formatEther(balance),
                    isApproved: allowance > 0n,
                    tokenAddress,
                    spender: this.routerAddress,
                    spenderName: this.routerName
                }
            };
        } catch (error) {
            yield {
                status: 'error',
                message: `Failed to check approval: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Approve token for Swapr V3 Router
     */
    async* approve(args, { publicClient, walletClient, account }) {
        const { tokenAddress, amount, useBlockExplorer = false } = args;

        yield { status: 'pending', message: `Preparing ${this.routerName} approval...`, step: 'prepare' };

        const amountWei = (amount === 'max' || amount === 'unlimited') ?
            2n ** 256n - 1n : // Max uint256 for unlimited approval
            (typeof amount === 'string' ? parseEther(amount) : amount);

        yield {
            status: 'pending',
            message: `Approving ${(amount === 'max' || amount === 'unlimited') ? 'unlimited' : formatEther(amountWei)} tokens for ${this.routerName}...`,
            step: 'approve'
        };

        const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [this.routerAddress, amountWei],
            account
        });

        yield {
            status: 'pending',
            message: 'Approval transaction submitted, waiting for confirmation...',
            step: 'confirm',
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
            receipt = await publicClient.waitForTransactionReceipt({ hash });
        }

        yield {
            status: 'success',
            message: `Token approved for ${this.routerName} successfully!`,
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                approvedAmount: amountWei.toString(),
                approvedAmountFormatted: (amount === 'max' || amount === 'unlimited') ? 'unlimited' : formatEther(amountWei),
                spender: this.routerAddress,
                spenderName: this.routerName
            }
        };
    }

    /**
     * Execute a Swapr V3 Algebra swap
     */
    async* swap(args, { publicClient, walletClient, account }) {
        const { tokenIn, tokenOut, amount, slippageBps = 0, deadline, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing Swapr V3 Algebra swap...', step: 'prepare' };

        try {
            const chainId = await publicClient.getChainId();

            if (chainId !== 100) {
                throw new Error(`Swapr V3 only available on Gnosis Chain (chainId: 100), current chain: ${chainId}`);
            }

            const amountWei = typeof amount === 'string' ? parseEther(amount) : amount;
            const swapDeadline = deadline || Math.floor(Date.now() / 1000) + 3600; // 1 hour default

            yield {
                status: 'pending',
                message: `Swapping ${formatEther(amountWei)} tokens via Swapr V3...`,
                step: 'quote'
            };

            // Prepare swap parameters
            const params = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                recipient: account,
                deadline: swapDeadline,
                amountIn: amountWei,
                amountOutMinimum: 0n, // Set to 0 as requested by user
                limitSqrtPrice: 0n    // No price limit
            };

            console.log('[Swapr Algebra Debug] Swap Params:', {
                tokenIn,
                tokenOut,
                amountIn: amountWei.toString(),
                deadline: swapDeadline,
                recipient: account
            });

            yield {
                status: 'pending',
                message: 'Executing exactInputSingle on Swapr V3...',
                step: 'execute',
                data: { params }
            };

            const hash = await walletClient.writeContract({
                address: this.routerAddress,
                abi: SWAPR_V3_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [params],
                account,
                gas: 350000n // Set reasonable gas limit
            });

            yield {
                status: 'pending',
                message: 'Swap transaction submitted, waiting for confirmation...',
                step: 'confirm',
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
                receipt = await publicClient.waitForTransactionReceipt({ hash });
            }

            // Try to decode the output amount from logs (simplified)
            let amountOut = 'Unknown';
            try {
                // In a real implementation, you would properly decode the logs
                // For now, we'll just show it was successful
                amountOut = 'Check transaction for details';
            } catch (e) {
                console.log('Could not decode output amount:', e.message);
            }

            yield {
                status: 'success',
                message: 'Swapr V3 Algebra swap completed successfully!',
                step: 'complete',
                data: {
                    transactionHash: hash,
                    receipt,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    tokenInFormatted: formatEther(amountWei),
                    tokenOutReceived: amountOut,
                    swapParams: params
                }
            };

        } catch (error) {
            yield {
                status: 'error',
                message: `Swapr V3 Algebra swap failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Execute a Swapr V3 Algebra exact output swap (specify exact amount out)
     */
    async* swapExactOut(args, { publicClient, walletClient, account }) {
        const { tokenIn, tokenOut, amountOut, amountInMaximum, slippageBps = 0, deadline, fee = 3000, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing Swapr V3 Algebra exact output swap...', step: 'prepare' };

        try {
            const chainId = await publicClient.getChainId();

            if (chainId !== 100) {
                throw new Error(`Swapr V3 only available on Gnosis Chain (chainId: 100), current chain: ${chainId}`);
            }

            const amountOutWei = typeof amountOut === 'string' ? parseEther(amountOut) : amountOut;
            const amountInMaxWei = typeof amountInMaximum === 'string' ? parseEther(amountInMaximum) : amountInMaximum;
            const swapDeadline = deadline || Math.floor(Date.now() / 1000) + 3600; // 1 hour default

            yield {
                status: 'pending',
                message: `Swapping to get exactly ${formatEther(amountOutWei)} tokens via Swapr V3...`,
                step: 'quote'
            };

            // Prepare exact output swap parameters
            const params = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee, // Pool fee (3000 = 0.3%)
                recipient: account,
                deadline: swapDeadline,
                amountOut: amountOutWei,
                amountInMaximum: amountInMaxWei,
                limitSqrtPrice: 0n    // No price limit
            };

            console.log('[Swapr Algebra Debug] Exact Output Swap Params:', {
                tokenIn,
                tokenOut,
                fee,
                amountOut: amountOutWei.toString(),
                amountInMaximum: amountInMaxWei.toString(),
                deadline: swapDeadline,
                recipient: account
            });

            yield {
                status: 'pending',
                message: 'Executing exactOutputSingle on Swapr V3...',
                step: 'execute',
                data: { params }
            };

            const hash = await walletClient.writeContract({
                address: this.routerAddress,
                abi: SWAPR_V3_ROUTER_ABI,
                functionName: 'exactOutputSingle',
                args: [params],
                account,
                gas: 350000n // Set reasonable gas limit
            });

            yield {
                status: 'pending',
                message: 'Exact output swap transaction submitted, waiting for confirmation...',
                step: 'confirm',
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
                receipt = await publicClient.waitForTransactionReceipt({ hash });
            }

            // Try to decode the actual amount in from logs (simplified)
            let actualAmountIn = 'Unknown';
            try {
                // In a real implementation, you would properly decode the logs
                // For now, we'll just show it was successful
                actualAmountIn = 'Check transaction for details';
            } catch (e) {
                console.log('Could not decode actual input amount:', e.message);
            }

            yield {
                status: 'success',
                message: 'Swapr V3 Algebra exact output swap completed successfully!',
                step: 'complete',
                data: {
                    transactionHash: hash,
                    receipt,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    tokenOutReceived: formatEther(amountOutWei),
                    actualAmountIn: actualAmountIn,
                    swapParams: params
                }
            };

        } catch (error) {
            yield {
                status: 'error',
                message: `Swapr V3 Algebra exact output swap failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Swap Operation: Check approval → Approve if needed → Swap
     */
    async* completeSwap(args, { publicClient, walletClient, account }) {
        const { tokenIn, tokenOut, amount, slippageBps, deadline, exactApproval = true, useBlockExplorer = false } = args;

        yield {
            status: 'pending',
            message: '🚀 Starting complete Swapr swap operation...',
            step: 'start'
        };

        try {
            // Step 1: Check approval
            yield {
                status: 'pending',
                message: '🔍 Checking token approval...',
                step: 'check_approval'
            };

            let isApproved = false;
            for await (const status of this.checkApproval({ tokenAddress: tokenIn }, { publicClient, walletClient, account })) {
                if (status.status === 'success') {
                    isApproved = status.data.isApproved;
                    yield {
                        status: 'pending',
                        message: `📊 Approval status: ${isApproved ? 'Already approved' : 'Not approved'}`,
                        step: 'approval_checked',
                        data: status.data
                    };
                    break;
                } else if (status.status === 'error') {
                    throw new Error(`Approval check failed: ${status.error}`);
                }
            }

            // Step 2: Approve if needed
            if (!isApproved) {
                yield {
                    status: 'pending',
                    message: `⏳ Approving token for Swapr V3 (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                    step: 'approving'
                };

                const approveAmount = exactApproval ? amount : 'unlimited';
                for await (const status of this.approve({ tokenAddress: tokenIn, amount: approveAmount, useBlockExplorer }, { publicClient, walletClient, account })) {
                    yield {
                        status: 'pending',
                        message: `${status.message}`,
                        step: `approve_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        yield {
                            status: 'pending',
                            message: '✅ Token approved for Swapr V3 successfully!',
                            step: 'approved'
                        };
                        break;
                    } else if (status.status === 'error') {
                        throw new Error(`Approval failed: ${status.error}`);
                    }
                }
            } else {
                yield {
                    status: 'pending',
                    message: '✅ Token already approved - skipping approval step',
                    step: 'already_approved'
                };
            }

            // Step 3: Execute swap
            yield {
                status: 'pending',
                message: '🔄 Executing Swapr V3 Algebra swap...',
                step: 'swapping'
            };

            for await (const status of this.swap({ tokenIn, tokenOut, amount, slippageBps, deadline, useBlockExplorer }, { publicClient, walletClient, account })) {
                yield {
                    status: status.status,
                    message: `${status.message}`,
                    step: `swap_${status.step}`,
                    data: status.data
                };

                if (status.status === 'success') {
                    yield {
                        status: 'success',
                        message: '🎉 Complete Swapr swap operation successful!',
                        step: 'complete',
                        data: status.data
                    };
                    return;
                } else if (status.status === 'error') {
                    throw new Error(`Swap failed: ${status.error}`);
                }
            }

        } catch (error) {
            if (isSafeTransactionSent(error)) throw error;
            yield {
                status: 'error',
                message: `Complete Swapr swap failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Exact Output Swap Operation: Check approval → Approve if needed → Exact Output Swap
     */
    async* completeSwapExactOut(args, { publicClient, walletClient, account }) {
        const { tokenIn, tokenOut, amountOut, amountInMaximum, slippageBps, deadline, fee, exactApproval = true, useBlockExplorer = false } = args;

        yield {
            status: 'pending',
            message: '🚀 Starting complete exact output swap operation...',
            step: 'start'
        };

        try {
            // Step 1: Check approval
            yield {
                status: 'pending',
                message: '🔍 Checking token approval...',
                step: 'check_approval'
            };

            let isApproved = false;
            for await (const status of this.checkApproval({ tokenAddress: tokenIn }, { publicClient, walletClient, account })) {
                if (status.status === 'success') {
                    isApproved = status.data.isApproved;
                    yield {
                        status: 'pending',
                        message: `📊 Approval status: ${isApproved ? 'Already approved' : 'Not approved'}`,
                        step: 'approval_checked',
                        data: status.data
                    };
                    break;
                } else if (status.status === 'error') {
                    throw new Error(`Approval check failed: ${status.error}`);
                }
            }

            // Step 2: Approve if needed
            if (!isApproved) {
                yield {
                    status: 'pending',
                    message: `⏳ Approving token for Swapr V3 (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                    step: 'approving'
                };

                const approveAmount = exactApproval ? amountInMaximum : 'unlimited';
                for await (const status of this.approve({ tokenAddress: tokenIn, amount: approveAmount, useBlockExplorer }, { publicClient, walletClient, account })) {
                    yield {
                        status: 'pending',
                        message: `${status.message}`,
                        step: `approve_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        yield {
                            status: 'pending',
                            message: '✅ Token approved for Swapr V3 successfully!',
                            step: 'approved'
                        };
                        break;
                    } else if (status.status === 'error') {
                        throw new Error(`Approval failed: ${status.error}`);
                    }
                }
            } else {
                yield {
                    status: 'pending',
                    message: '✅ Token already approved - skipping approval step',
                    step: 'already_approved'
                };
            }

            // Step 3: Execute exact output swap
            yield {
                status: 'pending',
                message: '🔄 Executing Swapr V3 Algebra exact output swap...',
                step: 'swapping'
            };

            for await (const status of this.swapExactOut({ tokenIn, tokenOut, amountOut, amountInMaximum, slippageBps, deadline, fee, useBlockExplorer }, { publicClient, walletClient, account })) {
                yield {
                    status: status.status,
                    message: `${status.message}`,
                    step: `swap_${status.step}`,
                    data: status.data
                };

                if (status.status === 'success') {
                    yield {
                        status: 'success',
                        message: '🎉 Complete exact output swap operation successful!',
                        step: 'complete',
                        data: status.data
                    };
                    return;
                } else if (status.status === 'error') {
                    throw new Error(`Exact output swap failed: ${status.error}`);
                }
            }

        } catch (error) {
            if (isSafeTransactionSent(error)) throw error;
            yield {
                status: 'error',
                message: `Complete exact output swap failed: ${error.message}`,
                error: error.message
            };
        }
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { SwaprAlgebraCartridge as default };