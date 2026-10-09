import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { motion, AnimatePresence } from "framer-motion";
import { formatBalance } from "../../../../utils/formatters";
import { ethers } from "ethers";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import {
  FUTARCHY_ROUTER_ADDRESS,
  MARKET_ADDRESS
} from "../constants/contracts";
import FutarchyCartridge from "futarchy-sdk/executors/FutarchyCartridge";
import { useSafeDetection } from "../../../../hooks/useSafeDetection";
import { useRequiredChain } from "../../../../hooks/useChainValidation";
import { DEBUG_MODE } from "../../../../config/featureFlags";
import { waitForSafeTxReceipt } from "../../../../utils/waitForSafeTxReceipt";
import { useSafeConnection } from "../../../../hooks/useSafeConnection";
import { approvalAmountFor } from "../../../../utils/approvalAmount";
import { getRedeemSide, describeRedeemError } from "../../../../utils/redeemPlan";

// MetaMask icon component
const MetamaskIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.171-1.52-.5-2.187l-3.955-7.97A11.81 11.81 0 0 0 12 0a11.81 11.81 0 0 0-6.105 2.093l-3.955 7.97c-.329.667-.5 1.407-.5 2.187s.171 1.52.5 2.187l3.955 7.97A11.81 11.81 0 0 0 12 24a11.81 11.81 0 0 0 6.105-2.093l3.955-7.97c.329-.667.5-1.407.5-2.187z" />
  </svg>
);

// WalletInformation component
const WalletInformation = ({ walletAddress, walletIcon }) => {
  const truncateAddress = (address) => {
    if (!address) return "No Connected Wallet";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="flex flex-row bg-white dark:bg-futarchyDarkGray4 border border-futarchyGray6 rounded-lg p-3 md:p-4">
      <div className="flex flex-col gap-[2px]">
        <div className="text-futarchyGray11 text-xs md:text-sm font-normal">
          Connected Wallet
        </div>
        <div className="flex flex-row items-center gap-[6px] text-futarchyGray12 dark:text-futarchyGray3 text-sm md:text-base font-medium">
          {walletIcon} {truncateAddress(walletAddress)}
        </div>
      </div>
    </div>
  );
};

// Define redemption steps - will be customized based on winning outcome
// Note: Collateral1 = Company, Collateral2 = Currency in redeemProposal function
export const getRedemptionSteps = (winningTokens) => ({
  1: {
    title: "Redeeming Winning Tokens",
    substeps: [
      { id: 1, text: `Approving ${winningTokens?.companySymbol || 'company'} tokens for Router (Collateral1)`, completed: false },
      { id: 2, text: `Approving ${winningTokens?.currencySymbol || 'currency'} tokens for Router (Collateral2)`, completed: false },
      { id: 3, text: "Executing redemption", completed: false },
    ],
  },
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
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

// Collapsible component to show transaction parameters
const TransactionParamsCollapse = ({ params, isWinningOutcomeYes }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if debugMode is enabled in URL
  const isDebugMode = DEBUG_MODE && typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugMode') === 'true';

  if (!params || !isDebugMode) return null;

  const borderColor = isWinningOutcomeYes
    ? "border-futarchyBlue7"
    : "border-futarchyGold9";
  const bgColor = isWinningOutcomeYes
    ? "bg-futarchyBlue3/30 dark:bg-futarchyBlue6/10"
    : "bg-futarchyGold3/30 dark:bg-futarchyGold6/10";
  const textColor = isWinningOutcomeYes
    ? "text-futarchyBlue11 dark:text-futarchyBlue6"
    : "text-futarchyGold11 dark:text-futarchyGold6";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(params, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={`ml-6 mt-1 border ${borderColor} ${bgColor} rounded-md overflow-hidden`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 flex items-center justify-between ${textColor} hover:opacity-80 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span className="text-xs font-medium">MetaMask Parameters</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 bg-white dark:bg-futarchyDarkGray4 border-t border-futarchyGray6 dark:border-futarchyGray11/50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                  Transaction data that will be sent to MetaMask:
                </p>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${copied
                    ? "bg-futarchyGreen3 text-futarchyGreen11"
                    : "bg-futarchyGray4 dark:bg-futarchyGray11 text-futarchyGray12 dark:text-futarchyGray3 hover:bg-futarchyGray5 dark:hover:bg-futarchyGray10"
                    }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs text-futarchyGray12 dark:text-futarchyGray3 overflow-x-auto whitespace-pre-wrap break-all font-mono p-2 bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded">
                {JSON.stringify(params, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StepWithSubsteps = ({
  step,
  title,
  substeps,
  expanded,
  onToggle,
  isProcessing,
  currentSubstep,
  processingStep,
  completedSubsteps,
  isWinningOutcomeYes,
  transactionParams,
}) => {
  const isStepActive = isProcessing && currentSubstep.step === parseInt(step);
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
      return isWinningOutcomeYes
        ? "text-futarchyBlue11 bg-futarchyBlue3"
        : "text-futarchyGold11 bg-futarchyGold3";
    }
    if (isStepActive) {
      return isWinningOutcomeYes
        ? "text-futarchyBlue11 bg-futarchyBlue3"
        : "text-futarchyGold11 bg-futarchyGold3";
    }
    return "text-futarchyGray8 bg-futarchyGray4";
  };

  const getSubstepColor = (isCompleted, isActive) => {
    if (isCompleted) {
      return isWinningOutcomeYes
        ? "text-futarchyBlue11"
        : "text-futarchyGold11";
    }
    if (isActive) {
      return isWinningOutcomeYes
        ? "text-futarchyBlue11"
        : "text-futarchyGold11";
    }
    return "text-futarchyGray8";
  };

  // Add debug logging
  console.log(`StepWithSubsteps ${step} rendered:`, {
    isStepActive,
    isStepCompleted,
    isStepWaiting,
    currentSubstep,
    processingStep,
    isProcessing
  });

  return (
    <motion.div
      initial={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, marginBottom: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-4 overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${getStepIconContainerClasses()}`}
        >
          {isStepCompleted ? (
            <CheckMark />
          ) : isStepActive && isAnySubstepCurrentlyProcessing ? (
            <LoadingSpinner className="h-6 w-6" />
          ) : (
            <span className="text-sm font-medium">{step}</span>
          )}
        </div>
        <span
          className={`flex-1 ${isStepCompleted
            ? "text-futarchyGray12 dark:text-futarchyGray112"
            : isStepActive
              ? "text-futarchyGray12 dark:text-futarchyGray112"
              : "text-futarchyGray11 dark:text-futarchyGray112"
            }`}
        >
          {title}
        </span>
        <button
          onClick={onToggle}
          className="text-futarchyBlue11 hover:text-futarchyBlue9 text-sm"
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
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

              // Get the transaction params for this specific substep
              const substepParams = transactionParams?.[substep.id];

              return (
                <div key={substep.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${getSubstepColor(isSubstepCompleted, isSubstepActive)
                        }`}
                    >
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
                    <span
                      className={`text-sm flex-1 ${isSubstepCompleted
                        ? "text-futarchyGray12 dark:text-futarchyGray112"
                        : isSubstepActive
                          ? "text-futarchyGray12 dark:text-futarchyGray112"
                          : "text-futarchyGray11 dark:text-futarchyGray112"
                        }`}
                    >
                      {substep.text}
                    </span>
                  </div>

                  {/* Transaction Parameters Display */}
                  {substepParams && (
                    <TransactionParamsCollapse
                      params={substepParams}
                      isWinningOutcomeYes={isWinningOutcomeYes}
                    />
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const RedemptionModal = ({
  title,
  handleClose,
  connectedWalletAddress,
  walletIcon = <MetamaskIcon />,
  config,
  winningTokens,
  processingStep,
  isProcessing = false,
  error,

  useBlockExplorer = false,
  onSafeTransaction,
}) => {
  const { address: account, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isSafe, isLoading: isSafeLoading, safeInfo } = useSafeDetection();
  const requiredChain = useRequiredChain(config?.chainId);
  const isSafeConnection = useSafeConnection();

  const [debugInfo, setDebugInfo] = useState(null);

  // Helper to update debug info
  const updateDebugInfo = (info) => {
    setDebugInfo(prev => ({ ...prev, ...info }));
  };
  // Approval preference state
  const [useUnlimitedApproval, setUseUnlimitedApproval] = useState(false);

  const [expandedSteps, setExpandedSteps] = useState({ 1: true });
  // Update state management to match ConfirmSwapModal pattern
  const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 1 });
  const [completedSubsteps, setCompletedSubsteps] = useState({
    1: { completed: false, substeps: {} }
  });
  const [localProcessingStep, setLocalProcessingStep] = useState(undefined);
  const [localError, setLocalError] = useState(null);
  const [localIsProcessing, setLocalIsProcessing] = useState(false);

  // Determine if winning outcome is YES
  const isWinningOutcomeYes = getRedeemSide(config?.marketInfo?.finalOutcome) === 'yes';

  // Calculate transaction parameters for each substep
  const transactionParams = useMemo(() => {
    if (!config || !winningTokens) return null;

    const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS;
    const marketAddress = config?.MARKET_ADDRESS;

    if (!routerAddress || !marketAddress) return null;

    try {
      const currencyAmountInWei = ethers.utils.parseUnits(winningTokens.currencyAmount.toString(), 18);
      const companyAmountInWei = ethers.utils.parseUnits(winningTokens.companyAmount.toString(), 18);

      return {
        // Substep 1: Approve Company Tokens (Collateral1)
        1: {
          function: "approve",
          contract: winningTokens.companyTokenAddress,
          contractName: `${winningTokens.companySymbol} Token Contract`,
          parameters: {
            spender: routerAddress,
            amount: approvalAmountFor(companyAmountInWei, useUnlimitedApproval).toString()
          },
          humanReadable: {
            spender: `Futarchy Router (${routerAddress})`,
            amount: useUnlimitedApproval ? "Unlimited" : `${winningTokens.companyAmount} ${winningTokens.companySymbol}`,
            purpose: `Allow router to spend your ${winningTokens.companySymbol} tokens`
          }
        },
        // Substep 2: Approve Currency Tokens (Collateral2)
        2: {
          function: "approve",
          contract: winningTokens.currencyTokenAddress,
          contractName: `${winningTokens.currencySymbol} Token Contract`,
          parameters: {
            spender: routerAddress,
            amount: approvalAmountFor(currencyAmountInWei, useUnlimitedApproval).toString()
          },
          humanReadable: {
            spender: `Futarchy Router (${routerAddress})`,
            amount: useUnlimitedApproval ? "Unlimited" : `${winningTokens.currencyAmount} ${winningTokens.currencySymbol}`,
            purpose: `Allow router to spend your ${winningTokens.currencySymbol} tokens`
          }
        },
        // Substep 3: Execute Redemption
        3: {
          function: "redeemProposal",
          contract: routerAddress,
          contractName: "Futarchy Router",
          parameters: {
            proposal: marketAddress,
            collateral1Amount_company: companyAmountInWei.toString(),
            collateral2Amount_currency: currencyAmountInWei.toString()
          },
          humanReadable: {
            proposal: `Market Address (${marketAddress})`,
            collateral1Amount_company: `${winningTokens.companyAmount} ${winningTokens.companySymbol}`,
            collateral2Amount_currency: `${winningTokens.currencyAmount} ${winningTokens.currencySymbol}`,
            purpose: "Redeem your winning outcome tokens for underlying collateral"
          }
        }
      };
    } catch (error) {
      console.error('Error calculating transaction parameters:', error);
      return null;
    }
  }, [config, winningTokens, useUnlimitedApproval]);

  // Update markSubstepCompleted to match ConfirmSwapModal pattern
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

  const handleRedemption = async () => {
    if (!isConnected || !account || !walletClient) {
      setLocalError("Please connect your wallet first");
      return;
    }
    if (requiredChain.isChainUnknown) {
      setLocalError('Market details are still loading. Try again in a moment.');
      return;
    }
    if (requiredChain.isWrongChain) {
      setLocalError(`This market is on ${requiredChain.requiredChainName}. Switch your wallet to it to continue.`);
      return;
    }

    try {
      console.log('[RedemptionModal] Starting redemption with:', {
        connectedAccount: account,
        walletType: walletClient?.connector?.name,
        isConnected,
        winningTokens
      });

      // Reset state and start processing
      setCompletedSubsteps({
        1: { completed: false, substeps: {} }
      });
      setLocalIsProcessing(true);
      setLocalProcessingStep("processing");
      setCurrentSubstep({ step: 1, substep: 1 });
      setLocalError(null);

      const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
      const marketAddress = config?.MARKET_ADDRESS || MARKET_ADDRESS;

      if (!routerAddress || !marketAddress) {
        throw new Error("Missing router or market address from config");
      }

      // Initialize Cartridge
      const cartridge = new FutarchyCartridge(routerAddress, { isSafeConnection });

      // Execute completeRedeemOutcomes
      const iterator = cartridge.completeRedeemOutcomes({
        proposal: marketAddress,
        token1Address: winningTokens.companyTokenAddress,
        token2Address: winningTokens.currencyTokenAddress,
        amount1: winningTokens.companyAmount.toString(),
        amount2: winningTokens.currencyAmount.toString(),
        exactApproval: !useUnlimitedApproval,
        useBlockExplorer
      }, { publicClient, walletClient, account });

      for await (const status of iterator) {
        console.log('[RedemptionModal] SDK Status:', status);

        // SDK failures come back as { status: 'error', message, error } with no step
        if (status.status === 'error') {
          throw new Error(status.error || status.message);
        }
        const step = status.step || '';
        const message = status.message || '';

        // Update debug info from SDK status
        if (status.txHash) {
          updateDebugInfo({
            status: 'Transaction Sent',
            message: status.message,
            txHash: status.txHash
          });
        } else {
          updateDebugInfo({
            status: 'Processing',
            message: status.message
          });
        }

        // Map SDK steps to UI steps
        if (step.includes('approving_token1')) {
          setCurrentSubstep({ step: 1, substep: 1 });
          if (step === 'token1_approved' || message.includes('Token 1 approved') || message.includes('Token 1 already approved')) {
            markSubstepCompleted(1, 1);
          }
        } else if (step.includes('approving_token2')) {
          // If token 1 was skipped or done quickly, ensure it's marked
          markSubstepCompleted(1, 1);
          setCurrentSubstep({ step: 1, substep: 2 });
          if (step === 'token2_approved' || message.includes('Token 2 approved') || message.includes('Token 2 already approved')) {
            markSubstepCompleted(1, 2);
          }
        } else if (step.includes('redeem')) {
          markSubstepCompleted(1, 1);
          markSubstepCompleted(1, 2);
          setCurrentSubstep({ step: 1, substep: 3 });
          if (step === 'complete') {
            markSubstepCompleted(1, 3);
            setCompletedSubsteps(prev => ({ ...prev, 1: { ...prev[1], completed: true } }));
          }
        } else if (step === 'complete') {
          setLocalProcessingStep("completed");
          setLocalIsProcessing(false);
        }
      }

    } catch (error) {
      console.error('Redemption failed:', error);
      setLocalError(describeRedeemError(error));
      setLocalProcessingStep(undefined);
      setLocalIsProcessing(false);
      setCurrentSubstep({ step: 1, substep: 1 });
      setCompletedSubsteps({
        1: { completed: false, substeps: {} }
      });
    }
  };

  const toggleStepExpansion = (step) => {
    setExpandedSteps(prev => ({
      ...prev,
      [step]: !prev[step]
    }));
  };

  const getUpdatedSteps = () => {
    const steps = getRedemptionSteps(winningTokens);
    return {
      ...steps,
      1: {
        ...steps[1],
        substeps: steps[1].substeps.map((substep) => ({
          ...substep,
          completed: completedSubsteps[1]?.substeps[substep.id] || localProcessingStep === "completed",
        })),
      },
    };
  };

  // Add useEffect for auto-expanding current step
  useEffect(() => {
    if (localIsProcessing && currentSubstep.step) {
      // Automatically expand the current step and collapse others
      setExpandedSteps({ 1: true });
    }
  }, [localIsProcessing, currentSubstep.step]);

  // Create portal container if it doesn't exist
  useEffect(() => {
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
      portalRoot = document.createElement('div');
      portalRoot.id = 'modal-root';
      document.body.appendChild(portalRoot);
    }
  }, []);

  let buttonContent;
  let buttonAction = () => { };
  let buttonIsEnabled = false;
  let buttonClasses = "w-full py-2 md:py-3 px-4 rounded-lg font-semibold transition-colors";

  if (localProcessingStep === "completed") {
    buttonContent = "Redemption Complete - Close";
    buttonAction = handleClose;
    buttonIsEnabled = true;
    const completedColors = isWinningOutcomeYes
      ? "bg-futarchyBlue9 hover:bg-futarchyBlue11 text-white"
      : "bg-futarchyGold9 hover:bg-futarchyGold11 text-black";
    buttonClasses += ` flex ${completedColors} items-center justify-center gap-2`;
  } else if (localIsProcessing) {
    buttonContent = "Processing Redemption...";
    buttonIsEnabled = false;
    buttonClasses += " bg-futarchyGray6 text-futarchyGray112/40 cursor-not-allowed";
  } else if (requiredChain.isWrongChain) {
    // Redemption goes through this market's router, which only exists on its chain
    buttonContent = requiredChain.isSwitching ? "Switching network..." : `Switch to ${requiredChain.requiredChainName}`;
    buttonAction = requiredChain.switchToRequiredChain;
    buttonIsEnabled = !requiredChain.isSwitching;
    buttonClasses += " bg-black hover:bg-black/80 text-white dark:bg-futarchyGray112 dark:hover:bg-futarchyGray112/80 dark:text-futarchyDarkGray1";
  } else {
    buttonContent = "Redeem Winning Tokens";
    buttonAction = handleRedemption;
    buttonIsEnabled = true;
    const actionColors = isWinningOutcomeYes
      ? "bg-futarchyBlue9 hover:bg-futarchyBlue11 text-white"
      : "bg-futarchyGold9 hover:bg-futarchyGold11 text-black";
    buttonClasses += ` ${actionColors}`;
  }

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="flex flex-col relative w-11/12 max-w-[393px] max-h-[80dvh] md:w-[480px] md:h-auto md:max-h-[min(638px,80dvh)] bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl shadow-lg gap-4 p-4 md:p-6 overflow-y-auto">
        <div className="flex justify-between items-center">
          <div className="text-lg md:text-xl text-futarchyGray12 dark:text-futarchyGray3 font-medium">
            {title}
          </div>
          <button
            onClick={handleClose}
            disabled={localIsProcessing && localProcessingStep !== "completed"}
            className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <WalletInformation
          walletAddress={connectedWalletAddress}
          walletIcon={walletIcon}
        />

        <AnimatePresence mode="wait">
          {!localProcessingStep ? (
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Redemption Summary */}
              <div className="mb-6">
                <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray4 dark:border dark:border-futarchyGray112/20 rounded-lg p-3 md:p-4">
                  <h4 className="font-medium mb-2 text-black dark:text-futarchyGray112 text-sm">Redemption Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-futarchyGray11 text-sm">Winning Outcome</span>
                      <span className="text-futarchyGreen11 font-medium text-sm">
                        {config?.marketInfo?.finalOutcome || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-futarchyGray11 text-sm">Currency Tokens</span>
                      <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium text-sm">
                        {formatBalance(winningTokens?.currencyAmount || '0', winningTokens?.currencySymbol || 'CURRENCY')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-futarchyGray11 text-sm">Company Tokens</span>
                      <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium text-sm">
                        {formatBalance(winningTokens?.companyAmount || '0', winningTokens?.companySymbol || 'COMPANY')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Max Approval Checkbox */}
              <div className="mb-6">
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
                      {useUnlimitedApproval
                        ? "Will request max allowance. Useful for saving gas on future requests."
                        : "Will request exact allowance for this transaction."
                      }
                    </p>
                  </div>
                </label>
              </div>

              {/* Info Container */}
              <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray4 dark:border dark:border-futarchyGray112/20 rounded-lg p-3 md:p-4">
                <h4 className="font-medium mb-1 text-black dark:text-futarchyGray112 text-xs">Redemption Information</h4>
                <p className="text-xs text-black dark:text-futarchyGray112">
                  You are redeeming your winning outcome tokens. This will convert your position tokens back to the underlying collateral tokens based on the market resolution.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="mb-6 relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="max-h-[240px] overflow-y-auto pr-2 -mr-2">
                <AnimatePresence>
                  {Object.entries(getUpdatedSteps() || {}).map(([step, data]) => (
                    <StepWithSubsteps
                      key={step}
                      step={parseInt(step)}
                      title={data.title}
                      substeps={data.substeps}
                      expanded={expandedSteps[step]}
                      onToggle={() => toggleStepExpansion(step)}
                      isProcessing={localIsProcessing}
                      currentSubstep={currentSubstep}
                      processingStep={localProcessingStep}
                      completedSubsteps={completedSubsteps}
                      isWinningOutcomeYes={isWinningOutcomeYes}
                      transactionParams={transactionParams}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {requiredChain.isWrongChain && !localIsProcessing && localProcessingStep !== "completed" && (
          <div className="p-2 bg-futarchyCrimson3 border border-futarchyCrimson5 rounded-lg text-futarchyCrimson11 text-sm">
            This market is on {requiredChain.requiredChainName}, but your wallet is on {requiredChain.walletChainName || "another network"}.
          </div>
        )}

        {/* Action Button */}
        <div className="">
          <button
            onClick={buttonAction}
            disabled={!buttonIsEnabled}
            className={buttonClasses}
          >
            {buttonContent}
          </button>
        </div>

        {(error || localError) && (
          <div className="mb-2 p-1 bg-red-50 border border-red-200 rounded-lg text-red-400 text-sm">
            {error || localError}
          </div>
        )}

        {/* Debug Info */}
        {DEBUG_MODE && debugInfo && (
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono border border-gray-200 dark:border-gray-700">
            <div className="font-bold mb-2 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-1">
              Safe Transaction Tracker
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-gray-500">Status:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">{debugInfo.status}</span>
              </div>

              <div className="text-gray-600 dark:text-gray-400">
                {debugInfo.message}
              </div>

              {debugInfo.safeTxHash && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="font-semibold text-gray-500 mb-1">Safe Tx Hash:</div>
                  <a
                    href={`https://app.safe.global/transactions/tx?safe=gno:${connectedWalletAddress}&id=${debugInfo.safeTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline break-all block"
                  >
                    {debugInfo.safeTxHash} ↗
                  </a>
                </div>
              )}

              {debugInfo.txHash && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="font-semibold text-gray-500 mb-1">On-Chain Tx Hash:</div>
                  <a
                    href={`https://gnosisscan.io/tx/${debugInfo.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 hover:underline break-all block"
                  >
                    {debugInfo.txHash} ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Return portal or null if no portal root
  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) return null;

  return ReactDOM.createPortal(modalContent, portalRoot);
};

RedemptionModal.propTypes = {
  title: PropTypes.string.isRequired,
  handleClose: PropTypes.func.isRequired,
  connectedWalletAddress: PropTypes.string,
  walletIcon: PropTypes.element,
  config: PropTypes.object.isRequired,
  winningTokens: PropTypes.object.isRequired,
  processingStep: PropTypes.string,
  isProcessing: PropTypes.bool,
  isProcessing: PropTypes.bool,
  error: PropTypes.string,
  useBlockExplorer: PropTypes.bool,
};

export default RedemptionModal; 
