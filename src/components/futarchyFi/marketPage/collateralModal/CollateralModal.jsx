import React, { useState, useEffect, useMemo } from "react";
import SafeDetector from "../../../debug/SafeDetector";
import { DEBUG_MODE } from "../../../../config/featureFlags";
import PropTypes from "prop-types";
import { motion, AnimatePresence } from "framer-motion";
import { formatBalance } from "../../../../utils/formatters";
import { ethers } from "ethers";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { FutarchyCartridge } from 'futarchy-sdk/executors/FutarchyCartridge';
// Import necessary constants and ABIs
import {
  ERC20_ABI,
  BASE_TOKENS_CONFIG,
  FUTARCHY_ROUTER_ADDRESS,
  FUTARCHY_ROUTER_ABI,
  MARKET_ADDRESS
} from "../constants/contracts";
import { getEthersSigner, isSafeWallet } from "../../../../utils/ethersAdapters";
// import { useContractConfig } from "../../../../hooks/useContractConfig";
import { waitForSafeTxReceipt } from "../../../../utils/waitForSafeTxReceipt";
import { useSafeDetection } from "../../../../hooks/useSafeDetection";
import { approvalAmountFor } from "../../../../utils/approvalAmount";

const toBN = (value) => ethers.BigNumber.from(value.toString());

// MetaMask icon component
const MetamaskIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.171-1.52-.5-2.187l-3.955-7.97A11.81 11.81 0 0 0 12 0a11.81 11.81 0 0 0-6.105 2.093l-3.955 7.97c-.329.667-.5 1.407-.5 2.187s.171 1.52.5 2.187l3.955 7.97A11.81 11.81 0 0 0 12 24a11.81 11.81 0 0 0 6.105-2.093l3.955-7.97c.329-.667.5-1.407.5-2.187z" />
  </svg>
);

// WalletInformation component - simplified to show only connected wallet
const WalletInformation = ({ walletAddress, walletIcon }) => {
  // Function to truncate address
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

// AlertContainer component
const AlertContainer = ({ alertContainerTitle, alertSupportText }) => (
  <div className="relative flex flex-col bg-white border border-futarchyGray6 rounded-lg p-4 gap-1">
    <div className="text-futarchyGray11 text-sm font-normal">
      <div className="text-futarchyGray12 text-sm font-medium">
        {alertContainerTitle}
      </div>
      {alertSupportText}
    </div>
  </div>
);

// Toggle Switch Component
const TokenToggle = ({ selectedToken, onToggle, getCurrencySymbol, getCompanySymbol }) => (
  <div className="flex items-center gap-2 md:gap-4 p-2 md:p-4 bg-white dark:bg-futarchyDarkGray4 border border-futarchyGray6 rounded-lg">
    <button
      onClick={() => onToggle("currency")}
      className={`px-3 py-1 text-sm md:px-4 md:py-2 rounded-md font-medium transition-colors ${selectedToken === "currency"
        ? "bg-futarchyGray12 text-white dark:bg-white dark:text-black"
        : "bg-white text-futarchyGray11 hover:bg-futarchyGray3 dark:bg-futarchyGray12 dark:border dark:border-futarchyGray112/40 dark:hover:bg-futarchyDarkGray4 dark:hover:border-white dark:hover:text-white"
        }`}
    >
      {getCurrencySymbol()}
    </button>
    <button
      onClick={() => onToggle("company")}
      className={`px-3 py-1 text-sm md:px-4 md:py-2 rounded-md font-medium transition-colors ${selectedToken === "company"
        ? "bg-futarchyGray12 text-white dark:bg-white dark:text-black"
        : "bg-white text-futarchyGray11 hover:bg-futarchyGray3 dark:bg-futarchyGray12 dark:border dark:border-futarchyGray112/40 dark:hover:bg-futarchyDarkGray4 dark:hover:border-white dark:hover:text-white"
        }`}
    >
      {getCompanySymbol()}
    </button>
  </div>
);

// Define steps data with substeps for both add and remove actions
export const COLLATERAL_STEPS = {
  add: {
    1: {
      title: "Futarchy Split Wrap",
      substeps: [
        {
          id: 1,
          text: "Approving token for Futarchy Split Wrap",
          completed: false,
        },
        { id: 2, text: "Minting position tokens", completed: false },
      ],
    },
  },
  remove: {
    1: {
      title: "Removing Collateral",
      substeps: [
        { id: 1, text: "Approving YES token for Router", completed: false },
        { id: 2, text: "Approving NO token for Router", completed: false },
        { id: 3, text: "Merging Positions", completed: false },
      ],
    },
  },
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

const StepWithSubsteps = ({
  step,
  title,
  substeps,
  expanded,
  onToggle,
  isProcessing,
  currentSubstep,
  processingStep,
  selectedTokenType,
  completedSubsteps,
  action,
}) => {
  // Determine if the entire step is active
  const isStepActive = processingStep && processingStep !== "completed";

  // Logic to determine if a specific substep is the one currently processing
  const isSubstepActive = (substep) => {
    if (!isStepActive) return false;

    if (action === "add") {
      if (substep.id === 1) {
        return processingStep === "baseTokenApproval";
      }
      if (substep.id === 2) {
        return processingStep === "mint";
      }
    } else if (action === "remove") {
      if (substep.id === 1) {
        return processingStep === "yesApproval";
      }
      if (substep.id === 2) {
        return processingStep === "noApproval";
      }
      if (substep.id === 3) {
        return processingStep === "merge";
      }
    }
    return false;
  };

  const getStepColors = () => {
    if (processingStep === "completed") {
      return selectedTokenType === "currency"
        ? "text-futarchyBlue11 bg-futarchyBlue3"
        : "text-futarchyEmerald11 bg-futarchyEmerald3";
    }
    if (isStepActive) {
      return selectedTokenType === "currency"
        ? "text-futarchyBlue11 bg-futarchyBlue3"
        : "text-futarchyEmerald11 bg-futarchyEmerald3";
    }
    return "text-futarchyGray8 bg-futarchyGray4";
  };

  // Determine which substep is currently active to decide if the main spinner should show
  const activeSubstepIndex = substeps.findIndex(isSubstepActive);

  const stepIconContainerClasses = () => {
    const colorClasses = getStepColors();
    // If the main step's spinner is active (i.e., a substep is active), remove the background class for transparency
    if (isStepActive && activeSubstepIndex !== -1) {
      return colorClasses
        .split(" ")
        .filter((cls) => !cls.startsWith("bg-"))
        .join(" ");
    }
    return colorClasses;
  };

  return (
    <motion.div
      initial={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, marginBottom: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${stepIconContainerClasses()}`}
        >
          {processingStep === "completed" ? (
            <CheckMark />
          ) : isStepActive ? (
            activeSubstepIndex !== -1 ? (
              <LoadingSpinner className="h-6 w-6" />
            ) : null
          ) : null}
        </div>
        <span
          className={`flex-1 text-sm md:text-base ${processingStep === "completed"
            ? "text-futarchyGray12 dark:text-futarchyGray3"
            : isStepActive
              ? "text-futarchyGray12 dark:text-futarchyGray3"
              : "text-futarchyGray11 dark:text-futarchyGray3"
            }`}
        >
          {title}
        </span>
        <button
          onClick={onToggle}
          className="text-futarchyBlue11 hover:text-futarchyBlue9 text-xs md:text-sm"
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
            {substeps.map((substep) => {
              const isActive = isSubstepActive(substep);
              const isCompleted = substep.completed;

              return (
                <div key={substep.id} className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${isCompleted
                      ? selectedTokenType === "currency"
                        ? "text-futarchyBlue11"
                        : "text-futarchyEmerald11"
                      : isActive
                        ? selectedTokenType === "currency"
                          ? "text-futarchyBlue11"
                          : "text-futarchyEmerald11"
                        : ""
                      }`}
                  >
                    {isCompleted ? (
                      <CheckMark />
                    ) : isActive ? (
                      <LoadingSpinner />
                    ) : null}
                  </div>
                  <span
                    className={`text-xs md:text-sm ${isCompleted
                      ? "text-futarchyGray12 dark:text-futarchyGray3"
                      : isActive
                        ? "text-futarchyGray12 dark:text-futarchyGray3"
                        : "text-futarchyGray11 dark:text-futarchyGray3"
                      }`}
                  >
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

// getEthersSigner imported from utils

const CollateralModal = ({
  title,
  supportText,
  handleClose,
  connectedWalletAddress,
  walletIcon = <MetamaskIcon />,
  alertContainerTitle,
  alertSupportText,
  tokenConfig,
  balances,
  processingStep,
  currentSubstep = { step: 1, substep: 0 },
  isProcessing = false,
  useBlockExplorer = false,
  action = "add",
  onSafeTransaction,
  error,
  useSDK = false,
  config,
  configLoading,
  proposalId
}) => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address: account, isConnected } = useAccount();
  // const { config, isLoading: configLoading } = useContractConfig();
  const { isSafe, isLoading: isSafeLoading, safeInfo } = useSafeDetection();

  const [debugInfo, setDebugInfo] = useState(null);

  // Helper to update debug info
  const updateDebugInfo = (info) => {
    setDebugInfo(prev => ({ ...prev, ...info }));
  };

  // Derive signer from wagmi clients
  const signer = useMemo(() => {
    if (!walletClient) {
      console.log('No wallet client available for signer creation');
      return null;
    }

    const ethersSigner = getEthersSigner(walletClient, publicClient);

    console.log('CollateralModal signer created:', {
      hasSigner: !!ethersSigner,
      signerType: ethersSigner?._isSigner ? 'custom' : 'web3provider'
    });

    return ethersSigner;
  }, [walletClient, publicClient]);

  // Local state for modal functionality
  const [selectedTokenType, setSelectedTokenType] = useState("currency");
  const [amount, setAmount] = useState("");
  const [nativeBalance, setNativeBalance] = useState("0");
  const [expandedSteps, setExpandedSteps] = useState({ 1: true }); // Fix: Use object instead of Set
  const [completedSubsteps, setCompletedSubsteps] = useState(new Set());
  const [transactionStates, setTransactionStates] = useState({
    approval: false,
    mint: false,
  });
  const [approvalStates, setApprovalStates] = useState({
    currency: { baseToken: false, yesToken: false, noToken: false },
    company: { baseToken: false, yesToken: false, noToken: false },
  });
  const [localProcessingStep, setLocalProcessingStep] = useState(undefined);
  const [localError, setLocalError] = useState(null);
  const [currentSubstepState, setCurrentSubstep] = useState(currentSubstep);

  // Helper functions for dynamic token symbols
  const getCurrencySymbol = () => config?.BASE_TOKENS_CONFIG?.currency?.symbol || tokenConfig?.currency?.symbol || 'CURRENCY';
  const getCompanySymbol = () => config?.BASE_TOKENS_CONFIG?.company?.symbol || tokenConfig?.company?.symbol || 'COMPANY';

  // Helper to get native token symbol based on chain
  const getNativeTokenSymbol = () => {
    // First try tokenConfig if provided
    if (tokenConfig?.nativeCoin?.symbol) {
      return tokenConfig.nativeCoin.symbol;
    }

    // Otherwise, determine from chainId
    const chainId = config?.chainId || walletClient?.chain?.id || publicClient?.chain?.id;

    switch (chainId) {
      case 1: // Ethereum Mainnet
        return 'ETH';
      case 100: // Gnosis Chain
        return 'xDAI';
      case 137: // Polygon
        return 'MATIC';
      case 42161: // Arbitrum
        return 'ETH';
      case 10: // Optimism
        return 'ETH';
      default:
        return 'xDAI'; // Default fallback
    }
  };

  // Reset amount and selected token when modal opens
  React.useEffect(() => {
    if (!processingStep) {
      setAmount("");
      setSelectedTokenType("currency");
    }
  }, [isProcessing]);

  // Enhanced handleTokenApproval function using wagmi publicClient for accurate allowance reading
  const handleTokenApproval = async (tokenAddress, spenderAddress, amount, tokenType, tokenSymbol) => {
    if (!walletClient || !publicClient) {
      throw new Error("Wallet not connected properly");
    }

    try {
      console.log(`[CollateralModal] Checking ${tokenSymbol} allowance...`);

      // Use JSON ABI format for publicClient calls
      const ERC20_JSON_ABI = [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" }
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        }
      ];

      // Use publicClient for accurate allowance reading
      const currentAllowanceRaw = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_JSON_ABI,
        functionName: "allowance",
        args: [account || connectedWalletAddress, spenderAddress],
      });

      console.log(`[CollateralModal] Current ${tokenSymbol} allowance:`, currentAllowanceRaw.toString());
      console.log(`[CollateralModal] Required amount:`, amount.toString());

      // convert bigint → ethers BigNumber
      const currentAllowance = ethers.BigNumber.from(
        currentAllowanceRaw.toString()
      );
      
      const needsApproval = currentAllowance.lt(amount);      

      if (needsApproval) {
        console.log(`[CollateralModal] Approving ${tokenSymbol} for ${spenderAddress}...`);

        // Use the wagmi signer for approval
        if (!signer) {
          throw new Error("No signer available");
        }

        // Use string format ABI for ethers Contract
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          signer
        );

        const approveTx = await tokenContract.approve(
          spenderAddress,
          approvalAmountFor(amount, useUnlimitedApproval)
        );
        console.log(`[CollateralModal] ${tokenSymbol} approval transaction sent:`, approveTx.hash);

        // Check for Safe wallet
        if (isSafeWallet(walletClient)) {
          if (!useBlockExplorer) {
            console.log('[CollateralModal] Safe wallet detected - skipping wait() and auto-closing');
            onSafeTransaction?.(); // Trigger toast
            handleClose(); // Auto-close for Safe
            throw new Error("SAFE_TRANSACTION_SENT"); // Signal to stop execution
          } else {
            console.log('[CollateralModal] Safe wallet detected - waiting for execution via Safe API');
            const chainId = await walletClient.getChainId();
            await waitForSafeTxReceipt({
              chainId,
              safeTxHash: approveTx.hash,
              publicClient
            });
          }
        } else {
          await approveTx.wait();
        }
        console.log(`[CollateralModal] ${tokenSymbol} approved successfully`);

        // Verify allowance after approval using publicClient
        const newAllowanceRaw = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_JSON_ABI,
          functionName: "allowance",
          args: [account || connectedWalletAddress, spenderAddress],
        });
        
        const newAllowance = ethers.BigNumber.from(
          newAllowanceRaw.toString()
        );

        console.log(`[CollateralModal] New ${tokenSymbol} allowance:`, newAllowance.toString());

        if (newAllowance.lt(amount)) {
          throw new Error(`Allowance is still insufficient after approval for ${tokenSymbol}`);
        }

        return true; // Approval was needed and completed
      } else {
        console.log(`[CollateralModal] ${tokenSymbol} already has sufficient allowance`);
        return false; // No approval was needed
      }
    } catch (error) {
      console.error(`[CollateralModal] Error in handleTokenApproval for ${tokenSymbol}:`, error);
      throw error;
    }
  };

  // SIMPLIFIED INPUT VALIDATION LOGIC

  // Clean and validate input amount
  const sanitizeAmount = (input) => {
    if (!input) return "";

    // Remove any non-numeric characters except decimal point
    let cleaned = input.toString().replace(/[^0-9.]/g, '');

    // Handle multiple decimal points - keep only the first one
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }

    // Remove leading zeros (except for "0." cases)
    if (cleaned.length > 1 && cleaned[0] === '0' && cleaned[1] !== '.') {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  };

  // Get available balance as a string (avoiding floating-point precision issues)
  const getAvailableBalance = () => {
    try {
      if (action === "add") {
        // For adding collateral, use wallet balance
        const balance = selectedTokenType === "currency" ? balances?.wxdai : balances?.faot;
        return balance || '0';
      } else {
        // For removing collateral, use minimum of YES/NO wrapped positions
        // CRITICAL: Use wrapped balances which are the actual ERC20 tokens we'll merge
        // Using .wrapped instead of .total because those are the actual token balances on-chain
        const currencyYes = balances?.currencyYes?.wrapped || balances?.currencyYes?.total || '0';
        const currencyNo = balances?.currencyNo?.wrapped || balances?.currencyNo?.total || '0';
        const companyYes = balances?.companyYes?.wrapped || balances?.companyYes?.total || '0';
        const companyNo = balances?.companyNo?.wrapped || balances?.companyNo?.total || '0';

        if (selectedTokenType === "currency") {
          // Convert to BigNumber for precise comparison, preserving all decimals
          const yesWei = ethers.utils.parseUnits(currencyYes.toString(), 18);
          const noWei = ethers.utils.parseUnits(currencyNo.toString(), 18);
          const minWei = yesWei.lt(noWei) ? yesWei : noWei;
          // Format with full precision - ethers.js formatUnits preserves all 18 decimals
          const fullBalance = ethers.utils.formatUnits(minWei, 18);

          console.log('[CollateralModal] Currency balance calculation:', {
            currencyYes,
            currencyNo,
            yesWei: yesWei.toString(),
            noWei: noWei.toString(),
            minWei: minWei.toString(),
            fullBalance,
            usingWrapped: true
          });

          return fullBalance;
        } else {
          // Convert to BigNumber for precise comparison, preserving all decimals
          const yesWei = ethers.utils.parseUnits(companyYes.toString(), 18);
          const noWei = ethers.utils.parseUnits(companyNo.toString(), 18);
          const minWei = yesWei.lt(noWei) ? yesWei : noWei;
          // Format with full precision - ethers.js formatUnits preserves all 18 decimals
          const fullBalance = ethers.utils.formatUnits(minWei, 18);

          console.log('[CollateralModal] Company balance calculation:', {
            companyYes,
            companyNo,
            yesWei: yesWei.toString(),
            noWei: noWei.toString(),
            minWei: minWei.toString(),
            fullBalance,
            usingWrapped: true
          });

          return fullBalance;
        }
      }
    } catch (error) {
      console.error('Error getting available balance:', error);
      return '0';
    }
  };

  // Simple amount validation using BigNumber precision
  const isAmountValid = () => {
    try {
      // Check if amount is empty or zero
      if (!amount || amount === "" || amount === "0" || amount === "0.") {
        return false;
      }

      // Parse the amount as a number for basic validation
      const numAmount = parseFloat(amount);

      // Check if it's a valid number
      if (isNaN(numAmount) || numAmount <= 0) {
        return false;
      }

      // Check if it's not greater than available balance using BigNumber precision
      const availableBalance = getAvailableBalance();
      try {
        const amountWei = ethers.utils.parseUnits(amount, 18);
        const availableWei = ethers.utils.parseUnits(availableBalance.toString(), 18);

        // Use BigNumber comparison to avoid floating-point errors
        if (amountWei.gt(availableWei)) {
          return false;
        }
      } catch (parseError) {
        console.error('Error parsing amounts for comparison:', parseError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating amount:', error);
      return false;
    }
  };

  // Handle amount input changes
  const handleAmountChange = (e) => {
    const rawValue = e.target.value;
    const cleanValue = sanitizeAmount(rawValue);
    setAmount(cleanValue);
  };

  // Handle max button click - use exact balance without any rounding
  const handleMaxClick = () => {
    const maxBalance = getAvailableBalance();

    // Use the exact balance value without any safety buffer or rounding
    // The balance calculation already gives us the precise minimum, so we use it as-is
    console.log('[CollateralModal] Max click - using exact balance:', {
      maxBalance,
      action
    });

    setAmount(maxBalance);
  };

  // Handle token type toggle
  const handleTokenToggle = (type) => {
    setSelectedTokenType(type);
    setAmount(""); // Reset amount when switching tokens
  };

  React.useEffect(() => {
    setCurrentSubstep(currentSubstep);
  }, [currentSubstep]);

  React.useEffect(() => {
    setLocalProcessingStep(processingStep);
  }, [processingStep]);

  React.useEffect(() => {
    // When the connected wallet changes, reset processing step and related states
    setLocalProcessingStep(undefined);
    setApprovalStates({
      currency: {
        baseToken: false,
        yesToken: false,
        noToken: false,
      },
      company: {
        baseToken: false,
        yesToken: false,
        noToken: false,
      },
    });
    setCompletedSubsteps(new Set());
  }, [connectedWalletAddress, account]);

  // Effect to fetch native xDAI balance
  useEffect(() => {
    const fetchNativeBalance = async () => {
      const walletAddress = account || connectedWalletAddress;
      if (walletAddress && publicClient) {
        try {
          const balance = await publicClient.getBalance({ address: walletAddress });
          setNativeBalance(balance.toString()); // balance is a BigNumber, store as string (Wei)
          console.log(
            "CollateralModal: Fetched native balance (Wei):",
            balance.toString()
          );
        } catch (error) {
          console.error("Error fetching native balance:", error);
          setNativeBalance("0");
        }
      }
    };

    fetchNativeBalance();
  }, [account, connectedWalletAddress, publicClient]);

  // Effect to check existing approvals when modal opens
  useEffect(() => {
    const checkExistingApprovals = async () => {
      if (!publicClient || !account || !config || configLoading || processingStep) {
        return; // Don't check if already processing or config not loaded
      }

      try {
        console.log('[CollateralModal] Checking existing approvals for:', selectedTokenType, action);

        // JSON ABI for allowance checking
        const ERC20_JSON_ABI = [{
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" }
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        }];

        const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
        const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;

        if (action === "add") {
          // Check base token approval for add action
          const baseToken = selectedTokenType === "currency"
            ? baseTokensConfig.currency
            : baseTokensConfig.company;

          if (baseToken?.address) {
            const allowanceRaw = await publicClient.readContract({
              address: baseToken.address,
              abi: ERC20_JSON_ABI,
              functionName: "allowance",
              args: [account, routerAddress]
            });
            const allowance = ethers.BigNumber.from(allowanceRaw.toString());

            // If allowance is greater than 0, consider it approved
            const isApproved = allowance.gt(0);
            console.log(`[CollateralModal] ${baseToken.symbol} approval status:`, isApproved, allowance.toString());

            if (isApproved) {
              setApprovalStates(prev => ({
                ...prev,
                [selectedTokenType]: {
                  ...prev[selectedTokenType],
                  baseToken: true
                }
              }));
              markSubstepCompleted(1, 0);
            }
          }
        } else if (action === "remove") {
          // Check YES and NO token approvals for remove action
          const mergeConfig = config?.MERGE_CONFIG;

          if (mergeConfig) {
            const yesTokenAddress = selectedTokenType === "currency"
              ? mergeConfig.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
              : mergeConfig.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress;
            const noTokenAddress = selectedTokenType === "currency"
              ? mergeConfig.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
              : mergeConfig.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

            if (yesTokenAddress && noTokenAddress) {
              const [yesAllowance, noAllowance] = await Promise.all([
                publicClient.readContract({
                  address: yesTokenAddress,
                  abi: ERC20_JSON_ABI,
                  functionName: "allowance",
                  args: [account, routerAddress]
                }),
                publicClient.readContract({
                  address: noTokenAddress,
                  abi: ERC20_JSON_ABI,
                  functionName: "allowance",
                  args: [account, routerAddress]
                })
              ]);

              const yesApproved = yesAllowance > 0n;
              const noApproved = noAllowance > 0n;

              console.log(`[CollateralModal] YES token approval:`, yesApproved, yesAllowance.toString());
              console.log(`[CollateralModal] NO token approval:`, noApproved, noAllowance.toString());

              setApprovalStates(prev => ({
                ...prev,
                [selectedTokenType]: {
                  ...prev[selectedTokenType],
                  yesToken: yesApproved,
                  noToken: noApproved
                }
              }));

              if (yesApproved) {
                markSubstepCompleted(1, 0);
              }
              if (noApproved) {
                markSubstepCompleted(1, 1);
              }
            }
          }
        }
      } catch (error) {
        console.error('[CollateralModal] Error checking existing approvals:', error);
      }
    };

    checkExistingApprovals();
  }, [publicClient, account, config, configLoading, selectedTokenType, action, processingStep]);

  // Map MetaMask steps to our internal steps
  const getStepFromProcessingStep = (step) => {
    if (action === "add") {
      const stepMapping = {
        baseTokenApproval: { step: 1, substep: 1 },
        mint: { step: 1, substep: 2 },
        completed: { step: 1, substep: 3 },
      };
      return stepMapping[step] || { step: 1, substep: 0 };
    } else {
      const stepMapping = {
        yesApproval: { step: 1, substep: 1 },
        noApproval: { step: 1, substep: 2 },
        merge: { step: 1, substep: 3 },
        completed: { step: 1, substep: 4 },
      };
      return stepMapping[step] || { step: 1, substep: 0 };
    }
  };

  // Update approval states when processing steps change
  React.useEffect(() => {
    const currentStep = localProcessingStep || processingStep; // Use local step if available
    if (currentStep) {
      console.log("=== CollateralModal Step Debug Info ===");
      console.log("Processing Step:", currentStep);
      console.log("Current Approvals:", approvalStates);
      console.log("Current Transactions:", transactionStates);

      if (action === "add") {
        // Update states based on the processing step
        switch (currentStep) {
          case "baseTokenApproval":
            // Approval in progress; do not mark as approved until confirmed
            setTransactionStates((prev) => ({ ...prev, mint: false }));
            break;
          case "mint":
            // Once mint is underway, mark the token as approved so the approval step is checkmarked
            setApprovalStates((prev) => ({
              ...prev,
              [selectedTokenType]: {
                ...prev[selectedTokenType],
                baseToken: true,
              },
            }));
            // Ensure the approval substep is marked as completed
            markSubstepCompleted(1, 0);
            setTransactionStates((prev) => ({ ...prev, mint: false }));
            break;
          case "completed":
            setApprovalStates((prev) => ({
              ...prev,
              [selectedTokenType]: {
                ...prev[selectedTokenType],
                baseToken: true,
              },
            }));
            setTransactionStates((prev) => ({ ...prev, mint: true }));
            break;
        }
      } else {
        // Update states for remove collateral flow
        switch (currentStep) {
          case "yesApproval":
            // Approval for YES token in progress; do nothing yet
            break;
          case "noApproval":
            // Once we move to noApproval, mark YES token as approved and mark substep 1 as completed
            setApprovalStates((prev) => ({
              ...prev,
              [selectedTokenType]: {
                ...prev[selectedTokenType],
                yesToken: true,
              },
            }));
            markSubstepCompleted(1, 0);
            setCurrentSubstep({ step: 1, substep: 2 });
            break;
          case "merge":
            // When we are at merge, mark NO token as approved and mark substep 2 as completed
            setApprovalStates((prev) => ({
              ...prev,
              [selectedTokenType]: {
                ...prev[selectedTokenType],
                yesToken: true, // Ensure YES approval is preserved
                noToken: true,
              },
            }));
            // Mark both approval substeps as completed
            markSubstepCompleted(1, 0); // YES token approval
            markSubstepCompleted(1, 1); // NO token approval
            setTransactionStates((prev) => ({ ...prev, merge: false }));
            setCurrentSubstep({ step: 1, substep: 3 });
            break;
          case "completed":
            setApprovalStates((prev) => ({
              ...prev,
              [selectedTokenType]: {
                ...prev[selectedTokenType],
                yesToken: true,
                noToken: true,
              },
            }));
            setTransactionStates((prev) => ({ ...prev, merge: true }));
            markSubstepCompleted(1, 0);
            markSubstepCompleted(1, 1);
            markSubstepCompleted(1, 2);
            setCurrentSubstep({ step: 1, substep: 4 });
            break;
          default:
            break;
        }
      }
    }
  }, [processingStep, localProcessingStep, action, selectedTokenType]);

  // Reset states when modal closes or action changes
  React.useEffect(() => {
    if (action === "add") {
      setApprovalStates({
        currency: {
          baseToken: false,
          yesToken: false,
          noToken: false,
        },
        company: {
          baseToken: false,
          yesToken: false,
          noToken: false,
        },
      });
      setTransactionStates({
        mint: false,
      });
    } else {
      setApprovalStates({
        currency: {
          yesToken: false,
          noToken: false,
        },
        company: {
          yesToken: false,
          noToken: false,
        },
      });
      setTransactionStates({
        merge: false,
      });
    }
  }, [action]);

  // Update isStepCompleted function with better debug logging
  const isStepCompleted = (stepType, step) => {
    console.log("=== DEBUG START COLLATERAL STEP CHECK ===");
    console.log({
      stepType,
      step,
      action,
      processingStep,
      currentSubstep,
      approvalStates: JSON.stringify(approvalStates, null, 2),
      completedSubsteps: Array.from(completedSubsteps),
    });

    if (!stepType || !step) return false;

    if (action === "remove") {
      if (stepType === "approval") {
        if (step === "yesToken") {
          return approvalStates[selectedTokenType].yesToken || completedSubsteps.has("1-0");
        }
        if (step === "noToken") {
          return approvalStates[selectedTokenType].noToken || completedSubsteps.has("1-1");
        }
      }
      if (stepType === "transaction" && step === "merge") {
        return transactionStates.merge || completedSubsteps.has("1-2");
      }
    } else {
      // action === 'add'
      if (stepType === "approval" && step === "baseToken") {
        return approvalStates[selectedTokenType].baseToken || completedSubsteps.has("1-0");
      }
      if (stepType === "transaction" && step === "mint") {
        return transactionStates.mint || completedSubsteps.has("1-1");
      }
    }

    return false;
  };

  // Update COLLATERAL_STEPS based on completion status
  const getUpdatedSteps = () => {
    const steps = COLLATERAL_STEPS[action];
    if (action === "add") {
      return {
        ...steps,
        1: {
          ...steps[1],
          substeps: steps[1].substeps.map((substep) => {
            let stepKey;
            let stepType;

            if (substep.id === 1) {
              stepKey = "baseToken";
              stepType = "approval";
            } else if (substep.id === 2) {
              stepKey = "mint";
              stepType = "transaction";
            }

            return {
              ...substep,
              completed: isStepCompleted(stepType, stepKey),
            };
          }),
        },
      };
    } else {
      return {
        ...steps,
        1: {
          ...steps[1],
          substeps: steps[1].substeps.map((substep) => {
            const stepKey =
              substep.id === 1
                ? "yesToken"
                : substep.id === 2
                  ? "noToken"
                  : "merge";

            const stepType = substep.id === 3 ? "transaction" : "approval";

            return {
              ...substep,
              completed: isStepCompleted(stepType, stepKey),
            };
          }),
        },
      };
    }
  };



  const toggleStepExpansion = (step) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [step]: !prev[step],
    }));
  };



  // Approval preference state
  const [useUnlimitedApproval, setUseUnlimitedApproval] = useState(false);

  // Add this helper function
  const markSubstepCompleted = (step, substep) => {
    console.log(`Marking substep ${step}-${substep} as completed`);
    setCompletedSubsteps((prev) => new Set([...prev, `${step}-${substep}`]));
  };

  // Add debug logging helper
  const logDebug = (data) => {
    console.log("=== CollateralModal Debug ===", {
      ...data,
      currentState: {
        approvalStates,
        completedSubsteps: Array.from(completedSubsteps),
      },
    });
  };

  // Update handleCollateralAction to handle errors gracefully
  const handleCollateralAction = async (tokenType, amount) => {
    // Check if wallet is properly connected before proceeding
    if (!isConnected || !account || !signer) {
      setLocalError("Please connect your wallet first");
      return;
    }

    try {
      console.log('[CollateralModal] Starting transaction with:', {
        connectedAccount: account,
        walletType: walletClient?.connector?.name,
        isConnected,
        action
      });

      // Reset states at the start
      setCompletedSubsteps(new Set());
      // --- SDK INTEGRATION START ---
      if (useSDK) {
        console.log('[CollateralModal] Using SDK for operation:', action);
        const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
        const marketAddress = config?.MARKET_ADDRESS || MARKET_ADDRESS;

        // Initialize Cartridge
        const cartridge = new FutarchyCartridge(routerAddress);

        if (action === "add") {
          // --- SDK SPLIT (ADD) ---
          setLocalProcessingStep("baseTokenApproval");
          setCurrentSubstep({ step: 1, substep: 1 });

          const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;
          const baseToken = tokenType === "currency" ? baseTokensConfig.currency : baseTokensConfig.company;

          // Execute completeSplit
          const iterator = cartridge.completeSplit({
            proposal: marketAddress,
            collateralToken: baseToken.address,
            amount: amount.toString(),
            exactApproval: !useUnlimitedApproval,
            useBlockExplorer
          }, { publicClient, walletClient, account });

          for await (const status of iterator) {
            console.log('[CollateralModal] SDK Status:', status);

            // Map SDK steps to UI steps
            if (status.step.includes('approv')) {
              setLocalProcessingStep("baseTokenApproval");
              if (status.step === 'approved' || status.step === 'already_approved') {
                markSubstepCompleted(1, 0);
                setApprovalStates(prev => ({
                  ...prev,
                  [tokenType]: { ...prev[tokenType], baseToken: true }
                }));
              }
            } else if (status.step.includes('split')) {
              setLocalProcessingStep("mint");
              setCurrentSubstep({ step: 1, substep: 2 });
              if (status.step === 'complete') {
                markSubstepCompleted(1, 1);
                setTransactionStates(prev => ({ ...prev, mint: true }));
              }
            } else if (status.step === 'complete') {
              setLocalProcessingStep("completed");
              setCurrentSubstep({ step: 1, substep: 3 });
            }
          }

        } else if (action === "remove") {
          // --- SDK MERGE (REMOVE) ---
          setLocalProcessingStep("yesApproval");
          setCurrentSubstep({ step: 1, substep: 1 });

          const mergeConfig = config?.MERGE_CONFIG;
          const yesTokenAddress = tokenType === "currency"
            ? mergeConfig.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
            : mergeConfig.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress;
          const noTokenAddress = tokenType === "currency"
            ? mergeConfig.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
            : mergeConfig.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

          const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;
          const baseToken = tokenType === "currency" ? baseTokensConfig.currency : baseTokensConfig.company;

          // Execute completeMerge
          const iterator = cartridge.completeMerge({
            proposal: marketAddress,
            collateralToken: baseToken.address,
            amount: amount.toString(),
            yesToken: yesTokenAddress,
            noToken: noTokenAddress,
            exactApproval: !useUnlimitedApproval,
            useBlockExplorer
          }, { publicClient, walletClient, account });

          for await (const status of iterator) {
            console.log('[CollateralModal] SDK Status:', status);

            // Map SDK steps to UI steps
            if (status.step.includes('yes_approv')) {
              setLocalProcessingStep("yesApproval");
              if (status.step === 'yes_approved' || status.step === 'yes_already_approved') {
                markSubstepCompleted(1, 0);
                setApprovalStates(prev => ({
                  ...prev,
                  [tokenType]: { ...prev[tokenType], yesToken: true }
                }));
                // Move to next step visually
                setLocalProcessingStep("noApproval");
                setCurrentSubstep({ step: 1, substep: 2 });
              }
            } else if (status.step.includes('no_approv')) {
              setLocalProcessingStep("noApproval");
              if (status.step === 'no_approved' || status.step === 'no_already_approved') {
                markSubstepCompleted(1, 1);
                setApprovalStates(prev => ({
                  ...prev,
                  [tokenType]: { ...prev[tokenType], noToken: true }
                }));
              }
            } else if (status.step.includes('merg')) {
              setLocalProcessingStep("merge");
              setCurrentSubstep({ step: 1, substep: 3 });
              if (status.step === 'complete') {
                markSubstepCompleted(1, 2);
                setTransactionStates(prev => ({ ...prev, merge: true }));
              }
            } else if (status.step === 'complete') {
              setLocalProcessingStep("completed");
              setCurrentSubstep({ step: 1, substep: 4 });
            }
          }
        }

        console.log('[CollateralModal] SDK Operation Completed Successfully');
        return; // Exit function, skipping legacy logic
      }

      if (action === "add") {
        setApprovalStates((prev) => ({
          ...prev,
          [tokenType]: {
            baseToken: false,
            yesToken: false,
            noToken: false,
          },
        }));

        // Set initial step and substep for add
        setLocalProcessingStep("baseTokenApproval");
        setCurrentSubstep({ step: 1, substep: 1 });

        // Use config-based token configuration with fallback to default
        const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;
        const baseToken = tokenType === "currency"
          ? baseTokensConfig.currency
          : baseTokensConfig.company;

        // Convert amount to wei
        const amountInWei = ethers.utils.parseUnits(amount.toString(), 18);

        // Check base token balance using publicClient
        const balanceRaw = await publicClient.readContract({
          address: baseToken.address,
          abi: [
            {
              inputs: [{ name: "account", type: "address" }],
              name: "balanceOf",
              outputs: [{ name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function"
            }
          ],
          functionName: "balanceOf",
          args: [account]
        });

        const balance = ethers.BigNumber.from(balanceRaw.toString());

        logDebug({
          event: "Balance check",
          balance: balance.toString(),
          required: amountInWei.toString(),
          tokenType,
        });

        if (balance.lt(amountInWei)) {
          throw new Error(`Insufficient ${baseToken.symbol} balance`);
        }

        // Handle base token approval using enhanced function with wagmi publicClient
        const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;
        const approvalSuccess = await handleTokenApproval(
          baseToken.address,
          routerAddress,
          amountInWei,
          tokenType,
          baseToken.symbol
        );

        if (approvalSuccess) {
          markSubstepCompleted(1, 0);
          setApprovalStates((prev) => ({
            ...prev,
            [tokenType]: {
              ...prev[tokenType],
              baseToken: true,
            },
          }));
        } else {
          // Even if no approval was needed, mark it as completed since it's already approved
          markSubstepCompleted(1, 0);
          setApprovalStates((prev) => ({
            ...prev,
            [tokenType]: {
              ...prev[tokenType],
              baseToken: true,
            },
          }));
        }

        setLocalProcessingStep("mint");
        setCurrentSubstep({ step: 1, substep: 2 });

        // Create router contract and execute split
        const futarchyRouter = new ethers.Contract(
          routerAddress,
          FUTARCHY_ROUTER_ABI,
          signer
        );

        logDebug({
          event: "Executing split position",
          tokenType,
          amount: amountInWei.toString(),
        });

        // Use market address from config with fallback
        const marketAddress = config?.MARKET_ADDRESS || MARKET_ADDRESS;

        // Use a high hardcoded gas limit
        const splitTx = await futarchyRouter.splitPosition(
          marketAddress,
          baseToken.address,
          amountInWei,
          {
            gasLimit: 2000000, // High fixed gas limit of 2M
            type: 2, // Ensure EIP-1559 transaction type
            maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"), // 1.5 Gwei
            maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"), // 1 Gwei
          }
        );

        // Always update debug info with detection result
        const debugData = {
          status: isSafe ? 'Safe Wallet Detected' : 'Standard Wallet Detected',
          message: `Wallet Type: ${walletClient?.connector?.name || 'Unknown'}`,
          isSafe,
          useBlockExplorer,
          // Extra debug fields
          referrer: typeof document !== 'undefined' ? document.referrer : 'N/A',
          isSafeFlag: typeof window !== 'undefined' ? String(window.ethereum?.isSafe) : 'N/A',
          isSafeAppFlag: typeof window !== 'undefined' ? String(window.ethereum?.isSafeApp) : 'N/A',
          connectorId: walletClient?.connector?.id || 'N/A',
          safeInfo: safeInfo ? `Connected to ${safeInfo.safeAddress}` : 'No Info'
        };
        updateDebugInfo(debugData);

        if (isSafe) {
          if (!useBlockExplorer) {
            console.log('[CollateralModal] Safe wallet detected - skipping wait() and auto-closing');
            markSubstepCompleted(1, 1);
            setTransactionStates((prev) => ({ ...prev, mint: true }));
            setLocalProcessingStep("completed");
            setCurrentSubstep({ step: 1, substep: 3 });
            onSafeTransaction?.(); // Trigger toast
            handleClose(); // Auto-close for Safe
            return;
          } else {
            console.log('[CollateralModal] Safe wallet detected - waiting for execution via Safe API');
            updateDebugInfo({
              isSafe: true,
              useBlockExplorer: true,
              safeTxHash: splitTx.hash,
              status: 'Initializing Safe polling...'
            });
            const chainId = await walletClient.getChainId();
            await waitForSafeTxReceipt({
              chainId,
              safeTxHash: splitTx.hash,
              publicClient,
              onStatus: (status) => {
                console.log('[CollateralModal] Safe Status Update:', status);
                updateDebugInfo(status);
              }
            });
            updateDebugInfo({ status: 'Safe execution confirmed!' });
          }
        } else {
          await splitTx.wait();
        }

        // Mark split complete and set to completed state
        markSubstepCompleted(1, 1);
        setTransactionStates((prev) => ({ ...prev, mint: true }));

        console.log('[CollateralModal] Split transaction completed successfully');

        // Small delay to ensure state updates are processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Set processing step to completed to show completion UI
        setLocalProcessingStep("completed");
        setCurrentSubstep({ step: 1, substep: 3 }); // Move to final substep

        console.log('[CollateralModal] State updated to completed');

      } else if (action === "remove") {
        // Handle remove collateral logic
        setApprovalStates((prev) => ({
          ...prev,
          [tokenType]: {
            baseToken: false,
            yesToken: false,
            noToken: false,
          },
        }));

        // Set initial step for remove
        setLocalProcessingStep("yesApproval");
        setCurrentSubstep({ step: 1, substep: 1 });

        // Convert amount to wei
        const amountInWei = ethers.utils.parseUnits(amount.toString(), 18);

        // Get YES and NO token addresses from config MERGE_CONFIG
        const mergeConfig = config?.MERGE_CONFIG;

        if (!mergeConfig) {
          throw new Error("MERGE_CONFIG not available in contract configuration");
        }

        // Get token addresses directly from MERGE_CONFIG structure (keeping .wrap as it's in the config)
        const yesTokenAddress = tokenType === "currency"
          ? mergeConfig.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
          : mergeConfig.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress;
        const noTokenAddress = tokenType === "currency"
          ? mergeConfig.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
          : mergeConfig.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

        console.log('[CollateralModal] Remove - Token addresses from config:', {
          tokenType,
          yesTokenAddress,
          noTokenAddress,
          mergeConfig
        });

        if (!yesTokenAddress || !noTokenAddress) {
          throw new Error(`Token addresses not found in config for ${tokenType}. YES: ${yesTokenAddress}, NO: ${noTokenAddress}`);
        }

        // Check YES and NO token balances
        const ERC20_BALANCE_ABI = [
          {
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function"
          }
        ];

        const yesBalanceRaw = await publicClient.readContract({
          address: yesTokenAddress,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [account]
        });

        const noBalanceRaw = await publicClient.readContract({
          address: noTokenAddress,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [account]
        });

        console.log('[CollateralModal] Remove - Token balances:', {
          yesBalanceRaw: yesBalanceRaw.toString(),
          noBalanceRaw: noBalanceRaw.toString(),
          amountInWei: amountInWei.toString(),
          comparison: {
            yesHasEnough: toBN(yesBalanceRaw).gte(amountInWei),
            noHasEnough: toBN(noBalanceRaw).gte(amountInWei),
          },
        });

        // Check if user has enough of both tokens using BigNumber comparison
        const yesBalanceBN = ethers.BigNumber.from(yesBalanceRaw.toString());
        const noBalanceBN = ethers.BigNumber.from(noBalanceRaw.toString());

        if (yesBalanceBN.lt(amountInWei) || noBalanceBN.lt(amountInWei)) {
          console.error('[CollateralModal] Insufficient balance detected:', {
            yesBalance: ethers.utils.formatUnits(yesBalance, 18),
            noBalance: ethers.utils.formatUnits(noBalance, 18),
            amountRequested: amount,
            shortfall: {
              yes: yesBalanceBN.lt(amountInWei)
                ? ethers.utils.formatUnits(amountInWei.sub(yesBalanceBN), 18)
                : '0',
              no: noBalanceBN.lt(amountInWei)
                ? ethers.utils.formatUnits(amountInWei.sub(noBalanceBN), 18)
                : '0',
            }
          });
          throw new Error(`Insufficient token balance. Need ${amount} of both YES and NO tokens.`);
        }

        const routerAddress = config?.FUTARCHY_ROUTER_ADDRESS || FUTARCHY_ROUTER_ADDRESS;

        // Approve YES tokens
        await handleTokenApproval(
          yesTokenAddress,
          routerAddress,
          amountInWei,
          tokenType,
          "YES"
        );

        markSubstepCompleted(1, 0);
        setApprovalStates((prev) => ({
          ...prev,
          [tokenType]: {
            ...prev[tokenType],
            yesToken: true,
          },
        }));

        setLocalProcessingStep("noApproval");
        setCurrentSubstep({ step: 1, substep: 2 });

        // Approve NO tokens
        await handleTokenApproval(
          noTokenAddress,
          routerAddress,
          amountInWei,
          tokenType,
          "NO"
        );

        markSubstepCompleted(1, 1);
        setApprovalStates((prev) => ({
          ...prev,
          [tokenType]: {
            ...prev[tokenType],
            noToken: true,
          },
        }));

        setLocalProcessingStep("merge");
        setCurrentSubstep({ step: 1, substep: 3 });

        // Execute merge using the base token address from config
        const futarchyRouter = new ethers.Contract(
          routerAddress,
          FUTARCHY_ROUTER_ABI,
          signer
        );

        const marketAddress = config?.MARKET_ADDRESS || MARKET_ADDRESS;

        // Use the base token address for the merge operation
        const baseTokensConfig = config?.BASE_TOKENS_CONFIG || BASE_TOKENS_CONFIG;
        const baseToken = tokenType === "currency"
          ? baseTokensConfig.currency
          : baseTokensConfig.company;

        const mergeTx = await futarchyRouter.mergePositions(
          marketAddress,
          baseToken.address, // Use base token address for merge
          amountInWei,
          {
            gasLimit: 2000000,
            type: 2,
            maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
          }
        );

        // Check for Safe wallet
        if (isSafeWallet(walletClient)) {
          if (!useBlockExplorer) {
            console.log('[CollateralModal] Safe wallet detected - skipping wait() and auto-closing');
            markSubstepCompleted(1, 3);
            setTransactionStates((prev) => ({ ...prev, merge: true }));
            setLocalProcessingStep("completed");
            setCurrentSubstep({ step: 1, substep: 4 });
            onSafeTransaction?.(); // Trigger toast
            handleClose(); // Auto-close for Safe
            return;
          } else {
            console.log('[CollateralModal] Safe wallet detected - waiting for execution via Safe API');
            const chainId = await walletClient.getChainId();
            await waitForSafeTxReceipt({
              chainId,
              safeTxHash: mergeTx.hash,
              publicClient
            });
          }
        } else {
          await mergeTx.wait();
        }

        // Mark merge complete and set to completed state
        markSubstepCompleted(1, 2);
        setTransactionStates((prev) => ({ ...prev, merge: true }));

        console.log('[CollateralModal] Merge transaction completed successfully');

        // Small delay to ensure state updates are processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Set processing step to completed to show completion UI
        setLocalProcessingStep("completed");
        setCurrentSubstep({ step: 1, substep: 4 }); // Move to final substep

        console.log('[CollateralModal] State updated to completed');

      }

      logDebug({
        event: "Action completed",
        tokenType,
        action,
        completedSteps: Array.from(completedSubsteps),
      });

    } catch (error) {
      // Ignore Safe transaction sent "error" as it's just a control flow signal
      if (error.message === "SAFE_TRANSACTION_SENT") {
        return;
      }

      console.error("Collateral action failed:", error);
      let errorMessage = error.message || "Unknown error occurred.";
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected by the user.";
      } else if (error.message?.includes("user rejected")) {
        errorMessage = "Transaction rejected by the user.";
      }
      setLocalError(errorMessage);
      setLocalProcessingStep(undefined);
    }
  };

  // Add a new helper to wrap the action button click to catch unhandled errors
  const onHandleActionButtonClick = async (e) => {
    // Prevent event propagation to stop any external handlers
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      // Always use internal handleCollateralAction for wagmi-enhanced functionality (like ConfirmSwapModal)
      await handleCollateralAction(selectedTokenType, amount);
    } catch (error) {
      console.error("Error in action button click:", error);
      let errorMessage = error.message || "Unknown error occurred.";
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected by the user.";
      }
      setLocalError(errorMessage);
      setLocalProcessingStep(undefined);
    }
  };

  // Logic for the unified action button
  let buttonContent;
  let buttonAction = () => { };
  let buttonIsEnabled = false;
  let buttonClasses = "w-full py-2 md:py-3 px-4 rounded-lg font-semibold transition-colors";

  // Debug logging for button state
  console.log('[CollateralModal] Button state check:', {
    localProcessingStep,
    isProcessing,
    action
  });

  if (localProcessingStep === "completed") {
    buttonContent = (
      <>
        Transaction Complete - Close
      </>
    );
    buttonAction = handleClose;
    buttonIsEnabled = true;
    buttonClasses += "flex bg-black text-white dark:bg-white dark:text-black items-center justify-center gap-2";
  } else if (localProcessingStep && localProcessingStep !== "completed") {
    buttonContent = "Transaction in Progress...";
    // buttonAction remains () => {} or can be explicitly set if needed
    buttonIsEnabled = false; // Disabled while processing
    buttonClasses += " bg-futarchyGray6 text-futarchyGray112/40 cursor-not-allowed";
  } else { // Not processing, in input mode (localProcessingStep is null/undefined)
    buttonContent = action === "add" ? "Split Collateral" : "Merge Collateral";
    buttonAction = onHandleActionButtonClick;
    buttonIsEnabled = isAmountValid();
    if (buttonIsEnabled) {
      buttonClasses += " bg-black hover:bg-black/80 text-white hover:bg-black/90 dark:bg-futarchyGray112 dark:hover:bg-futarchyGray112/80 dark:text-futarchyDarkGray1";
    } else {
      buttonClasses += " bg-futarchyGray6 text-futarchyGray112/40 cursor-not-allowed";
    }
  }

  return (
    <div className="flex flex-col relative w-11/12 max-w-[393px] max-h-[85vh] md:w-[480px] md:h-auto md:max-h-[638px] bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl shadow-lg gap-4 p-4 md:p-6 overflow-y-auto">
      <div className="flex justify-between items-center">
        <div className="text-lg md:text-xl text-futarchyGray12 dark:text-futarchyGray3 font-medium">
          {title}
        </div>
        <button
          onClick={handleClose}
          disabled={isProcessing && processingStep !== "completed"}
          className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {configLoading ? (
        <div className="flex items-center gap-2 md:gap-4 p-2 md:p-4 bg-white dark:bg-futarchyDarkGray4 border border-futarchyGray6 rounded-lg">
          <div className="w-16 h-8 bg-futarchyGray4 dark:bg-futarchyGray7 animate-pulse rounded-md"></div>
          <div className="w-16 h-8 bg-futarchyGray4 dark:bg-futarchyGray7 animate-pulse rounded-md"></div>
        </div>
      ) : (
        <TokenToggle
          selectedToken={selectedTokenType}
          onToggle={handleTokenToggle}
          getCurrencySymbol={getCurrencySymbol}
          getCompanySymbol={getCompanySymbol}
        />
      )}

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
            {/* Amount Input */}
            <div className="mb-6">
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.0"
                    className="w-full px-3 py-2 md:px-4 md:py-3 bg-white border dark:bg-futarchyDarkGray4 border-futarchyGray6 rounded-lg text-sm md:text-base text-futarchyGray12 dark:text-futarchyGray3 font-medium focus:outline-none focus:ring-2 focus:ring-futarchyGray7"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button
                      onClick={handleMaxClick}
                      className="px-2 py-1 bg-futarchyGray4 dark:bg-transparent text-futarchyGray11 rounded text-xs md:text-sm font-medium hover:bg-futarchyGray5 transition-colors"
                    >
                      Max
                    </button>
                  </div>
                </div>
                {/* START Updated Balances Display */}
                <div className="flex justify-between items-start">
                  {/* Left Column: Selected Token */}
                  <div className="flex flex-col gap-[2px]">
                    <div className="text-futarchyGray11 text-xs md:text-sm font-normal">
                      {configLoading ? (
                        <div className="w-12 h-4 bg-futarchyGray4 dark:bg-futarchyGray7 animate-pulse rounded"></div>
                      ) : (
                        <>
                          {selectedTokenType === "currency"
                            ? getCurrencySymbol()
                            : getCompanySymbol()}{" "}
                          Available
                        </>
                      )}
                    </div>
                    <div className="text-futarchyGray12 dark:text-futarchyGray3 text-sm md:text-base font-medium">
                      {configLoading ? (
                        <div className="w-20 h-5 bg-futarchyGray4 dark:bg-futarchyGray7 animate-pulse rounded"></div>
                      ) : (
                        formatBalance(
                          getAvailableBalance().toString(),
                          selectedTokenType === "currency"
                            ? getCurrencySymbol()
                            : getCompanySymbol()
                        )
                      )}
                    </div>
                    {!configLoading && (
                      <a
                        href={
                          selectedTokenType === "company"
                            ? `https://swap.cow.fi/#/${config?.chainId || 100}/swap/_/${config?.BASE_TOKENS_CONFIG?.company?.address}`
                            : `https://swap.cow.fi/#/${config?.chainId || 100}/swap/_/${config?.BASE_TOKENS_CONFIG?.currency?.address}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-futarchyBlue11 dark:text-futarchyBlue9 hover:text-futarchyBlue9 dark:hover:text-futarchyBlue7 underline cursor-pointer"
                        title={
                          selectedTokenType === "company"
                            ? `BUY ${getCompanySymbol()}`
                            : `BUY ${getCurrencySymbol()}`
                        }
                      >
                        {selectedTokenType === "company"
                          ? `BUY ${getCompanySymbol()}`
                          : `BUY ${getCurrencySymbol()}`}
                      </a>
                    )}
                  </div>

                  {/* Right Column: Native Token Balance */}
                  <div className="flex flex-col gap-[2px] items-end">
                    <div className="text-futarchyGray11 text-xs md:text-sm font-normal">
                      {getNativeTokenSymbol()} Balance
                    </div>
                    <div className="text-futarchyGray12 dark:text-futarchyGray3 text-sm md:text-base font-medium">
                      {console.log(
                        "CollateralModal: Displaying native balance. Raw nativeBalance state (Wei):",
                        nativeBalance,
                        "Full balances object from props (for other tokens):",
                        balances
                      )}
                      {formatBalance(
                        typeof nativeBalance === 'string' && nativeBalance.length > 0 && !isNaN(nativeBalance)
                          ? ethers.utils.formatUnits(nativeBalance, 18) // Assume nativeBalance is in Wei
                          : nativeBalance || "0", // Otherwise, pass as is or default to "0"
                        getNativeTokenSymbol()
                      )}
                    </div>
                    {/* Optional: Link for getting xDAI if needed in the future */}
                    {/* <a href="#" className="text-xs font-medium text-futarchyBlue11 dark:text-futarchyBlue9 hover:text-futarchyBlue9 dark:hover:text-futarchyBlue7 underline cursor-pointer">Get xDAI</a> */}
                  </div>
                </div>
                {/* END Updated Balances Display */}
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

            {/* Alert Container */}
            <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray4 dark:border dark:border-futarchyGray112/20 rounded-lg p-3 md:p-4" >
              <h4 className="font-medium mb-1 text-black dark:text-futarchyGray112 text-xs">{alertContainerTitle}</h4>
              <p className="text-xs text-black dark:text-futarchyGray112">{alertSupportText}</p>
            </div>

            {/* Additional Collateral Section */}
            {
              false && (
                <div className="bg-futarchyGray3 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-futarchyGray11">Already Have</span>
                    <span className="text-futarchyGreen11 font-medium">
                      {formatBalance(
                        existingBalance,
                        selectedTokenType === "currency" ? getCurrencySymbol() : getCompanySymbol()
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-futarchyGray11">Need to Add</span>
                    <span className="text-futarchyBlue11 font-medium">
                      {formatBalance(
                        additionalCollateralNeeded,
                        selectedTokenType === "currency" ? getCurrencySymbol() : getCompanySymbol()
                      )}
                    </span>
                  </div>
                </div>
              )
            }
          </motion.div >
        ) : (
          <motion.div
            className="mb-6 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-futarchyDarkGray3 dark:to-transparent pointer-events-none z-10" />
            <div className="max-h-[240px] overflow-hidden pr-2 -mr-2">
              <AnimatePresence>
                {Object.entries(getUpdatedSteps() || {})
                  .filter(([stepNum]) => {
                    if (!currentSubstepState) return true;
                    const step = parseInt(stepNum);
                    return step === 1; // Always show the steps
                  })
                  .map(([step, data]) => (
                    <StepWithSubsteps
                      key={step}
                      step={parseInt(step)}
                      title={data.title}
                      substeps={data.substeps}
                      expanded={expandedSteps[step]}
                      onToggle={() => toggleStepExpansion(step)}
                      isProcessing={isProcessing}
                      currentSubstep={currentSubstepState}
                      processingStep={localProcessingStep}
                      selectedTokenType={selectedTokenType}
                      completedSubsteps={completedSubsteps}
                      action={action}
                    />
                  ))}
              </AnimatePresence>
            </div>

            {/* Completion button - THIS ENTIRE BLOCK WILL BE REMOVED */}
            {/* 
            {localProcessingStep === "completed" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="mt-4"
              >
                <button
                  onClick={handleClose}
                  className="w-full py-3 px-4 rounded-lg font-semibold bg-futarchyGreen text-white hover:bg-futarchyGreen/90 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckMark />
                  Transaction Completed - Click to Close
                </button>
              </motion.div>
            )} 
            */}
          </motion.div>
        )}
      </AnimatePresence >

      {/* Unified Action Button */}
      <div className="" > {/* Ensures button is at the bottom, mt-auto pushes it down if content is short, pt-4 for spacing */}
        < button
          onClick={buttonAction}
          disabled={!buttonIsEnabled}
          className={buttonClasses}
        >
          {buttonContent}
        </button >
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

      {/* Config Debug Info */}
      {DEBUG_MODE && <>
      <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono border border-gray-200 dark:border-gray-700">
        <div className="font-bold mb-2 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-1">
          Config Debug
        </div>
        <div className="space-y-1 text-gray-600 dark:text-gray-400">
          <div>Loading: {configLoading ? 'Yes' : 'No'}</div>
          <div>Config Present: {config ? 'Yes' : 'No'}</div>
          <div>Proposal ID: {proposalId}</div>
          <div>Merge Config: {config?.MERGE_CONFIG ? 'Present' : 'Missing'}</div>
          <div>Router: {config?.FUTARCHY_ROUTER_ADDRESS}</div>
        </div>
      </div>
      <SafeDetector />
      </>}
    </div>
  );
};

CollateralModal.propTypes = {
  title: PropTypes.string.isRequired,
  supportText: PropTypes.string,
  handleClose: PropTypes.func.isRequired,
  connectedWalletAddress: PropTypes.string,
  walletIcon: PropTypes.element,
  alertContainerTitle: PropTypes.string.isRequired,
  alertSupportText: PropTypes.string.isRequired,
  tokenConfig: PropTypes.object.isRequired,
  balances: PropTypes.object.isRequired,
  processingStep: PropTypes.oneOf([
    "baseTokenApproval",
    "mint",
    "completed",
    "yesApproval",
    "noApproval",
    "merge",
    null,
  ]),
  currentSubstep: PropTypes.shape({
    step: PropTypes.number,
    substep: PropTypes.number,
  }),
  isProcessing: PropTypes.bool,
  action: PropTypes.oneOf(["add", "remove"]),
  error: PropTypes.string,
  proposalId: PropTypes.string.isRequired,
  config: PropTypes.object, // Add config prop
  configLoading: PropTypes.bool, // Add configLoading prop
};

export default CollateralModal;
