// FutarchyCartridge.js - Futarchy Router Operations Cartridge

import { parseEther, formatEther } from 'viem';
import { waitForSafeTxReceipt } from '../../src/utils/waitForSafeTxReceipt';
import { assertReceiptSucceeded, isSafeTransactionSent } from '../../src/utils/txErrors';

// =============================================================================
// FUTARCHY ROUTER ABI
// =============================================================================

export const FUTARCHY_ROUTER_ABI = [
    {
        "inputs": [
            { "internalType": "contract IConditionalTokens", "name": "_conditionalTokens", "type": "address" },
            { "internalType": "contract IWrapped1155Factory", "name": "_wrapped1155Factory", "type": "address" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [],
        "name": "conditionalTokens",
        "outputs": [{ "internalType": "contract IConditionalTokens", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "contract IERC20", "name": "collateralToken", "type": "address" },
            { "internalType": "bytes32", "name": "parentCollectionId", "type": "bytes32" },
            { "internalType": "bytes32", "name": "conditionId", "type": "bytes32" },
            { "internalType": "uint256", "name": "indexSet", "type": "uint256" }
        ],
        "name": "getTokenId",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "conditionId", "type": "bytes32" }],
        "name": "getWinningOutcomes",
        "outputs": [{ "internalType": "bool[]", "name": "", "type": "bool[]" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "contract FutarchyProposal", "name": "proposal", "type": "address" },
            { "internalType": "contract IERC20", "name": "collateralToken", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "mergePositions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "", "type": "address" },
            { "internalType": "address", "name": "", "type": "address" },
            { "internalType": "uint256[]", "name": "", "type": "uint256[]" },
            { "internalType": "uint256[]", "name": "", "type": "uint256[]" },
            { "internalType": "bytes", "name": "", "type": "bytes" }
        ],
        "name": "onERC1155BatchReceived",
        "outputs": [{ "internalType": "bytes4", "name": "", "type": "bytes4" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "", "type": "address" },
            { "internalType": "address", "name": "", "type": "address" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "bytes", "name": "", "type": "bytes" }
        ],
        "name": "onERC1155Received",
        "outputs": [{ "internalType": "bytes4", "name": "", "type": "bytes4" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "contract FutarchyProposal", "name": "proposal", "type": "address" },
            { "internalType": "contract IERC20", "name": "collateralToken", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "redeemPositions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "contract FutarchyProposal", "name": "proposal", "type": "address" },
            { "internalType": "uint256", "name": "amount1", "type": "uint256" },
            { "internalType": "uint256", "name": "amount2", "type": "uint256" }
        ],
        "name": "redeemProposal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "contract FutarchyProposal", "name": "proposal", "type": "address" },
            { "internalType": "contract IERC20", "name": "collateralToken", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "splitPosition",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }],
        "name": "supportsInterface",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "wrapped1155Factory",
        "outputs": [{ "internalType": "contract IWrapped1155Factory", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
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
// FUTARCHY CARTRIDGE CLASS
// =============================================================================

export class FutarchyCartridge {
    constructor(futarchyRouterAddress = '0x7495a583ba85875d59407781b4958ED6e0E1228f', options = {}) {
        this.futarchyRouterAddress = futarchyRouterAddress;
        this.name = 'FutarchyCartridge';
        this.swapMode = options.swapMode || 'swapr'; // 'swapr' | 'uniswap'
        this.swapRouter = options.swapRouter || null; // for v3 or UR address for v4
        this.swapConfig = options.swapConfig || null; // full config (e.g., { universalRouter, permit2, quoterV4 })
        // (walletClient) => boolean. The app passes useSafeConnection()'s check,
        // which also recognises a Safe connected over WalletConnect; that is only
        // visible in the session's peer metadata, not on the wallet client.
        this.isSafeConnection = options.isSafeConnection || isSafeWallet;

        // Define operations this cartridge provides
        this.operations = {
            'futarchy.splitPosition': this.splitPosition.bind(this),
            'futarchy.mergePositions': this.mergePositions.bind(this),
            'futarchy.redeemPositions': this.redeemPositions.bind(this),
            'futarchy.redeemProposal': this.redeemProposal.bind(this),
            'futarchy.checkApproval': this.checkApproval.bind(this),
            'futarchy.approveCollateral': this.approveCollateral.bind(this),
            'futarchy.getWinningOutcomes': this.getWinningOutcomes.bind(this),
            'futarchy.completeSplit': this.completeSplit.bind(this),
            'futarchy.completeMerge': this.completeMerge.bind(this),
            'futarchy.completeSplitSwap': this.completeSplitSwap.bind(this),
            'futarchy.completeRedeemOutcomes': this.completeRedeemOutcomes.bind(this)
        };

        console.log(`🎯 ${this.name} initialized with ${Object.keys(this.operations).length} operations`);
        console.log(`📍 Futarchy Router: ${this.futarchyRouterAddress}`);
        console.log(`🔁 Swap mode: ${this.swapMode}${this.swapRouter ? ` (router: ${this.swapRouter})` : ''}`);
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
    // FUTARCHY OPERATIONS
    // =============================================================================

    /**
     * Split collateral position into YES/NO outcome tokens
     */
    async* splitPosition(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, amount, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing to split position...', step: 'prepare' };

        const amountWei = typeof amount === 'string' ? parseEther(amount) : amount;

        yield {
            status: 'pending',
            message: `Splitting ${formatEther(amountWei)} tokens into YES/NO positions...`,
            step: 'split'
        };

        const hash = await walletClient.writeContract({
            address: this.futarchyRouterAddress,
            abi: FUTARCHY_ROUTER_ABI,
            functionName: 'splitPosition',
            args: [proposal, collateralToken, amountWei],
            account
        });

        yield {
            status: 'pending',
            message: 'Transaction submitted, waiting for confirmation...',
            step: 'confirm',
            data: { transactionHash: hash }
        };

        let receipt;
        if (this.isSafeConnection(walletClient)) {
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
            receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
        }

        yield {
            status: 'success',
            message: 'Position split successfully!',
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed
            }
        };
    }

    /**
     * Merge YES/NO positions back to collateral
     */
    async* mergePositions(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, amount, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing to merge positions...', step: 'prepare' };

        const amountWei = typeof amount === 'string' ? parseEther(amount) : amount;

        yield {
            status: 'pending',
            message: `Merging ${formatEther(amountWei)} YES/NO positions back to collateral...`,
            step: 'merge'
        };

        const hash = await walletClient.writeContract({
            address: this.futarchyRouterAddress,
            abi: FUTARCHY_ROUTER_ABI,
            functionName: 'mergePositions',
            args: [proposal, collateralToken, amountWei],
            account
        });

        yield {
            status: 'pending',
            message: 'Transaction submitted, waiting for confirmation...',
            step: 'confirm',
            data: { transactionHash: hash }
        };

        let receipt;
        if (this.isSafeConnection(walletClient)) {
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
            receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
        }

        yield {
            status: 'success',
            message: 'Positions merged successfully!',
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed
            }
        };
    }

    /**
     * Redeem winning positions after proposal resolution
     */
    async* redeemPositions(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, amount, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing to redeem positions...', step: 'prepare' };

        const amountWei = typeof amount === 'string' ? parseEther(amount) : amount;

        yield {
            status: 'pending',
            message: `Redeeming ${formatEther(amountWei)} winning positions...`,
            step: 'redeem'
        };

        const hash = await walletClient.writeContract({
            address: this.futarchyRouterAddress,
            abi: FUTARCHY_ROUTER_ABI,
            functionName: 'redeemPositions',
            args: [proposal, collateralToken, amountWei],
            account
        });

        yield {
            status: 'pending',
            message: 'Transaction submitted, waiting for confirmation...',
            step: 'confirm',
            data: { transactionHash: hash }
        };

        let receipt;
        if (this.isSafeConnection(walletClient)) {
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
            receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
        }

        yield {
            status: 'success',
            message: 'Positions redeemed successfully!',
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed
            }
        };
    }

    /**
     * Redeem proposal tokens
     */
    async* redeemProposal(args, { publicClient, walletClient, account }) {
        const { proposal, amount1, amount2, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing to redeem proposal...', step: 'prepare' };

        const amount1Wei = typeof amount1 === 'string' ? parseEther(amount1) : amount1;
        const amount2Wei = typeof amount2 === 'string' ? parseEther(amount2) : amount2;

        yield {
            status: 'pending',
            message: `Redeeming proposal tokens...`,
            step: 'redeem'
        };

        const hash = await walletClient.writeContract({
            address: this.futarchyRouterAddress,
            abi: FUTARCHY_ROUTER_ABI,
            functionName: 'redeemProposal',
            args: [proposal, amount1Wei, amount2Wei],
            account
        });

        yield {
            status: 'pending',
            message: 'Transaction submitted, waiting for confirmation...',
            step: 'confirm',
            data: { transactionHash: hash }
        };

        let receipt;
        if (this.isSafeConnection(walletClient)) {
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
            receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
        }

        yield {
            status: 'success',
            message: 'Proposal redeemed successfully!',
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed
            }
        };
    }

    /**
     * Check collateral approval for futarchy router
     */
    async* checkApproval(args, { publicClient, account }) {
        const { collateralToken } = args;

        yield { status: 'pending', message: 'Checking collateral approval...', step: 'check' };

        try {
            const allowance = await publicClient.readContract({
                address: collateralToken,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [account, this.futarchyRouterAddress]
            });

            const balance = await publicClient.readContract({
                address: collateralToken,
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
                    collateralToken,
                    spender: this.futarchyRouterAddress
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
     * Approve collateral token for futarchy router
     */
    async* approveCollateral(args, { publicClient, walletClient, account }) {
        const { collateralToken, amount, useBlockExplorer = false } = args;

        yield { status: 'pending', message: 'Preparing collateral approval...', step: 'prepare' };

        const amountWei = (amount === 'max' || amount === 'unlimited') ?
            2n ** 256n - 1n : // Max uint256 for unlimited approval
            (typeof amount === 'string' ? parseEther(amount) : amount);

        yield {
            status: 'pending',
            message: `Approving ${(amount === 'max' || amount === 'unlimited') ? 'unlimited' : formatEther(amountWei)} tokens...`,
            step: 'approve'
        };

        const hash = await walletClient.writeContract({
            address: collateralToken,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [this.futarchyRouterAddress, amountWei],
            account
        });

        yield {
            status: 'pending',
            message: 'Approval transaction submitted, waiting for confirmation...',
            step: 'confirm',
            data: { transactionHash: hash }
        };

        let receipt;
        if (this.isSafeConnection(walletClient)) {
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
            receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
        }

        yield {
            status: 'success',
            message: 'Collateral approved successfully!',
            step: 'complete',
            data: {
                transactionHash: hash,
                receipt,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                approvedAmount: amountWei.toString(),
                approvedAmountFormatted: (amount === 'max' || amount === 'unlimited') ? 'unlimited' : formatEther(amountWei)
            }
        };
    }

    /**
     * Get winning outcomes for a condition
     */
    async* getWinningOutcomes(args, { publicClient }) {
        const { conditionId } = args;

        yield { status: 'pending', message: 'Fetching winning outcomes...', step: 'fetch' };

        try {
            const outcomes = await publicClient.readContract({
                address: this.futarchyRouterAddress,
                abi: FUTARCHY_ROUTER_ABI,
                functionName: 'getWinningOutcomes',
                args: [conditionId]
            });

            yield {
                status: 'success',
                message: 'Winning outcomes retrieved',
                step: 'complete',
                data: {
                    conditionId,
                    outcomes,
                    winningIndexes: outcomes.map((isWinning, index) => isWinning ? index : null).filter(i => i !== null)
                }
            };
        } catch (error) {
            yield {
                status: 'error',
                message: `Failed to get winning outcomes: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Split Operation: Check approval → Approve if needed → Split
     * @param {object} args - { proposal, collateralToken, amount }
     */
    async* completeSplit(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, amount, exactApproval = true, useBlockExplorer = false } = args;

        yield {
            status: 'pending',
            message: '🚀 Starting complete split operation...',
            step: 'start'
        };

        try {
            // Step 1: Check approval
            yield {
                status: 'pending',
                message: '🔍 Checking collateral approval...',
                step: 'check_approval'
            };

            let isApproved = false;
            for await (const status of this.checkApproval({ collateralToken }, { publicClient, walletClient, account })) {
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
                    message: `⏳ Approving collateral (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                    step: 'approving'
                };

                const approveAmount = exactApproval ? amount : 'unlimited';
                for await (const status of this.approveCollateral({ collateralToken, amount: approveAmount, useBlockExplorer }, { publicClient, walletClient, account })) {
                    yield {
                        status: 'pending',
                        message: `${status.message}`,
                        step: `approve_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        yield {
                            status: 'pending',
                            message: '✅ Collateral approved successfully!',
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
                    message: '✅ Collateral already approved - skipping approval step',
                    step: 'already_approved'
                };
            }

            // Step 3: Execute split
            yield {
                status: 'pending',
                message: '🔀 Executing split position...',
                step: 'splitting'
            };

            for await (const status of this.splitPosition({ proposal, collateralToken, amount, useBlockExplorer }, { publicClient, walletClient, account })) {
                yield {
                    status: status.status,
                    message: `${status.message}`,
                    step: `split_${status.step}`,
                    data: status.data
                };

                if (status.status === 'success') {
                    yield {
                        status: 'success',
                        message: '🎉 Complete split operation successful!',
                        step: 'complete',
                        data: status.data
                    };
                    return;
                } else if (status.status === 'error') {
                    throw new Error(`Split failed: ${status.error}`);
                }
            }

        } catch (error) {
            if (isSafeTransactionSent(error)) throw error;
            yield {
                status: 'error',
                message: `Complete split failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Merge Operation: Check YES approval → Check NO approval → Approve if needed → Merge
     * @param {object} args - { proposal, collateralToken, amount, yesToken, noToken }
     */
    async* completeMerge(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, amount, yesToken, noToken, exactApproval = true, useBlockExplorer = false } = args;

        yield {
            status: 'pending',
            message: '🚀 Starting complete merge operation...',
            step: 'start'
        };

        try {
            // Step 1: Check YES token approval
            yield {
                status: 'pending',
                message: '🔍 Checking YES token approval...',
                step: 'check_yes_approval'
            };

            let yesApproved = false;
            for await (const status of this.checkApproval({ collateralToken: yesToken }, { publicClient, walletClient, account })) {
                if (status.status === 'success') {
                    yesApproved = status.data.isApproved;
                    yield {
                        status: 'pending',
                        message: `📊 YES token: ${yesApproved ? 'Already approved' : 'Not approved'}`,
                        step: 'yes_approval_checked',
                        data: status.data
                    };
                    break;
                } else if (status.status === 'error') {
                    throw new Error(`YES approval check failed: ${status.error}`);
                }
            }

            // Step 2: Check NO token approval
            yield {
                status: 'pending',
                message: '🔍 Checking NO token approval...',
                step: 'check_no_approval'
            };

            let noApproved = false;
            for await (const status of this.checkApproval({ collateralToken: noToken }, { publicClient, walletClient, account })) {
                if (status.status === 'success') {
                    noApproved = status.data.isApproved;
                    yield {
                        status: 'pending',
                        message: `📊 NO token: ${noApproved ? 'Already approved' : 'Not approved'}`,
                        step: 'no_approval_checked',
                        data: status.data
                    };
                    break;
                } else if (status.status === 'error') {
                    throw new Error(`NO approval check failed: ${status.error}`);
                }
            }

            // Step 3: Approve YES if needed
            if (!yesApproved) {
                yield {
                    status: 'pending',
                    message: `⏳ Approving YES token (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                    step: 'approving_yes'
                };

                const approveAmount = exactApproval ? amount : 'unlimited';
                for await (const status of this.approveCollateral({ collateralToken: yesToken, amount: approveAmount, useBlockExplorer }, { publicClient, walletClient, account })) {
                    yield {
                        status: 'pending',
                        message: `YES: ${status.message}`,
                        step: `approve_yes_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        yield {
                            status: 'pending',
                            message: '✅ YES token approved successfully!',
                            step: 'yes_approved'
                        };
                        break;
                    } else if (status.status === 'error') {
                        throw new Error(`YES approval failed: ${status.error}`);
                    }
                }
            } else {
                yield {
                    status: 'pending',
                    message: '✅ YES token already approved - skipping',
                    step: 'yes_already_approved'
                };
            }

            // Step 4: Approve NO if needed
            if (!noApproved) {
                yield {
                    status: 'pending',
                    message: `⏳ Approving NO token (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                    step: 'approving_no'
                };

                const approveAmount = exactApproval ? amount : 'unlimited';
                for await (const status of this.approveCollateral({ collateralToken: noToken, amount: approveAmount, useBlockExplorer }, { publicClient, walletClient, account })) {
                    yield {
                        status: 'pending',
                        message: `NO: ${status.message}`,
                        step: `approve_no_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        yield {
                            status: 'pending',
                            message: '✅ NO token approved successfully!',
                            step: 'no_approved'
                        };
                        break;
                    } else if (status.status === 'error') {
                        throw new Error(`NO approval failed: ${status.error}`);
                    }
                }
            } else {
                yield {
                    status: 'pending',
                    message: '✅ NO token already approved - skipping',
                    step: 'no_already_approved'
                };
            }

            // Step 5: Execute merge
            yield {
                status: 'pending',
                message: '🔀 Executing merge positions...',
                step: 'merging'
            };

            for await (const status of this.mergePositions({ proposal, collateralToken, amount, useBlockExplorer }, { publicClient, walletClient, account })) {
                yield {
                    status: status.status,
                    message: `${status.message}`,
                    step: `merge_${status.step}`,
                    data: status.data
                };

                if (status.status === 'success') {
                    yield {
                        status: 'success',
                        message: '🎉 Complete merge operation successful!',
                        step: 'complete',
                        data: status.data
                    };
                    return;
                } else if (status.status === 'error') {
                    throw new Error(`Merge failed: ${status.error}`);
                }
            }

        } catch (error) {
            if (isSafeTransactionSent(error)) throw error;
            yield {
                status: 'error',
                message: `Complete merge failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Split + Swap Operation: Check balances → Split if needed → Swap to target token
     * @param {object} args - { proposal, collateralToken, yesSdaiToken, yesGnoToken, targetAmount, slippageBps }
     */
    async* completeSplitSwap(args, { publicClient, walletClient, account }) {
        const { proposal, collateralToken, yesSdaiToken, yesGnoToken, targetAmount, slippageBps = '100' } = args;

        yield {
            status: 'pending',
            message: '🚀 Starting complete split + swap operation...',
            step: 'start'
        };

        try {
            // Choose swap cartridge based on configured mode
            let swapCartridge;
            if (this.swapMode === 'uniswap') {
                const { default: UniswapV4Cartridge } = await import('./UniswapV4Cartridge.js');
                swapCartridge = new UniswapV4Cartridge(this.swapConfig || this.swapRouter);
                console.log('🔄 UniswapV4Cartridge initialized for swap operation');
            } else {
                const { default: SwaprAlgebraCartridge } = await import('./SwaprAlgebraCartridge.js');
                swapCartridge = new SwaprAlgebraCartridge();
                console.log('🔄 SwaprAlgebraCartridge initialized for swap operation');
            }

            // ERC20 ABI for balance checking
            const ERC20_ABI = [
                {
                    name: 'balanceOf',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }]
                }
            ];

            // Step 1: Check current YES SDAI balance
            yield {
                status: 'pending',
                message: '🔍 Checking current YES SDAI balance...',
                step: 'check_yes_balance'
            };

            const currentYesSdaiBalance = await publicClient.readContract({
                address: yesSdaiToken,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [account]
            });

            const currentYesSdaiFormatted = formatEther(currentYesSdaiBalance);

            // Step 2: Check SDAI balance
            yield {
                status: 'pending',
                message: '💰 Checking SDAI balance...',
                step: 'check_sdai_balance'
            };

            const sdaiBalance = await publicClient.readContract({
                address: collateralToken,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [account]
            });

            const sdaiBalanceFormatted = formatEther(sdaiBalance);

            yield {
                status: 'pending',
                message: `📊 Current balances - YES SDAI: ${parseFloat(currentYesSdaiFormatted).toFixed(4)}, SDAI: ${parseFloat(sdaiBalanceFormatted).toFixed(4)}`,
                step: 'balances_checked'
            };

            // Step 3: Calculate split amount needed
            yield {
                status: 'pending',
                message: '🧮 Calculating split amount needed...',
                step: 'calculating_split'
            };

            const targetAmountWei = parseEther(targetAmount);
            const splitAmountNeeded = targetAmountWei - currentYesSdaiBalance;

            if (splitAmountNeeded <= 0n) {
                yield {
                    status: 'pending',
                    message: `✅ Already have enough YES SDAI (${currentYesSdaiFormatted}), proceeding to swap...`,
                    step: 'split_calculated'
                };
            } else {
                const splitAmountFormatted = formatEther(splitAmountNeeded);

                // Check if we have enough SDAI to split
                if (splitAmountNeeded > sdaiBalance) {
                    throw new Error(`Insufficient SDAI balance. Need ${splitAmountFormatted} more SDAI to split, but only have ${sdaiBalanceFormatted}`);
                }

                yield {
                    status: 'pending',
                    message: `📋 Need to split ${splitAmountFormatted} SDAI to reach target of ${targetAmount} YES SDAI`,
                    step: 'split_calculated'
                };

                // Step 4: Execute split for the needed amount
                yield {
                    status: 'pending',
                    message: `🔀 Splitting ${splitAmountFormatted} SDAI...`,
                    step: 'splitting'
                };

                for await (const status of this.completeSplit({
                    proposal,
                    collateralToken,
                    amount: splitAmountFormatted
                }, { publicClient, walletClient, account })) {
                    // Don't forward the success status from split - convert to pending
                    const forwardStatus = status.status === 'success' ? 'pending' : status.status;

                    yield {
                        status: forwardStatus,
                        message: `Split: ${status.message}`,
                        step: `split_${status.step}`,
                        data: status.data
                    };

                    if (status.status === 'success') {
                        console.log('✅ Split operation completed, continuing to swap...');
                        yield {
                            status: 'pending',
                            message: '✅ Split completed successfully!',
                            step: 'split_complete'
                        };
                        break;
                    } else if (status.status === 'error') {
                        throw new Error(`Split failed: ${status.error}`);
                    }
                }
                console.log('🔄 Split loop completed, moving to swap logic...');
            }

            // Step 5: Approve YES SDAI for swapping
            console.log('🔍 About to check YES SDAI approval for swapping...');
            yield {
                status: 'pending',
                message: '🔍 Checking YES SDAI approval for swap...',
                step: 'check_yes_approval'
            };

            console.log('🔍 Calling swap cartridge checkApproval with token:', yesSdaiToken);
            for await (const status of swapCartridge.checkApproval({
                tokenAddress: yesSdaiToken
            }, { publicClient, walletClient, account })) {
                console.log('🔍 Approval check status:', status);
                if (status.status === 'success') {
                    const isApproved = status.data.isApproved;

                    if (!isApproved) {
                        yield {
                            status: 'pending',
                            message: `⏳ Approving YES SDAI for swap (${exactApproval ? 'exact amount' : 'unlimited'})...`,
                            step: 'approving_yes'
                        };

                        const approveAmount = exactApproval ? splitAmountNeeded : 'unlimited'; // Use splitAmountNeeded as proxy for swap amount? No, swap amount is targetAmount?
                        // Actually, for completeSplitSwap, we are swapping the YES tokens we got from split + existing YES tokens.
                        // The swap amount is roughly targetAmount (if we started with 0 YES).
                        // But wait, completeSplitSwap logic is:
                        // 1. Check YES balance.
                        // 2. Split SDAI to get more YES if needed.
                        // 3. Swap YES for target token.
                        // The amount to swap is NOT explicitly passed to approve here in the original code?
                        // Original code: amount: 'unlimited'
                        // We need to know the amount to swap.
                        // In step 5, we are approving YES SDAI.
                        // The swap happens in step 6 (not shown in snippet but implied).
                        // The amount to swap is `targetAmount`? No, `targetAmount` is the target YES amount we wanted?
                        // Wait, `targetAmount` in `completeSplitSwap` args seems to be the amount of YES tokens we want to end up with?
                        // No, `completeSplitSwap` is usually "Split SDAI into YES/NO, then Swap YES for X".
                        // Let's look at the args: `targetAmount`
                        // Line 903: `const targetAmountWei = parseEther(targetAmount);`
                        // Line 904: `const splitAmountNeeded = targetAmountWei - currentYesSdaiBalance;`
                        // This implies `targetAmount` is the TOTAL YES tokens we want to have available to swap?
                        // So the swap amount is `targetAmount`.

                        const swapApproveAmount = exactApproval ? targetAmount : 'unlimited';

                        for await (const approveStatus of swapCartridge.approve({
                            tokenAddress: yesSdaiToken,
                            amount: swapApproveAmount
                        }, { publicClient, walletClient, account })) {
                            yield {
                                status: 'pending',
                                message: `Approve: ${approveStatus.message}`,
                                step: `approve_${approveStatus.step}`,
                                data: approveStatus.data
                            };

                            if (approveStatus.status === 'success') {
                                yield {
                                    status: 'pending',
                                    message: '✅ YES SDAI approved for swap!',
                                    step: 'yes_approved'
                                };
                                break;
                            } else if (approveStatus.status === 'error') {
                                throw new Error(`YES SDAI approval failed: ${approveStatus.error}`);
                            }
                        }
                    } else {
                        yield {
                            status: 'pending',
                            message: '✅ YES SDAI already approved for swap',
                            step: 'yes_approved'
                        };
                    }
                    break;
                } else if (status.status === 'error') {
                    throw new Error(`Approval check failed: ${status.error}`);
                }
            }

            // Step 6: Execute swap from YES SDAI to YES GNO
            console.log('🔄 About to execute swap...');
            yield {
                status: 'pending',
                message: `🔄 Swapping ${targetAmount} YES SDAI to YES GNO...`,
                step: 'swapping'
            };

            console.log('🔄 Calling swap cartridge completeSwap with params:', {
                tokenIn: yesSdaiToken,
                tokenOut: yesGnoToken,
                amount: targetAmount,
                slippageBps: slippageBps
            });

            for await (const status of swapCartridge.completeSwap({
                tokenIn: yesSdaiToken,
                tokenOut: yesGnoToken,
                amount: targetAmount,
                slippageBps: slippageBps,
                exactApproval: exactApproval
            }, { publicClient, walletClient, account })) {
                console.log('🔄 Swap status:', status);
                yield {
                    status: status.status,
                    message: `Swap: ${status.message}`,
                    step: `swap_${status.step}`,
                    data: status.data
                };

                if (status.status === 'success') {
                    yield {
                        status: 'success',
                        message: '🎉 Complete split + swap operation successful!',
                        step: 'complete',
                        data: status.data
                    };
                    return;
                } else if (status.status === 'error') {
                    throw new Error(`Swap failed: ${status.error}`);
                }
            }

        } catch (error) {
            yield {
                status: 'error',
                message: `Complete split + swap failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Complete Redeem Outcomes Operation: Check balances → Approve if needed → Redeem outcome tokens
     * @param {object} args - { proposal, token1Address, token2Address, amount1, amount2 }
     */
    async* completeRedeemOutcomes(args, { publicClient, walletClient, account }) {
        const { proposal, token1Address, token2Address, amount1, amount2, exactApproval = true, useBlockExplorer = false } = args;

        yield {
            status: 'pending',
            message: '🎯 Starting complete redeem outcomes operation...',
            step: 'start'
        };

        try {
            // Convert amounts to numbers for validation
            const amount1Num = Number(amount1 || '0');
            const amount2Num = Number(amount2 || '0');

            // ERC20 ABI for balance and approval checking
            const ERC20_ABI = [
                {
                    name: 'balanceOf',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }]
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
                }
            ];

            // Step 1: Check token balances
            if (amount1Num > 0 && token1Address) {
                yield {
                    status: 'pending',
                    message: '🔍 Checking token 1 balance...',
                    step: 'check_token1_balance'
                };

                const token1Balance = await publicClient.readContract({
                    address: token1Address,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [account]
                });

                const token1BalanceFormatted = formatEther(token1Balance);

                if (parseEther(amount1) > token1Balance) {
                    throw new Error(`Insufficient token 1 balance. Need ${amount1}, have ${token1BalanceFormatted}`);
                }

                yield {
                    status: 'pending',
                    message: `📊 Token 1 balance: ${parseFloat(token1BalanceFormatted).toFixed(6)}`,
                    step: 'check_token1_balance'
                };
            }

            if (amount2Num > 0 && token2Address) {
                yield {
                    status: 'pending',
                    message: '🔍 Checking token 2 balance...',
                    step: 'check_token2_balance'
                };

                const token2Balance = await publicClient.readContract({
                    address: token2Address,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [account]
                });

                const token2BalanceFormatted = formatEther(token2Balance);

                if (parseEther(amount2) > token2Balance) {
                    throw new Error(`Insufficient token 2 balance. Need ${amount2}, have ${token2BalanceFormatted}`);
                }

                yield {
                    status: 'pending',
                    message: `📊 Token 2 balance: ${parseFloat(token2BalanceFormatted).toFixed(6)}`,
                    step: 'check_token2_balance'
                };
            }

            yield {
                status: 'pending',
                message: '✅ Token balances verified',
                step: 'balances_checked'
            };

            // Step 2: Check and handle approvals
            if (amount1Num > 0 && token1Address) {
                yield {
                    status: 'pending',
                    message: '🔍 Checking token 1 approval...',
                    step: 'check_token1_approval'
                };

                const allowance1 = await publicClient.readContract({
                    address: token1Address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [account, this.futarchyRouterAddress]
                });

                const needed1 = parseEther(amount1);
                if (allowance1 < needed1) {
                    yield {
                        status: 'pending',
                        message: '⏳ Approving token 1 for redemption...',
                        step: 'approving_token1'
                    };

                    const approveAmount1 = exactApproval ? amount1 : 'unlimited';
                    for await (const status of this.approveCollateral({
                        collateralToken: token1Address,
                        amount: approveAmount1,
                        useBlockExplorer
                    }, { publicClient, walletClient, account })) {
                        if (status.status === 'success') {
                            yield {
                                status: 'pending',
                                message: '✅ Token 1 approved!',
                                step: 'approving_token1'
                            };
                            break;
                        } else if (status.status === 'error') {
                            throw new Error(`Token 1 approval failed: ${status.error}`);
                        }
                    }
                } else {
                    yield {
                        status: 'pending',
                        message: '✅ Token 1 already approved',
                        step: 'check_token1_approval'
                    };
                }
            }

            if (amount2Num > 0 && token2Address) {
                yield {
                    status: 'pending',
                    message: '🔍 Checking token 2 approval...',
                    step: 'check_token2_approval'
                };

                const allowance2 = await publicClient.readContract({
                    address: token2Address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [account, this.futarchyRouterAddress]
                });

                const needed2 = parseEther(amount2);
                if (allowance2 < needed2) {
                    yield {
                        status: 'pending',
                        message: '⏳ Approving token 2 for redemption...',
                        step: 'approving_token2'
                    };

                    const approveAmount2 = exactApproval ? amount2 : 'unlimited';
                    for await (const status of this.approveCollateral({
                        collateralToken: token2Address,
                        amount: approveAmount2,
                        useBlockExplorer
                    }, { publicClient, walletClient, account })) {
                        if (status.status === 'success') {
                            yield {
                                status: 'pending',
                                message: '✅ Token 2 approved!',
                                step: 'approving_token2'
                            };
                            break;
                        } else if (status.status === 'error') {
                            throw new Error(`Token 2 approval failed: ${status.error}`);
                        }
                    }
                } else {
                    yield {
                        status: 'pending',
                        message: '✅ Token 2 already approved',
                        step: 'check_token2_approval'
                    };
                }
            }

            yield {
                status: 'pending',
                message: '✅ All required approvals completed',
                step: 'tokens_approved'
            };

            // Step 3: Execute redemption
            const amount1Wei = amount1Num > 0 ? parseEther(amount1) : 0n;
            const amount2Wei = amount2Num > 0 ? parseEther(amount2) : 0n;

            yield {
                status: 'pending',
                message: `🔄 Redeeming outcome tokens (${amount1} | ${amount2})...`,
                step: 'redeeming'
            };

            const hash = await walletClient.writeContract({
                address: this.futarchyRouterAddress,
                abi: FUTARCHY_ROUTER_ABI,
                functionName: 'redeemProposal',
                args: [proposal, amount1Wei, amount2Wei],
                account
            });

            yield {
                status: 'pending',
                message: 'Transaction submitted, waiting for confirmation...',
                step: 'redeeming',
                data: { transactionHash: hash }
            };

            let receipt;
            if (this.isSafeConnection(walletClient)) {
                if (!useBlockExplorer) {
                    throw new Error("SAFE_TRANSACTION_SENT");
                }
                // For a Safe, `hash` is the safeTxHash, not an on-chain tx hash
                const chainId = await publicClient.getChainId();
                receipt = await waitForSafeTxReceipt({
                    chainId,
                    safeTxHash: hash,
                    publicClient
                });
            } else {
                receipt = await publicClient.waitForTransactionReceipt({ hash });
            }

            if (receipt.status === 'reverted') {
                throw new Error(`Redemption transaction reverted (${receipt.transactionHash})`);
            }

            yield {
                status: 'success',
                message: '🎉 Outcome tokens redeemed successfully!',
                step: 'complete',
                data: {
                    transactionHash: hash,
                    receipt,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    amount1: amount1,
                    amount2: amount2
                }
            };

        } catch (error) {
            if (error.message === "SAFE_TRANSACTION_SENT") throw error;
            yield {
                status: 'error',
                message: `Complete redeem outcomes failed: ${error.message}`,
                error: error.message
            };
        }
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { FutarchyCartridge as default }; 
