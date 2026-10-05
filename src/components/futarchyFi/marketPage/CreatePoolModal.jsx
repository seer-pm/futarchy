/**
 * CreatePoolModal
 * 
 * Modal for creating missing Futarchy pools.
 * Styled to match AddLiquidityModal (light/dark theme).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCreatePool } from '../../../hooks/useCreatePool';
import { CHAIN_CONFIG, getExplorerTxUrl } from '../../debug/constants/chainConfig';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';

// Pool type configurations - with clear labels
const POOL_TYPES = {
    CONDITIONAL_YES: {
        label: 'YES Conditional Pool',
        description: 'YES_COMPANY / YES_CURRENCY',
        getTokens: (config) => {
            const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || config?.metadata?.companyTokens?.base?.tokenSymbol || 'Company';
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.yes?.wrappedCollateralTokenAddress,
                token0Symbol: `YES_${companySymbol}`,
                token1Symbol: `YES_${currencySymbol}`
            };
        }
    },
    CONDITIONAL_NO: {
        label: 'NO Conditional Pool',
        description: 'NO_COMPANY / NO_CURRENCY',
        getTokens: (config) => {
            const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || config?.metadata?.companyTokens?.base?.tokenSymbol || 'Company';
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.companyTokens?.no?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.no?.wrappedCollateralTokenAddress,
                token0Symbol: `NO_${companySymbol}`,
                token1Symbol: `NO_${currencySymbol}`
            };
        }
    },
    PREDICTION_YES: {
        label: 'YES Prediction Pool',
        description: 'YES_CURRENCY / BASE_CURRENCY',
        getTokens: (config) => {
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.currencyTokens?.yes?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.base?.wrappedCollateralTokenAddress || config?.BASE_TOKENS_CONFIG?.currency?.address,
                token0Symbol: `YES_${currencySymbol}`,
                token1Symbol: currencySymbol
            };
        }
    },
    PREDICTION_NO: {
        label: 'NO Prediction Pool',
        description: 'NO_CURRENCY / BASE_CURRENCY',
        getTokens: (config) => {
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.currencyTokens?.no?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.base?.wrappedCollateralTokenAddress || config?.BASE_TOKENS_CONFIG?.currency?.address,
                token0Symbol: `NO_${currencySymbol}`,
                token1Symbol: currencySymbol
            };
        }
    },
    EXPECTED_VALUE_YES: {
        label: 'YES Expected Value Pool',
        description: 'YES_COMPANY / BASE_CURRENCY',
        getTokens: (config) => {
            const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || config?.metadata?.companyTokens?.base?.tokenSymbol || 'Company';
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.base?.wrappedCollateralTokenAddress || config?.BASE_TOKENS_CONFIG?.currency?.address,
                token0Symbol: `YES_${companySymbol}`,
                token1Symbol: currencySymbol
            };
        }
    },
    EXPECTED_VALUE_NO: {
        label: 'NO Expected Value Pool',
        description: 'NO_COMPANY / BASE_CURRENCY',
        getTokens: (config) => {
            const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || config?.metadata?.companyTokens?.base?.tokenSymbol || 'Company';
            const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || config?.metadata?.currencyTokens?.base?.tokenSymbol || 'Currency';
            return {
                token0: config?.metadata?.companyTokens?.no?.wrappedCollateralTokenAddress,
                token1: config?.metadata?.currencyTokens?.base?.wrappedCollateralTokenAddress || config?.BASE_TOKENS_CONFIG?.currency?.address,
                token0Symbol: `NO_${companySymbol}`,
                token1Symbol: currencySymbol
            };
        }
    }
};

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
};

const modalVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 }
};

export default function CreatePoolModal({ isOpen, onClose, config, missingPools = [], onPoolCreated }) {
    const [selectedPoolType, setSelectedPoolType] = useState(null);
    const [initialPrice, setInitialPrice] = useState('');
    const chainId = config?.chainId || 100;
    const chainConfig = CHAIN_CONFIG[chainId];

    const {
        createPool,
        reset,
        status,
        txHash,
        poolAddress,
        isCreating,
        isConnected
    } = useCreatePool();

    // Get subgraph refresh function to trigger after pool creation
    const { refreshChart } = useSubgraphRefresh();

    // Trigger chart refresh and config refetch after successful pool creation
    useEffect(() => {
        if (status.type === 'success' && poolAddress) {
            console.log('[CreatePoolModal] Pool created, scheduling refreshes in 3s');
            const timer = setTimeout(() => {
                console.log('[CreatePoolModal] Triggering chart refresh and config refetch');
                refreshChart();
                // Refetch config to update pool addresses
                if (onPoolCreated) {
                    onPoolCreated();
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [status.type, poolAddress, refreshChart, onPoolCreated]);

    // Get tokens for selected pool type
    const selectedTokens = useMemo(() => {
        if (!selectedPoolType || !config) return null;
        return POOL_TYPES[selectedPoolType]?.getTokens(config);
    }, [selectedPoolType, config]);

    // Track previous isOpen to only reset on actual open
    const prevIsOpenRef = useRef(false);

    // Reset state ONLY when modal transitions from closed to open
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            // Modal just opened - reset everything
            reset();
            setSelectedPoolType(null);
            setInitialPrice('');
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen, reset]);

    // Handle pool creation
    const handleCreatePool = async () => {
        if (!selectedTokens?.token0 || !selectedTokens?.token1) {
            console.error('Missing token addresses');
            return;
        }

        const price = parseFloat(initialPrice);
        if (isNaN(price) || price <= 0) {
            console.error('Invalid price');
            return;
        }

        await createPool({
            token0: selectedTokens.token0,
            token1: selectedTokens.token1,
            initialPrice: price,
            targetChainId: chainId
        });
    };

    // Configure which pool types are enabled - easy to change in future
    // Set to true to enable each pool type category
    const ENABLED_POOL_CATEGORIES = {
        conditional: true,   // YES/NO Conditional pools
        prediction: false,   // YES/NO Prediction pools (currency vs base)
        expectedValue: false // YES/NO Expected Value pools (company vs base)
    };

    // Determine which pools are missing based on enabled categories
    const availablePoolTypes = useMemo(() => {
        if (missingPools.length > 0) return missingPools;

        // Auto-detect from config based on enabled categories
        const missing = [];

        if (ENABLED_POOL_CATEGORIES.conditional) {
            if (!config?.POOL_CONFIG_YES?.address) missing.push('CONDITIONAL_YES');
            if (!config?.POOL_CONFIG_NO?.address) missing.push('CONDITIONAL_NO');
        }

        if (ENABLED_POOL_CATEGORIES.prediction) {
            if (!config?.PREDICTION_POOLS?.yes?.address) missing.push('PREDICTION_YES');
            if (!config?.PREDICTION_POOLS?.no?.address) missing.push('PREDICTION_NO');
        }

        if (ENABLED_POOL_CATEGORIES.expectedValue) {
            // Add detection for expected value pools if needed
            missing.push('EXPECTED_VALUE_YES');
            missing.push('EXPECTED_VALUE_NO');
        }

        return missing;
    }, [config, missingPools]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={onClose}
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                >
                    <motion.div
                        className="bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80dvh] overflow-y-auto shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-futarchyGray12 dark:text-futarchyGray3">Create Pool</h2>
                            <button
                                onClick={onClose}
                                className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Description */}
                        <div className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-6">
                            Create missing pools for this proposal.
                            {chainConfig?.amm === 'uniswap'
                                ? " Pools will be created on Uniswap V3."
                                : " Pools will be created on Swapr (Algebra)."
                            }
                        </div>

                        {/* Chain Info */}
                        <div className="p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 mb-4">
                            <div className="flex items-center gap-2 text-sm text-futarchyGray11 dark:text-futarchyGray112">
                                <div className={`w-2 h-2 rounded-full ${chainId === 1 ? 'bg-blue-500' : 'bg-green-500'}`} />
                                <span className="text-futarchyGray12 dark:text-futarchyGray3">{chainConfig?.name || 'Unknown'} Chain</span>
                                <span className="text-futarchyGray6 dark:text-futarchyGray112">|</span>
                                <span>{chainConfig?.amm === 'uniswap' ? 'Uniswap V3' : 'Algebra'}</span>
                            </div>
                        </div>

                        {/* Pool Type Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112 mb-2">
                                Select Pool to Create
                            </label>
                            <select
                                value={selectedPoolType || ''}
                                onChange={(e) => setSelectedPoolType(e.target.value)}
                                className="w-full bg-futarchyGray3 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyGray112/20 rounded-lg px-4 py-3 text-futarchyGray12 dark:text-futarchyGray3 focus:border-futarchyBlue focus:ring-1 focus:ring-futarchyBlue outline-none"
                            >
                                <option value="">Select a pool...</option>
                                {availablePoolTypes.map((poolType) => (
                                    <option key={poolType} value={poolType}>
                                        {POOL_TYPES[poolType]?.label || poolType}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Token Pair Display */}
                        {selectedTokens && (
                            <div className="p-4 bg-futarchyGray3 dark:bg-futarchyDarkGray4 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 mb-4">
                                <div className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-2">Token Pair:</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-futarchyGray12 dark:text-futarchyGray3 font-mono text-sm">
                                        {selectedTokens.token0Symbol || 'Token0'}
                                    </div>
                                    <div className="text-futarchyGray11 dark:text-futarchyGray112">/</div>
                                    <div className="text-futarchyGray12 dark:text-futarchyGray3 font-mono text-sm">
                                        {selectedTokens.token1Symbol || 'Token1'}
                                    </div>
                                </div>
                                <div className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-2 break-all">
                                    {selectedTokens.token0?.slice(0, 10)}...{selectedTokens.token0?.slice(-6)}
                                </div>
                            </div>
                        )}

                        {/* Initial Price Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112 mb-2">
                                Initial Price {selectedTokens ? `(${selectedTokens.token1Symbol} per ${selectedTokens.token0Symbol})` : ''}
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={initialPrice}
                                onChange={(e) => setInitialPrice(e.target.value)}
                                placeholder="e.g., 120"
                                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                disabled={isCreating}
                            />
                            <div className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-1">
                                For conditional pools, this is typically the spot price of the company token
                            </div>
                        </div>

                        {/* Status Display */}
                        {status.type !== 'idle' && (
                            <div className={`rounded-lg p-3 mb-4 ${status.type === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50' :
                                status.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700/50' :
                                    status.type === 'error' ? 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50' :
                                        'bg-futarchyGray3 dark:bg-futarchyDarkGray4'
                                }`}>
                                <div className="flex items-center gap-2">
                                    {status.type === 'pending' && (
                                        <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full" />
                                    )}
                                    {status.type === 'success' && (
                                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {status.type === 'error' && (
                                        <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    )}
                                    <span className={`text-sm ${status.type === 'pending' ? 'text-yellow-700 dark:text-yellow-400' :
                                        status.type === 'success' ? 'text-green-700 dark:text-green-400' :
                                            status.type === 'error' ? 'text-red-700 dark:text-red-400' :
                                                'text-futarchyGray11 dark:text-futarchyGray112'
                                        }`}>
                                        {status.message}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Transaction Hash */}
                        {txHash && (
                            <div className="p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 mb-4">
                                <div className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-1">Transaction Hash:</div>
                                <a
                                    href={getExplorerTxUrl(chainId, txHash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-futarchyBlue hover:text-futarchyBlue/80 text-sm font-mono break-all"
                                >
                                    {txHash}
                                </a>
                            </div>
                        )}

                        {/* Pool Address */}
                        {poolAddress && (
                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg border border-green-300 dark:border-green-700/50 mb-4">
                                <div className="text-sm text-green-700 dark:text-green-400 mb-1">Pool Created:</div>
                                <div className="text-futarchyGray12 dark:text-futarchyGray3 text-sm font-mono break-all">{poolAddress}</div>
                                <div className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-2">
                                    The pool may take a few minutes to appear in the subgraph
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 text-futarchyGray11 dark:text-futarchyGray112 hover:bg-futarchyGray3 dark:hover:bg-futarchyDarkGray4 transition-colors"
                                disabled={isCreating}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreatePool}
                                disabled={!isConnected || !selectedPoolType || !initialPrice || isCreating || status.type === 'success'}
                                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${!isConnected || !selectedPoolType || !initialPrice || isCreating || status.type === 'success'
                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    : selectedPoolType?.includes('YES')
                                        ? 'bg-futarchyBlue3 dark:bg-futarchyBlue6/40 text-futarchyBlue11 dark:text-futarchyBlue6 border-2 border-futarchyBlue7 hover:bg-futarchyBlue4'
                                        : 'bg-futarchyGold3 dark:bg-futarchyGold6/30 text-futarchyGold11 dark:text-futarchyGold6 border-2 border-futarchyGold9 hover:bg-futarchyGold4'
                                    }`}
                            >
                                {isCreating ? 'Creating...' : status.type === 'success' ? 'Pool Created!' : 'Create Pool'}
                            </button>
                        </div>

                        {/* Wallet Connection Warning */}
                        {!isConnected && (
                            <div className="mt-4 text-center text-sm text-yellow-600 dark:text-yellow-400">
                                Please connect your wallet to create pools
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
