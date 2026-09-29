import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
// Replace useMetaMask with wagmi hooks
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CowSdk, OrderKind } from '@gnosis.pm/cow-sdk';
import { fetchSushiSwapRoute, executeSushiSwapRoute } from '../../../utils/sushiswapHelper';
import { executeV3Swap, executeSushiV3RouterSwap, executeSushiV3DirectRedemption, checkAndApproveTokenForV3Swap, V3_POOL_CONFIG, executeRedemptionSwap, executeAlgebraExactSingle, SWAPR_V3_ROUTER } from '../../../utils/sushiswapV3Helper';
import {
    checkAndApproveTokenForUniswapV3,
    executeUniswapV3Swap,
    getUniswapV3Quote,
    UNISWAP_V3_ROUTER,
    UNISWAP_UNIVERSAL_ROUTER,
    PERMIT2_ADDRESS,
    shouldUsePermit2
} from '../../../utils/uniswapV3Helper';
import {
    checkAndApproveForUniswapSDK,
    executeSwapForUniswapSDK,
    getUniswapV3QuoteWithPriceImpact,
    getPoolSqrtPrice,
    sqrtPriceX96ToPrice as uniswapSqrtPriceX96ToPrice
} from '../../../utils/uniswapSdk';
import {
    getAlgebraQuoteWithSlippage,
    sqrtPriceX96ToPrice
} from '../../../utils/algebraQuoter';
// Import SDK Cartridges
import { UniswapRouterCartridge } from 'futarchy-sdk/executors/UniswapRouterCartridge';
import { SwaprAlgebraCartridge } from 'futarchy-sdk/executors/SwaprAlgebraCartridge';
import { FutarchyCartridge } from 'futarchy-sdk/executors/FutarchyCartridge';
import { getBestRpcProvider, getBestRpc, clearRpcCache } from '../../../utils/getBestRpc';
import {
    ERC20_ABI,
    FUTARCHY_ROUTER_ABI,
    WRAPPER_SERVICE_ADDRESS,
    PRECISION_CONFIG as DEFAULT_PRECISION_CONFIG,
    DEFAULT_BASE_TOKENS_CONFIG,
    FUTARCHY_ROUTER_ADDRESS as DEFAULT_FUTARCHY_ROUTER_ADDRESS,
    SUSHISWAP_V2_ROUTER as DEFAULT_SUSHISWAP_V2_ROUTER,
    SUSHISWAP_V3_ROUTER as DEFAULT_SUSHISWAP_V3_ROUTER,
    PREDICTION_POOLS,
    MARKET_ADDRESS,
} from './constants/contracts';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { useRequiredChain } from '../../../hooks/useChainValidation';
import DebugToast from './DebugToast';
import { formatBalance, formatPrice, formatPercentage } from '../../../utils/formatters';
import { Decimal } from 'decimal.js';
import { formatTokenAmount, formatWith } from '../../../utils/precisionFormatter';
import { getEthersSigner, getEthersProvider } from '../../../utils/ethersAdapters';
import { useSafeConnection } from '../../../hooks/useSafeConnection';
import { waitForSafeTxReceipt } from '../../../utils/waitForSafeTxReceipt';
import { SAFE_TRANSACTION_SENT, isSafeTransactionSent, isUserRejection, describeTxError, assertReceiptSucceeded, TX_CANCELLED_MESSAGE, SWAP_REVERT_HINT, describeQuoteError } from '../../../utils/txErrors';
import { minReceiveFromQuote, compareQuotes } from '../../../utils/swapQuoteMath';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';
import { approvalAmountFor } from '../../../utils/approvalAmount';

// Define ERC20 ABI in viem-compatible format
const ERC20_ABI_VIEM = [
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
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

// getEthersSigner and getEthersProvider imported from utils

// Mock steps data with substeps
export const STEPS_DATA = {
    1: {
        title: 'Adding Collateral',
        substeps: [
            { id: 1, text: 'Approving base token for Futarchy Router', completed: false },
            { id: 2, text: 'Split wrapping position', completed: false }
        ]
    },
    2: {
        title: 'Processing Transaction',
        substeps: [
            { id: 1, text: 'Approving token for swap', completed: false },
            { id: 2, text: 'Executing transaction', completed: false }
        ]
    }
};

// Updated function to get steps data based on transaction type AND method
const getStepsData = (transactionType, selectedMethod = 'cowswap') => {
    const swapTargetName =
        selectedMethod === 'cowswap' ? 'CoW Swap' :
            selectedMethod === 'algebra' ? 'Algebra (Swapr)' :
                selectedMethod === 'uniswap' ? 'Uniswap V3' :
                    selectedMethod === 'uniswapSdk' ? 'Uniswap SDK' :
                        'SushiSwap V3';

    if (transactionType === 'Redeem') {
        // Use the same logic to determine the target name for redemption steps
        const redemptionTargetName =
            selectedMethod === 'cowswap' ? 'CoW Swap' :
                selectedMethod === 'algebra' ? 'Algebra (Swapr)' :
                    selectedMethod === 'uniswap' ? 'Uniswap V3' :
                        selectedMethod === 'uniswapSdk' ? 'Uniswap SDK' :
                            'SushiSwap V3';

        // Special case for Uniswap with Permit2
        if (selectedMethod === 'uniswap' || selectedMethod === 'uniswapSdk') {
            return {
                1: {
                    title: 'Preparing Redemption',
                    substeps: [
                        { id: 1, text: 'Checking position balance', completed: false },
                        { id: 2, text: 'Validating redemption eligibility', completed: false }
                    ]
                },
                2: {
                    title: 'Processing Redemption',
                    substeps: [
                        { id: 1, text: 'Step 1: Approve token to Permit2', completed: false },
                        { id: 2, text: 'Step 2: Approve Permit2 to Universal Router', completed: false },
                        { id: 3, text: 'Executing redemption', completed: false }
                    ]
                }
            };
        }

        return {
            1: {
                title: 'Preparing Redemption',
                substeps: [
                    { id: 1, text: 'Checking position balance', completed: false },
                    { id: 2, text: 'Validating redemption eligibility', completed: false }
                ]
            },
            2: {
                title: 'Processing Redemption',
                substeps: [
                    // Use the dynamically determined redemptionTargetName
                    { id: 1, text: 'Approving token for spending', completed: false },
                    { id: 2, text: 'Executing redemption', completed: false }
                ]
            }
        };
    }

    // Default steps for Buy/Sell
    // Special case for Uniswap with Permit2
    if (selectedMethod === 'uniswap' || selectedMethod === 'uniswapSdk') {
        return {
            1: {
                title: 'Adding Collateral', // Method-agnostic
                substeps: [
                    { id: 1, text: 'Approving base token for Futarchy Router', completed: false },
                    { id: 2, text: 'Split wrapping position', completed: false }
                ]
            },
            2: {
                title: 'Processing Swap',
                substeps: [
                    { id: 1, text: 'Step 1: Approve token to Permit2', completed: false },
                    { id: 2, text: 'Step 2: Approve Permit2 to Universal Router', completed: false },
                    { id: 3, text: 'Executing swap', completed: false }
                ]
            }
        };
    }

    return {
        1: {
            title: 'Adding Collateral', // Method-agnostic
            substeps: [
                { id: 1, text: 'Approving base token for Futarchy Router', completed: false },
                { id: 2, text: 'Split wrapping position', completed: false }
            ]
        },
        2: {
            title: 'Processing Swap', // Method-agnostic
            substeps: [
                // Use the dynamically determined swapTargetName
                { id: 1, text: 'Approving token for spending', completed: false },
                { id: 2, text: 'Executing swap', completed: false }
            ]
        }
    };
};

const LoadingSpinner = ({ className = "" }) => (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24">
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            opacity="0.15"
        />
        <path
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            d="M4 12a8 8 0 018-8"
        />
    </svg>
);

const CheckMark = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
        />
    </svg>
);

const StepWithSubsteps = ({
    step,
    title,
    substeps,
    expanded,
    onToggle,
    isSimulating,
    currentSubstep,
    processingStep,
    transactionData,
    prices,
    completedSubsteps
}) => {
    const isStepActive = isSimulating && currentSubstep.step === parseInt(step);
    const isStepCompleted = processingStep === 'completed';
    const isStepWaiting = currentSubstep.step < parseInt(step);

    // Determine if any substep for THIS main step is currently processing
    const isAnySubstepCurrentlyProcessing = useMemo(() => {
        if (!isStepActive) return false;
        return substeps.some(sub => parseInt(currentSubstep.substep) === parseInt(sub.id));
    }, [isStepActive, substeps, currentSubstep.substep]);

    // Add debug logging
    console.log(`Step ${step} Status:`, {
        isStepActive,
        isStepCompleted,
        isStepWaiting,
        currentSubstep
    });

    const getStepIconContainerClasses = () => {
        const baseColors = getStepColors();
        if (isStepActive && isAnySubstepCurrentlyProcessing) {
            // If spinner is active for the main step, remove background for transparency
            return baseColors.split(' ').filter(cls => !cls.startsWith('bg-')).join(' ');
        }
        return baseColors;
    };

    const getStepColors = () => {
        if (isStepCompleted) {
            return transactionData.action === 'Buy'
                ? 'text-futarchyBlue11 bg-futarchyBlue3'
                : 'text-futarchyCrimson11 bg-futarchyCrimson3';
        }
        if (isStepActive) {
            return transactionData.action === 'Buy'
                ? 'text-futarchyBlue11 bg-futarchyBlue3'
                : 'text-futarchyCrimson11 bg-futarchyCrimson3';
        }
        return 'text-futarchyGray8 bg-futarchyGray4';
    };

    const getSubstepColor = (isCompleted, isActive) => {
        if (isCompleted) {
            return transactionData.action === 'Buy'
                ? 'text-futarchyBlue11'
                : 'text-futarchyCrimson11';
        }
        if (isActive) {
            return transactionData.action === 'Buy'
                ? 'text-futarchyBlue11'
                : 'text-futarchyCrimson11';
        }
        return 'text-futarchyGray8';
    };

    // Add debug logging
    console.log(`StepWithSubsteps ${step} rendered:`, {
        isStepActive,
        isStepCompleted,
        isStepWaiting,
        currentSubstep,
        processingStep,
        isSimulating
    });

    return (
        <motion.div
            initial={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-4 overflow-hidden"
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getStepIconContainerClasses()}`}>
                    {isStepCompleted ? (
                        <CheckMark />
                    ) : isStepActive && isAnySubstepCurrentlyProcessing ? (
                        <LoadingSpinner className="h-6 w-6" />
                    ) : (
                        <span className="text-sm font-medium">{step}</span>
                    )}
                </div>
                <span className={`flex-1 ${isStepCompleted
                    ? 'text-futarchyGray12 dark:text-futarchyGray112    '
                    : isStepActive
                        ? 'text-futarchyGray12 dark:text-futarchyGray112'
                        : 'text-futarchyGray11 dark:text-futarchyGray112'
                    }`}>
                    {title}
                </span>
                <button
                    onClick={onToggle}
                    className="text-futarchyBlue11 hover:text-futarchyBlue9 text-sm"
                >
                    {expanded ? 'Hide details' : 'Show details'}
                </button>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-9 space-y-2 overflow-hidden"
                    >
                        {substeps.map((substep, index) => {
                            // Fix how we determine if a substep is active
                            const explicitlyActive = isStepActive && parseInt(currentSubstep.substep) === parseInt(substep.id);
                            // Force active state for debugging if needed
                            const isSubstepActive = explicitlyActive ||
                                (isStepActive &&
                                    parseInt(currentSubstep.substep) === parseInt(substep.id));

                            const isSubstepCompleted =
                                isStepCompleted ||
                                completedSubsteps[step]?.substeps[substep.id] ||
                                currentSubstep.step > parseInt(step);
                            const isSubstepWaiting =
                                isStepWaiting ||
                                (isStepActive && currentSubstep.substep < substep.id);

                            // Add debug logging for each substep
                            console.log(`Step ${step} Substep ${substep.id} Status:`, {
                                isSubstepActive,
                                isSubstepCompleted,
                                currentSubstep,
                                substepId: substep.id,
                                active: isStepActive && currentSubstep.substep === substep.id
                            });

                            return (
                                <div key={substep.id} className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${getSubstepColor(isSubstepCompleted, isSubstepActive)
                                        }`}>
                                        {isSubstepCompleted ? (
                                            <CheckMark />
                                        ) : isSubstepActive ? (
                                            <>
                                                {console.log(`Rendering SPINNER for step ${step} substep ${substep.id}`, {
                                                    isSubstepActive,
                                                    explicitlyActive,
                                                    isStepActive,
                                                    currentSubstep
                                                })}
                                                <LoadingSpinner />
                                            </>
                                        ) : (
                                            <div className="w-2 h-2 rounded-full bg-current" />
                                        )}
                                    </div>
                                    <span className={`text-sm ${isSubstepCompleted
                                        ? 'text-futarchyGray12 dark:text-futarchyGray112    '
                                        : isSubstepActive
                                            ? 'text-futarchyGray12 dark:text-futarchyGray112'
                                            : 'text-futarchyGray11 dark:text-futarchyGray112'
                                        }`}>
                                        {substep.text}
                                    </span>
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ---> Define Default Explorer Config (used for initial state) <----
const DEFAULT_EXPLORER_CONFIG = {
    url: 'https://gnosisscan.io/tx/', // Default to GnosisScan
    name: 'GnosisScan'
};
// Ethereum-market transactions (Uniswap SDK) link here instead
const MAINNET_EXPLORER_CONFIG = {
    url: 'https://etherscan.io/tx/',
    name: 'Etherscan'
};

// ---> Simple SVG Cog Icon <----
const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block ml-1 text-futarchyGray9 hover:text-futarchyGray11 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const ConfirmSwapModal = memo(({
    onClose,
    transactionData,
    existingBalance = '0',
    additionalCollateralNeeded = '0',
    onTransactionComplete,
    proposalId: proposalIdFromProps, // <-- Add new prop
    onSafeTransaction, // Add prop
    debugMode = false,
    checkSellCollateral = false,
    useSushiV3 = true,  // Default to using SushiSwap V3
    hideToggleSushiSwap = true, // New flag to hide SushiSwap toggle
    toggleHideCowSwap = true, // New flag to hide CoW Swap toggle (default: true)
    useSDK = false, // Feature flag for SDK integration
    useBlockExplorer = false // Flag to force waiting for transaction confirmation
}) => {
    // Feature flag for redemption functionality
    const ENABLE_REDEMPTION = true;
    // Feature flag to control whether we should display inverse swap prices for redemption
    const USE_INVERSE_SWAP_DISPLAY = false; // Set to false to display direct API swap price instead of inverse

    // Get subgraph refresh triggers for post-swap updates
    const { refreshAll } = useSubgraphRefresh();

    // Detailed prop logging at component mount
    console.log('=== ConfirmSwapModal Raw Props ===', {
        fullTransactionData: transactionData,
        rawAmount: transactionData?.amount,
        amountParts: transactionData?.amount?.split(' '),
        rawAmountValue: transactionData?.amount?.split(' ')[0],
        token: transactionData?.amount?.split(' ')[1],
        stringLength: transactionData?.amount?.split(' ')[0]?.length,
        action: transactionData?.action,
        outcome: transactionData?.outcome
    });

    // Log any potential type coercion or formatting
    useEffect(() => {
        if (transactionData?.amount) {
            const rawAmount = transactionData.amount.split(' ')[0];
            console.log('=== Amount Processing Debug ===', {
                originalAmount: transactionData.amount,
                rawAmount,
                numberValue: Number(rawAmount),
                parseFloatValue: parseFloat(rawAmount),
                toStringResult: rawAmount.toString(),
                toFixedResult: parseFloat(rawAmount).toFixed(18)
            });
        }
    }, [transactionData]);

    console.log('=== ConfirmSwapModal Props Debug ===', {
        transactionData,
        existingBalance,
        additionalCollateralNeeded,
        checkSellCollateral,
        useSushiV3
    });

    const [selectedSwapMethod, setSelectedSwapMethod] = useState(() => {
        // Default to algebra, will be updated by useEffect when chain is known
        if (typeof window !== 'undefined') {
            const lastUsedMethod = localStorage.getItem('lastSwapMethod');
            // Only allow saved methods that are valid
            if (['cowswap', 'algebra', 'uniswapSdk'].includes(lastUsedMethod)) {
                return lastUsedMethod;
            }
        }
        return 'algebra'; // Default to 'algebra'
    });

    console.log(`[ConfirmSwapCow Debug - Render] selectedSwapMethod state: ${selectedSwapMethod}`);

    // Get the steps data based on transaction type AND selected method
    const stepsData = useMemo(() => {
        console.log(`[ConfirmSwapCow Debug - Render] Recalculating stepsData for method: ${selectedSwapMethod}`);
        return getStepsData(transactionData?.action, selectedSwapMethod);
    }, [transactionData?.action, selectedSwapMethod]);

    const [expandedSteps, setExpandedSteps] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [processingStep, setProcessingStep] = useState(null);
    const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 1 });
    const [swapRouteData, setSwapRouteData] = useState({ isLoading: true, error: null, data: null });
    const [completedSubsteps, setCompletedSubsteps] = useState({
        1: { completed: false, substeps: {} },
        2: { completed: false, substeps: {} }
    });
    const [debugData, setDebugData] = useState(null);
    const [transactionResultHash, setTransactionResultHash] = useState(null);
    const [orderStatus, setOrderStatus] = useState(null);

    const [cowSwapQuoteData, setCowSwapQuoteData] = useState({ isLoading: true, error: null, data: null }); // <-- State for CoW quote
    const [sushiSwapQuoteData, setSushiSwapQuoteData] = useState({ isLoading: true, error: null, data: null }); // <-- State for Sushi quote

    // ---> ADD State for final executed amount <---
    const [finalExecutedAmount, setFinalExecutedAmount] = useState(null);

    // Slippage configuration state
    const [slippageTolerance, setSlippageTolerance] = useState(3.0); // Default 3% (better for low liquidity pools)
    const [showSlippageSettings, setShowSlippageSettings] = useState(false);
    const [customSlippage, setCustomSlippage] = useState('');
    const [slippageWarning, setSlippageWarning] = useState('');

    // Approval preference state (for Uniswap SDK on mainnet)
    const [useUnlimitedApproval, setUseUnlimitedApproval] = useState(false);
    const [tradeAnywayAcknowledged, setTradeAnywayAcknowledged] = useState(Boolean(transactionData?.tradeAnywayAcknowledged));
    // Set when the pre-send re-quote differs from the quote on screen
    const [priceMoveNotice, setPriceMoveNotice] = useState(null);
    // Output of the latest re-quote; overrides the trade panel's quote when
    // the quote effect rebuilds the display data
    const refreshedQuoteRef = useRef(null);

    // A high-impact acknowledgment is only valid for the quote it was given on.
    // Re-quotes (slippage change, refresh) can change impact materially — require
    // a fresh acknowledgment whenever the live quote data changes.
    useEffect(() => {
        if (swapRouteData?.data) {
            setTradeAnywayAcknowledged(false);
        }
    }, [swapRouteData?.data]);
    // True when input-token allowances for the spenders this swap will hit
    // are already effectively unlimited, so the approval section is moot.
    const [hideApprovalSection, setHideApprovalSection] = useState(false);

    // ---> Add State for UI-controlled explorer config <---
    const [uiExplorerUrl, setUiExplorerUrl] = useState(DEFAULT_EXPLORER_CONFIG.url);
    const [uiExplorerName, setUiExplorerName] = useState(DEFAULT_EXPLORER_CONFIG.name);
    // ---> Add state for UI visibility <---
    const [showExplorerConfigUi, setShowExplorerConfigUi] = useState(false);

    // Handle slippage changes with validation
    const handleSlippageChange = useCallback((value) => {
        try {
            console.log('handleSlippageChange called with:', value);

            // Always update the custom slippage input value for display
            setCustomSlippage(value);

            const numValue = parseFloat(value);
            console.log('Parsed numValue:', numValue);

            // Handle empty input or invalid values
            if (value === '' || isNaN(numValue)) {
                if (value === '') {
                    setSlippageWarning('');
                    console.log('Empty input, keeping current slippageTolerance');
                    // Don't update slippageTolerance on empty input, keep current value
                    return;
                } else {
                    setSlippageWarning('Enter a valid number');
                    console.log('Invalid slippage value (not a number):', value);
                    return;
                }
            }

            // Handle negative values - clamp to 0 instead of rejecting
            if (numValue < 0) {
                console.log('Negative slippage value, clamping to 0:', numValue);
                setSlippageTolerance(0);
                setSlippageWarning('Slippage set to 0% - transactions may fail due to price movement');
                return;
            }

            // Handle extremely high values - clamp to maximum reasonable value
            if (numValue > 50) {
                console.log('Very high slippage value, clamping to 50%:', numValue);
                setSlippageTolerance(50);
                setSlippageWarning('Slippage clamped to 50% maximum');
                return;
            }

            // Update the actual slippage tolerance
            setSlippageTolerance(numValue);
            console.log('Updated slippageTolerance to:', numValue);

            // Set warnings based on the value
            if (numValue < 0.1) {
                setSlippageWarning('Very low slippage may cause transaction to fail');
            } else if (numValue > 5) {
                setSlippageWarning('High slippage - Risk of MEV/front-running attacks');
            } else if (numValue > 1) {
                setSlippageWarning('Moderate slippage - potential for MEV');
            } else {
                setSlippageWarning('');
            }
        } catch (error) {
            console.error('Error in handleSlippageChange:', error);
            setSlippageWarning('Error updating slippage');
        }
    }, []);

    // Helper function to get safe slippage value for calculations
    const getSafeSlippageTolerance = useCallback(() => {
        // Ensure slippageTolerance is always a valid number between 0-50
        if (typeof slippageTolerance !== 'number' || isNaN(slippageTolerance) || slippageTolerance < 0) {
            console.warn('Invalid slippageTolerance detected, using default 0.5%:', slippageTolerance);
            return 0.5; // Default to 0.5% if invalid
        }
        if (slippageTolerance > 50) {
            console.warn('Very high slippageTolerance detected, clamping to 50%:', slippageTolerance);
            return 50; // Cap at 50%
        }
        return slippageTolerance;
    }, [slippageTolerance]);

    // The transaction's amountOutMinimum. The dialog's "Min. Receive" is
    // computed by the same function, from the same quote and tolerance.
    const minimumFromQuote = useCallback((quotedAmountOutRaw) => {
        const quotedAmountOut = ethers.BigNumber.from(quotedAmountOutRaw || 0);
        if (quotedAmountOut.isZero()) throw new Error('A non-zero on-chain quote is required for minOut');
        return ethers.BigNumber.from(minReceiveFromQuote(quotedAmountOut.toString(), getSafeSlippageTolerance()).toString());
    }, [getSafeSlippageTolerance]);

    // Replace useMetaMask with wagmi hooks
    const { address: account, isConnected, chain, connector } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const isSafeConnection = useSafeConnection();

    // Effect to update swap method when chain changes
    useEffect(() => {
        if (chain?.id === 1) {
            // Force UniswapSDK on Ethereum mainnet
            setSelectedSwapMethod('uniswapSdk');
        } else if (selectedSwapMethod === 'uniswapSdk' || selectedSwapMethod === 'uniswap') {
            // If switching away from Ethereum and using Uniswap, switch to Algebra
            setSelectedSwapMethod('algebra');
        }
    }, [chain?.id, selectedSwapMethod]);

    // Effect to save the selected swap method to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined' && selectedSwapMethod && chain?.id !== 1) {
            // Only save preference for non-Ethereum chains
            localStorage.setItem('lastSwapMethod', selectedSwapMethod);
        }
    }, [selectedSwapMethod, chain?.id]);

    // Add debugging for connection state
    useEffect(() => {
        console.log('Wallet connection state:', {
            account,
            isConnected,
            hasWalletClient: !!walletClient,
            hasPublicClient: !!publicClient,
            walletClientChain: walletClient?.chain?.id,
            publicClientChain: publicClient?.chain?.id
        });
    }, [account, isConnected, walletClient, publicClient]);

    // Derive signer and provider from wagmi clients
    const signer = useMemo(() => {
        if (!walletClient) {
            console.log('No wallet client available for signer creation');
            return null;
        }

        const ethersSigner = getEthersSigner(walletClient, publicClient);
        const ethersProvider = getEthersProvider(publicClient);

        // Link provider to signer for full ethers compatibility
        if (ethersSigner && ethersProvider && !ethersSigner.provider) {
            ethersSigner.provider = ethersProvider;
        }

        console.log('Signer created:', {
            hasSigner: !!ethersSigner,
            hasProvider: !!ethersProvider,
            signerType: ethersSigner?._isSigner ? 'custom' : 'web3provider'
        });

        return ethersSigner;
    }, [walletClient, publicClient]);

    const provider = useMemo(() => {
        const ethersProvider = getEthersProvider(publicClient);
        console.log('Provider created:', {
            hasProvider: !!ethersProvider,
            providerType: ethersProvider?._isProvider ? 'custom' : 'web3provider'
        });
        return ethersProvider;
    }, [publicClient]);

    // Ref for polling retries and max attempts
    const pollingRetryCountRef = useRef(0);
    const MAX_POLLING_ATTEMPTS = 5;

    // Define backdrop variants for Framer Motion. Fade the backdrop colour in,
    // not the element's opacity: the panel is a child of this element, so an
    // opacity fade-in left it see-through and the price chart showed through
    // it while the modal opened.
    const backdropVariants = {
        hidden: { backgroundColor: 'rgba(0, 0, 0, 0)' },
        visible: { backgroundColor: 'rgba(0, 0, 0, 0.5)', transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.3 } },
    };

    // Helper function to parse revert reason from transaction receipt
    const parseRevertReason = (receipt, error) => {
        try {
            // Check if the error message contains a revert reason
            if (error && error.message) {
                // Look for common revert reason patterns
                const revertPatterns = [
                    /execution reverted: (.*)/,
                    /reverted with reason string '(.*)'/,
                    /revert (.+)/i,
                    /transaction reverted: (.*)/i
                ];

                for (const pattern of revertPatterns) {
                    const match = error.message.match(pattern);
                    if (match && match[1]) {
                        return match[1].trim();
                    }
                }
            }

            // Try to parse from receipt logs if available
            if (receipt && receipt.logs) {
                // Look for Error(string) events in logs
                for (const log of receipt.logs) {
                    try {
                        // Try to decode common error signatures
                        if (log.topics && log.topics[0] === '0x08c379a0') { // Error(string) signature
                            // Decode the error message (simplified approach)
                            const data = log.data;
                            if (data && data.length > 2) {
                                // This is a simplified decoder - in production you'd use ethers.js ABI decoding
                                console.log('Found error log data:', data);
                            }
                        }
                    } catch (parseError) {
                        console.log('Could not parse log:', parseError);
                    }
                }
            }

            // Check for specific error types in the error object
            if (error && error.code) {
                switch (error.code) {
                    case 'UNPREDICTABLE_GAS_LIMIT':
                        return 'Transaction would fail - likely due to slippage or insufficient liquidity';
                    case 'INSUFFICIENT_FUNDS':
                        return 'Insufficient funds for transaction';
                    case 'NONCE_EXPIRED':
                        return 'Transaction nonce expired - please try again';
                    default:
                        break;
                }
            }

            return null; // No specific reason found
        } catch (parseError) {
            console.error('Error parsing revert reason:', parseError);
            return null;
        }
    };

    // Helper function to format transaction-related errors
    const formatTransactionError = (rawError, txId) => {
        // A declined signature is not a failure worth explaining
        if (isUserRejection(rawError)) {
            return TX_CANCELLED_MESSAGE;
        }

        if (txId) {
            return `Transaction Failed. ID: ${txId}. Please check details and try again.`;
        }

        // viem's shortMessage / the first line only: the full message carries
        // request arguments and calldata that would flood the modal
        const message = describeTxError(rawError, '');

        // Check for slippage-related errors first
        const slippageKeywords = [
            "too little received", "insufficient output amount", "slippage",
            "amountOutMinimum", "price impact", "output amount"
        ];
        const fullMessage = `${message} ${rawError?.message || ''}`.toLowerCase();
        const isSlippageError = slippageKeywords.some(keyword =>
            fullMessage.includes(keyword.toLowerCase())
        );

        if (isSlippageError) {
            return `Transaction failed due to slippage. The price moved unfavorably during execution. Try increasing slippage tolerance or try again with a smaller amount.`;
        }

        // Keywords for common wallet/RPC errors that are often verbose
        const genericErrorKeywords = ["MetaMask", "RPC", "User denied", "rejected", "nonce", "gas", "ledger", "trezor"];
        const isKnownGenericError = genericErrorKeywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()));

        if (isKnownGenericError || message.length > 150) {
            return "Transaction failed. Please check your wallet for details and try again.";
        }

        if (message) {
            return `Transaction Error: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}. Please try again.`;
        }

        return "An unexpected transaction error occurred. Please try again.";
    };

    // Effect to auto-clear error messages after a delay
    useEffect(() => {
        let timer;
        if (error) {
            timer = setTimeout(() => {
                setError(null);
            }, 7000); // Clear error after 7 seconds
        }
        return () => clearTimeout(timer); // Cleanup timer if component unmounts or error changes
    }, [error]);

    // Add fallback precision values
    const DEFAULT_PRECISION = {
        display: {
            price: 4,
            amount: 6,
            balance: 8,
            percentage: 2
        }
    };

    // Use the contract config hook - get proposal ID from props or URL
    const { config, loading: configLoading, error: configError } = useContractConfig(proposalIdFromProps);
    // The swap route, quotes and token addresses all come from this market's chain
    const requiredChain = useRequiredChain(config?.chainId);

    // Get currency symbol from config (no hardcoded chain-based logic)
    const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'sDAI';

    // Destructure config values with fallbacks only for missing configs
    const {
        FUTARCHY_ROUTER_ADDRESS = DEFAULT_FUTARCHY_ROUTER_ADDRESS,
        SUSHISWAP_V2_ROUTER = DEFAULT_SUSHISWAP_V2_ROUTER,
        SUSHISWAP_V3_ROUTER = DEFAULT_SUSHISWAP_V3_ROUTER,
        MARKET_ADDRESS, // This should come from the extracted proposal ID
        BASE_TOKENS_CONFIG = DEFAULT_BASE_TOKENS_CONFIG,
        MERGE_CONFIG, // This should come from config
        PRECISION_CONFIG = DEFAULT_PRECISION_CONFIG,
        POOL_CONFIG_YES, // This should come from config
        POOL_CONFIG_NO, // This should come from config
        // ---> Destructure network config with default <---
        network: networkConfig = {}
    } = config || {};

    // Hide the "Max Approval" section when input-token allowances for the
    // spenders this swap will touch are already effectively unlimited.
    // (Must come after `config` and `FUTARCHY_ROUTER_ADDRESS` are in scope —
    // referencing them in the deps array before initialization causes a TDZ
    // error that crashes the entire page during render.)
    useEffect(() => {
        if (!publicClient || !account || !transactionData?.action) return;
        const baseTokenConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
        const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG;
        const futarchyRouter = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
        if (!baseTokenConfig?.currency?.address || !mergeConfig?.currencyPositions || !futarchyRouter) return;

        const isYes = transactionData.outcome === 'Event Will Occur';
        const condCurrency = isYes
            ? mergeConfig.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
            : mergeConfig.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress;
        const condCompany = isYes
            ? mergeConfig.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
            : mergeConfig.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

        // Pairs the swap path will need allowance for, by action.
        // Buy:  base currency → futarchyRouter (split), conditional currency → swap router.
        // Sell: conditional company → swap router, conditional currency → futarchyRouter (merge).
        let pairs = [];
        if (transactionData.action === 'Buy') {
            pairs = [
                { token: baseTokenConfig.currency.address, spender: futarchyRouter },
                { token: condCurrency, spender: SWAPR_V3_ROUTER },
            ];
        } else if (transactionData.action === 'Sell') {
            pairs = [
                { token: condCompany, spender: SWAPR_V3_ROUTER },
                { token: condCurrency, spender: futarchyRouter },
            ];
        } else {
            setHideApprovalSection(false);
            return;
        }
        pairs = pairs.filter(p => p.token && p.spender);
        if (pairs.length === 0) {
            setHideApprovalSection(false);
            return;
        }

        let cancelled = false;
        const ALLOWANCE_ABI = [{
            name: 'allowance', type: 'function', stateMutability: 'view',
            inputs: [{ name: '', type: 'address' }, { name: '', type: 'address' }],
            outputs: [{ type: 'uint256' }],
        }];
        const EFFECTIVELY_UNLIMITED = ethers.BigNumber.from(2).pow(255);

        (async () => {
            try {
                const allowances = await Promise.all(pairs.map(p =>
                    publicClient.readContract({
                        address: p.token,
                        abi: ALLOWANCE_ABI,
                        functionName: 'allowance',
                        args: [account, p.spender],
                    }).catch(() => 0n)
                ));
                const allMax = allowances.every(a => ethers.BigNumber.from(a.toString()).gte(EFFECTIVELY_UNLIMITED));
                if (!cancelled) setHideApprovalSection(allMax);
            } catch {
                if (!cancelled) setHideApprovalSection(false);
            }
        })();
        return () => { cancelled = true; };
    }, [publicClient, account, transactionData?.action, transactionData?.outcome, config, FUTARCHY_ROUTER_ADDRESS]);

    // Create a console log for debugging
    console.log('🔄 ConfirmSwapModal config status:', {
        loading: configLoading,
        error: configError ? configError.message : null,
        configLoaded: !!config,
        futarchyRouter: FUTARCHY_ROUTER_ADDRESS,
        marketAddress: MARKET_ADDRESS
    });

    // Use constants or fallback to defaults
    const precisionConfig = PRECISION_CONFIG || DEFAULT_PRECISION_CONFIG;

    // Add this helper function after the DEFAULT_PRECISION definition
    const isAlmostEqual = (a, b, type = 'balance') => {
        const tolerance = precisionConfig?.rounding?.tolerance?.[type] || 1e-15;
        return Math.abs(a - b) < tolerance;
    };

    // Helper function to safely format numbers with fallback precision
    const formatWithPrecision = (value, type) => {
        if (!value) return '0';

        // For very small numbers, use higher precision
        const num = parseFloat(value);
        if (num > 0 && num < 0.0001) {
            return num.toFixed(precisionConfig?.display?.smallNumbers || 20).replace(/\.?0+$/, '');
        }

        const defaultDisplay = {
            default: 2,
            price: 4,
            amount: 6,
            balance: 8,
            percentage: 2
        };

        const precision = precisionConfig?.display?.[type] || defaultDisplay[type] || defaultDisplay.default;
        return Number(value).toFixed(precision);
    };

    // Add this helper function after the DEFAULT_PRECISION definition
    const safeParseToWei = (value) => {
        console.log('=== safeParseToWei Input ===', {
            value,
            type: typeof value
        });

        if (!value || isNaN(value)) {
            console.log('Invalid input value:', value);
            return ethers.BigNumber.from(0);
        }

        try {
            // Use Decimal.js for precise conversion
            const decimalValue = new Decimal(value);
            console.log('Decimal value:', decimalValue.toString());

            const weiValue = decimalValue.times(new Decimal(10).pow(18));
            console.log('Wei value:', weiValue.toString());

            // Convert to string and remove any decimal part (shouldn't have any, but just in case)
            const weiString = weiValue.toFixed(0);
            console.log('Wei string:', weiString);

            // Convert to BigNumber for compatibility with ethers
            const bigNumber = ethers.BigNumber.from(weiString);
            console.log('Final BigNumber:', bigNumber.toString());

            return bigNumber;
        } catch (error) {
            console.error('=== DEBUG: safeParseToWei Error ===', {
                originalValue: value,
                error: error.message,
            });
            throw new Error(`Invalid amount format: ${value}`);
        }
    };

    // Add this helper function for precise balance comparison
    const comparePreciseBalances = (balance, required) => {
        // Convert to BigNumber for precise comparison
        const balanceBN = ethers.utils.parseUnits(balance.toString(), 18);
        const requiredBN = ethers.utils.parseUnits(required.toString(), 18);

        console.log('Precise balance comparison:', {
            balanceWei: balanceBN.toString(),
            requiredWei: requiredBN.toString(),
            difference: balanceBN.sub(requiredBN).toString()
        });

        // If difference is less than 1000 wei (extremely small in ETH terms)
        const difference = balanceBN.sub(requiredBN).abs();
        const negligibleDifference = ethers.utils.parseUnits('0.000000001', 18); // 1 gwei

        return {
            hasEnough: balanceBN.gte(requiredBN) || difference.lte(negligibleDifference),
            difference: ethers.utils.formatUnits(difference, 18)
        };
    };

    // Internal helper functions
    const handleTokenApproval = async (tokenAddress, spenderAddress, amount, tokenName = '') => {
        try {
            console.log(`Approving ${tokenName} token...`);

            // Validate signer before proceeding
            if (!signer) {
                throw new Error('Signer not available. Please ensure wallet is connected.');
            }

            // Validate that we have a connected account
            if (!account) {
                throw new Error('Account not connected. Please connect your wallet.');
            }

            // Check if we have a full ethers signer or need to use viem approach
            const isEthersSigner = signer && signer.getAddress && typeof signer.getAddress === 'function' && !signer._isSigner;

            console.log('Signer detection in handleTokenApproval:', {
                hasSigner: !!signer,
                hasGetAddress: signer && typeof signer.getAddress === 'function',
                isCustomSigner: signer && signer._isSigner,
                signerType: isEthersSigner ? 'ethers' : 'viem',
                signerKeys: signer ? Object.keys(signer) : []
            });

            if (!isEthersSigner) {
                // Use viem approach for WalletConnect
                console.log('Using viem-based approach for token approval');

                // First, check allowance using the public client
                const allowanceResult = await publicClient.readContract({
                    address: tokenAddress,
                    abi: ERC20_ABI_VIEM,
                    functionName: 'allowance',
                    args: [account, spenderAddress]
                });

                const allowance = ethers.BigNumber.from(allowanceResult.toString());
                console.log(`Current allowance: ${allowance.toString()}`);

                if (allowance.lt(amount)) {
                    console.log('Allowance insufficient, requesting approval...');

                    // Use unlimited or exact amount based on user preference
                    const approvalAmount = approvalAmountFor(amount, useUnlimitedApproval).toString();
                    console.log(`Approval amount: ${useUnlimitedApproval ? 'MaxUint256 (unlimited)' : 'exact amount'}`);

                    // Send approval transaction using viem
                    const hash = await walletClient.writeContract({
                        address: tokenAddress,
                        abi: ERC20_ABI_VIEM,
                        functionName: 'approve',
                        args: [spenderAddress, approvalAmount]
                    });

                    console.log('Approval transaction sent:', hash);

                    // Wait for confirmation
                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            throw new Error(SAFE_TRANSACTION_SENT);
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: hash,
                                publicClient
                            });
                        }
                    } else {
                        receipt = await publicClient.waitForTransactionReceipt({ hash });
                    }
                    assertReceiptSucceeded(receipt, hash);
                    console.log('Approval confirmed:', receipt);
                } else {
                    console.log(`Token already approved (allowance: ${allowance.toString()})`);
                }
            } else {
                // Use standard ethers approach for browser extension
                console.log('Using ethers approach for token approval');

                const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

                // Get current allowance with better error handling
                let allowance;
                try {
                    allowance = await tokenContract.allowance(account, spenderAddress);
                } catch (error) {
                    console.error('Failed to check allowance:', error);
                    throw new Error(`Failed to check token allowance: ${error.message}`);
                }

                if (allowance.lt(amount)) {
                    console.log(`Current allowance insufficient (${allowance.toString()}), requesting approval...`);

                    // Use unlimited or exact amount based on user preference
                    const approvalAmount = approvalAmountFor(amount, useUnlimitedApproval);
                    console.log(`Approval amount: ${useUnlimitedApproval ? 'MaxUint256 (unlimited)' : 'exact amount'}`);

                    try {
                        const tx = await tokenContract.approve(spenderAddress, approvalAmount);
                        console.log('Approval transaction sent:', tx.hash);

                        let receipt;
                        // Check for Safe wallet
                        if (isSafeConnection(walletClient)) {
                            if (!useBlockExplorer) {
                                console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                                throw new Error(SAFE_TRANSACTION_SENT);
                            } else {
                                console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                                const chainId = await walletClient.getChainId();
                                receipt = await waitForSafeTxReceipt({
                                    chainId,
                                    safeTxHash: tx.hash,
                                    publicClient
                                });
                            }
                        } else {
                            // Wait for confirmation with timeout
                            receipt = await Promise.race([
                                tx.wait(),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Transaction timeout')), 60000)
                                )
                            ]);
                        }

                        assertReceiptSucceeded(receipt, tx.hash);
                        console.log('Approval confirmed:', receipt);
                    } catch (error) {
                        // Pass the Safe "queued" signal through untouched
                        if (isSafeTransactionSent(error)) throw error;
                        console.error('Approval transaction failed:', error);
                        throw new Error(`Token approval failed: ${error.message}`);
                    }
                } else {
                    console.log(`Token already approved (allowance: ${allowance.toString()})`);
                }
            }
        } catch (error) {
            console.error('Token approval failed:', error);
            throw error;
        }
    };

    const markSubstepCompleted = (step, substepId) => {
        setCompletedSubsteps(prev => {
            // Make sure the step and substeps objects exist
            const ensuredPrev = {
                ...prev,
                [step]: prev[step] || { completed: false, substeps: {} }
            };

            // Now we can safely update
            const newState = {
                ...ensuredPrev,
                [step]: {
                    ...ensuredPrev[step],
                    substeps: {
                        ...ensuredPrev[step].substeps,
                        [substepId]: true
                    }
                }
            };
            return newState;
        });
    };

    const handleCollateralAction = async (tokenType, amount) => {
        try {
            setIsProcessing(true);
            setCurrentSubstep({ step: 1, substep: 1 });
            setProcessingStep(1);

            if (!signer || !account) {
                console.error('No signer or account available');
                setError('Wallet connection error');
                return false;
            }

            const baseToken = tokenType === 'currency'
                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency
                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company;

            // --- SDK INTEGRATION START ---
            if (useSDK) {
                console.log('[ConfirmSwapModal] Using SDK for Collateral Operation');

                // Strictly match CollateralModal variable resolution
                const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
                // CollateralModal uses config?.MARKET_ADDRESS || MARKET_ADDRESS
                const marketAddress = config?.MARKET_ADDRESS || MARKET_ADDRESS;

                // Initialize Cartridge
                const cartridge = new FutarchyCartridge(routerAddress);

                // --- SDK SPLIT (ADD) ---
                // We only support 'add' (split) here as this is ConfirmSwapModal (Buy/Sell)

                // Strictly match CollateralModal baseToken resolution
                const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;
                const baseToken = tokenType === 'currency' ? baseTokensConfig.currency : baseTokensConfig.company;

                console.log('[ConfirmSwapModal] SDK Split Params:', {
                    proposal: marketAddress,
                    collateralToken: baseToken.address,
                    amount: amount.toString(),
                    exactApproval: !useUnlimitedApproval
                });

                // Execute completeSplit
                const iterator = cartridge.completeSplit({
                    proposal: marketAddress,
                    collateralToken: baseToken.address,
                    amount: amount.toString(), // Match CollateralModal exactly (relies on SDK parseEther)
                    exactApproval: !useUnlimitedApproval,
                    useBlockExplorer
                }, { publicClient, walletClient, account });

                for await (const status of iterator) {
                    console.log('[ConfirmSwapModal] SDK Status:', status);
                    // The SDK reports failures (e.g. a reverted receipt) as an error status
                    if (status.status === 'error') {
                        throw new Error(status.message || status.error);
                    }

                    // Map SDK steps to UI steps
                    if (status.step.includes('approv')) {
                        // Ensure we are on the approval substep
                        if (currentSubstep.substep !== 1) {
                            setCurrentSubstep({ step: 1, substep: 1 });
                        }

                        if (status.step === 'approved' || status.step === 'already_approved') {
                            markSubstepCompleted(1, 1);
                            // Move to next substep visually
                            setCurrentSubstep({ step: 1, substep: 2 });
                        }
                    } else if (status.step.includes('split')) {
                        // Ensure we are on the mint substep
                        if (currentSubstep.substep !== 2) {
                            setCurrentSubstep({ step: 1, substep: 2 });
                        }

                        // Fix: Check for 'split_complete' specifically
                        if (status.step === 'split_complete' || status.status === 'success') {
                            markSubstepCompleted(1, 2);
                        }
                    } else if (status.step === 'complete') {
                        // All done
                        setCompletedSubsteps(prev => ({
                            ...prev,
                            1: { ...prev[1], completed: true }
                        }));

                        // Advance to next step (Swap)
                        setCurrentSubstep({ step: 2, substep: 1 });
                        setProcessingStep(2);
                        setExpandedSteps(prev => ({ ...prev, 1: false, 2: true }));
                    }
                }

                console.log('[ConfirmSwapModal] SDK Collateral Operation Completed Successfully');
                return true;
            }
            // --- SDK INTEGRATION END ---

            // Convert to decimal string first
            const amountInWei = amount.toString().includes('e')
                ? ethers.utils.parseUnits(new Decimal(amount).toString(), baseToken.decimals)
                : ethers.utils.parseUnits(amount.toString(), baseToken.decimals);

            // Check if we're using a standard ethers signer or viem approach
            const isEthersSigner = signer && signer.getAddress && typeof signer.getAddress === 'function' && !signer._isSigner;

            console.log('Signer detection in handleCollateralAction:', {
                hasSigner: !!signer,
                hasGetAddress: signer && typeof signer.getAddress === 'function',
                isCustomSigner: signer && signer._isSigner,
                signerType: isEthersSigner ? 'ethers' : 'viem',
                signerKeys: signer ? Object.keys(signer) : []
            });

            let userBalance;

            if (isEthersSigner) {
                // Standard ethers approach
                const baseTokenContract = new ethers.Contract(baseToken.address, ERC20_ABI, signer);
                userBalance = await baseTokenContract.balanceOf(account);
            } else {
                // Viem approach using publicClient
                const balanceData = await publicClient.readContract({
                    address: baseToken.address,
                    abi: ERC20_ABI_VIEM,
                    functionName: 'balanceOf',
                    args: [account]
                });
                userBalance = ethers.BigNumber.from(balanceData.toString());
            }

            // 1. Check balance
            if (userBalance.lt(amountInWei)) {
                const formattedBalance = ethers.utils.formatUnits(userBalance, baseToken.decimals);
                setError(`Insufficient ${baseToken.symbol} balance. You have ${formattedBalance} ${baseToken.symbol}`);
                return false;
            }

            // 2. Check and approve if needed
            await handleTokenApproval(
                baseToken.address,
                FUTARCHY_ROUTER_ADDRESS,
                amountInWei,
                baseToken.symbol
            );

            // Mark first substep completed
            markSubstepCompleted(1, 1);
            // Move to the second substep
            setCurrentSubstep({ step: 1, substep: 2 });

            // 3. Execute split position
            const marketAddress = transactionData?.marketAddress || MARKET_ADDRESS;

            if (isEthersSigner) {
                // Standard ethers approach
                const routerContract = new ethers.Contract(
                    FUTARCHY_ROUTER_ADDRESS,
                    FUTARCHY_ROUTER_ABI,
                    signer
                );

                const tx = await routerContract.splitPosition(
                    marketAddress,
                    baseToken.address,
                    amountInWei,
                    { gasLimit: 2000000 }
                );
                // Check for Safe wallet
                if (isSafeConnection(walletClient)) {
                    if (!useBlockExplorer) {
                        console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                        throw new Error(SAFE_TRANSACTION_SENT);
                    } else {
                        console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                        const chainId = await walletClient.getChainId();
                        await waitForSafeTxReceipt({
                            chainId,
                            safeTxHash: tx.hash,
                            publicClient
                        });
                    }
                } else {
                    await tx.wait();
                }
            } else {
                // Viem approach using walletClient
                console.log(`Executing splitPosition with viem for market: ${marketAddress}`);

                const { request } = await publicClient.simulateContract({
                    address: FUTARCHY_ROUTER_ADDRESS,
                    abi: FUTARCHY_ROUTER_ABI,
                    functionName: 'splitPosition',
                    args: [marketAddress, baseToken.address, amountInWei],
                    account,
                    gas: 2000000n
                });

                const hash = await walletClient.writeContract(request);
                console.log(`Split position transaction sent: ${hash}`);

                // Wait for transaction confirmation with better error handling
                try {
                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            throw new Error(SAFE_TRANSACTION_SENT);
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: hash,
                                publicClient
                            });
                        }
                    } else {
                        receipt = await publicClient.waitForTransactionReceipt({
                            hash,
                            timeout: 60000,
                            confirmations: 1
                        });
                    }

                    if (receipt.status === 'success') {
                        console.log(`Split position transaction confirmed: ${receipt.transactionHash}`);
                    } else {
                        throw new Error(`Transaction failed with status: ${receipt.status}`);
                    }
                } catch (confirmError) {
                    // Pass the Safe "queued" signal through untouched
                    if (isSafeTransactionSent(confirmError)) throw confirmError;
                    console.error('Error confirming split position transaction:', confirmError);
                    throw new Error(`Transaction confirmation failed: ${confirmError.message}`);
                }
            }

            // Mark second substep completed
            markSubstepCompleted(1, 2);

            // Set completed
            setCompletedSubsteps(prev => ({
                ...prev,
                1: { ...prev[1], completed: true }
            }));

            // Advance to next step
            setCurrentSubstep({ step: 2, substep: 1 });
            setProcessingStep(2); // Move processing to step 2
            setExpandedSteps(prev => ({ ...prev, 1: false, 2: true })); // Expand step 2
            return true;
        } catch (error) {
            // Handle Safe transaction signal
            if (isSafeTransactionSent(error)) {
                console.log('[ConfirmSwapModal] Safe transaction sent in collateral action - closing modal');
                onSafeTransaction?.();
                onClose();
                return false; // Stop execution
            }

            console.error('Error in handleCollateralAction:', error);
            setError(formatTransactionError(error)); // Use new error formatter
            return false;
        } finally {
            // Do not set isProcessing to false here; handleConfirmSwap manages overall state.
            // setIsProcessing(false);
        }
    };

    // Add debug logging function
    const logDebug = (data) => {
        if (debugMode) {
            setDebugData(data);
            console.log('Debug Data:', data);
        }
    };

    // A fresh on-chain quote for the confirmed amount: the Futarchy quote
    // helper for Algebra (Gnosis) and QuoterV2 for the Uniswap SDK (Ethereum).
    // Returns null when there is no fresh-quote source for this swap.
    const fetchFreshQuote = async (amountInWei, amount) => {
        if (transactionData.action !== 'Buy' && transactionData.action !== 'Sell') return null;
        const isYes = transactionData.outcome === 'Event Will Occur';
        const isBuy = transactionData.action === 'Buy';

        if (selectedSwapMethod === 'algebra') {
            if (!proposalIdFromProps) return null;
            const { getSwapQuote } = await import('../../../utils/FutarchyQuoteHelper');
            const quote = await getSwapQuote({
                proposal: proposalIdFromProps,
                amount: ethers.utils.formatEther(amountInWei),
                isYesPool: isYes,
                isInputCompanyToken: !isBuy,
                slippagePercentage: getSafeSlippageTolerance() / 100
            }, await getBestRpcProvider(100));
            return quote ? { amountOutRaw: quote.raw.amountOut, partialFill: Boolean(quote.partialFill) } : null;
        }

        if (selectedSwapMethod === 'uniswapSdk') {
            const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG || DEFAULT_MERGE_CONFIG;
            const currency = isYes ? mergeConfig.currencyPositions.yes : mergeConfig.currencyPositions.no;
            const company = isYes ? mergeConfig.companyPositions.yes : mergeConfig.companyPositions.no;
            const quote = await getUniswapV3QuoteWithPriceImpact({
                tokenIn: (isBuy ? currency : company).wrap.wrappedCollateralTokenAddress,
                tokenOut: (isBuy ? company : currency).wrap.wrappedCollateralTokenAddress,
                amountIn: amount,
                fee: 500,
                provider: await getBestRpcProvider(1),
                chainId: 1
            });
            return { amountOutRaw: quote.amountOut, partialFill: false };
        }

        return null;
    };

    // Shows a re-quoted output in place of the one on screen.
    const applyRefreshedQuote = (amountOutRaw) => {
        refreshedQuoteRef.current = { buyAmount: amountOutRaw.toString() };
        const update = (prev) => (prev?.data
            ? { ...prev, data: { ...prev.data, buyAmount: amountOutRaw.toString() } }
            : prev);
        setSwapRouteData(update);
        if (selectedSwapMethod === 'algebra') setSushiSwapQuoteData(update);
    };

    // Re-quotes right before sending. The transaction's minimum output stays
    // the Min. Receive the user confirmed; if the fresh quote is below it the
    // swap would revert, so the dialog shows the new quote and stops.
    // Returns false when the swap must not be sent.
    const requoteBeforeSend = async (amountInWei, amount) => {
        const confirmedAmountOutRaw = swapRouteData.data?.buyAmount;
        if (!confirmedAmountOutRaw) return true;

        let fresh;
        try {
            fresh = await fetchFreshQuote(amountInWei, amount);
        } catch (quoteError) {
            const { kind, message } = describeQuoteError(quoteError);
            if (kind === 'network') {
                // The confirmed Min. Receive still protects the swap
                console.warn('[ConfirmSwapModal] Could not refresh the quote, sending with the confirmed minimum:', quoteError);
                return true;
            }
            setError(message);
            return false;
        }
        if (!fresh) return true;

        if (fresh.partialFill) {
            setError('The pool can no longer fill this amount. Reduce the amount and try again.');
            return false;
        }

        const tolerance = getSafeSlippageTolerance();
        const { movedPct, exceedsTolerance } = compareQuotes({
            confirmedAmountOutRaw,
            freshAmountOutRaw: fresh.amountOutRaw,
            slippagePct: tolerance
        });

        if (exceedsTolerance) {
            applyRefreshedQuote(fresh.amountOutRaw);
            setPriceMoveNotice(`The price moved ${movedPct.toFixed(2)}% since the quote, beyond your ${tolerance}% slippage tolerance. The quote has been updated: review Min. Receive and confirm again.`);
            return false;
        }
        if (Math.abs(movedPct) >= 0.01) {
            setPriceMoveNotice(`The quote changed by ${movedPct > 0 ? '-' : '+'}${Math.abs(movedPct).toFixed(2)}% since it was shown, within your ${tolerance}% tolerance. Min. Receive is unchanged.`);
        }
        return true;
    };

    // Refactor handleConfirmSwap
    const handleConfirmSwap = async () => {
        // --- Basic Setup and Validation ---
        if (isProcessing) return;
        if (quoteUnavailableForExecution) {
            setError('A current on-chain pool quote is required before this swap can be submitted.');
            return;
        }
        if (priceImpactTooHigh && !tradeAnywayAcknowledged) {
            setError('Price impact too high — pool depth insufficient for this size');
            return;
        }
        if (!isConnected || !account || !walletClient) {
            alert('Please connect your wallet first!');
            return;
        }
        if (requiredChain.isChainUnknown) {
            setError('Market details are still loading. Try again in a moment.');
            return;
        }
        if (requiredChain.isWrongChain) {
            setError(`This market is on ${requiredChain.requiredChainName}. Switch your wallet to it to continue.`);
            return;
        }

        console.log('[DEBUG] handleConfirmSwap started with:', {
            selectedSwapMethod,
            isConnected,
            account,
            walletClient: !!walletClient,
            publicClient: !!publicClient,
            transactionType: transactionData.action,
            eventHappens: transactionData.outcome === 'Event Will Occur'
        });

        setError(null);
        setPriceMoveNotice(null);
        setIsProcessing(true);
        setOrderStatus('submitted');
        setTransactionResultHash(null);
        setProcessingStep('processing');
        setCurrentSubstep({ step: 1, substep: 1 });
        setCompletedSubsteps({
            1: { completed: false, substeps: {} },
            2: { completed: false, substeps: {} }
        });

        try {
            // Create signer
            console.log('[DEBUG] Creating signer...');
            const signer = getEthersSigner(walletClient, publicClient);
            if (!signer) {
                throw new Error('Failed to create signer');
            }
            console.log('[DEBUG] Signer created successfully:', {
                signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                hasProvider: !!signer.provider
            });

            // Test signer address retrieval
            try {
                const signerAddress = await signer.getAddress();
                console.log('[DEBUG] Signer address test successful:', signerAddress);
            } catch (addressError) {
                console.error('[DEBUG] Signer address test failed:', addressError);
                throw new Error(`Signer address retrieval failed: ${addressError.message}`);
            }

            // Parse transaction data
            const amount = transactionData.amount.split(' ')[0];
            // Prefer raw wei value if available to avoid precision loss from re-parsing formatted amounts
            // This fixes the 2-wei precision issue that causes STF errors when swapping max balance
            const amountInWei = transactionData.amountInRaw
                ? ethers.BigNumber.from(transactionData.amountInRaw)
                : safeParseToWei(amount);
            if (amountInWei.isZero()) throw new Error("Invalid amount");

            console.log('[DEBUG] Amount precision:', {
                hasRawWei: !!transactionData.amountInRaw,
                rawWei: transactionData.amountInRaw,
                parsedWei: safeParseToWei(amount).toString(),
                usedWei: amountInWei.toString(),
                difference: transactionData.amountInRaw ?
                    ethers.BigNumber.from(transactionData.amountInRaw).sub(safeParseToWei(amount)).toString() : '0'
            });

            console.log('[DEBUG] Transaction data parsed:', {
                amount,
                amountInWei: amountInWei.toString(),
                action: transactionData.action,
                outcome: transactionData.outcome
            });

            // Re-quote before any transaction (including the collateral split)
            if (requiresPoolQuote && !(await requoteBeforeSend(amountInWei, amount))) {
                setIsProcessing(false);
                setOrderStatus(null);
                setProcessingStep(null);
                return;
            }

            // --- Step 1: Collateral (Remains the same, unrelated to swap method) ---
            const needsCollateral = transactionData.action === 'Buy' ||
                (checkSellCollateral && transactionData.action === 'Sell') ?
                parseFloat(additionalCollateralNeeded) > 0 : false;

            if (needsCollateral) {
                console.log('[ConfirmSwapCow Debug - Toggle] Handling Collateral Step');
                const collateralSuccess = await handleCollateralAction(transactionData.action === 'Buy' ? 'currency' : 'company', additionalCollateralNeeded);
                if (!collateralSuccess) {
                    // Error handled within handleCollateralAction, just stop
                    setIsProcessing(false);
                    setOrderStatus(null); // Reset status if collateral failed
                    return;
                }
                // handleCollateralAction now sets processingStep=2, currentSubstep={2,1}
            } else {
                console.log('[ConfirmSwapCow Debug - Toggle] Skipping Collateral Step');
                // Skip collateral step visualization
                markSubstepCompleted(1, 1);
                markSubstepCompleted(1, 2);
                setCompletedSubsteps(prev => ({ ...prev, 1: { ...prev[1], completed: true } }));
                setProcessingStep(2); // Move processing to step 2
                setCurrentSubstep({ step: 2, substep: 1 }); // Set substep for approval
                setExpandedSteps(prev => ({ ...prev, 1: false, 2: true })); // Expand step 2
            }

            // --- Step 2: Approval & Execution (Conditional based on selectedSwapMethod) ---
            console.log(`[ConfirmSwapCow Debug - Toggle] Entering Step 2 for ${selectedSwapMethod}`);
            setCurrentSubstep({ step: 2, substep: 1 }); // Ensure focus is on approval substep

            // --- SDK INTEGRATION START ---
            if (useSDK) {
                console.log('[ConfirmSwapModal] Using SDK for Swap Operation');

                // Determine tokens for swap
                let tokenIn, tokenOut;
                const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG || DEFAULT_MERGE_CONFIG;
                const baseTokenConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
                const isRedemptionOrRecover = transactionData.action === 'Redeem' || transactionData.action === 'Recover';

                if (isRedemptionOrRecover) {
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = baseTokenConfig.currency.address;
                } else if (transactionData.action === 'Buy') {
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
                } else { // Sell
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                }

                let cartridge;
                let generator;

                if (selectedSwapMethod === 'uniswap' || selectedSwapMethod === 'uniswapSdk') {
                    console.log('[ConfirmSwapModal] Initializing UniswapRouterCartridge');
                    cartridge = new UniswapRouterCartridge({
                        chainId: chain?.id || 1,
                        routerAddress: UNISWAP_UNIVERSAL_ROUTER,
                        permit2Address: PERMIT2_ADDRESS
                    });

                    const minAmountOut = minimumFromQuote(
                        swapRouteData.data?.buyAmount || transactionData.amountOutRaw
                    );

                    generator = cartridge.completeSwap({
                        tokenIn,
                        tokenOut,
                        amountIn: amountInWei.toString(), // Pass as string or BigInt depending on SDK expectation. SDK usually handles strings/BigInts.
                        minAmountOut: minAmountOut.toString(),
                        recipient: account,
                        fee: 500, // Default fee
                        exactApproval: !useUnlimitedApproval,
                        useBlockExplorer
                    }, { publicClient, walletClient, account });

                } else if (selectedSwapMethod === 'algebra') {
                    console.log('[ConfirmSwapModal] Initializing SwaprAlgebraCartridge');
                    cartridge = new SwaprAlgebraCartridge();

                    // Prepare args for completeSwap
                    // SwaprAlgebraCartridge.completeSwap expects { tokenIn, tokenOut, amount, slippageBps, deadline }
                    const slippageBps = Math.round(getSafeSlippageTolerance() * 100);

                    generator = cartridge.completeSwap({
                        tokenIn,
                        tokenOut,
                        amount: amountInWei.toString(),
                        slippageBps,
                        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
                        exactApproval: !useUnlimitedApproval,
                        useBlockExplorer
                    }, { publicClient, walletClient, account });
                } else {
                    throw new Error(`SDK not supported for method: ${selectedSwapMethod}`);
                }

                // Execute generator
                for await (const step of generator) {
                    console.log('[ConfirmSwapModal] SDK Step:', step);

                    // Map SDK steps to UI
                    // We have 2 main steps in UI: 1. Collateral (already done), 2. Processing Swap
                    // Substeps for Swap: 1. Approve, 2. Execute

                    if (step.status === 'error') {
                        throw new Error(step.message || step.error);
                    }

                    if (step.step === 'check_approval' || step.step === 'approving' || step.step === 'approve_confirm' || step.step === 'check') {
                        setCurrentSubstep({ step: 2, substep: 1 });
                        // Update text if possible? Current UI has fixed text.
                    } else if (step.step === 'approved' || step.step === 'permit2_approved' || step.step === 'already_approved') {
                        markSubstepCompleted(2, 1);
                        setCurrentSubstep({ step: 2, substep: 2 });
                    } else if (step.step === 'swapping' || step.step === 'swap' || step.step === 'execute') {
                        setCurrentSubstep({ step: 2, substep: 2 });
                    } else if (step.step === 'complete' || step.status === 'success') {
                        markSubstepCompleted(2, 2);
                        setProcessingStep('completed');
                        setOrderStatus('fulfilled');
                        if (step.data && step.data.transactionHash) {
                            setTransactionResultHash(step.data.transactionHash);
                        }
                    }
                }

                console.log('[ConfirmSwapModal] SDK Operation Completed Successfully');
                setIsProcessing(false);
                refreshAll(); // Trigger subgraph chart/trades refresh
                onTransactionComplete?.();
                return; // Exit function, skipping legacy logic
            }
            // --- SDK INTEGRATION END ---

            // Determine tokens for swap (same logic as before)
            let tokenIn, tokenOut;
            const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG || DEFAULT_MERGE_CONFIG;
            const baseTokenConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
            const isRedemptionOrRecover = transactionData.action === 'Redeem' || transactionData.action === 'Recover';

            // --> ADD Definition for eventHappens <--
            const eventHappens = transactionData.outcome === 'Event Will Occur';
            console.log(`[ConfirmSwapCow Debug - Toggle] eventHappens determined as: ${eventHappens}`);

            // Log the config being used
            console.log('[DEBUG] Using token configurations:', {
                mergeConfig,
                baseTokenConfig,
                eventHappens,
                action: transactionData.action
            });

            if (isRedemptionOrRecover) {
                // Always recover/redeem from position token to native token (currency)
                tokenIn = transactionData.outcome === 'Event Will Occur'
                    ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                tokenOut = baseTokenConfig.currency.address;
            } else if (transactionData.action === 'Buy') {
                // Buy: Currency position -> Company position (same outcome)
                tokenIn = transactionData.outcome === 'Event Will Occur'
                    ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                tokenOut = transactionData.outcome === 'Event Will Occur'
                    ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
            } else { // Sell
                // Sell: Company position -> Currency position (same outcome)
                tokenIn = transactionData.outcome === 'Event Will Occur'
                    ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
                tokenOut = transactionData.outcome === 'Event Will Occur'
                    ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
            }

            console.log('[DEBUG] Token swap configuration:', {
                tokenIn,
                tokenOut,
                action: transactionData.action,
                outcome: transactionData.outcome
            });
            // Special handling for Redemption (overrides Buy/Sell logic)
            if (transactionData.action === 'Redeem') {
                console.log(`[ConfirmSwapCow Debug - Toggle] Handling REDEEM action via ${selectedSwapMethod}`);

                // Determine Position Token address (tokenIn for redemption)
                tokenIn = transactionData.outcome === 'Event Will Occur'
                    ? (MERGE_CONFIG || DEFAULT_MERGE_CONFIG).currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                    : (MERGE_CONFIG || DEFAULT_MERGE_CONFIG).currencyPositions.no.wrap.wrappedCollateralTokenAddress;

                let redeemTx;

                if (selectedSwapMethod === 'cowswap') {
                    // --- CoW Swap Redemption Approval ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving Redemption for CoW Swap');
                    console.log('[DEBUG] CoW Redeem - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalCow = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer,
                        tokenAddress: tokenIn,
                        amount: amountInWei,
                        eventHappens, // Keep for V3 helper context if needed
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalCow) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- CoW Swap Redemption Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing Redemption via CoW Swap path (executeRedemptionSwap)');
                    redeemTx = await executeRedemptionSwap({ // Calls helper configured for CoW
                        signer,
                        tokenAddress: tokenIn,
                        amount: amountInWei,
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") } // Gas options
                    });
                    if (!redeemTx || !redeemTx.hash) throw new Error("Failed CoW Swap Redemption submission.");
                    setTransactionResultHash(redeemTx.hash); // Store Order ID
                    setOrderStatus('submitted'); // Trigger polling

                } else if (selectedSwapMethod === 'algebra') {
                    // --- Algebra (Swapr) Redemption Approval ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving Redemption for Algebra (Swapr)');
                    console.log('[DEBUG] Algebra Redeem - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalAlgebraRedeem = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer, tokenAddress: tokenIn, amount: amountInWei, eventHappens,
                        spenderAddressOverride: SWAPR_V3_ROUTER, // Target Algebra (Swapr) Router
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalAlgebraRedeem) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // Get currency token address for tokenOut (the redemption target)
                    const tokenOut = baseTokenConfig.currency.address;

                    // --- Algebra (Swapr) Redemption Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing Redemption via Algebra (Swapr) Router (executeAlgebraExactSingle)');
                    console.log('Redemption tokenIn (position token):', tokenIn);
                    console.log(`Redemption tokenOut (${currencySymbol}):`, tokenOut);

                    redeemTx = await executeAlgebraExactSingle({ // Calls helper configured for Algebra (Swapr)
                        signer,
                        tokenIn, // Position token
                        tokenOut, // Currency token
                        amount: amountInWei,
                        slippageBps: Math.round(getSafeSlippageTolerance() * 100),
                        minOutputAmount: minimumFromQuote(swapRouteData.data?.buyAmount || transactionData.amountOutRaw),
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") }
                    });

                    if (!redeemTx || !redeemTx.hash) throw new Error("Failed to get transaction hash from Algebra (Swapr) execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx submitted: ${redeemTx.hash}`);
                    setTransactionResultHash(redeemTx.hash); // Store Tx Hash

                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            setOrderStatus('fulfilled');
                            setProcessingStep('completed');
                            setIsProcessing(false);
                            onTransactionComplete?.();
                            onClose(); // Auto-close for Safe
                            return;
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: redeemTx.hash,
                                publicClient
                            });
                        }
                    } else {
                        // Wait for V3 confirmation *here*
                        console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Algebra (Swapr) Tx confirmation...');
                        receipt = await redeemTx.wait();
                    }

                    try {
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt, null);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx Confirmed! Hash: ${redeemTx.hash}`);
                        setOrderStatus('fulfilled'); // Mark as fulfilled immediately
                        setProcessingStep('completed'); // Mark process complete
                        setIsProcessing(false); // Unlock UI
                        onTransactionComplete?.(); // Refresh balances; the modal stays open
                        // Do NOT auto-close modal for Algebra (Swapr). User must close manually.
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx failed during confirmation:', waitError);
                        // Enhanced error with receipt details for debugging
                        if (waitError.receipt) {
                            console.error('Transaction receipt details:', waitError.receipt);
                        }
                        throw waitError; // Re-throw to be caught by main catch block
                    }

                } else if (selectedSwapMethod === 'uniswap') {
                    // --- Uniswap V3 Router Approval (with Permit2 on Ethereum) ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving for Uniswap V3');
                    console.log('[DEBUG] Uniswap V3 Redeem - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name,
                        chainId: chain?.id
                    });

                    // Check if we're on Ethereum mainnet (chainId 1) to use Permit2
                    const usePermit2 = chain?.id === 1 || chain?.id === 137;

                } else if (selectedSwapMethod === 'uniswapSdk') {
                    // --- Uniswap SDK Cartridge Flow ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Using Uniswap SDK flow');

                    // Get currency token address for tokenOut
                    const tokenOut = baseTokenConfig.currency.address;

                    // Use the SDK approval flow with step callbacks
                    await checkAndApproveForUniswapSDK(
                        tokenIn,
                        null, // spender not needed, SDK handles Permit2 flow
                        amountInWei,
                        signer,
                        (stepNum, isComplete) => {
                            if (stepNum === 1) {
                                if (!isComplete) {
                                    setCurrentSubstep({ step: 2, substep: 1 });
                                } else {
                                    markSubstepCompleted(2, 1);
                                }
                            } else if (stepNum === 2) {
                                if (!isComplete) {
                                    setCurrentSubstep({ step: 2, substep: 2 });
                                } else {
                                    markSubstepCompleted(2, 2);
                                }
                            }
                        },
                        useUnlimitedApproval,
                        walletClient,
                        publicClient,
                        account,
                        connector
                    );

                    // Mark substep 2 as completed if not already done
                    markSubstepCompleted(2, 2);

                    // Move to swap execution step
                    setCurrentSubstep({ step: 2, substep: 3 });

                    // Execute swap using SDK flow
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing via Uniswap SDK');

                    const quotedAmountOutRaw = swapRouteData.data?.buyAmount || transactionData.amountOutRaw;
                    if (!quotedAmountOutRaw || ethers.BigNumber.from(quotedAmountOutRaw).isZero()) {
                        throw new Error('A non-zero on-chain quote is required for minOut');
                    }

                    redeemTx = await executeSwapForUniswapSDK(
                        tokenIn,
                        tokenOut,
                        amount, // Use the original string amount
                        quotedAmountOutRaw,
                        account,
                        signer,
                        getSafeSlippageTolerance() / 100,
                        walletClient,
                        publicClient,
                        account,
                        transactionData.outputDecimals || 18,
                        connector
                    );

                    if (!redeemTx || !redeemTx.hash) throw new Error("Failed to get transaction hash from Uniswap SDK execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx submitted: ${redeemTx.hash}`);
                    setTransactionResultHash(redeemTx.hash);

                    // Mark swap execution as completed
                    markSubstepCompleted(2, 3);

                    // Check for Safe wallet
                    if (isSafeConnection(walletClient) && !useBlockExplorer) {
                        console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onSafeTransaction?.(); // Trigger toast
                        onTransactionComplete?.();
                        onClose(); // Auto-close for Safe
                        return;
                    }

                    // Wait for transaction confirmation
                    console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Uniswap SDK Tx confirmation...');
                    try {
                        let receipt;
                        // Check if tx has .wait() method (ethers) or just { hash } (viem)
                        if (typeof redeemTx.wait === 'function') {
                            // Ethers tx
                            receipt = await redeemTx.wait();
                        } else {
                            // Viem tx - use publicClient to wait
                            receipt = await publicClient.waitForTransactionReceipt({ hash: redeemTx.hash });
                        }

                        if (receipt.status === 0 || receipt.status === 'reverted') {
                            const revertReason = parseRevertReason(receipt);
                            const errorMessage = revertReason
                                ? `Transaction reverted: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx Confirmed! Hash: ${redeemTx.hash}`);
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onTransactionComplete?.();
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx wait() error:', waitError);

                        // Check if transaction actually succeeded despite wait() error
                        if (redeemTx.hash) {
                            try {
                                const txReceipt = await provider.getTransactionReceipt(redeemTx.hash);
                                if (txReceipt && txReceipt.status === 1) {
                                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx Confirmed despite wait() error! Hash: ${redeemTx.hash}`);
                                    setOrderStatus('fulfilled');
                                    setProcessingStep('completed');
                                    setIsProcessing(false);
                                    onTransactionComplete?.();
                                    return; // Exit successfully
                                }
                            } catch (receiptError) {
                                console.error('[ConfirmSwapCow Debug - Toggle] Failed to fetch receipt:', receiptError);
                            }
                        }

                        throw waitError;
                    }

                } else if (selectedSwapMethod === 'uniswap') {
                    // Continue with original Uniswap V3 flow
                    const needsApprovalUniswap = await checkAndApproveTokenForUniswapV3({
                        signer: signer,
                        walletClient,
                        connector,
                        tokenAddress: tokenIn,
                        amount: amountInWei,
                        usePermit2,
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        onStatusUpdate: (status) => {
                            // Handle loading states for Permit2 two-step flow
                            console.log('[Uniswap V3] Status update:', status);
                            if (status.step === 'check') {
                                console.log('[Uniswap V3] Checking Permit2 approvals...');
                            } else if (status.step === 'erc20') {
                                console.log('[Uniswap V3] Step 1: Approving ERC20 → Permit2...');
                            } else if (status.step === 'erc20_wait') {
                                console.log('[Uniswap V3] Waiting for ERC20 approval tx:', status.data?.transactionHash);
                            } else if (status.step === 'permit2') {
                                console.log('[Uniswap V3] Step 2: Approving Permit2 → Universal Router...');
                            } else if (status.step === 'permit2_wait') {
                                console.log('[Uniswap V3] Waiting for Permit2 approval tx:', status.data?.transactionHash);
                            }
                        },
                        publicClient: publicClient,
                        walletClient: walletClient,
                        useUnlimitedApproval
                    });
                    if (!needsApprovalUniswap) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // Get currency token address for tokenOut
                    const tokenOut = baseTokenConfig.currency.address;
                    const amountOutMinimum = minimumFromQuote(swapRouteData.data?.buyAmount || transactionData.amountOutRaw);

                    // --- Uniswap V3 Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing via Uniswap V3');

                    redeemTx = await executeUniswapV3Swap({
                        signer,
                        tokenIn,
                        tokenOut,
                        fee: 500, // 0.05% fee tier - SDK standard for conditional tokens - most common
                        recipient: account,
                        amountIn: amountInWei,
                        amountOutMinimum,
                        useUniversalRouter: usePermit2, // Use Universal Router on mainnet
                        walletClient: walletClient
                    });

                    if (!redeemTx || !redeemTx.hash) throw new Error("Failed to get transaction hash from Uniswap execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx submitted: ${redeemTx.hash}`);
                    setTransactionResultHash(redeemTx.hash);

                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            setOrderStatus('fulfilled');
                            setProcessingStep('completed');
                            setIsProcessing(false);
                            onSafeTransaction?.(); // Trigger toast
                            onTransactionComplete?.();
                            onClose(); // Auto-close for Safe
                            return;
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: redeemTx.hash,
                                publicClient
                            });
                        }
                    } else {
                        // Wait for Uniswap transaction confirmation
                        console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Uniswap V3 Tx confirmation...');
                        receipt = await redeemTx.wait();
                    }

                    try {
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx Confirmed! Hash: ${redeemTx.hash}`);
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onTransactionComplete?.();
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx failed during confirmation:', waitError);
                        throw waitError;
                    }

                } else { // selectedSwapMethod === 'sushiswap'
                    // --- SushiSwap V3 Router Approval ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving for SushiSwap V3 Router');
                    console.log('[DEBUG] SushiSwap V3 Redeem - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalV3 = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer, tokenAddress: tokenIn, amount: amountInWei, eventHappens,
                        spenderAddressOverride: SUSHISWAP_V3_ROUTER, // Target the V3 Router
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalV3) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- SushiSwap V3 Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing via SushiSwap V3 Router (executeSushiV3RouterSwap)');

                    redeemTx = await executeSushiV3RouterSwap({ // Call the correct V3 function
                        signer,
                        tokenIn,
                        tokenOut,
                        amount: amountInWei,
                        eventHappens,
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") } // Gas options
                    });

                    if (!redeemTx || !redeemTx.hash) throw new Error("Failed to get transaction hash from SushiSwap execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx submitted: ${redeemTx.hash}`);
                    setTransactionResultHash(redeemTx.hash); // Store Tx Hash

                    // Check for Safe wallet
                    if (isSafeConnection(walletClient) && !useBlockExplorer) {
                        console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onSafeTransaction?.(); // Trigger toast
                        onTransactionComplete?.();
                        onClose(); // Auto-close for Safe
                        return;
                    }

                    // Wait for V3 confirmation *here*
                    console.log('[ConfirmSwapCow Debug - Toggle] Waiting for SushiSwap V3 Tx confirmation...');
                    try {
                        const receipt = await redeemTx.wait();
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt, null);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx Confirmed! Hash: ${redeemTx.hash}`);
                        setOrderStatus('fulfilled'); // Mark as fulfilled immediately
                        setProcessingStep('completed'); // Mark process complete
                        setIsProcessing(false); // Unlock UI
                        onTransactionComplete?.(); // Notify parent
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx failed during confirmation:', waitError);
                        // Enhanced error with receipt details for debugging
                        if (waitError.receipt) {
                            console.error('Transaction receipt details:', waitError.receipt);
                        }
                        throw waitError; // Re-throw to be caught by main catch block
                    }
                }
            } else {
                // --- Buy/Sell Path ---
                console.log(`[ConfirmSwapCow Debug - Toggle] Handling ${transactionData.action} via ${selectedSwapMethod}`);
                let swapTx;

                if (selectedSwapMethod === 'cowswap') {
                    // --- CoW Swap Approval ---
                    const eventHappens = transactionData.outcome === 'Event Will Occur';
                    console.log('[DEBUG] CoW Buy/Sell - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalCow = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer,
                        tokenAddress: tokenIn,
                        amount: amountInWei,
                        eventHappens, // Keep for V3 helper context if needed
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalCow) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- CoW Swap Execution ---
                    swapTx = await executeV3Swap({ // executeV3Swap handles CoW swap logic
                        signer,
                        tokenIn,
                        tokenOut,
                        amount: amountInWei,
                        eventHappens,
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") } // Gas options
                    });

                    if (!swapTx || !swapTx.hash) throw new Error("Failed to get Order ID from CoW Swap submission.");
                    console.log(`[ConfirmSwapCow Debug - Toggle] CoW Swap submitted. Order ID: ${swapTx.hash}`);
                    setTransactionResultHash(swapTx.hash);

                    // Check for Safe wallet
                    if (isSafeConnection(walletClient) && !useBlockExplorer) {
                        console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onSafeTransaction?.(); // Trigger toast
                        onTransactionComplete?.();
                        onClose(); // Auto-close for Safe
                        return;
                    }

                    setOrderStatus('submitted'); // Trigger polling

                } else if (selectedSwapMethod === 'algebra') {
                    // --- Algebra (Swapr) Approval ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving for Algebra (Swapr)');
                    console.log('[DEBUG] Algebra Buy/Sell - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalAlgebra = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer, tokenAddress: tokenIn, amount: amountInWei, eventHappens,
                        spenderAddressOverride: SWAPR_V3_ROUTER, // Target Algebra (Swapr) Router
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalAlgebra) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- Algebra (Swapr) Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing via Algebra (Swapr) Router (executeAlgebraExactSingle)');

                    const minOutputAmount = minimumFromQuote(swapRouteData.data?.buyAmount || transactionData.amountOutRaw);

                    swapTx = await executeAlgebraExactSingle({ // Calls helper configured for Algebra (Swapr)
                        signer,
                        tokenIn,
                        tokenOut,
                        amount: amountInWei,
                        slippageBps: Math.round(getSafeSlippageTolerance() * 100),
                        minOutputAmount, // Pass pre-calculated if available
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") } // Gas options
                    });

                    if (!swapTx || !swapTx.hash) throw new Error("Failed to get transaction hash from Algebra (Swapr) execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx submitted: ${swapTx.hash}`);
                    console.log(`[ConfirmSwapCow Debug - Toggle] Transaction object:`, {
                        hash: swapTx.hash,
                        hasWaitMethod: typeof swapTx.wait === 'function',
                        confirmations: swapTx.confirmations,
                        blockNumber: swapTx.blockNumber
                    });
                    setTransactionResultHash(swapTx.hash); // Store Tx Hash

                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            setOrderStatus('fulfilled');
                            setProcessingStep('completed');
                            setIsProcessing(false);
                            onSafeTransaction?.(); // Trigger toast
                            onTransactionComplete?.();
                            onClose(); // Auto-close for Safe
                            return;
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: swapTx.hash,
                                publicClient
                            });
                        }
                    } else {
                        // Wait for V3 confirmation *here*
                        console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Algebra (Swapr) Tx confirmation...');
                        receipt = await swapTx.wait();
                    }

                    try {
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt, null);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx Confirmed! Hash: ${swapTx.hash}`, {
                            status: receipt.status,
                            blockNumber: receipt.blockNumber,
                            confirmations: receipt.confirmations,
                            gasUsed: receipt.gasUsed?.toString()
                        });
                        setOrderStatus('fulfilled'); // Mark as fulfilled immediately
                        setProcessingStep('completed'); // Mark process complete
                        setIsProcessing(false); // Unlock UI
                        onTransactionComplete?.(); // Refresh balances; the modal stays open
                        // Do NOT auto-close modal for Algebra (Swapr). User must close manually.
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Algebra (Swapr) Tx failed during confirmation:', waitError);
                        // Enhanced error with receipt details for debugging
                        if (waitError.receipt) {
                            console.error('Transaction receipt details:', waitError.receipt);
                        }
                        throw waitError; // Re-throw to be caught by main catch block
                    }

                } else if (selectedSwapMethod === 'uniswapSdk') {
                    // --- Uniswap SDK Cartridge Flow ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Using Uniswap SDK flow for Buy/Sell');

                    // Use the SDK approval flow with step callbacks
                    await checkAndApproveForUniswapSDK(
                        tokenIn,
                        null, // spender not needed, SDK handles Permit2 flow
                        amountInWei,
                        signer,
                        (stepNum, isComplete) => {
                            if (stepNum === 1) {
                                if (!isComplete) {
                                    setCurrentSubstep({ step: 2, substep: 1 });
                                } else {
                                    markSubstepCompleted(2, 1);
                                }
                            } else if (stepNum === 2) {
                                if (!isComplete) {
                                    setCurrentSubstep({ step: 2, substep: 2 });
                                } else {
                                    markSubstepCompleted(2, 2);
                                }
                            }
                        },
                        useUnlimitedApproval,
                        walletClient,
                        publicClient,
                        account,
                        connector
                    );

                    // Mark substep 2 as completed if not already done
                    markSubstepCompleted(2, 2);

                    // Move to swap execution step
                    setCurrentSubstep({ step: 2, substep: 3 });

                    // Execute swap using SDK flow
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing Uniswap SDK swap');

                    const quotedAmountOutRaw = swapRouteData.data?.buyAmount || transactionData.amountOutRaw;
                    if (!quotedAmountOutRaw || ethers.BigNumber.from(quotedAmountOutRaw).isZero()) {
                        throw new Error('A non-zero on-chain quote is required for minOut');
                    }

                    swapTx = await executeSwapForUniswapSDK(
                        tokenIn,
                        tokenOut,
                        amount, // Use the original string amount
                        quotedAmountOutRaw,
                        account,
                        signer,
                        getSafeSlippageTolerance() / 100,
                        walletClient,
                        publicClient,
                        account,
                        transactionData.outputDecimals || 18,
                        connector
                    );

                    if (!swapTx || !swapTx.hash) throw new Error("Failed to get transaction hash from Uniswap SDK execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx submitted: ${swapTx.hash}`);
                    setTransactionResultHash(swapTx.hash);

                    // Mark swap execution as completed
                    markSubstepCompleted(2, 3);

                    let receipt;
                    try {
                        // Check for Safe wallet
                        if (isSafeConnection(walletClient)) {
                            if (!useBlockExplorer) {
                                console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                                setOrderStatus('fulfilled');
                                setProcessingStep('completed');
                                setIsProcessing(false);
                                onSafeTransaction?.(); // Trigger toast
                                onTransactionComplete?.();
                                onClose(); // Auto-close for Safe
                                return;
                            } else {
                                console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                                const chainId = await walletClient.getChainId();
                                receipt = await waitForSafeTxReceipt({
                                    chainId,
                                    safeTxHash: swapTx.hash,
                                    publicClient
                                });
                            }
                        } else {
                            // Wait for transaction confirmation
                            console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Uniswap SDK Tx confirmation...');
                            // Check if tx has .wait() method (ethers) or just { hash } (viem)
                            if (typeof swapTx.wait === 'function') {
                                // Ethers tx
                                receipt = await swapTx.wait();
                            } else {
                                // Viem tx - use publicClient to wait
                                receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx.hash });
                            }
                        }

                        if (receipt.status === 0 || receipt.status === 'reverted') {
                            const revertReason = parseRevertReason(receipt);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx Confirmed! Hash: ${swapTx.hash}`);
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onTransactionComplete?.();
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx wait() error:', waitError);

                        // Check if transaction actually succeeded despite wait() error
                        if (swapTx.hash) {
                            try {
                                const txReceipt = await provider.getTransactionReceipt(swapTx.hash);
                                if (txReceipt && txReceipt.status === 1) {
                                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap SDK Tx Confirmed despite wait() error! Hash: ${swapTx.hash}`);
                                    setOrderStatus('fulfilled');
                                    setProcessingStep('completed');
                                    setIsProcessing(false);
                                    onTransactionComplete?.();
                                    return; // Exit successfully
                                }
                            } catch (receiptError) {
                                console.error('[ConfirmSwapCow Debug - Toggle] Failed to fetch receipt:', receiptError);
                            }
                        }

                        throw waitError;
                    }

                } else if (selectedSwapMethod === 'uniswap') {
                    // --- Uniswap V3 Approval (with Permit2 on Ethereum) ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving for Uniswap V3');
                    console.log('[DEBUG] Current chain:', {
                        chainId: chain?.id,
                        chainName: chain?.name,
                        isMainnet: chain?.id === 1
                    });
                    console.log('[DEBUG] Signer info:', {
                        hasSigner: !!signer,
                        signerType: signer?._isSigner ? 'ethers' : 'unknown',
                        hasProvider: !!signer?.provider
                    });

                    // Check if we're on Ethereum mainnet (chainId 1) to use Permit2
                    const usePermit2 = chain?.id === 1 || chain?.id === 137;
                    console.log('[DEBUG] Use Permit2:', usePermit2);

                    const needsApprovalUniswap = await checkAndApproveTokenForUniswapV3({
                        signer: signer,
                        walletClient,
                        connector,
                        tokenAddress: tokenIn,
                        amount: amountInWei,
                        usePermit2,
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        onStatusUpdate: (status) => {
                            // Handle loading states for Permit2 two-step flow
                            console.log('[Uniswap V3] Status update:', status);
                            if (status.step === 'check') {
                                console.log('[Uniswap V3] Checking Permit2 approvals...');
                            } else if (status.step === 'erc20') {
                                console.log('[Uniswap V3] Step 1: Approving ERC20 → Permit2...');
                            } else if (status.step === 'erc20_wait') {
                                console.log('[Uniswap V3] Waiting for ERC20 approval tx:', status.data?.transactionHash);
                            } else if (status.step === 'permit2') {
                                console.log('[Uniswap V3] Step 2: Approving Permit2 → Universal Router...');
                            } else if (status.step === 'permit2_wait') {
                                console.log('[Uniswap V3] Waiting for Permit2 approval tx:', status.data?.transactionHash);
                            }
                        },
                        publicClient: publicClient,
                        useUnlimitedApproval
                    });
                    if (!needsApprovalUniswap) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- Uniswap V3 Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing Uniswap V3 swap');

                    const calculatedMinOutput = minimumFromQuote(swapRouteData.data?.buyAmount || transactionData.amountOutRaw);

                    swapTx = await executeUniswapV3Swap({
                        signer,
                        tokenIn,
                        tokenOut,
                        fee: 500, // 0.05% fee tier - SDK standard for conditional tokens
                        recipient: account,
                        amountIn: amountInWei,
                        amountOutMinimum: calculatedMinOutput,
                        useUniversalRouter: usePermit2
                    });

                    if (!swapTx || !swapTx.hash) throw new Error("Failed to get transaction hash from Uniswap execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx submitted: ${swapTx.hash}`);
                    setTransactionResultHash(swapTx.hash);

                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            setOrderStatus('fulfilled');
                            setProcessingStep('completed');
                            setIsProcessing(false);
                            onSafeTransaction?.(); // Trigger toast
                            onTransactionComplete?.();
                            onClose(); // Auto-close for Safe
                            return;
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: swapTx.hash,
                                publicClient
                            });
                        }
                    } else {
                        // Wait for Uniswap transaction confirmation
                        console.log('[ConfirmSwapCow Debug - Toggle] Waiting for Uniswap V3 Tx confirmation...');
                        receipt = await swapTx.wait();
                    }

                    try {
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx Confirmed! Hash: ${swapTx.hash}`);
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                        onTransactionComplete?.();
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Uniswap V3 Tx failed during confirmation:', waitError);
                        throw waitError;
                    }

                } else { // selectedSwapMethod === 'sushiswap' -> Use V3 Router Direct Path
                    // --- SushiSwap V3 Router Approval ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Approving for SushiSwap V3 Router');
                    console.log('[DEBUG] SushiSwap V3 Redeem - Using signer for approval:', {
                        signerType: signer._isSigner ? 'custom' : 'Web3Provider',
                        connectorName: walletClient?.connector?.name
                    });

                    const needsApprovalV3 = await checkAndApproveTokenForV3Swap({
                        walletClient,
                        connector,
                        signer: signer, tokenAddress: tokenIn, amount: amountInWei, eventHappens,
                        spenderAddressOverride: SUSHISWAP_V3_ROUTER, // Target the V3 Router
                        onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                        onApprovalComplete: () => markSubstepCompleted(2, 1),
                        publicClient: publicClient, // Pass wagmi publicClient for accurate allowance reading
                        useUnlimitedApproval
                    });
                    if (!needsApprovalV3) markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });

                    // --- SushiSwap V3 Execution ---
                    console.log('[ConfirmSwapCow Debug - Toggle] Executing via SushiSwap V3 Router (executeSushiV3RouterSwap)');

                    swapTx = await executeSushiV3RouterSwap({ // Call the correct V3 function
                        signer,
                        tokenIn,
                        tokenOut,
                        amount: amountInWei,
                        eventHappens,
                        options: { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("0.97", "gwei") } // Gas options
                    });

                    if (!swapTx || !swapTx.hash) throw new Error("Failed to get transaction hash from SushiSwap execution.");

                    console.log(`[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx submitted: ${swapTx.hash}`);
                    console.log(`[ConfirmSwapCow Debug - Toggle] Transaction object:`, {
                        hash: swapTx.hash,
                        hasWaitMethod: typeof swapTx.wait === 'function',
                        confirmations: swapTx.confirmations,
                        blockNumber: swapTx.blockNumber
                    });
                    setTransactionResultHash(swapTx.hash); // Store Tx Hash

                    let receipt;
                    // Check for Safe wallet
                    if (isSafeConnection(walletClient)) {
                        if (!useBlockExplorer) {
                            console.log('[ConfirmSwapModal] Safe wallet detected - skipping wait() and auto-closing');
                            setOrderStatus('fulfilled');
                            setProcessingStep('completed');
                            setIsProcessing(false);
                            onTransactionComplete?.();
                            onClose(); // Auto-close for Safe
                            return;
                        } else {
                            console.log('[ConfirmSwapModal] Safe wallet detected - waiting for execution via Safe API');
                            const chainId = await walletClient.getChainId();
                            receipt = await waitForSafeTxReceipt({
                                chainId,
                                safeTxHash: swapTx.hash,
                                publicClient
                            });
                        }
                    } else {
                        // Wait for V3 confirmation *here*
                        console.log('[ConfirmSwapCow Debug - Toggle] Waiting for SushiSwap V3 Tx confirmation...');
                        receipt = await swapTx.wait();
                    }

                    try {
                        if (receipt.status === 0) {
                            const revertReason = parseRevertReason(receipt, null);
                            const errorMessage = revertReason
                                ? `Transaction failed: ${revertReason}`
                                : 'Transaction reverted - likely due to slippage or insufficient output amount';
                            console.error('[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx reverted:', { receipt, revertReason });
                            throw new Error(errorMessage);
                        }
                        console.log(`[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx Confirmed! Hash: ${swapTx.hash}`, {
                            status: receipt.status,
                            blockNumber: receipt.blockNumber,
                            confirmations: receipt.confirmations,
                            gasUsed: receipt.gasUsed?.toString()
                        });
                        setOrderStatus('fulfilled'); // Mark as fulfilled immediately
                        setProcessingStep('completed'); // Mark process complete
                        setIsProcessing(false); // Unlock UI
                        onTransactionComplete?.(); // Notify parent
                    } catch (waitError) {
                        console.error('[ConfirmSwapCow Debug - Toggle] SushiSwap V3 Tx failed during confirmation:', waitError);
                        // Enhanced error with receipt details for debugging
                        if (waitError.receipt) {
                            console.error('Transaction receipt details:', waitError.receipt);
                        }
                        throw waitError; // Re-throw to be caught by main catch block
                    }
                }
            } // End Buy/Sell Path

            // Note: CoW Swap path does not set isProcessing=false or processingStep=completed here.
            // That happens within the polling useEffect when a final status is reached.

        } catch (error) {
            // Handle Safe transaction signal
            if (isSafeTransactionSent(error)) {
                console.log('[ConfirmSwapModal] Safe transaction sent in swap action - closing modal');
                onSafeTransaction?.();
                onClose();
                return;
            }

            console.error(`[ConfirmSwapCow Debug - Toggle] Error in handleConfirmSwap (Method: ${selectedSwapMethod}):`, error);

            // Enhanced error logging for debugging
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                reason: error.reason,
                receipt: error.receipt,
                transaction: error.transaction,
                stack: error.stack
            });

            // Try to extract more detailed error information
            let detailedError = error.message;
            if (error.receipt) {
                const revertReason = parseRevertReason(error.receipt, error);
                if (revertReason) {
                    detailedError = `Transaction failed: ${revertReason}`;
                }
            }

            let errorMessage = formatTransactionError({ ...error, message: detailedError }, transactionResultHash);
            // Mined but reverted (a CALL_EXCEPTION carrying its receipt): with no
            // revert reason, the usual cause is a price move past the tolerance
            if (error?.receipt && detailedError === error.message) {
                errorMessage = `${describeTxError(error)}. ${SWAP_REVERT_HINT}`;
            }
            setError(errorMessage);
            setOrderStatus('failed'); // Set failed status
            setTransactionResultHash(null);
            setIsProcessing(false); // Unlock UI on failure
            setProcessingStep(null); // Reset step visualization
            setCurrentSubstep({ step: 1, substep: 1 });
            setCompletedSubsteps({
                1: { completed: false, substeps: {} },
                2: { completed: false, substeps: {} }
            });
        }
    };

    // Modify useEffect for Polling Order Status - check selectedSwapMethod
    useEffect(() => {
        // Only poll if we have an order ID, CoW was SELECTED, and status is trackable
        if (!transactionResultHash || selectedSwapMethod !== 'cowswap' || ['fulfilled', 'expired', 'cancelled', 'failed'].includes(orderStatus)) {
            // Log why polling isn't starting/continuing
            if (selectedSwapMethod !== 'cowswap') console.log('[ConfirmSwapCow Debug - Polling] Skipping poll: CoW Swap was not the selected method.');
            else if (!transactionResultHash) console.log('[ConfirmSwapCow Debug - Polling] Skipping poll: No Order ID.');
            else console.log(`[ConfirmSwapCow Debug - Polling] Skipping poll: Final status reached (${orderStatus}).`);
            return;
        }

        // If orderStatus is 'submitted', it means we are initiating polling for a new CoW order.
        // Set to 'tracking' and reset retry count for this specific transactionResultHash.
        if (orderStatus === 'submitted') {
            console.log(`[ConfirmSwapCow Debug - Polling] Initializing CoW order tracking for: ${transactionResultHash}. Setting status to tracking.`);
            setOrderStatus('tracking');
            pollingRetryCountRef.current = 0; // Reset retries for a new order being tracked
        } else {
            console.log(`[ConfirmSwapCow Debug - Polling] Continuing CoW order polling for: ${transactionResultHash}. Current status: ${orderStatus}`);
        }

        const POLLING_INTERVAL = 10000; // Poll every 10 seconds
        let intervalId = null;

        const checkStatus = async () => {
            try {
                // Assume chainId 100 (Gnosis) based on previous context
                // TODO: Make chainId dynamic if needed
                const chainId = 100;
                const cowSdk = new CowSdk(chainId); // SDK instance for API call
                console.log(`[ConfirmSwapCow Debug - Polling] Checking status for ${transactionResultHash} (Attempt: ${pollingRetryCountRef.current + 1})...`);
                const orderDetails = await cowSdk.cowApi.getOrder(transactionResultHash);

                // Reset retry count on successful API communication
                pollingRetryCountRef.current = 0;

                console.log(`[ConfirmSwapCow Debug - Polling] Received status: ${orderDetails.status}`, orderDetails);

                // Update state based on fetched status
                setOrderStatus(orderDetails.status);

                // Stop polling if order reached a final state
                if (['fulfilled', 'expired', 'cancelled'].includes(orderDetails.status)) {
                    console.log(`[ConfirmSwapCow Debug - Polling] Order reached final state: ${orderDetails.status}. Stopping polling.`);
                    if (intervalId) clearInterval(intervalId);
                    setIsProcessing(false); // Unlock UI now
                    setProcessingStep('completed'); // Mark overall process complete

                    // ---> If fulfilled, store the executed amount <---
                    if (orderDetails.status === 'fulfilled' && orderDetails.executedBuyAmount) {
                        console.log(`[ConfirmSwapCow Debug - Polling] Order fulfilled! Storing executed amount: ${orderDetails.executedBuyAmount}`);
                        setFinalExecutedAmount(orderDetails.executedBuyAmount);
                    }
                    // --- End store executed amount ---

                    if (orderDetails.status === 'fulfilled') {
                        onTransactionComplete?.(); // Notify parent only on fulfillment
                    }
                }
            } catch (error) {
                console.error(`[ConfirmSwapCow Debug - Polling] Error checking order status for ${transactionResultHash}:`, error);
                pollingRetryCountRef.current += 1;

                if (error.response?.status === 404) {
                    console.warn(`[ConfirmSwapCow Debug - Polling] Order ${transactionResultHash} not found (404). Stopping polling and marking as failed.`);
                    if (intervalId) clearInterval(intervalId);
                    setOrderStatus('failed');
                    setIsProcessing(false);
                    setProcessingStep('completed');
                    pollingRetryCountRef.current = 0; // Reset for next potential distinct order
                } else if (pollingRetryCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    console.warn(`[ConfirmSwapCow Debug - Polling] Max polling attempts (${MAX_POLLING_ATTEMPTS}) reached for ${transactionResultHash}. Stopping polling and marking as failed.`);
                    if (intervalId) clearInterval(intervalId);
                    setOrderStatus('failed');
                    setIsProcessing(false);
                    setProcessingStep('completed');
                    pollingRetryCountRef.current = 0; // Reset for next potential distinct order
                }
                // If not a 404 and not max retries, polling will continue on the next interval
            }
        };

        // Initial check immediately
        checkStatus();
        // Set up interval for subsequent checks
        intervalId = setInterval(checkStatus, POLLING_INTERVAL);

        // Cleanup function to clear interval when component unmounts or dependencies change
        return () => {
            console.log(`[ConfirmSwapCow Debug - Polling] Clearing interval for ${transactionResultHash}`);
            if (intervalId) clearInterval(intervalId);
        };

    }, [transactionResultHash, selectedSwapMethod, orderStatus, onTransactionComplete]); // Add orderStatus and onTransactionComplete

    const toggleStepExpansion = (step) => {
        setExpandedSteps(prev => ({
            ...prev,
            [step]: !prev[step]
        }));
    };

    // Modify fetchRoute in useEffect to fetch BOTH quotes
    useEffect(() => {
        const fetchQuotes = async () => {
            console.log('[ConfirmSwapCow Debug - Toggle] Entering fetchQuotes');

            // ---> Prevent re-fetching if already processing or completed <---
            if (isProcessing || transactionResultHash || finalExecutedAmount) {
                console.log('[ConfirmSwapCow Debug - Toggle] Skipping fetchQuotes: Already processing, submitted, or fulfilled.');
                return;
            }
            // --- End Prevent re-fetching ---

            if (!account || !transactionData.amount || !provider || !config) {
                console.log('[ConfirmSwapCow Debug - Toggle] Exiting fetchQuotes early: Missing dependencies (waiting for initialization).');
                // Don't set error state - just keep loading state while waiting for dependencies
                // This prevents showing "Missing dependencies" error before modal fully initializes
                return;
            }

            // Reset states based on selected method
            console.log('[ConfirmSwapCow Debug - Toggle] Resetting quote states to loading.')

            // Only reset relevant quote data based on selected method
            if (selectedSwapMethod === 'cowswap') {
                setCowSwapQuoteData({ isLoading: true, error: null, data: null });
            } else if (selectedSwapMethod === 'uniswap' || selectedSwapMethod === 'uniswapSdk') {
                // For Uniswap, we'll fetch a quote differently
                setSwapRouteData({ isLoading: true, error: null, data: null });
            } else {
                // For Algebra and SushiSwap
                setSushiSwapQuoteData({ isLoading: true, error: null, data: null });
            }
            // Reset the main display data
            setSwapRouteData({ isLoading: true, error: null, data: null });

            try {
                const amount = transactionData.amount.split(' ')[0];
                // Prefer raw wei value to avoid precision loss (same fix as handleConfirmSwapToggle)
                const amountInWei = transactionData.amountInRaw
                    ? ethers.BigNumber.from(transactionData.amountInRaw)
                    : safeParseToWei(amount);
                if (amountInWei.isZero()) throw new Error("Invalid amount");

                let tokenIn, tokenOut;
                const mergeConfig = MERGE_CONFIG || DEFAULT_MERGE_CONFIG;
                const baseTokenConfig = BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
                const isRedemptionOrRecover = transactionData.action === 'Redeem' || transactionData.action === 'Recover';

                if (isRedemptionOrRecover) {
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = baseTokenConfig.currency.address;
                } else if (transactionData.action === 'Buy') {
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
                } else { // Sell action
                    tokenIn = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
                    tokenOut = transactionData.outcome === 'Event Will Occur'
                        ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
                        : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
                }
                console.log('[ConfirmSwapCow Debug - Toggle] Determined Tokens:', { tokenIn, tokenOut });


                // --- Handle Uniswap Quote Separately ---
                if (selectedSwapMethod === 'uniswap' || selectedSwapMethod === 'uniswapSdk') {
                    // Check if we have pre-calculated data from ShowcaseSwapComponent
                    // Note: 'amountOutRaw' and 'priceAfter' would be available if passed correctly
                    // Uniswap optimization: use 'executionPrice' and 'amountOutRaw' from transactionData if available
                    if (transactionData.amountOutRaw && transactionData.priceAfter && transactionData.executionPrice) {
                        console.log('[QUOTER CONFIRMSWAP] Using pre-calculated Uniswap quote from Showcase', transactionData);

                        const uniswapPrecalc = {
                            buyAmount: transactionData.amountOutRaw, // Use raw amount for precision
                            sellAmount: amountInWei.toString(),
                            swapPrice: transactionData.executionPrice.toString(),
                            estimatedGas: '350000',
                            feeAmount: '0',
                            priceImpact: parseFloat(transactionData.priceImpact || 0),
                            protocol: selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' : 'Uniswap V3',
                            protocolName: selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' : 'Uniswap V3',
                            currentPrice: parseFloat(transactionData.currentPrice || 0),
                            executionPrice: parseFloat(transactionData.executionPrice || 0),
                            poolPriceAfter: parseFloat(transactionData.priceAfter || 0),
                            displayPrice: transactionData.executionPrice,
                            // a pre-send re-quote replaces the panel's output
                            ...(refreshedQuoteRef.current || {})
                        };

                        setSwapRouteData({
                            isLoading: false,
                            error: null,
                            data: uniswapPrecalc
                        });
                        return; // Exit early
                    }

                    console.log('[QUOTER CONFIRMSWAP] Fetching Uniswap quote using QuoterV2');
                    console.log('[QUOTER CONFIRMSWAP] Input data:', {
                        tokenIn,
                        tokenOut,
                        amount,
                        amountInWei: amountInWei.toString()
                    });

                    try {
                        // For Uniswap SDK, use QuoterV2 to get accurate quote with price impact
                        let chainId;
                        try {
                            chainId = await publicClient.getChainId();
                        } catch (e) {
                            // Fallback to checking window.ethereum
                            if (typeof window !== 'undefined' && window.ethereum) {
                                const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                                chainId = parseInt(chainIdHex, 16);
                            } else {
                                chainId = 100; // Default to Gnosis
                            }
                        }
                        console.log('[QUOTER CONFIRMSWAP] Chain ID:', chainId);
                        console.log('[QUOTER CONFIRMSWAP] Network check:', {
                            publicClientChain: publicClient?.chain,
                            windowEthereumChainId: typeof window !== 'undefined' && window.ethereum ? window.ethereum.chainId : 'N/A'
                        });

                        let quoteResult = null;
                        let poolData = null;
                        let ethereumProvider = null;

                        // Retry loop for RPC robustness (3 attempts)
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            try {
                                if (attempt > 1) console.log(`[QUOTER CONFIRMSWAP] Retry attempt ${attempt}/3...`);

                                // Get real quote from QuoterV2 - use best available RPC for any chain
                                ethereumProvider = await getBestRpcProvider(chainId);

                                quoteResult = await getUniswapV3QuoteWithPriceImpact({
                                    tokenIn,
                                    tokenOut,
                                    amountIn: amount,
                                    fee: 500, // 0.05% fee tier for conditional tokens
                                    provider: ethereumProvider,
                                    chainId
                                });

                                console.log('[QUOTER CONFIRMSWAP] Quote result from QuoterV2:', quoteResult);

                                // Get current pool sqrt price for price impact calculation
                                poolData = await getPoolSqrtPrice(
                                    tokenIn,
                                    tokenOut,
                                    quoteResult.feeTier,
                                    ethereumProvider,
                                    chainId
                                );

                                console.log('[QUOTER CONFIRMSWAP] Pool data:', poolData);

                                // If we get here, both calls succeeded
                                break;
                            } catch (retryError) {
                                console.warn(`[QUOTER CONFIRMSWAP] Attempt ${attempt} failed:`, retryError);
                                if (attempt < 3) {
                                    console.log('[QUOTER CONFIRMSWAP] Clearing RPC cache and retrying...');
                                    clearRpcCache();
                                    // Small delay
                                    await new Promise(r => setTimeout(r, 1000));
                                } else {
                                    // Last attempt failed, throw to outer catch
                                    throw retryError;
                                }
                            }
                        }

                        // Calculate price impact from sqrt prices
                        const priceImpact = quoteResult.priceImpactPct;

                        // Calculate raw prices from sqrtPriceX96
                        const rawCurrentPrice = sqrtPriceX96ToPrice(poolData.sqrtPriceX96);
                        const rawPoolPriceAfter = sqrtPriceX96ToPrice(quoteResult.sqrtPriceX96After);

                        // Execution price = average price you got (amountOut / amountIn)
                        const amountOutFormatted = parseFloat(quoteResult.amountOutFormatted);
                        const amountInFormatted = parseFloat(amount);
                        const rawExecutionPrice = amountOutFormatted / amountInFormatted;

                        // GOAL: Always show prices as "currency per company" (e.g., USDS per TSLAon)
                        // Simple approach: We know action (Buy/Sell) and we know token addresses

                        // Determine which tokens are token0 and token1 in the pool (lower address is token0)
                        const token0Address = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn.toLowerCase() : tokenOut.toLowerCase();
                        const token1Address = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenOut.toLowerCase() : tokenIn.toLowerCase();

                        // Pool prices from sqrtPriceX96 are ALWAYS token1/token0
                        // For Buy: input=currency, output=company → rawExecutionPrice = company/currency
                        // For Sell: input=company, output=currency → rawExecutionPrice = currency/company

                        const isBuy = transactionData.action === 'Buy';
                        const isSell = transactionData.action === 'Sell';

                        // Determine if pool price needs inversion
                        // If token0 = currency and token1 = company: pool price = company/currency → INVERT
                        // If token0 = company and token1 = currency: pool price = currency/company → DON'T INVERT
                        let shouldInvertPoolPrices = false;
                        if (isBuy) {
                            // Buy: tokenIn=currency, tokenOut=company
                            // If tokenIn < tokenOut: token0=currency, token1=company → pool=company/currency → INVERT
                            // If tokenOut < tokenIn: token0=company, token1=currency → pool=currency/company → DON'T INVERT
                            shouldInvertPoolPrices = (tokenIn.toLowerCase() < tokenOut.toLowerCase());
                        } else if (isSell) {
                            // Sell: tokenIn=company, tokenOut=currency
                            // If tokenOut < tokenIn: token0=currency, token1=company → pool=company/currency → INVERT
                            // If tokenIn < tokenOut: token0=company, token1=currency → pool=currency/company → DON'T INVERT
                            shouldInvertPoolPrices = (tokenOut.toLowerCase() < tokenIn.toLowerCase());
                        }

                        const currentPrice = shouldInvertPoolPrices ? (1 / rawCurrentPrice) : rawCurrentPrice;
                        const poolPriceAfter = shouldInvertPoolPrices ? (1 / rawPoolPriceAfter) : rawPoolPriceAfter;

                        // Execution price: rawExecutionPrice = output/input
                        // For Buy: output=company, input=currency → rawExecutionPrice = company/currency → INVERT
                        // For Sell: output=currency, input=company → rawExecutionPrice = currency/company → DON'T INVERT
                        const executionPrice = isBuy ? (1 / rawExecutionPrice) : rawExecutionPrice;

                        // Calculate slippage (executionPrice vs currentPrice)
                        const slippage = ((currentPrice - executionPrice) / currentPrice) * 100;

                        console.log('[QUOTER CONFIRMSWAP] Price impact data:', {
                            action: transactionData.action,
                            outcome: transactionData.outcome,
                            tokenIn,
                            tokenOut,
                            token0Address,
                            token1Address,
                            isBuy,
                            isSell,
                            shouldInvertPoolPrices,
                            rawCurrentPrice,
                            currentPrice,
                            rawPoolPriceAfter,
                            poolPriceAfter,
                            rawExecutionPrice,
                            executionPrice,
                            priceImpact: priceImpact?.toFixed(4) + '%',
                            slippage: slippage?.toFixed(4) + '%',
                            amountOut: quoteResult.amountOutFormatted,
                            amountIn: amount,
                            note: 'Simplified logic: Buy → invert exec price, Sell → keep as-is. Prices always shown as currency per company'
                        });

                        const uniswapData = {
                            buyAmount: quoteResult.amountOut, // Real output from QuoterV2
                            sellAmount: amountInWei.toString(),
                            swapPrice: quoteResult.effectivePrice.toString(),
                            estimatedGas: quoteResult.gasEstimate || '350000',
                            feeAmount: '0',
                            priceImpact: priceImpact, // Real price impact from pool (poolPriceAfter - poolPriceBefore)
                            slippage: slippage, // Slippage (currentPrice - executionPrice)
                            protocol: selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' : 'Uniswap V3',
                            protocolName: selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' : 'Uniswap V3',
                            sqrtPriceX96After: quoteResult.sqrtPriceX96After,
                            initializedTicksCrossed: quoteResult.initializedTicksCrossed,
                            currentPrice: currentPrice, // Pool price before trade
                            executionPrice: executionPrice, // Average execution price (amountOut/amountIn)
                            poolPriceAfter: poolPriceAfter, // Pool price after trade
                            poolAddress: poolData.poolAddress,
                            decimalsOut: quoteResult.decimalsOut
                        };

                        console.log('[QUOTER CONFIRMSWAP] Final uniswapData:', uniswapData);

                        setSwapRouteData({
                            isLoading: false,
                            error: null,
                            data: uniswapData
                        });

                        console.log('[QUOTER CONFIRMSWAP] Uniswap quote set with QuoterV2:', uniswapData);
                    } catch (error) {
                        console.error('[ConfirmSwapCow Debug - Toggle] Uniswap QuoterV2 error:', error);
                        setSwapRouteData({
                            isLoading: false,
                            error: error.message || 'On-chain pool quote unavailable',
                            data: null
                        });
                    }
                    return; // Exit early for Uniswap - don't fetch SushiSwap quote
                }

                // --- Fetch CoW Swap Quote --- (Run in parallel conceptually)
                let cowPromise = (async () => {
                    let cowError = null;
                    let cowData = null;
                    try {
                        console.log('[ConfirmSwapCow Debug - Toggle] Attempting CoW Swap Quote (direct fetch)');
                        const chainId = 100; // Or dynamic
                        const quoteUrl = `https://api.cow.fi/xdai/api/v1/quote`;
                        const quoteParams = { // Ensure this matches current needs
                            kind: OrderKind.SELL,
                            sellToken: tokenIn,
                            buyToken: tokenOut,
                            sellAmountBeforeFee: amountInWei.toString(),
                            from: account,
                            receiver: account,
                            appData: JSON.stringify({
                                appCode: 'Futarchy',
                                environment: 'production',
                                metadata: { orderClass: { orderClass: 'market' } }
                            }),
                            partiallyFillable: false,
                            sellTokenBalance: 'erc20',
                            buyTokenBalance: 'erc20',
                            signingScheme: 'eip712',
                            onchainOrder: false,
                            priceQuality: 'verified',
                            validTo: Math.floor(Date.now() / 1000) + 3600
                        };
                        const response = await fetch(quoteUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify(quoteParams)
                        });
                        const responseText = await response.text();
                        if (!response.ok) throw new Error(`HTTP ${response.status} | ${responseText.substring(0, 200)}`);
                        const quoteResponse = JSON.parse(responseText);
                        const { quote } = quoteResponse;
                        if (!quote || !quote.buyAmount || !quote.sellAmount || !quote.feeAmount) throw new Error('Incomplete CoW quote');

                        const buyAmountBN = ethers.BigNumber.from(quote.buyAmount);
                        const sellAmountBeforeFeeBN = amountInWei;
                        let swapPrice = '0';
                        if (!sellAmountBeforeFeeBN.isZero()) {
                            const priceRatio = buyAmountBN.mul(ethers.constants.WeiPerEther).div(sellAmountBeforeFeeBN);
                            swapPrice = ethers.utils.formatUnits(priceRatio, 18);
                        }
                        cowData = {
                            assumedAmountOut: quote.buyAmount,
                            swapPrice: swapPrice,
                            feeAmount: quote.feeAmount,
                            priceImpact: null, gasSpent: null,
                        };
                        console.log('[ConfirmSwapCow Debug - Toggle] CoW Quote Fetch SUCCESS');
                        return { data: cowData, error: null }; // Return result
                    } catch (error) {
                        console.warn('[ConfirmSwapCow Debug - Toggle] CoW Quote Fetch FAILED:', error.message);
                        return { data: null, error: error.message || "Failed to get CoW Swap quote" }; // Return error
                    }
                })(); // Immediately invoke async function

                // --- Fetch SushiSwap V2 Quote --- (Run in parallel conceptually)
                let sushiPromise;
                // --- Algebra Quote Path with Direct Quoter ---
                if (selectedSwapMethod === 'algebra') {
                    console.log('[QUOTER CONFIRMSWAP] Data received:', {
                        priceAfter: transactionData.priceAfter,
                        minRec: transactionData.minimumReceived,
                        amountRaw: transactionData.amountOutRaw,
                        expected: transactionData.expectedReceiveAmount
                    });

                    // Check if we have pre-calculated data from ShowcaseSwapComponent (via FutarchyQuoteHelper)
                    if (transactionData.priceAfter && transactionData.minimumReceived) {
                        console.log('[QUOTER CONFIRMSWAP] Using pre-calculated Algebra quote from Showcase', transactionData);

                        // Construct the data object from transactionData
                        // transactionData.expectedReceiveAmount is FORMATTED (e.g. "1.5")
                        // transactionData.amountOutRaw is WEI (e.g. "1500000000000000000")

                        // We must use raw value for buyAmount because formatUnits expects Wei
                        let buyAmountRaw = transactionData.amountOutRaw;

                        if (!buyAmountRaw && transactionData.expectedReceiveAmount) {
                            // Fallback only if raw is missing (should not happen with new code)
                            // Attempt to parse back if we know decimals (assuming 18 for now)
                            try {
                                buyAmountRaw = ethers.utils.parseUnits(transactionData.expectedReceiveAmount, 18).toString();
                            } catch (e) {
                                console.warn("Could not parse expectedReceiveAmount", e);
                                buyAmountRaw = "0";
                            }
                        }

                        const precalcData = {
                            buyAmount: buyAmountRaw || "0",
                            sellAmount: amountInWei.toString(),
                            swapPrice: transactionData.executionPrice,
                            estimatedGas: '400000', // Default estimate
                            feeAmount: '0',
                            priceImpact: parseFloat(transactionData.priceImpact || 0), // Price impact, already in the quoted output
                            protocol: 'Algebra (Direct Quoter)',
                            protocolName: 'Algebra (Direct Quoter)',
                            currentPrice: parseFloat(transactionData.currentPrice || 0),
                            executionPrice: parseFloat(transactionData.executionPrice || 0),
                            displayPrice: transactionData.executionPrice,
                            poolPriceAfter: parseFloat(transactionData.priceAfter || 0),
                            // a pre-send re-quote replaces the panel's output
                            ...(refreshedQuoteRef.current || {})
                        };

                        sushiPromise = Promise.resolve({ data: precalcData, error: null });
                    } else {
                        // Fallback to fetching if data is missing (e.g. feature flag off or first load)
                        console.log('[QUOTER CONFIRMSWAP] Fetching Algebra quote using direct Quoter');

                        sushiPromise = (async () => {
                            let algebraData = null, algebraError = null;

                            // Retry loop for Algebra quote
                            for (let attempt = 1; attempt <= 3; attempt++) {
                                try {
                                    if (attempt > 1) console.log(`[QUOTER CONFIRMSWAP] Algebra Retry attempt ${attempt}/3...`);

                                    // Determine which pool config to use based on outcome
                                    const eventHappens = transactionData.outcome === 'Event Will Occur';
                                    const poolConfig = eventHappens ?
                                        (config?.POOL_CONFIG_YES || POOL_CONFIG_YES) :
                                        (config?.POOL_CONFIG_NO || POOL_CONFIG_NO);

                                    const poolAddress = poolConfig.address;

                                    if (!poolAddress) {
                                        throw new Error('Pool address not found in config');
                                    }

                                    console.log('[QUOTER CONFIRMSWAP] Algebra Quoter input data:', {
                                        tokenIn,
                                        tokenOut,
                                        amount,
                                        amountInWei: amountInWei.toString(),
                                        poolAddress
                                    });

                                    // Use slippage from state (updated when user changes it)
                                    const slipBps = Math.round(slippageTolerance * 100); // Convert percentage to basis points

                                    // Get RPC URL for Gnosis
                                    const rpcUrl = await getBestRpc(100); // Gnosis Chain

                                    // Build merge config from metadata for proper token classification
                                    const metadataMergeConfig = config?.metadata ? {
                                        companyPositions: {
                                            yes: { wrap: { wrappedCollateralTokenAddress: config.metadata.companyTokens?.yes?.wrappedCollateralTokenAddress } },
                                            no: { wrap: { wrappedCollateralTokenAddress: config.metadata.companyTokens?.no?.wrappedCollateralTokenAddress } }
                                        },
                                        currencyPositions: {
                                            yes: { wrap: { wrappedCollateralTokenAddress: config.metadata.currencyTokens?.yes?.wrappedCollateralTokenAddress } },
                                            no: { wrap: { wrappedCollateralTokenAddress: config.metadata.currencyTokens?.no?.wrappedCollateralTokenAddress } }
                                        }
                                    } : MERGE_CONFIG;

                                    const metadataBaseTokenConfig = config?.metadata ? {
                                        currency: { address: config.metadata.currencyTokens?.base?.wrappedCollateralTokenAddress },
                                        company: { address: config.metadata.companyTokens?.base?.wrappedCollateralTokenAddress }
                                    } : BASE_TOKENS_CONFIG;

                                    // Get quote from direct Algebra Quoter (no more 420+ RPC calls!)
                                    const quoteResult = await getAlgebraQuoteWithSlippage({
                                        tokenIn,
                                        tokenOut,
                                        amountIn: amount,
                                        poolAddress,
                                        provider,
                                        slippageBps: slipBps,
                                        mergeConfig: metadataMergeConfig,
                                        baseTokenConfig: metadataBaseTokenConfig
                                    });

                                    console.log('[QUOTER CONFIRMSWAP] Algebra direct quote result:', quoteResult);

                                    // Format data similar to Uniswap quoter for consistency
                                    algebraData = {
                                        buyAmount: quoteResult.amountOut, // Real output from Algebra Quoter
                                        sellAmount: amountInWei.toString(),
                                        swapPrice: quoteResult.executionPrice,
                                        estimatedGas: quoteResult.gasEstimate || '400000',
                                        feeAmount: '0',
                                        slippage: quoteResult.slippage, // NOTE: This is slippage, NOT price impact
                                        priceImpact: quoteResult.priceImpact, // Same as slippage
                                        protocol: 'Algebra (Direct Quoter)',
                                        protocolName: 'Algebra (Direct Quoter)',
                                        currentPrice: quoteResult.currentPrice,
                                        executionPrice: parseFloat(quoteResult.displayPrice || quoteResult.invertedPrice || quoteResult.executionPrice), // Use displayPrice for correct direction
                                        displayPrice: quoteResult.displayPrice, // Keep displayPrice
                                        invertedPrice: quoteResult.invertedPrice, // Keep invertedPrice
                                        minimumReceived: quoteResult.minimumReceived,
                                        minimumReceivedFormatted: quoteResult.minimumReceivedFormatted,
                                        poolAddress: quoteResult.poolAddress,
                                        liquidity: quoteResult.liquidity,
                                        route: quoteResult.route,
                                        tokenIn: quoteResult.tokenIn, // Token symbols for display
                                        tokenOut: quoteResult.tokenOut,
                                        // Keep minOutAmount for backward compatibility
                                        minOutAmount: quoteResult.minimumReceived
                                    };

                                    console.log('[QUOTER CONFIRMSWAP] Algebra Quoter final data:', algebraData);
                                    algebraError = null; // Clear error if success
                                    break; // Success
                                } catch (e) {
                                    console.error(`[QUOTER CONFIRMSWAP] Algebra Quoter error (Attempt ${attempt}):`, e);
                                    algebraError = e.message || 'Failed to get Algebra quote';

                                    if (attempt < 3) {
                                        console.log('[QUOTER CONFIRMSWAP] Clearing RPC cache and retrying...');
                                        clearRpcCache();
                                        await new Promise(r => setTimeout(r, 1000));
                                    }
                                }
                            }
                            return { data: algebraData, error: algebraError };
                        })();
                    }
                } else {
                    sushiPromise = (async () => {
                        let sushiError = null;
                        let sushiData = null;
                        try {
                            console.log('[ConfirmSwapCow Debug - Toggle] Attempting SushiSwap V2 Quote');
                            const sushiV2RouteData = await fetchSushiSwapRoute({
                                tokenIn,
                                tokenOut,
                                amount: amountInWei,
                                userAddress: account,
                                // Ensure all needed params are passed
                                chainId: 100, // Example: assuming Gnosis
                                sushiswapRouterAddress: SUSHISWAP_V2_ROUTER || DEFAULT_SUSHISWAP_V2_ROUTER,
                            });
                            if (!sushiV2RouteData || !sushiV2RouteData.swapPrice || !sushiV2RouteData.routerAddress) {
                                throw new Error("Incomplete Sushi V2 quote or missing routerAddress from helper");
                            }
                            sushiData = {
                                assumedAmountOut: sushiV2RouteData.assumedAmountOut,
                                swapPrice: sushiV2RouteData.swapPrice,
                                priceImpact: sushiV2RouteData.priceImpact,
                                gasSpent: sushiV2RouteData.gasSpent,
                                feeAmount: null,
                                routeProcessorAddr: sushiV2RouteData.routerAddress
                            };
                            console.log('[ConfirmSwapCow Debug - Toggle] SushiSwap V2 Quote Fetch SUCCESS');
                            return { data: sushiData, error: null };
                        } catch (error) {
                            console.warn('[ConfirmSwapCow Debug - Toggle] SushiSwap V2 Quote Fetch FAILED:', error.message);
                            return { data: null, error: error.message || "Failed to get SushiSwap quote" };
                        }
                    })();
                }

                // Wait for both promises and update state
                const [cowResult, sushiResult] = await Promise.all([cowPromise, sushiPromise]);

                console.log('[ConfirmSwapCow Debug - Toggle] Updating CoW state:', cowResult);
                setCowSwapQuoteData({ isLoading: false, error: cowResult.error, data: cowResult.data });

                console.log('[ConfirmSwapCow Debug - Toggle] Updating Sushi state:', sushiResult);
                setSushiSwapQuoteData({ isLoading: false, error: sushiResult.error, data: sushiResult.data });

            } catch (error) {
                // Catch errors from initial setup (amount parsing, token determination)
                console.error('[ConfirmSwapCow Debug - Toggle] Outer error during quote fetching setup:', error);
                setCowSwapQuoteData({ isLoading: false, error: error.message, data: null });
                setSushiSwapQuoteData({ isLoading: false, error: error.message, data: null });
                setSwapRouteData({ isLoading: false, error: error.message, data: null }); // Update display state too
            }
        };

        fetchQuotes();
    }, [account, transactionData, provider, config, isProcessing, transactionResultHash, finalExecutedAmount, selectedSwapMethod, slippageTolerance]);

    // --> ADD useEffect to update displayed data based on selection <--
    useEffect(() => {
        console.log(`[ConfirmSwapCow Debug - Toggle] Selected method changed to: ${selectedSwapMethod}. Updating display data.`);
        if (selectedSwapMethod === 'cowswap') {
            console.log('[ConfirmSwapCow Debug - Toggle] Setting display data to CoW Quote:', cowSwapQuoteData);
            setSwapRouteData(cowSwapQuoteData);
        } else if (selectedSwapMethod === 'sushiswap') {
            console.log('[ConfirmSwapCow Debug - Toggle] Setting display data to Sushi Quote:', sushiSwapQuoteData);
            setSwapRouteData(sushiSwapQuoteData);
        } else if (selectedSwapMethod === 'algebra') {
            console.log('[ConfirmSwapCow Debug - Toggle] Setting display data to Algebra Quote:', sushiSwapQuoteData);
            setSwapRouteData(sushiSwapQuoteData);
        }
        // Note: This effect handles setting isLoading/error for the main display
    }, [selectedSwapMethod, cowSwapQuoteData, sushiSwapQuoteData]);

    // Add useEffect for auto-expanding current step
    useEffect(() => {
        if (isProcessing && currentSubstep.step) {
            // Automatically expand the current step and collapse others
            const newExpandedState = {};

            // First, set all steps to collapsed
            Object.keys(STEPS_DATA).forEach(step => {
                newExpandedState[step] = false;
            });

            // Then, expand only the current step
            newExpandedState[currentSubstep.step] = true;

            setExpandedSteps(newExpandedState);
        }
    }, [isProcessing, currentSubstep.step]);

    // Debug the currentSubstep state changes
    useEffect(() => {
        console.log('currentSubstep changed:', currentSubstep);
    }, [currentSubstep]);

    // Add isProcessing state logging
    useEffect(() => {
        console.log('isProcessing changed:', isProcessing);
    }, [isProcessing]);

    // Monitor transaction hash and verify its status
    useEffect(() => {
        if (!transactionResultHash || !provider) return;

        // Skip for CoW Swap as it has its own polling mechanism
        if (selectedSwapMethod === 'cowswap') return;

        const checkTransactionStatus = async () => {
            try {
                const receipt = await provider.getTransactionReceipt(transactionResultHash);
                if (receipt && receipt.status === 1) {
                    console.log(`[ConfirmSwapModal] Transaction confirmed via monitoring: ${transactionResultHash}`);
                    // Ensure we show success state
                    if (orderStatus !== 'fulfilled') {
                        setOrderStatus('fulfilled');
                        setProcessingStep('completed');
                        setIsProcessing(false);
                    }
                }
            } catch (error) {
                console.error('[ConfirmSwapModal] Error checking transaction status:', error);
            }
        };

        // Check immediately and then periodically
        checkTransactionStatus();
        const interval = setInterval(checkTransactionStatus, 2000); // Check every 2 seconds

        return () => clearInterval(interval);
    }, [transactionResultHash, provider, selectedSwapMethod, orderStatus]);

    // --> ADDED: Trigger Subgraph Refresh on Success <--
    useEffect(() => {
        if (orderStatus === 'fulfilled' && processingStep === 'completed') {
            console.log('[ConfirmSwapModal] Transaction successful - Triggering Subgraph Refresh');
            refreshAll();
        }
    }, [orderStatus, processingStep, refreshAll]);

    // Include a loading/error state handler at the beginning of the component
    if (configLoading) {
        // Continue with default values instead of showing loading UI
        console.log('Using default configuration while loading...');
    }

    if (configError) {
        console.warn('Using fallback configuration due to API error:', configError);
        // Continue with fallback values instead of showing error UI
        // This ensures the component still works even if the API is down
    }

    // ---> Prepare explorer config based on UI state <---
    // Ethereum markets link to Etherscan unless the dev explorer UI overrode the default
    const explorerConfig = (config?.chainId || chain?.id) === 1 && uiExplorerUrl === DEFAULT_EXPLORER_CONFIG.url
        ? MAINNET_EXPLORER_CONFIG
        : {
            url: uiExplorerUrl,   // Use state directly
            name: uiExplorerName // Use state directly
        };

    // Determine if the transaction is in a final state for the main button behavior
    const isFinalStateForCloseButton =
        (selectedSwapMethod === 'cowswap' && ['fulfilled', 'expired', 'cancelled', 'failed'].includes(orderStatus)) ||
        (selectedSwapMethod === 'sushiswap' && ['fulfilled', 'failed'].includes(orderStatus)) ||
        (selectedSwapMethod === 'algebra' && ['fulfilled', 'failed'].includes(orderStatus)) ||
        (selectedSwapMethod === 'uniswap' && ['fulfilled', 'failed'].includes(orderStatus)) ||
        (selectedSwapMethod === 'uniswapSdk' && ['fulfilled', 'failed'].includes(orderStatus)) ||
        (processingStep === 'completed' && orderStatus === 'fulfilled');

    // Calculate CoW Explorer base URL once
    let cowExplorerBase = 'https://explorer.cow.fi/orders/'; // Default for Ethereum Mainnet
    if (config?.chainId === 100) {
        cowExplorerBase = 'https://explorer.cow.fi/gc/orders/'; // Gnosis Chain
    } else if (config?.chainId === 11155111) {
        cowExplorerBase = 'https://explorer.cow.fi/sepolia/orders/'; // Sepolia
    }

    // Create portal container if it doesn't exist
    useEffect(() => {
        if (typeof document !== 'undefined') {
            let portalRoot = document.getElementById('modal-root');
            if (!portalRoot) {
                portalRoot = document.createElement('div');
                portalRoot.id = 'modal-root';
                document.body.appendChild(portalRoot);
            }
        }
    }, []);

    const activePriceImpact = Math.abs(parseFloat(swapRouteData.data?.priceImpact ?? transactionData?.priceImpact ?? 0));
    const priceImpactTooHigh = Number.isFinite(activePriceImpact) && activePriceImpact > 15;
    const requiresPoolQuote = ['uniswap', 'uniswapSdk', 'algebra'].includes(selectedSwapMethod);
    const quoteUnavailableForExecution = requiresPoolQuote && (
        swapRouteData.isLoading ||
        Boolean(swapRouteData.error) ||
        !swapRouteData.data?.buyAmount ||
        ethers.BigNumber.from(swapRouteData.data?.buyAmount || 0).isZero()
    );

    // "Min. Receive" = the amountOutMinimum the transaction will send
    const outputDecimals = swapRouteData.data?.decimalsOut || transactionData?.outputDecimals || 18;
    const displayedMinReceive = (() => {
        try {
            const quoted = swapRouteData.data?.buyAmount;
            if (!quoted || ethers.BigNumber.from(quoted).isZero()) return null;
            return ethers.utils.formatUnits(minimumFromQuote(quoted), outputDecimals);
        } catch {
            return null;
        }
    })();

    const modalContent = (
        <>
            <motion.div // This is the backdrop
                className="fixed inset-0 bg-black/50 z-[99999] overflow-y-auto"
                onClick={onClose}
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                <div className="flex min-h-full items-center justify-center p-4">
                    <div // This is the modal content panel
                        className="bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl max-w-md w-full relative my-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* All original modal content starts here */}
                        <div className="flex justify-between items-center p-4 border-b border-futarchyGray6 dark:border-futarchyDarkGray6">
                            <h2 className="text-xl font-semibold text-futarchyGray12 dark:text-futarchyGray3">
                                {transactionData.action === 'Redeem'
                                    ? 'Confirm Redeem'
                                    : `Confirm ${transactionData.action}`}
                            </h2>
                            <button
                                onClick={onClose}
                                className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* SWAP METHOD TOGGLE */}
                        <div className="p-4">
                            <label className="block text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112 mb-2">Swap Method:</label>
                            <div className="flex items-center space-x-4">
                                {/* Only show UniswapSDK on Ethereum mainnet (chain 1) */}
                                {chain?.id === 1 ? (
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="swapMethod"
                                            value="uniswapSdk"
                                            checked={true} // Always checked on Ethereum
                                            onChange={() => { }} // No-op, always UniswapSDK on Ethereum
                                            className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                            disabled={true} // Disabled since it's the only option
                                        />
                                        <span className="text-sm text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                            Uniswap V3
                                            <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Ethereum Mainnet)</span>
                                        </span>
                                    </label>
                                ) : (
                                    <>
                                        {/* Algebra (Swapr) Radio - Only on non-Ethereum chains */}
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="swapMethod"
                                                value="algebra"
                                                checked={selectedSwapMethod === 'algebra'}
                                                onChange={() => { setSelectedSwapMethod('algebra'); setShowExplorerConfigUi(false); }}
                                                className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                                disabled={isProcessing || transactionResultHash}
                                            />
                                            <span className={`text-sm ${selectedSwapMethod === 'algebra' ? 'text-futarchyGray12 dark:text-futarchyGray112 font-medium' : 'text-futarchyGray11 dark:text-futarchyGray112'
                                                }`}>
                                                Algebra (Swapr)
                                                <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Direct Algebra Pool)</span>
                                            </span>
                                        </label>
                                        {/* CoW Swap Radio - Only on non-Ethereum chains */}
                                        {!toggleHideCowSwap && (
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="swapMethod"
                                                    value="cowswap"
                                                    checked={selectedSwapMethod === 'cowswap'}
                                                    onChange={() => {
                                                        setSelectedSwapMethod('cowswap');
                                                        setShowExplorerConfigUi(false);
                                                    }}
                                                    className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                                    disabled={isProcessing || transactionResultHash}
                                                />
                                                <span className={`text-sm ${selectedSwapMethod === 'cowswap' ? 'text-futarchyGray12 dark:text-futarchyGray112 font-medium' : 'text-futarchyGray11 dark:text-futarchyGray112'
                                                    }`}>
                                                    CoW Swap
                                                    <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Gasless, MEV Protect)</span>
                                                </span>
                                            </label>
                                        )}
                                    </>
                                )}
                                {/* SushiSwap Radio (hidden - kept for backwards compatibility) */}
                                {false && !hideToggleSushiSwap && (
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="swapMethod"
                                            value="sushiswap"
                                            checked={selectedSwapMethod === 'sushiswap'}
                                            onChange={() => setSelectedSwapMethod('sushiswap')}
                                            className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                            disabled={isProcessing || transactionResultHash}
                                        />
                                        <span className={`flex items-center text-sm ${selectedSwapMethod === 'sushiswap' ? 'text-futarchyGray12 dark:text-futarchyGray112 font-medium' : 'text-futarchyGray11 dark:text-futarchyGray112'
                                            }`}>
                                            SushiSwap
                                            <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Direct V3 Pool)</span>
                                            {selectedSwapMethod === 'sushiswap' && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setShowExplorerConfigUi(!showExplorerConfigUi);
                                                    }}
                                                    className="ml-1 p-0.5 rounded hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray4 disabled:opacity-50"
                                                    title="Configure Explorer Link"
                                                    disabled={isProcessing || transactionResultHash}
                                                >
                                                    <SettingsIcon />
                                                </button>
                                            )}
                                        </span>
                                    </label>
                                )}
                                {/* Uniswap V3 Radio (hidden - replaced by chain-specific logic) */}
                                {false && (
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="swapMethod"
                                            value="uniswap"
                                            checked={selectedSwapMethod === 'uniswap'}
                                            onChange={() => setSelectedSwapMethod('uniswap')}
                                            className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                            disabled={isProcessing || transactionResultHash}
                                        />
                                        <span className={`flex items-center text-sm ${selectedSwapMethod === 'uniswap' ? 'text-futarchyGray12 dark:text-futarchyGray112 font-medium' : 'text-futarchyGray11 dark:text-futarchyGray112'
                                            }`}>
                                            Uniswap V3
                                            <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Ethereum, Permit2)</span>
                                            {selectedSwapMethod === 'uniswap' && (
                                                <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">ETH Mainnet</span>
                                            )}
                                        </span>
                                    </label>
                                )}
                                {/* Uniswap SDK Radio (hidden - integrated into chain-specific logic) */}
                                {false && (
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="swapMethod"
                                            value="uniswapSdk"
                                            checked={selectedSwapMethod === 'uniswapSdk'}
                                            onChange={() => setSelectedSwapMethod('uniswapSdk')}
                                            className="form-radio text-futarchyBlue9 focus:ring-futarchyBlue9 dark:bg-futarchyDarkGray3 dark:border-futarchyDarkGray7 dark:focus:ring-offset-futarchyDarkGray3"
                                            disabled={isProcessing || transactionResultHash}
                                        />
                                        <span className={`flex items-center text-sm ${selectedSwapMethod === 'uniswapSdk' ? 'text-futarchyGray12 dark:text-futarchyGray112 font-medium' : 'text-futarchyGray11 dark:text-futarchyGray112'
                                            }`}>
                                            Uniswap SDK
                                            <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(SDK Cartridge)</span>
                                            {selectedSwapMethod === 'uniswapSdk' && (
                                                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">✓ SDK Flow</span>
                                            )}
                                        </span>
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* Slippage Settings */}
                        <div className="px-4 pb-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112/80">
                                        Slippage Tolerance: {getSafeSlippageTolerance()}%
                                    </span>
                                    {slippageWarning && !showSlippageSettings && (
                                        <span className="text-xs text-futarchyOrange11 dark:text-futarchyOrangeDark11">
                                            {slippageWarning.split(' ').slice(0, 2).join(' ')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                                    className="p-1.5 rounded-lg hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray5 transition-colors"
                                    title="Configure slippage"
                                >
                                    <svg className="w-4 h-4 text-futarchyGray11 dark:text-futarchyGray112" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>
                            </div>

                            {showSlippageSettings && (
                                <div className="mt-3 p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 rounded-lg">
                                    <div className="flex gap-2 mb-2">
                                        {[1.0, 3.0, 5.0].map(value => (
                                            <button
                                                key={value}
                                                onClick={() => {
                                                    setSlippageTolerance(value);
                                                    setCustomSlippage('');
                                                    setSlippageWarning('');
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${slippageTolerance === value && !customSlippage
                                                    ? 'bg-futarchyBlue11 text-white dark:bg-futarchyBlue11 dark:text-white'
                                                    : 'bg-futarchyGray4 dark:bg-futarchyDarkGray4 text-futarchyGray11 dark:text-futarchyGray112 hover:bg-futarchyGray5 dark:hover:bg-futarchyDarkGray6'
                                                    }`}
                                            >
                                                {value}%
                                            </button>
                                        ))}
                                        <div className="flex-1 relative">
                                            <input
                                                type="number"
                                                value={customSlippage}
                                                onChange={(e) => handleSlippageChange(e.target.value)}
                                                placeholder="Custom"
                                                step="0.1"
                                                min="0"
                                                max="50"
                                                className="w-full px-3 py-1.5 pr-8 bg-futarchyGray4 dark:bg-futarchyDarkGray4 text-futarchyGray12 dark:text-futarchyGray3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-futarchyBlue11 dark:focus:ring-futarchyBlue9 border border-transparent dark:border-futarchyDarkGray6"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-futarchyGray11 dark:text-futarchyGray112 text-sm">
                                                %
                                            </span>
                                        </div>
                                    </div>

                                    {slippageWarning && (
                                        <div className={`text-xs mt-2 p-2 rounded-lg ${slippageWarning.includes('High slippage')
                                            ? 'bg-futarchyCrimson3 dark:bg-futarchyCrimsonDark3 text-futarchyCrimson11 dark:text-futarchyCrimsonDark11'
                                            : slippageWarning.includes('Moderate slippage')
                                                ? 'bg-futarchyOrange3 dark:bg-futarchyOrangeDark3 text-futarchyOrange11 dark:text-futarchyOrangeDark11'
                                                : 'bg-futarchyYellow3 dark:bg-futarchyYellowDark3 text-futarchyYellow11 dark:text-futarchyYellowDark11'
                                            }`}>
                                            {slippageWarning}
                                        </div>
                                    )}

                                    <div className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-2">
                                        Your transaction will revert if the price changes unfavorably by more than {getSafeSlippageTolerance()}%
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Transaction Summary */}
                        <div className="bg-futarchyGray4 dark:bg-futarchyDarkGray4 p-4 rounded-lg mb-4 mx-4">
                            {/* ... all the transaction summary divs ... */}
                            <h3 className="font-medium text-futarchyGray12 dark:text-futarchyGray112 mb-2">Transaction Summary</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Outcome</span>
                                    <span className={`font-medium ${transactionData.outcome === 'Event Will Occur'
                                        ? 'text-futarchyGreen11 dark:text-futarchyGreenDark11'
                                        : 'text-futarchyOrange11 dark:text-futarchyOrangeDark11'
                                        }`}>
                                        {transactionData.outcome}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Type</span>
                                    <span className={`font-medium ${transactionData.action === 'Buy'
                                        ? (transactionData.outcome === 'Event Will Occur'
                                            ? 'text-futarchyBlue11 dark:text-futarchyBlueDark11'
                                            : 'text-futarchyOrange11 dark:text-futarchyOrangeDark11')
                                        : transactionData.action === 'Redeem'
                                            ? 'text-futarchyGreen11 dark:text-futarchyGreenDark11'
                                            : 'text-futarchyCrimson11 dark:text-futarchyCrimsonDark11'
                                        }`}>
                                        {transactionData.action}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Input Amount</span>
                                    <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">{transactionData.amount}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Protocol</span>
                                    <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                        {selectedSwapMethod === 'cowswap' ? 'CoW Swap' :
                                            selectedSwapMethod === 'algebra' ? 'Algebra (Swapr)' :
                                                selectedSwapMethod === 'uniswap' ? 'Uniswap V3' :
                                                    selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' :
                                                        'SushiSwap V3'}
                                    </span>
                                </div>
                                {/* For Uniswap SDK (Chain 1 - Ethereum), show QuoterV2-based fields */}
                                {selectedSwapMethod === 'uniswapSdk' && transactionData.insufficientLiquidity && (
                                    <div className="bg-futarchyOrange3 dark:bg-futarchyOrangeDark3 border border-futarchyOrange7 dark:border-futarchyOrangeDark7 rounded-lg p-3 text-center">
                                        <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 font-medium text-sm">Insufficient liquidity in this pool</span>
                                        <p className="text-futarchyOrange11/70 dark:text-futarchyOrangeDark11/70 text-xs mt-1">This pool does not have enough in-range liquidity to execute this trade.</p>
                                    </div>
                                )}
                                {selectedSwapMethod === 'uniswapSdk' && !transactionData.insufficientLiquidity && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Expected Receive</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.buyAmount ? (
                                                    <>
                                                        {(() => {
                                                            const amountFormatted = ethers.utils.formatUnits(swapRouteData.data.buyAmount, outputDecimals);
                                                            return formatTokenAmount(amountFormatted);
                                                        })()} {transactionData.receiveToken ||
                                                            (transactionData.action === 'Buy'
                                                                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">
                                                Min. Receive ({getSafeSlippageTolerance()}% slippage)
                                                {transactionData.isApproximate && (
                                                    <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 ml-1" title="Estimate based on spot price — does not account for pool fees or concentrated liquidity. Actual output may differ.">~ approx</span>
                                                )}
                                            </span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.buyAmount ? (
                                                    <>
                                                        {displayedMinReceive !== null ? formatTokenAmount(displayedMinReceive) : '-'} {transactionData.receiveToken ||
                                                            (transactionData.action === 'Buy'
                                                                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Current Pool Price</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.currentPrice ? (
                                                    swapRouteData.data.currentPrice.toFixed(4)
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Execution Price</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.executionPrice ? (
                                                    swapRouteData.data.executionPrice.toFixed(4)
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Pool Price After</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.poolPriceAfter ? (
                                                    swapRouteData.data.poolPriceAfter.toFixed(4)
                                                ) : '-'}
                                            </span>
                                        </div>
                                        {/* Show Price Impact for Uniswap SDK (has sqrtPriceX96After) */}
                                        {(swapRouteData.data?.priceImpact !== null && swapRouteData.data?.priceImpact !== undefined) && (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Price Impact</span>
                                                    <span className={`font-medium ${Math.abs(swapRouteData.data.priceImpact) > 99 ? 'text-futarchyOrange11' : Math.abs(swapRouteData.data.priceImpact) > 2 ? 'text-futarchyCrimson11' : 'text-futarchyGreen11'}`}>
                                                        {Math.abs(swapRouteData.data.priceImpact) > 99
                                                            ? 'Insufficient liquidity'
                                                            : `${Math.abs(swapRouteData.data.priceImpact) < 0.01
                                                                ? Math.abs(swapRouteData.data.priceImpact).toFixed(4)
                                                                : Math.abs(swapRouteData.data.priceImpact).toFixed(2)}%`}
                                                    </span>
                                                </div>
                                                {/* Warning for insufficient liquidity */}
                                                {Math.abs(swapRouteData.data.priceImpact) > 99 && (
                                                    <div className="mt-2 p-2 bg-futarchyOrange3 dark:bg-futarchyOrange11/10 border border-futarchyOrange11 rounded-lg">
                                                        <p className="text-futarchyOrange11 font-medium text-sm">Insufficient Liquidity</p>
                                                        <p className="text-futarchyOrange11 text-xs mt-1">
                                                            This pool does not have enough liquidity to execute your trade. The price impact would be extreme.
                                                        </p>
                                                    </div>
                                                )}
                                                {/* Warning for high price impact (but not insufficient) */}
                                                {Math.abs(swapRouteData.data.priceImpact) > 5 && Math.abs(swapRouteData.data.priceImpact) <= 99 && (
                                                    <div className="mt-2 p-2 bg-futarchyCrimson3 dark:bg-futarchyCrimson11/10 border border-futarchyCrimson11 rounded-lg">
                                                        <div className="flex-1">
                                                            <p className="text-futarchyCrimson11 font-medium text-sm">
                                                                High Price Impact Warning
                                                            </p>
                                                            <p className="text-futarchyCrimson11 text-xs mt-1">
                                                                This trade will significantly move the pool price ({Math.abs(swapRouteData.data.priceImpact).toFixed(2)}%).
                                                                Consider reducing trade size or splitting into multiple trades.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                                {/* For Algebra (Chain 100 - Gnosis), show Algebra Quoter fields */}
                                {selectedSwapMethod === 'algebra' && transactionData.insufficientLiquidity && (
                                    <div className="bg-futarchyOrange3 dark:bg-futarchyOrangeDark3 border border-futarchyOrange7 dark:border-futarchyOrangeDark7 rounded-lg p-3 text-center">
                                        <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 font-medium text-sm">Insufficient liquidity in this pool</span>
                                        <p className="text-futarchyOrange11/70 dark:text-futarchyOrangeDark11/70 text-xs mt-1">This pool does not have enough in-range liquidity to execute this trade.</p>
                                    </div>
                                )}
                                {selectedSwapMethod === 'algebra' && !transactionData.insufficientLiquidity && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Expected Receive</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.buyAmount ? (
                                                    <>
                                                        {(() => {
                                                            const amountFormatted = ethers.utils.formatUnits(swapRouteData.data.buyAmount, outputDecimals);
                                                            return formatTokenAmount(amountFormatted);
                                                        })()} {transactionData.receiveToken ||
                                                            (transactionData.action === 'Buy'
                                                                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Min. Receive ({getSafeSlippageTolerance()}% slippage)</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : displayedMinReceive !== null ? (
                                                    <>
                                                        {formatTokenAmount(displayedMinReceive)} {transactionData.receiveToken ||
                                                            (transactionData.action === 'Buy'
                                                                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Current Pool Price</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.currentPrice ? (
                                                    <>
                                                        {swapRouteData.data.currentPrice.toFixed(4)} {(BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Execution Price</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.displayPrice || swapRouteData.data?.invertedPrice || swapRouteData.data?.executionPrice ? (
                                                    <>
                                                        {parseFloat(swapRouteData.data.displayPrice || swapRouteData.data.invertedPrice || swapRouteData.data.executionPrice).toFixed(4)} {(BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Pool Price After</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {swapRouteData.isLoading ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading...
                                                    </span>
                                                ) : swapRouteData.error ? (
                                                    '-'
                                                ) : swapRouteData.data?.poolPriceAfter ? (
                                                    <>
                                                        {parseFloat(swapRouteData.data.poolPriceAfter).toFixed(4)} {(BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol}
                                                    </>
                                                ) : '-'}
                                            </span>
                                        </div>
                                        {(swapRouteData.data?.priceImpact !== null && swapRouteData.data?.priceImpact !== undefined) && (
                                            <div className="flex justify-between">
                                                <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Price Impact</span>
                                                <span className={`font-medium ${Math.abs(swapRouteData.data.priceImpact) > 99 ? 'text-futarchyOrange11' : Math.abs(swapRouteData.data.priceImpact) > 2 ? 'text-futarchyCrimson11' : 'text-futarchyGreen11'}`}>
                                                    {Math.abs(swapRouteData.data.priceImpact) > 99
                                                        ? 'Insufficient liquidity'
                                                        : `${Math.abs(swapRouteData.data.priceImpact) < 0.01
                                                            ? Math.abs(swapRouteData.data.priceImpact).toFixed(4)
                                                            : Math.abs(swapRouteData.data.priceImpact).toFixed(2)}%`}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {/* For other methods (cowswap, sushiswap), show standard fields */}
                                {selectedSwapMethod !== 'uniswapSdk' && selectedSwapMethod !== 'algebra' && transactionData.expectedReceiveAmount && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Expected Receive</span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {formatTokenAmount(transactionData.expectedReceiveAmount)} {transactionData.receiveToken ||
                                                    (transactionData.action === 'Buy'
                                                        ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                        : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-futarchyGray11 dark:text-futarchyGray112/80">
                                                Min. Receive ({getSafeSlippageTolerance()}% slippage)
                                                {transactionData.isApproximate && (
                                                    <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 ml-1" title="Estimate based on spot price — does not account for pool fees or concentrated liquidity. Actual output may differ.">~ approx</span>
                                                )}
                                            </span>
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                                {formatTokenAmount(parseFloat(transactionData.expectedReceiveAmount) * (1 - getSafeSlippageTolerance() / 100))} {transactionData.receiveToken ||
                                                    (transactionData.action === 'Buy'
                                                        ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                        : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                            </span>
                                        </div>
                                    </>
                                )}
                                {/* OLD: Estimated Price for Algebra - REMOVED, now using Algebra Quoter fields above */}
                                {false && selectedSwapMethod === 'algebra' && transactionData.expectedReceiveAmount && transactionData.amount && (
                                    <div className="flex justify-between">
                                        <span className="text-futarchyGray11 dark:text-futarchyGray112/80">
                                            {transactionData.action === 'Redeem' ? 'Redemption Rate' : 'Est. Price'}
                                        </span>
                                        <span className="text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                            {(() => {
                                                const inputAmount = parseFloat(transactionData.amount.split(' ')[0]);

                                                // For Uniswap SDK, use QuoterV2 result
                                                let outputAmount;
                                                if (selectedSwapMethod === 'uniswapSdk' && swapRouteData.data?.buyAmount) {
                                                    outputAmount = parseFloat(ethers.utils.formatUnits(swapRouteData.data.buyAmount, 18));
                                                } else {
                                                    outputAmount = parseFloat(transactionData.expectedReceiveAmount);
                                                }

                                                if (!inputAmount || !outputAmount || outputAmount <= 0) {
                                                    return 'N/A';
                                                }

                                                const currencySymbol = (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol;
                                                const companySymbol = (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol;
                                                const precision = precisionConfig?.display?.price || 4;

                                                // Calculate price based on action
                                                if (transactionData.action === 'Redeem') {
                                                    // For redemption: show how much currency per position token
                                                    const price = inputAmount / outputAmount;
                                                    return `${price.toFixed(precision)} ${currencySymbol} / Position Token`;
                                                } else if (transactionData.action === 'Buy') {
                                                    // For buy: show how much currency per company token
                                                    const price = inputAmount / outputAmount;
                                                    return `${price.toFixed(precision)} ${currencySymbol} / ${companySymbol}`;
                                                } else {
                                                    // For sell: show how much currency per company token (inverted)
                                                    const price = outputAmount / inputAmount;
                                                    return `${price.toFixed(precision)} ${currencySymbol} / ${companySymbol}`;
                                                }
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {/* OLD: Max Price with Slippage for Algebra - REMOVED, now using Algebra Quoter fields above */}
                                {false && selectedSwapMethod === 'algebra' && transactionData.expectedReceiveAmount && transactionData.amount && (
                                    <div className="flex justify-between">
                                        <span className="text-futarchyGray11 dark:text-futarchyGray112/80">
                                            Max Price ({getSafeSlippageTolerance()}% slippage)
                                        </span>
                                        <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">
                                            {(() => {
                                                const inputAmount = parseFloat(transactionData.amount.split(' ')[0]);
                                                const outputAmount = parseFloat(transactionData.expectedReceiveAmount);
                                                const slippage = getSafeSlippageTolerance();

                                                if (!inputAmount || !outputAmount || outputAmount <= 0) {
                                                    return 'N/A';
                                                }

                                                // Calculate min receive with slippage
                                                const minReceive = outputAmount * (1 - slippage / 100);

                                                const currencySymbol = (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol;
                                                const companySymbol = (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol;
                                                const precision = precisionConfig?.display?.price || 4;

                                                // Calculate worst-case price (max price you'd pay)
                                                if (transactionData.action === 'Redeem') {
                                                    const maxPrice = inputAmount / minReceive;
                                                    return `${maxPrice.toFixed(precision)} ${currencySymbol} / Position Token`;
                                                } else if (transactionData.action === 'Buy') {
                                                    const maxPrice = inputAmount / minReceive;
                                                    return `${maxPrice.toFixed(precision)} ${currencySymbol} / ${companySymbol}`;
                                                } else {
                                                    // For sell: show min currency per company token (inverted)
                                                    const minPrice = minReceive / inputAmount;
                                                    return `${minPrice.toFixed(precision)} ${currencySymbol} / ${companySymbol}`;
                                                }
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {selectedSwapMethod !== 'algebra' && selectedSwapMethod !== 'uniswapSdk' && (
                                    <div className="flex justify-between">
                                        <span className="text-futarchyGray11 dark:text-futarchyGray112/80">
                                            {transactionData.action === 'Redeem' ? 'Redemption Rate' : 'Est. Price'}
                                        </span>
                                        <span className="text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                            {swapRouteData.isLoading ? 'Loading...' : swapRouteData.error ? '-' : (() => {
                                                if (!swapRouteData.data?.swapPrice || Number(swapRouteData.data.swapPrice) <= 0 || !BASE_TOKENS_CONFIG || !BASE_TOKENS_CONFIG.currency || !BASE_TOKENS_CONFIG.company) {
                                                    return 'N/A';
                                                }
                                                const currencySymbol = BASE_TOKENS_CONFIG.currency.symbol;
                                                const companySymbol = BASE_TOKENS_CONFIG.company.symbol;
                                                const precision = precisionConfig?.display?.price || 4;
                                                if (transactionData.action === 'Redeem') {
                                                    return `${Number(swapRouteData.data.swapPrice).toFixed(precision)} ${currencySymbol} / Position Token`;
                                                } else {
                                                    const priceValue = 1 / Number(swapRouteData.data.swapPrice);
                                                    const formattedPriceValue = priceValue.toFixed(precision);
                                                    let numeratorSymbol;
                                                    let denominatorSymbol;
                                                    if (transactionData.action === 'Buy') {
                                                        numeratorSymbol = currencySymbol;
                                                        denominatorSymbol = companySymbol;
                                                    } else {
                                                        numeratorSymbol = companySymbol;
                                                        denominatorSymbol = currencySymbol;
                                                    }
                                                    return `${formattedPriceValue} ${numeratorSymbol} / ${denominatorSymbol}`;
                                                }
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {swapRouteData.data?.feeAmount && ethers.BigNumber.from(swapRouteData.data.feeAmount).gt(0) && (
                                    <div className="flex justify-between">
                                        <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Est. Fee {swapRouteData.data?.protocolName ? `(${swapRouteData.data.protocolName})` : '(CoW)'}</span>
                                        <span className="text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                            {formatBalance(
                                                ethers.utils.formatUnits(swapRouteData.data.feeAmount, 18),
                                                transactionData.amount.split(' ')[1]
                                            )}
                                        </span>
                                    </div>
                                )}
                                {/* Price Impact is already shown above in the Algebra/Uniswap SDK sections */}
                                {swapRouteData.data?.gasSpent && (
                                    <div className="flex justify-between">
                                        <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Est. Gas</span>
                                        <span className="text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                            {`~${swapRouteData.data?.gasSpent.toLocaleString()} gas`}
                                        </span>
                                    </div>
                                )}
                                {(parseFloat(additionalCollateralNeeded) > 0 &&
                                    (transactionData.action === 'Buy' ||
                                        (checkSellCollateral && transactionData.action === 'Sell'))) && (
                                        <>
                                            <div className="border-t border-futarchyGray6 dark:border-futarchyDarkGray6 my-2"></div>
                                            <div className="flex justify-between">
                                                <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Already Have</span>
                                                <span className="text-futarchyGreen11 dark:text-futarchyGreenDark11 font-medium">
                                                    {existingBalance} {transactionData.action === 'Buy' ? (BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY') : (BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Need to Add</span>
                                                <span className="text-futarchyBlue11 dark:text-futarchyBlueDark11 font-medium">
                                                    {additionalCollateralNeeded} {transactionData.action === 'Buy' ? (BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY') : (BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY')}
                                                </span>
                                            </div>
                                        </>
                                    )}
                            </div>
                        </div>

                        {/* Approval Settings - Show for all swap methods on all chains.
                            Hidden when input-token allowances for this swap's spenders are already at max. */}
                        {!hideApprovalSection && (
                            <div className="px-4 pb-4">
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={useUnlimitedApproval}
                                        onChange={(e) => setUseUnlimitedApproval(e.target.checked)}
                                        className="mt-1 w-4 h-4 text-futarchyBlue9 bg-futarchyGray3 border-futarchyGray7 rounded focus:ring-futarchyBlue9 focus:ring-2 dark:bg-futarchyDarkGray4 dark:border-futarchyGray112"
                                    />
                                    <div className="flex-1">
                                        <span className="text-sm font-medium text-futarchyGray12 dark:text-futarchyGray3 group-hover:text-futarchyBlue11 dark:group-hover:text-futarchyBlue9 transition-colors">
                                            Max Approval
                                        </span>
                                        <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-1">
                                            Will request max allowance. Useful for saving gas on future requests.
                                        </p>
                                    </div>
                                </label>
                            </div>
                        )}

                        {priceImpactTooHigh && (
                            <div className="mx-4 mb-4 p-3 rounded-lg border border-futarchyCrimson7 bg-futarchyCrimson3 dark:bg-futarchyCrimson11/10">
                                <p className="text-sm font-medium text-futarchyCrimson11">
                                    Price impact too high — pool depth insufficient for this size
                                </p>
                                <label className="mt-2 flex items-center gap-2 text-xs text-futarchyCrimson11 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={tradeAnywayAcknowledged}
                                        onChange={(event) => setTradeAnywayAcknowledged(event.target.checked)}
                                    />
                                    Trade anyway
                                </label>
                            </div>
                        )}

                        {requiredChain.isWrongChain && !isProcessing && !isFinalStateForCloseButton && (
                            <div className="mb-6 p-4 bg-futarchyCrimson3 border border-futarchyCrimson5 rounded-lg text-futarchyCrimson11 text-sm">
                                This market is on {requiredChain.requiredChainName}, but your wallet is on {requiredChain.walletChainName || 'another network'}.
                            </div>
                        )}

                        {priceMoveNotice && (
                            <div className="mb-6 p-4 bg-futarchyOrange3 dark:bg-futarchyOrange11/10 border border-futarchyOrange7 rounded-lg text-futarchyOrange11 text-sm">
                                {priceMoveNotice}
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm break-words max-h-32 overflow-y-auto">
                                {error}
                            </div>
                        )}

                        {/* Processing Steps Display */}
                        {processingStep && (
                            <div className="mb-6 relative">
                                {/* ... step display logic ... */}
                                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-futarchyDarkGray3 dark:to-transparent pointer-events-none z-10" />
                                <div className="max-h-[240px] overflow-y-auto pr-2 -mr-2">
                                    {console.log("[ConfirmSwapCow Debug - Render] Rendering steps with stepsData:", stepsData)}
                                    {Object.entries(stepsData)
                                        .filter(([stepNum]) => {
                                            const step = parseInt(stepNum);
                                            const isCompleted = currentSubstep.step > step || processingStep === 'completed';
                                            return !isCompleted;
                                        })
                                        .map(([step, data]) => (
                                            <StepWithSubsteps
                                                key={step}
                                                step={parseInt(step)}
                                                title={data.title}
                                                substeps={data.substeps}
                                                expanded={expandedSteps[step]}
                                                onToggle={() => toggleStepExpansion(step)}
                                                isSimulating={isProcessing}
                                                currentSubstep={currentSubstep}
                                                processingStep={processingStep}
                                                transactionData={transactionData}
                                                prices={swapRouteData.data}
                                                completedSubsteps={completedSubsteps}
                                            />
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Transaction Result / Status Display - NOW MOSTLY FOR SUSHISWAP */}
                        {transactionResultHash &&
                            selectedSwapMethod === 'sushiswap' && (
                                // (selectedSwapMethod === 'cowswap' && isProcessing && ['submitting', 'submitted', 'tracking', 'open'].includes(orderStatus)) ||
                                // Sushi can show processing or final state here
                                <div className="mt-4 mb-4 p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray5 rounded-lg text-center text-sm space-y-1">
                                    {isProcessing
                                        ? (
                                            selectedSwapMethod === 'sushiswap' // Only SushiSwap processing message here now
                                                ? 'Processing SushiSwap V3...'
                                                : null // CoW and Algebra not handled here
                                        )
                                        : selectedSwapMethod === 'sushiswap' && orderStatus === 'fulfilled' // Only SushiSwap final state here
                                            ? 'SushiSwap V3 Confirmed!'
                                            : null
                                    }
                                </div>
                            )}

                        {/* Combined Link/Status for CoW Swap (Processing & Final) */}
                        {selectedSwapMethod === 'cowswap' && transactionResultHash && (
                            <div className="text-center text-sm mb-3 text-futarchyGray11 dark:text-futarchyGray112">
                                {isProcessing ? (
                                    // Processing states for CoW Swap
                                    orderStatus === 'submitting' ? 'Submitting CoW Order...' :
                                        ['submitted', 'tracking', 'open'].includes(orderStatus) ? (
                                            <>
                                                <div className="flex flex-row gap-1 items-center justify-center">
                                                    {'Tracking: '}
                                                    <a
                                                        href={`${cowExplorerBase}${transactionResultHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-futarchyBlue9 hover:underline dark:text-futarchyBlueDark9 dark:hover:text-futarchyBlueDark10"
                                                    >
                                                        {transactionResultHash.substring(0, 10)}...{transactionResultHash.substring(transactionResultHash.length - 8)}
                                                    </a>
                                                    <svg
                                                        className="w-4 h-4 text-black dark:text-futarchyGray112 hover:text-futarchyGray11 dark:hover:text-futarchyGray5 transition-colors"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                        <polyline points="15 3 21 3 21 9" />
                                                        <line x1="10" y1="14" x2="21" y2="3" />
                                                    </svg>
                                                </div>
                                            </>
                                        ) :
                                            'Processing CoW Swap...' // Fallback processing message
                                ) : (
                                    // Final states for CoW Swap
                                    <>
                                        <div className="flex flex-row gap-1 items-center justify-center">
                                            {orderStatus === 'fulfilled' && 'Fulfilled: '}
                                            {orderStatus === 'expired' && 'Expired: '}
                                            {orderStatus === 'cancelled' && 'Cancelled: '}
                                            {orderStatus === 'failed' && 'Failed: '}
                                            <a
                                                href={`${cowExplorerBase}${transactionResultHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-futarchyBlue9 hover:underline dark:text-futarchyBlueDark9 dark:hover:text-futarchyBlueDark10"
                                            >
                                                {transactionResultHash.substring(0, 10)}...{transactionResultHash.substring(transactionResultHash.length - 8)}
                                            </a>
                                            <svg
                                                className="w-4 h-4 text-black dark:text-futarchyGray112 hover:text-futarchyGray11 dark:hover:text-futarchyGray5 transition-colors"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                <polyline points="15 3 21 3 21 9" />
                                                <line x1="10" y1="14" x2="21" y2="3" />
                                            </svg>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Explorer Config UI */}
                        {selectedSwapMethod === 'sushiswap' && showExplorerConfigUi && (
                            <div className="mt-4 mb-4 p-3 border border-futarchyGray6 dark:border-futarchyDarkGray6 rounded-lg space-y-2">
                                {/* ... explorer config inputs ... */}
                                <h4 className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112 mb-1">Dev: Explorer Config</h4>
                                <div>
                                    <label className="block text-xs text-futarchyGray11 dark:text-futarchyGray112 mb-0.5" htmlFor="explorerUrlInput">Explorer URL:</label>
                                    <input
                                        id="explorerUrlInput"
                                        type="text"
                                        value={uiExplorerUrl}
                                        onChange={(e) => setUiExplorerUrl(e.target.value)}
                                        className="w-full p-1 border border-futarchyGray7 dark:border-futarchyDarkGray7 rounded text-xs bg-white dark:bg-futarchyDarkGray1 text-futarchyGray12 dark:text-futarchyGray112 focus:ring-1 focus:ring-futarchyBlue9 dark:focus:ring-offset-futarchyDarkGray3 focus:border-futarchyBlue9 dark:focus:border-futarchyBlueDark9"
                                        placeholder="e.g., https://gnosisscan.io/tx/"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-futarchyGray11 dark:text-futarchyGray112 mb-0.5" htmlFor="explorerNameInput">Explorer Name:</label>
                                    <input
                                        id="explorerNameInput"
                                        type="text"
                                        value={uiExplorerName}
                                        onChange={(e) => setUiExplorerName(e.target.value)}
                                        className="w-full p-1 border border-futarchyGray7 dark:border-futarchyDarkGray7 rounded text-xs bg-white dark:bg-futarchyDarkGray1 text-futarchyGray12 dark:text-futarchyGray112 focus:ring-1 focus:ring-futarchyBlue9 dark:focus:ring-offset-futarchyDarkGray3 focus:border-futarchyBlue9 dark:focus:border-futarchyBlueDark9"
                                        placeholder="e.g., GnosisScan"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Post-Trade Summary Panel — Success */}
                        {isFinalStateForCloseButton && orderStatus === 'fulfilled' && (
                            <div className="mx-4 mb-4 p-4 bg-futarchyGreen3 dark:bg-futarchyGreenDark3 border border-futarchyGreen7 dark:border-futarchyGreenDark7 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <svg className="w-5 h-5 text-futarchyGreen11 dark:text-futarchyGreenDark11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    <span className="font-semibold text-sm text-futarchyGreen11 dark:text-futarchyGreenDark11">Trade Completed</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-futarchyGreen11/70 dark:text-futarchyGreenDark11/70">You sent</span>
                                    <span className="text-futarchyGreen11 dark:text-futarchyGreenDark11 font-medium">{transactionData.amount}</span>
                                </div>
                                {transactionData.expectedReceiveAmount && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-futarchyGreen11/70 dark:text-futarchyGreenDark11/70">You received</span>
                                        <span className="text-futarchyGreen11 dark:text-futarchyGreenDark11 font-medium">
                                            ~{formatTokenAmount(transactionData.expectedReceiveAmount)} {transactionData.receiveToken ||
                                                (transactionData.action === 'Buy'
                                                    ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
                                                    : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol)}
                                        </span>
                                    </div>
                                )}
                                {transactionData.outcome && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-futarchyGreen11/70 dark:text-futarchyGreenDark11/70">Outcome</span>
                                        <span className="text-futarchyGreen11 dark:text-futarchyGreenDark11 font-medium">{transactionData.outcome}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-futarchyGreen11/70 dark:text-futarchyGreenDark11/70">Protocol</span>
                                    <span className="text-futarchyGreen11 dark:text-futarchyGreenDark11 font-medium">
                                        {selectedSwapMethod === 'cowswap' ? 'CoW Swap' :
                                            selectedSwapMethod === 'algebra' ? 'Algebra (Swapr)' :
                                                selectedSwapMethod === 'uniswap' ? 'Uniswap V3' :
                                                    selectedSwapMethod === 'uniswapSdk' ? 'Uniswap SDK' :
                                                        'SushiSwap V3'}
                                    </span>
                                </div>
                                {transactionResultHash && (
                                    <div className="pt-1 border-t border-futarchyGreen7/40 dark:border-futarchyGreenDark7/40">
                                        <a
                                            href={selectedSwapMethod === 'cowswap'
                                                ? `${cowExplorerBase}${transactionResultHash}`
                                                : `${explorerConfig.url}${transactionResultHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-sm text-futarchyGreen11 dark:text-futarchyGreenDark11 hover:underline"
                                        >
                                            View on {selectedSwapMethod === 'cowswap' ? 'CoW Explorer' : explorerConfig.name}
                                            <span className="font-mono">({transactionResultHash.substring(0, 10)}…{transactionResultHash.substring(transactionResultHash.length - 8)})</span>
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                <polyline points="15 3 21 3 21 9" />
                                                <line x1="10" y1="14" x2="21" y2="3" />
                                            </svg>
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Post-Trade Summary Panel — Failed/Expired/Cancelled */}
                        {isFinalStateForCloseButton && orderStatus !== 'fulfilled' && (
                            <div className="mx-4 mb-4 p-4 bg-futarchyCrimson3 dark:bg-futarchyCrimsonDark3 border border-futarchyCrimson7 dark:border-futarchyCrimsonDark7 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <svg className="w-5 h-5 text-futarchyCrimson11 dark:text-futarchyCrimsonDark11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    <span className="font-semibold text-sm text-futarchyCrimson11 dark:text-futarchyCrimsonDark11">
                                        Trade {orderStatus === 'expired' ? 'Expired' : orderStatus === 'cancelled' ? 'Cancelled' : 'Failed'}
                                    </span>
                                </div>
                                {transactionResultHash && (
                                    <a
                                        href={selectedSwapMethod === 'cowswap'
                                            ? `${cowExplorerBase}${transactionResultHash}`
                                            : `${explorerConfig.url}${transactionResultHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-sm text-futarchyCrimson11 dark:text-futarchyCrimsonDark11 hover:underline"
                                    >
                                        View on {selectedSwapMethod === 'cowswap' ? 'CoW Explorer' : explorerConfig.name}
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Main Action Button */}
                        <div className="px-4 flex items-center justify-center">
                            {/* Show ConnectButton if wallet not connected */}
                            {!account ? (
                                <div className="w-full mb-4">
                                    <ConnectButton.Custom>
                                        {({
                                            account,
                                            chain,
                                            openAccountModal,
                                            openChainModal,
                                            openConnectModal,
                                            mounted,
                                        }) => {
                                            const ready = mounted;
                                            const connected = ready && account && chain;

                                            return (
                                                <div
                                                    {...(!ready && {
                                                        'aria-hidden': true,
                                                        'style': {
                                                            opacity: 0,
                                                            pointerEvents: 'none',
                                                            userSelect: 'none',
                                                        },
                                                    })}
                                                >
                                                    {(() => {
                                                        if (!connected) {
                                                            return (
                                                                <button
                                                                    onClick={openConnectModal}
                                                                    type="button"
                                                                    className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-black text-white hover:bg-black/90 dark:bg-futarchyGray3 dark:text-black dark:hover:bg-futarchyGray3/80"
                                                                >
                                                                    Connect Wallet
                                                                </button>
                                                            );
                                                        }
                                                    })()}
                                                </div>
                                            );
                                        }}
                                    </ConnectButton.Custom>
                                </div>
                            ) : isFinalStateForCloseButton && orderStatus === 'fulfilled' ? (
                                <div className="w-full mb-4 flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors bg-black text-white hover:bg-black/90 dark:bg-futarchyGray3 dark:text-black dark:hover:bg-futarchyGray3/80"
                                    >
                                        View Positions
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors border border-futarchyGray7 dark:border-futarchyDarkGray7 text-futarchyGray11 dark:text-futarchyGray112 hover:bg-futarchyGray3 dark:hover:bg-futarchyDarkGray5"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : requiredChain.isWrongChain && !isProcessing && !isFinalStateForCloseButton ? (
                                <button
                                    onClick={requiredChain.switchToRequiredChain}
                                    disabled={requiredChain.isSwitching}
                                    className="w-full mb-4 py-3 px-4 rounded-lg font-medium transition-colors bg-black text-white hover:bg-black/90 dark:bg-futarchyGray3 dark:text-black dark:hover:bg-futarchyGray3/80"
                                >
                                    {requiredChain.isSwitching ? 'Switching network...' : `Switch to ${requiredChain.requiredChainName}`}
                                </button>
                            ) : (
                                <button
                                    onClick={
                                        isFinalStateForCloseButton
                                            ? onClose
                                            : handleConfirmSwap
                                    }
                                    disabled={(isProcessing && !isFinalStateForCloseButton) || transactionData.insufficientLiquidity || quoteUnavailableForExecution || (priceImpactTooHigh && !tradeAnywayAcknowledged)}
                                    className={`w-full mb-4 py-3 px-4 rounded-lg font-medium transition-colors ${transactionData.insufficientLiquidity
                                        ? 'bg-futarchyOrange7 text-futarchyOrange11 cursor-not-allowed opacity-60'
                                        : isFinalStateForCloseButton
                                            ? 'bg-futarchyCrimson7 text-futarchyCrimson11 hover:bg-futarchyCrimson8 dark:bg-futarchyCrimsonDark7 dark:text-futarchyCrimsonDark11 dark:hover:bg-futarchyCrimsonDark8'
                                        : isProcessing
                                            ? 'bg-futarchyGray6 text-futarchyGray11 dark:bg-futarchyDarkGray6 dark:text-futarchyDarkGray11 cursor-not-allowed'
                                            : 'bg-black text-white hover:bg-black/90 dark:bg-futarchyGray3 dark:text-black dark:hover:bg-futarchyGray3/80'
                                        }`}
                                >
                                    {isFinalStateForCloseButton
                                        ? "Transaction Finished"
                                        : isProcessing
                                            ? (
                                                selectedSwapMethod === 'cowswap'
                                                    ? (orderStatus === 'submitting' ? 'Submitting CoW Order...' : 'Processing CoW Swap...')
                                                    : selectedSwapMethod === 'sushiswap'
                                                        ? 'Processing SushiSwap V3...'
                                                        : 'Processing Swap'
                                            )
                                            : transactionData.insufficientLiquidity || quoteUnavailableForExecution
                                                ? 'Quote Unavailable'
                                                : priceImpactTooHigh && !tradeAnywayAcknowledged
                                                    ? 'Acknowledge High Impact'
                                                : transactionData.action === 'Redeem'
                                                    ? 'Confirm Redeem'
                                                    : 'Confirm Swap'
                                    }
                                </button>
                            )}
                        </div>
                    </div> {/* End of modal content panel div */}
                </div> {/* End of centering wrapper div */}
            </motion.div> {/* End of backdrop motion.div */}
            {debugMode && <DebugToast debugData={debugData} />}
        </>
    );

    // Return portal or null if no portal root
    if (typeof document === 'undefined') return null;
    const portalRoot = document.getElementById('modal-root');
    if (!portalRoot) return null;

    return ReactDOM.createPortal(modalContent, portalRoot);
});

ConfirmSwapModal.displayName = 'ConfirmSwapModal';

export default ConfirmSwapModal;
