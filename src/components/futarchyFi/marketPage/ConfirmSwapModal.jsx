import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
// Replace useMetaMask with wagmi hooks
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
    PRECISION_CONFIG as DEFAULT_PRECISION_CONFIG,
    DEFAULT_BASE_TOKENS_CONFIG,
    FUTARCHY_ROUTER_ADDRESS as DEFAULT_FUTARCHY_ROUTER_ADDRESS,
} from './constants/contracts';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { useRequiredChain } from '../../../hooks/useChainValidation';
import DebugToast from './DebugToast';
import { formatBalance } from '../../../utils/formatters';
import { Decimal } from 'decimal.js';
import { formatTokenAmount } from '../../../utils/precisionFormatter';
import { getEthersSigner, getEthersProvider } from '../../../utils/ethersAdapters';
import { useSafeConnection } from '../../../hooks/useSafeConnection';
import { waitForSafeTxReceipt } from '../../../utils/waitForSafeTxReceipt';
import { isSafeTransactionSent, isUserRejection, describeTxError, TX_CANCELLED_MESSAGE, SWAP_REVERT_HINT, PRICE_MOVED_WHILE_SIGNING, describeQuoteError } from '../../../utils/txErrors';
import { minReceiveFromQuote, compareQuotes, slippagePctToBps, slippageBpsForMinimum, executionPriceFor } from '../../../utils/swapQuoteMath';
import { quoteSeerSwap, executeSeerSwap, getSeerPublicClient, SEER_ROUTE_NAMES, SEER_DEFAULT_SWAP_ROUTER } from '../../../utils/seerSwap';
import { useSubgraphRefresh } from '../../../contexts/SubgraphRefreshContext';
import { splitCollateral } from '../../../utils/collateralActions';


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
const getStepsData = () => ({
    1: {
        title: 'Adding Collateral',
        substeps: [
            { id: 1, text: 'Approving base token for Futarchy Router', completed: false },
            { id: 2, text: 'Split wrapping position', completed: false }
        ]
    },
    2: {
        title: 'Processing Swap',
        substeps: [
            { id: 1, text: 'Approving token for the swap router', completed: false },
            { id: 2, text: 'Executing swap', completed: false }
        ]
    }
});

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
    useBlockExplorer = false // Flag to force waiting for transaction confirmation
}) => {

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

    const provider = useMemo(() => {
        const ethersProvider = getEthersProvider(publicClient);
        console.log('Provider created:', {
            hasProvider: !!ethersProvider,
            providerType: ethersProvider?._isProvider ? 'custom' : 'web3provider'
        });
        return ethersProvider;
    }, [publicClient]);

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

    // Effect to auto-clear error messages after a delay. The reason for a
    // failed trade stays: clearing it left the dialog on a bare "Trade Failed".
    useEffect(() => {
        let timer;
        if (error && orderStatus !== 'failed') {
            timer = setTimeout(() => {
                setError(null);
            }, 7000); // Clear error after 7 seconds
        }
        return () => clearTimeout(timer); // Cleanup timer if component unmounts or error changes
    }, [error, orderStatus]);

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

    // One route per chain, both executed through @seer-pm/sdk (see utils/seerSwap):
    // Uniswap on Ethereum, Swapr (Algebra) on Gnosis. The value selects the
    // dialog's per-chain summary rows.
    const swapChainId = config?.chainId ?? chain?.id;
    const selectedSwapMethod = swapChainId === 1 ? 'uniswapSdk' : 'algebra';
    const stepsData = useMemo(() => getStepsData(), []);
    // The swap route, quotes and token addresses all come from this market's chain
    const requiredChain = useRequiredChain(config?.chainId);

    // Get currency symbol from config (no hardcoded chain-based logic)
    const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'sDAI';

    // Destructure config values with fallbacks only for missing configs
    const {
        FUTARCHY_ROUTER_ADDRESS = DEFAULT_FUTARCHY_ROUTER_ADDRESS,
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

        // The router the quoted trade approves (from the panel's quote), else the chain's default
        const swapRouter = transactionData?.swapSpender || SEER_DEFAULT_SWAP_ROUTER[swapChainId];

        // Pairs the swap path will need allowance for, by action.
        // Buy:  base currency → futarchyRouter (split), conditional currency → swap router.
        // Sell: conditional company → swap router, conditional currency → futarchyRouter (merge).
        let pairs = [];
        if (transactionData.action === 'Buy') {
            pairs = [
                { token: baseTokenConfig.currency.address, spender: futarchyRouter },
                { token: condCurrency, spender: swapRouter },
            ];
        } else if (transactionData.action === 'Sell') {
            pairs = [
                { token: condCompany, spender: swapRouter },
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
    }, [publicClient, account, transactionData?.action, transactionData?.outcome, transactionData?.swapSpender, swapChainId, config, FUTARCHY_ROUTER_ADDRESS]);

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

    // Splits the missing collateral into YES/NO tokens before the swap
    // (step 1 of the dialog). The transactions are in utils/collateralActions.
    const handleCollateralAction = async (tokenType, amount) => {
        try {
            setIsProcessing(true);
            setCurrentSubstep({ step: 1, substep: 1 });
            setProcessingStep(1);

            if (!walletClient || !publicClient || !account) {
                console.error('No wallet client or account available');
                setError('Wallet connection error');
                return false;
            }

            const baseToken = tokenType === 'currency'
                ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency
                : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company;

            // Decimal first: a very small number may arrive in exponent form
            const amountInWei = ethers.utils.parseUnits(
                amount.toString().includes('e') ? new Decimal(amount).toString() : amount.toString(),
                baseToken.decimals
            );

            await splitCollateral({
                publicClient,
                walletClient,
                account,
                router: FUTARCHY_ROUTER_ADDRESS,
                proposal: transactionData?.marketAddress || MARKET_ADDRESS,
                collateralToken: baseToken.address,
                amount: amountInWei.toString(),
                symbol: baseToken.symbol,
                useUnlimitedApproval,
                isSafe: isSafeConnection(walletClient),
                waitForSafeExecution: useBlockExplorer,
                onStep: (step) => {
                    if (step === 'approved') {
                        // Also when the allowance was already enough
                        markSubstepCompleted(1, 1);
                        setCurrentSubstep({ step: 1, substep: 2 });
                    }
                },
            });

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
        }
        // isProcessing stays set: handleConfirmSwap manages the overall state
    };

    // Add debug logging function
    const logDebug = (data) => {
        if (debugMode) {
            setDebugData(data);
            console.log('Debug Data:', data);
        }
    };

    // Tokens this Buy/Sell swaps, on the chosen outcome's side:
    // currency → company to buy, company → currency to sell.
    const swapTokens = () => {
        const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG;
        const isYes = transactionData.outcome === 'Event Will Occur';
        const currency = (isYes ? mergeConfig.currencyPositions.yes : mergeConfig.currencyPositions.no).wrap.wrappedCollateralTokenAddress;
        const company = (isYes ? mergeConfig.companyPositions.yes : mergeConfig.companyPositions.no).wrap.wrappedCollateralTokenAddress;
        return transactionData.action === 'Buy'
            ? { tokenIn: currency, tokenOut: company }
            : { tokenIn: company, tokenOut: currency };
    };

    // A fresh quote for the confirmed amount from Seer's Lens quoter. It is
    // the trade that gets sent: its calldata carries the minimum output.
    const fetchFreshQuote = async (amountInWei, slippageBps) => {
        if (transactionData.action !== 'Buy' && transactionData.action !== 'Sell') return null;
        const { tokenIn, tokenOut } = swapTokens();
        return quoteSeerSwap({
            chainId: swapChainId,
            account,
            tokenIn,
            tokenOut,
            amountInRaw: amountInWei.toString(),
            slippageBps
        });
    };

    // Shows a re-quoted output in place of the one on screen.
    const applyRefreshedQuote = (amountOutRaw) => {
        // The execution price follows from the new output. The pool price
        // before and after, and the impact, came with the earlier quote and no
        // longer describe this one, so those rows are cleared, not left stale.
        const executionPrice = executionPriceFor({
            amountIn: transactionData.amount.split(' ')[0],
            amountOut: ethers.utils.formatUnits(amountOutRaw.toString(), outputDecimals),
            isBuy: transactionData.action === 'Buy'
        });
        refreshedQuoteRef.current = {
            buyAmount: amountOutRaw.toString(),
            executionPrice,
            swapPrice: executionPrice === null ? null : String(executionPrice),
            displayPrice: executionPrice === null ? null : String(executionPrice),
            currentPrice: null,
            poolPriceAfter: null,
            priceImpact: null
        };
        setSwapRouteData((prev) => (prev?.data
            ? { ...prev, data: { ...prev.data, ...refreshedQuoteRef.current } }
            : prev));
    };

    // Re-quotes right before sending and returns the trade to send, or null
    // to stop. The transaction's minimum output is never below the Min.
    // Receive the user confirmed: if the fresh quote's minimum at the user's
    // tolerance is lower, it is re-quoted with just enough slippage to keep
    // that minimum. If the fresh quote itself is below it, the swap would
    // revert, so the dialog shows the new quote and stops.
    const requoteBeforeSend = async (amountInWei) => {
        const confirmedAmountOutRaw = swapRouteData.data?.buyAmount;
        if (!confirmedAmountOutRaw) {
            setError('A current on-chain pool quote is required before this swap can be submitted.');
            return null;
        }
        const tolerance = getSafeSlippageTolerance();
        const toleranceBps = slippagePctToBps(tolerance);
        const confirmedMin = BigInt(minimumFromQuote(confirmedAmountOutRaw).toString());

        const quote = async (bps) => {
            try {
                return await fetchFreshQuote(amountInWei, bps);
            } catch (quoteError) {
                setError(describeQuoteError(quoteError).message);
                return null;
            }
        };

        const fresh = await quote(toleranceBps);
        if (!fresh) return null;

        const { movedPct, exceedsTolerance } = compareQuotes({
            confirmedAmountOutRaw,
            freshAmountOutRaw: fresh.amountOut.toString(),
            slippagePct: tolerance
        });

        if (exceedsTolerance) {
            applyRefreshedQuote(fresh.amountOut);
            setPriceMoveNotice(`The price moved ${movedPct.toFixed(2)}% since the quote, beyond your ${tolerance}% slippage tolerance. The quote has been updated: review Min. Receive and confirm again.`);
            return null;
        }
        if (Math.abs(movedPct) >= 0.01) {
            setPriceMoveNotice(`The quote changed by ${movedPct > 0 ? '-' : '+'}${Math.abs(movedPct).toFixed(2)}% since it was shown, within your ${tolerance}% tolerance. Min. Receive is unchanged.`);
        }
        if (fresh.minimumAmountOut() >= confirmedMin) return fresh;

        const tightened = await quote(slippageBpsForMinimum(fresh.amountOut, confirmedMin, toleranceBps));
        if (!tightened) return null;
        if (tightened.minimumAmountOut() < confirmedMin) {
            applyRefreshedQuote(tightened.amountOut);
            setPriceMoveNotice(`The price moved again while re-quoting. The quote has been updated: review Min. Receive and confirm again.`);
            return null;
        }
        return tightened;
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
            const quotedTrade = await requoteBeforeSend(amountInWei);
            if (!quotedTrade) {
                setIsProcessing(false);
                setOrderStatus(null);
                setProcessingStep(null);
                return;
            }
            const quotedAt = Date.now();
            const confirmedMinimum = quotedTrade.minimumAmountOut();

            // The swap is sent after the collateral split and the approval have
            // been signed and mined, which can outlast the quote's five-minute
            // deadline. This rebuilds it just before sending, never for less
            // than the minimum confirmed above.
            const requoteForSend = async () => {
                const toleranceBps = slippagePctToBps(getSafeSlippageTolerance());
                let fresh = await fetchFreshQuote(amountInWei, toleranceBps);
                if (fresh.minimumAmountOut() < confirmedMinimum) {
                    const tighterBps = slippageBpsForMinimum(fresh.amountOut, confirmedMinimum, toleranceBps);
                    fresh = tighterBps === null ? null : await fetchFreshQuote(amountInWei, tighterBps);
                }
                if (!fresh || fresh.minimumAmountOut() < confirmedMinimum) {
                    throw new Error(PRICE_MOVED_WHILE_SIGNING);
                }
                return fresh;
            };

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

            // --- Step 2: Approval & swap, one executor for both chains (@seer-pm/sdk) ---
            setCurrentSubstep({ step: 2, substep: 1 });
            const swapHash = await executeSeerSwap({
                trade: quotedTrade,
                account,
                walletClient,
                connector,
                isSafe: isSafeConnection(walletClient),
                useUnlimitedApproval,
                requote: requoteForSend,
                quotedAt,
                onApprovalNeeded: () => setCurrentSubstep({ step: 2, substep: 1 }),
                onApprovalComplete: () => {
                    markSubstepCompleted(2, 1);
                    setCurrentSubstep({ step: 2, substep: 2 });
                }
            });
            setTransactionResultHash(swapHash);

            let receipt;
            if (isSafeConnection(walletClient)) {
                // The hash is a safeTxHash: the Safe executes the swap later
                if (!useBlockExplorer) {
                    setOrderStatus('fulfilled');
                    setProcessingStep('completed');
                    setIsProcessing(false);
                    onSafeTransaction?.(); // Trigger toast
                    onTransactionComplete?.();
                    onClose(); // Auto-close for Safe
                    return;
                }
                receipt = await waitForSafeTxReceipt({
                    chainId: await walletClient.getChainId(),
                    safeTxHash: swapHash,
                    publicClient
                });
            } else {
                receipt = await getSeerPublicClient(quotedTrade.chainId).waitForTransactionReceipt({ hash: swapHash });
            }

            if (receipt.status === 0 || receipt.status === 'reverted') {
                const revertReason = parseRevertReason(receipt);
                const revertError = new Error(revertReason
                    ? `Transaction failed: ${revertReason}`
                    : 'Transaction reverted - likely due to slippage or insufficient output amount');
                revertError.receipt = receipt;
                throw revertError;
            }
            markSubstepCompleted(2, 2);
            setOrderStatus('fulfilled');
            setProcessingStep('completed');
            setIsProcessing(false);
            onTransactionComplete?.(); // Refresh balances; the modal stays open

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

            let errorMessage = error.message === PRICE_MOVED_WHILE_SIGNING
                ? PRICE_MOVED_WHILE_SIGNING
                : formatTransactionError({ ...error, message: detailedError }, transactionResultHash);
            // Mined but reverted (a CALL_EXCEPTION carrying its receipt): with no
            // revert reason, the usual cause is a price move past the tolerance
            if (error?.receipt && detailedError === error.message) {
                errorMessage = `${describeTxError(error)}. ${SWAP_REVERT_HINT}`;
            }
            setError(errorMessage);
            setOrderStatus('failed'); // Set failed status
            // A swap that was mined and reverted keeps its hash, so the failed
            // panel can link to it.
            if (!error?.receipt) setTransactionResultHash(null);
            setIsProcessing(false); // Unlock UI on failure
            setProcessingStep(null); // Reset step visualization
            setCurrentSubstep({ step: 1, substep: 1 });
            setCompletedSubsteps({
                1: { completed: false, substeps: {} },
                2: { completed: false, substeps: {} }
            });
        }
    };

    const toggleStepExpansion = (step) => {
        setExpandedSteps(prev => ({
            ...prev,
            [step]: !prev[step]
        }));
    };

    // The dialog's quote. The trade panel already quoted this swap through
    // @seer-pm/sdk and passes the result; without it, quote here the same way.
    // A pre-send re-quote (requoteBeforeSend) replaces the output shown.
    useEffect(() => {
        if (isProcessing || transactionResultHash || finalExecutedAmount) return;
        if (!account || !transactionData?.amount || !config || !swapChainId) return;

        const amount = transactionData.amount.split(' ')[0];
        const amountInWei = transactionData.amountInRaw
            ? ethers.BigNumber.from(transactionData.amountInRaw)
            : safeParseToWei(amount);
        const panelData = {
            sellAmount: amountInWei.toString(),
            feeAmount: '0',
            priceImpact: parseFloat(transactionData.priceImpact || 0),
            protocol: SEER_ROUTE_NAMES[swapChainId],
            protocolName: SEER_ROUTE_NAMES[swapChainId],
            currentPrice: parseFloat(transactionData.currentPrice || 0),
            poolPriceAfter: parseFloat(transactionData.priceAfter || 0)
        };

        if (transactionData.amountOutRaw) {
            setSwapRouteData({
                isLoading: false,
                error: null,
                data: {
                    ...panelData,
                    buyAmount: transactionData.amountOutRaw,
                    swapPrice: transactionData.executionPrice,
                    executionPrice: parseFloat(transactionData.executionPrice || 0),
                    displayPrice: transactionData.executionPrice,
                    ...(refreshedQuoteRef.current || {})
                }
            });
            return;
        }

        let cancelled = false;
        setSwapRouteData({ isLoading: true, error: null, data: null });
        fetchFreshQuote(amountInWei, slippagePctToBps(getSafeSlippageTolerance()))
            .then((trade) => {
                if (cancelled) return;
                if (!trade) throw new Error('No quote for this swap');
                const executionPrice = executionPriceFor({
                    amountIn: amount,
                    amountOut: ethers.utils.formatUnits(trade.amountOut.toString(), trade.tokenOut.decimals),
                    isBuy: transactionData.action === 'Buy'
                });
                setSwapRouteData({
                    isLoading: false,
                    error: null,
                    data: {
                        ...panelData,
                        buyAmount: trade.amountOut.toString(),
                        decimalsOut: trade.tokenOut.decimals,
                        swapPrice: String(executionPrice),
                        executionPrice,
                        displayPrice: String(executionPrice),
                        ...(refreshedQuoteRef.current || {})
                    }
                });
            })
            .catch((quoteError) => {
                if (!cancelled) setSwapRouteData({ isLoading: false, error: describeQuoteError(quoteError).message, data: null });
            });
        return () => { cancelled = true; };
    }, [account, transactionData, config, swapChainId, isProcessing, transactionResultHash, finalExecutedAmount, slippageTolerance]);

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
    const isFinalStateForCloseButton = ['fulfilled', 'failed'].includes(orderStatus);

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
    const quoteUnavailableForExecution = (
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
                className="fixed inset-0 bg-black/50 z-[99999]"
                onClick={onClose}
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                <div className="flex h-full items-center justify-center p-4">
                    <div // This is the modal content panel
                        className="bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl max-w-md w-full relative flex flex-col max-h-[80dvh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* All original modal content starts here */}
                        <div className="flex shrink-0 justify-between items-center p-4 border-b border-futarchyGray6 dark:border-futarchyDarkGray6">
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

                        {/* Scrolls inside the dialog; the page behind never has to */}
                        <div className="flex-1 min-h-0 overflow-y-auto">
                        {/* SWAP ROUTE */}
                        <div className="p-4">
                            <span className="block text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112 mb-1">Swap Route:</span>
                            <span className="text-sm text-futarchyGray12 dark:text-futarchyGray112 font-medium">
                                {SEER_ROUTE_NAMES[swapChainId] || 'Seer'}
                                <span className="text-xs block text-futarchyGray9 dark:text-futarchyGray9">(Best route from the Seer Lens quoter)</span>
                            </span>
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
                                        {SEER_ROUTE_NAMES[swapChainId] || 'Seer'}
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
                                                    {formatTokenAmount(existingBalance)} {transactionData.action === 'Buy' ? (BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY') : (BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-futarchyGray11 dark:text-futarchyGray112/80">Need to Add</span>
                                                <span className="text-futarchyBlue11 dark:text-futarchyBlueDark11 font-medium">
                                                    {formatTokenAmount(additionalCollateralNeeded)} {transactionData.action === 'Buy' ? (BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY') : (BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY')}
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
                                        {SEER_ROUTE_NAMES[swapChainId] || 'Seer'}
                                    </span>
                                </div>
                                {transactionResultHash && (
                                    <div className="pt-1 border-t border-futarchyGreen7/40 dark:border-futarchyGreenDark7/40">
                                        <a
                                            href={`${explorerConfig.url}${transactionResultHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-sm text-futarchyGreen11 dark:text-futarchyGreenDark11 hover:underline"
                                        >
                                            View on {explorerConfig.name}
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
                                        href={`${explorerConfig.url}${transactionResultHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-sm text-futarchyCrimson11 dark:text-futarchyCrimsonDark11 hover:underline"
                                    >
                                        View on {explorerConfig.name}
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                    </a>
                                )}
                            </div>
                        )}

                        </div>

                        {/* Main Action Button */}
                        <div className="shrink-0 px-4 pt-3 flex items-center justify-center border-t border-futarchyGray6 dark:border-futarchyDarkGray6">
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
                                            ? 'Processing Swap'
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
