/**
 * CreatePoolModal
 * 
 * Modal for creating missing Futarchy pools.
 * Styled to match AddLiquidityModal (light/dark theme).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useCreatePool } from '../../../hooks/useCreatePool';
import { CHAIN_CONFIG, getExplorerTxUrl } from '../../debug/constants/chainConfig';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';
import { Dialog } from '@seer-pm/ui-kit/react';

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
        <Dialog open={isOpen} onClose={onClose} title="Create Pool" dismissible={!isCreating}>

                        {/* Description */}
                        <div className="text-sm text-seer-muted mb-6">
                            Create missing pools for this proposal.
                            {chainConfig?.amm === 'uniswap'
                                ? " Pools will be created on Uniswap V3."
                                : " Pools will be created on Swapr (Algebra)."
                            }
                        </div>

                        {/* Chain Info */}
                        <div className="p-3 bg-seer-surface-raised rounded-lg border border-seer-border mb-4">
                            <div className="flex items-center gap-2 text-sm text-seer-muted">
                                <div className={`w-2 h-2 rounded-full ${chainId === 1 ? 'bg-seer-accent-text' : 'bg-seer-positive'}`} />
                                <span className="text-seer-text">{chainConfig?.name || 'Unknown'} Chain</span>
                                <span className="text-seer-muted text-seer-muted">|</span>
                                <span>{chainConfig?.amm === 'uniswap' ? 'Uniswap V3' : 'Algebra'}</span>
                            </div>
                        </div>

                        {/* Pool Type Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-seer-muted mb-2">
                                Select Pool to Create
                            </label>
                            <select
                                value={selectedPoolType || ''}
                                onChange={(e) => setSelectedPoolType(e.target.value)}
                                className="w-full bg-seer-surface-raised border border-seer-border rounded-lg px-4 py-3 text-seer-text focus:border-seer-accent-text focus:ring-1 focus:ring-seer-accent-text outline-none"
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
                            <div className="p-4 bg-seer-surface-raised rounded-lg border border-seer-border mb-4">
                                <div className="text-sm text-seer-muted mb-2">Token Pair:</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-seer-text font-mono text-sm">
                                        {selectedTokens.token0Symbol || 'Token0'}
                                    </div>
                                    <div className="text-seer-muted">/</div>
                                    <div className="text-seer-text font-mono text-sm">
                                        {selectedTokens.token1Symbol || 'Token1'}
                                    </div>
                                </div>
                                <div className="text-xs text-seer-muted mt-2 break-all">
                                    {selectedTokens.token0?.slice(0, 10)}...{selectedTokens.token0?.slice(-6)}
                                </div>
                            </div>
                        )}

                        {/* Initial Price Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-seer-muted mb-2">
                                Initial Price {selectedTokens ? `(${selectedTokens.token1Symbol} per ${selectedTokens.token0Symbol})` : ''}
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={initialPrice}
                                onChange={(e) => setInitialPrice(e.target.value)}
                                placeholder="e.g., 120"
                                className="w-full bg-seer-surface border border-seer-border rounded-lg px-4 py-3 text-seer-text placeholder-seer-muted focus:border-seer-accent-text focus:ring-1 focus:ring-seer-accent-text outline-none"
                                disabled={isCreating}
                            />
                            <div className="text-xs text-seer-muted mt-1">
                                For conditional pools, this is typically the spot price of the company token
                            </div>
                        </div>

                        {/* Status Display */}
                        {status.type !== 'idle' && (
                            <div className={`rounded-lg p-3 mb-4 ${status.type === 'pending' ? 'bg-fail-soft border border-yellow-300 ' :
                                status.type === 'success' ? 'bg-seer-positive/10 border border-seer-positive/40 ' :
                                    status.type === 'error' ? 'bg-seer-negative/10 border border-seer-negative/40 ' :
                                        'bg-seer-surface-raised'
                                }`}>
                                <div className="flex items-center gap-2">
                                    {status.type === 'pending' && (
                                        <div className="animate-spin h-4 w-4 border-2 border-seer-border border-t-seer-purple rounded-full" />
                                    )}
                                    {status.type === 'success' && (
                                        <svg className="w-4 h-4 text-seer-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {status.type === 'error' && (
                                        <svg className="w-4 h-4 text-seer-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    )}
                                    <span className={`text-sm ${status.type === 'pending' ? 'text-yellow-700' :
                                        status.type === 'success' ? 'text-seer-positive' :
                                            status.type === 'error' ? 'text-seer-negative' :
                                                'text-seer-muted'
                                        }`}>
                                        {status.message}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Transaction Hash */}
                        {txHash && (
                            <div className="p-3 bg-seer-surface-raised rounded-lg border border-seer-border mb-4">
                                <div className="text-sm text-seer-muted mb-1">Transaction Hash:</div>
                                <a
                                    href={getExplorerTxUrl(chainId, txHash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-seer-accent-text hover:text-seer-accent-text text-sm font-mono break-all"
                                >
                                    {txHash}
                                </a>
                            </div>
                        )}

                        {/* Pool Address */}
                        {poolAddress && (
                            <div className="p-3 bg-seer-positive/10 rounded-lg border border-seer-positive/40 mb-4">
                                <div className="text-sm text-seer-positive mb-1">Pool Created:</div>
                                <div className="text-seer-text text-sm font-mono break-all">{poolAddress}</div>
                                <div className="text-xs text-seer-muted mt-2">
                                    The pool may take a few minutes to appear in the subgraph
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 rounded-lg border border-seer-border text-seer-muted hover:bg-seer-surface-raised hover:bg-seer-surface transition-colors"
                                disabled={isCreating}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreatePool}
                                disabled={!isConnected || !selectedPoolType || !initialPrice || isCreating || status.type === 'success'}
                                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${!isConnected || !selectedPoolType || !initialPrice || isCreating || status.type === 'success'
                                    ? 'bg-seer-surface-raised text-seer-muted cursor-not-allowed'
                                    : selectedPoolType?.includes('YES')
                                        ? 'bg-pass-soft text-pass-text border border-pass hover:bg-pass-soft'
                                        : 'bg-fail-soft text-fail-text border border-fail hover:bg-fail-soft'
                                    }`}
                            >
                                {isCreating ? 'Creating...' : status.type === 'success' ? 'Pool Created!' : 'Create Pool'}
                            </button>
                        </div>

                        {/* Wallet Connection Warning */}
                        {!isConnected && (
                            <div className="mt-4 text-center text-sm text-fail-text">
                                Please connect your wallet to create pools
                            </div>
                        )}
        </Dialog>
    );
}
