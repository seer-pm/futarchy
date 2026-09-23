import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { STEPS_CONFIG } from './constants/swapSteps';
import { ethers } from 'ethers';
import { useMetaMask } from '../../../hooks/useMetaMask';
import {
  CONDITIONAL_TOKENS_ADDRESS,
  WRAPPER_SERVICE_ADDRESS,
  SUSHISWAP_V2_ROUTER,
  VAULT_RELAYER_ADDRESS,
  COW_SETTLEMENT_ADDRESS,
  FUTARCHY_ROUTER_ADDRESS,
  DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS,
  DEFAULT_BASE_COMPANY_TOKEN_ADDRESS,
  REQUIRED_CHAIN_ID,
  CONDITIONAL_TOKENS_ABI,
  WRAPPER_SERVICE_ABI,
  SUSHISWAP_ROUTER_ABI,
  ERC20_ABI,
  SPLIT_CONFIG,
  DEFAULT_BASE_TOKENS_CONFIG,
  MERGE_CONFIG,
  YES_TOKEN_ADDRESS,
  NO_TOKEN_ADDRESS,
  COMPANY_YES_TOKEN,
  COMPANY_NO_TOKEN,
  ERC1155_ABI,
  MARKET_ADDRESS,
  WXDAI_ADDRESS
} from './constants/contracts';
import { getTokenBytecode } from '1155-to-20-helper/src';
import { fetchSushiSwapRoute, executeSushiSwapRoute } from '../../../utils/sushiswapHelper';
import { formatBalance, formatPercentage } from '../../../utils/formatters';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { formatTokenAmount, formatWith } from '../../../utils/precisionFormatter';
import { getUniswapV3QuoteWithPriceImpact, getPoolSqrtPrice, sqrtPriceX96ToPrice } from '../../../utils/uniswapSdk';
import { usePublicClient, useChainId } from 'wagmi';
import { approvalAmountFor } from '../../../utils/approvalAmount';

// Opens only from the native-swap action — load it on demand.
const SwapNativeToCurrencyModal = dynamic(() => import("./SwapNativeToCurrencyModal"), { ssr: false });

// Opens only on user action, and it is one of the heaviest components in
// the market bundle — load it on demand.
const ConfirmSwapModal = dynamic(() => import('./ConfirmSwapModal'), { ssr: false });


// Configuration for this showcase implementation
const SHOWCASE_CHECK_SELL_COLLATERAL = true;

// FEATURE FLAG: Use new Futarchy Quote Helper?
const USING_FUTARCHY_QUOTER = true;

// Add Futarchy Router ABI
const FUTARCHY_ROUTER_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract FutarchyProposal",
        "name": "proposal",
        "type": "address"
      },
      {
        "internalType": "contract IERC20",
        "name": "collateralToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "splitPosition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "contract FutarchyProposal",
        "name": "proposal",
        "type": "address"
      },
      {
        "internalType": "contract IERC20",
        "name": "collateralToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "mergePositions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const ShowcaseSwapComponent = ({ positions, prices, walletBalances, isLoadingBalances, account, isConnected, onConnectWallet, proposalId, marketHasClosed }) => {
  // Use contract config for dynamic token symbols
  const { config } = useContractConfig(proposalId);

  // Helper functions for dynamic token symbols
  const getCurrencySymbol = () => config?.BASE_TOKENS_CONFIG?.currency?.symbol || DEFAULT_BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY';
  const getCompanySymbol = () => config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';

  // Feature flag for redirecting to CoW Swap instead of native conversion
  const [redirectToCOW, setRedirectToCOW] = useState(false); // Default false for now

  const [amount, setAmount] = useState('1');
  const [amountRawWei, setAmountRawWei] = useState(null); // Raw wei value to avoid precision loss
  const [selectedOutcome, setSelectedOutcome] = useState('approved');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState('Buy'); // 'Buy' or 'Sell'
  const { selectedCurrency } = useCurrency();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isNativeSwapModalOpen, setIsNativeSwapModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 0 });
  const [deactivateTimeout, setDeactivateTimeout] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [error, setError] = useState(null);
  const [processingStep, setProcessingStep] = useState(null);
  // Use wallet balances passed from parent component
  const balances = walletBalances || {
    sdaiBalance: '0',
    wxdaiBalance: '0',
    nativeBalance: '0'
  };
  const [confirmModalData, setConfirmModalData] = useState(null);

  // QuoterV2 live preview state
  const [quoterPreview, setQuoterPreview] = useState({
    isLoading: false,
    amountOut: null,
    currentPrice: null,
    executionPrice: null,
    error: null
  });
  const [showPriceInfo, setShowPriceInfo] = useState(false);
  const [tradeAnywayAcknowledged, setTradeAnywayAcknowledged] = useState(false);
  const publicClient = usePublicClient();
  const walletChainId = useChainId();

  // Use the market's chain (from config/registry) for quoting, not the wallet's chain.
  // The wallet may be on Ethereum while viewing a Gnosis market.
  const chainId = config?.chainId || walletChainId;

  const {
    signer,
    provider,
    connect,
    checkAndSwitchChain,
    checkAndApproveToken
  } = useMetaMask();

  // Calculate percentages for the progress bar
  const approvalAmount = 298.7;
  const rejectionAmount = 201.3;
  const total = approvalAmount + rejectionAmount;
  const approvalPercentage = (approvalAmount / total) * 100;

  const outcomeOptions = {
    approved: {
      text: 'If Approved',
      bgColor: 'bg-futarchyTeal3',
      iconColor: 'text-futarchyTeal9',
      borderColor: 'border-futarchyTeal6'
    },
    reproved: {
      text: 'If Reproved',
      bgColor: 'bg-futarchyOrange3',
      iconColor: 'text-futarchyOrange9',
      borderColor: 'border-futarchyOrange6'
    }
  };

  // Handler for outcome selection (Event Occurs/Doesn't Occur)
  const handleOutcomeSelect = useCallback((outcome) => {
    setSelectedOutcome(outcome);
    setIsDropdownOpen(false);
    console.log('Outcome selected:', outcome === 'approved' ? 'Event Occurs Outcome' : 'Event Doesn\'t Occur Outcome');
  }, []);

  // Handler for amount input
  const handleAmountChange = useCallback((e) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    setAmountRawWei(null); // Clear raw wei when user types manually (was set by max click)
    setError(null); // Clear any errors when amount changes
    console.log('Amount input updated to:', `$${newAmount} USDC`);
  }, []);

  // Debounced QuoterV2/Swapr SDK preview - for Ethereum (chainId === 1) and Gnosis (chainId === 100)
  useEffect(() => {
    // Only run on Ethereum mainnet or Gnosis Chain
    if (chainId !== 1 && chainId !== 100) {
      setQuoterPreview({ isLoading: false, amountOut: null, error: null });
      return;
    }

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      setQuoterPreview({ isLoading: false, amountOut: null, error: null });
      return;
    }

    // Set loading state immediately (only if we are going to fetch)
    setQuoterPreview(prev => ({ ...prev, isLoading: true }));

    let isActive = true;

    // Debounce: wait 500ms after user stops typing
    const timer = setTimeout(async () => {
      // Resolve tokens and provider outside try so catch can use them for fallback
      const baseTokenConfig = config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
      const mergeConfig = config?.MERGE_CONFIG || MERGE_CONFIG;

      let tokenIn, tokenOut;
      if (selectedAction === 'Buy') {
        // Buy: currency -> company
        tokenIn = selectedOutcome === 'approved'
          ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
        tokenOut = selectedOutcome === 'approved'
          ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
      } else {
        // Sell: company -> currency
        tokenIn = selectedOutcome === 'approved'
          ? mergeConfig.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : mergeConfig.companyPositions.no.wrap.wrappedCollateralTokenAddress;
        tokenOut = selectedOutcome === 'approved'
          ? mergeConfig.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : mergeConfig.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
      }

      try {
        console.log('[QUOTER SHOWCASE] Fetching quote for amount:', amount);

        // Use best available RPC for the current chain
        const { getBestRpcProvider, getBestRpc } = await import('../../../utils/getBestRpc');
        const ethersProvider = await getBestRpcProvider(chainId);

        let quoteResult, currentPrice, executionPrice;

        if (chainId === 100) {
          // Gnosis Chain Logic
          if (USING_FUTARCHY_QUOTER) {
            console.log('[QUOTER SHOWCASE] Using FutarchyQuoteHelper (New Logic)');
            const { getSwapQuote } = await import('../../../utils/FutarchyQuoteHelper');

            // Prepare params
            // 1. Proposal Address should be proposalId (if it's an address) or retrieved from config?
            // Usually proposalId IS the address. Let's verify. 
            // Looking at usage: const { config } = useContractConfig(proposalId);

            // 2. isYesPool -> Selected Outcome
            const isYesPool = selectedOutcome === 'approved';

            // 3. isInputCompanyToken -> 'Buy' means Currency->Company? 
            // If Buy: Input is Currency. Company is Output.
            // If Sell: Input is Company. Currency is Output.
            // Helper param: isInputCompanyToken
            const isInputCompanyToken = selectedAction === 'Sell';

            const quoteParams = {
              proposal: proposalId,
              amount: amount,
              isYesPool: isYesPool,
              isInputCompanyToken: isInputCompanyToken,
              slippagePercentage: 0.005 // 0.5% default slippage
            };

            try {
              const quote = await getSwapQuote(quoteParams, ethersProvider);
              if (quote) {
                quoteResult = {
                  amountOut: quote.expectedReceive, // String already
                  amountOutFormatted: quote.expectedReceive,
                  minimumReceived: quote.minReceive,
                  priceAfter: quote.priceAfter,
                  currentPrice: quote.currentPoolPrice,
                  amountOutRaw: quote.raw.amountOut // PRESERVE RAW WEI VALUE
                };

                // Helper already handles inversion logic!
                currentPrice = parseFloat(quote.currentPoolPrice);
                executionPrice = parseFloat(quote.executionPrice);

                console.log('[QUOTER SHOWCASE] FutarchyQuoteHelper Result:', quote);
              } else {
                throw new Error('No quote returned');
              }
            } catch (err) {
              console.error('[QUOTER SHOWCASE] Helper failed, falling back to legacy?', err);
              throw err;
            }

          } else {
            // Legacy Gnosis Chain: Use direct Algebra Quoter
            console.log('[QUOTER SHOWCASE] Using direct Algebra Quoter for Gnosis Chain (Legacy)');
            const { getAlgebraQuoteWithSlippage } = await import('../../../utils/algebraQuoter');

            // Get pool address based on outcome
            const poolConfigYes = config?.POOL_CONFIG_YES || POOL_CONFIG_YES;
            const poolConfigNo = config?.POOL_CONFIG_NO || POOL_CONFIG_NO;
            const poolConfig = selectedOutcome === 'approved' ? poolConfigYes : poolConfigNo;
            const poolAddress = poolConfig?.address;

            if (!poolAddress) {
              throw new Error('Pool address not found for selected outcome');
            }

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
            } : null;

            const metadataBaseTokenConfig = config?.metadata ? {
              currency: { address: config.metadata.currencyTokens?.base?.wrappedCollateralTokenAddress },
              company: { address: config.metadata.companyTokens?.base?.wrappedCollateralTokenAddress }
            } : null;

            quoteResult = await getAlgebraQuoteWithSlippage({
              tokenIn,
              tokenOut,
              amountIn: amount,
              poolAddress,
              provider: ethersProvider,
              slippageBps: 50, // 0.5% slippage
              mergeConfig: metadataMergeConfig,
              baseTokenConfig: metadataBaseTokenConfig
            });

            currentPrice = quoteResult.currentPrice;
            executionPrice = parseFloat(quoteResult.displayPrice || quoteResult.executionPrice);

            console.log('[QUOTER SHOWCASE] Algebra direct quote result:', quoteResult);
          }
        } else {
          // Ethereum mainnet: Use Uniswap QuoterV2
          console.log('[QUOTER SHOWCASE] Using Uniswap QuoterV2 for Ethereum');

          // Always fetch pool current price first (needed even if quote fails)
          let poolData;
          try {
            poolData = await getPoolSqrtPrice(tokenIn, tokenOut, 500, ethersProvider, 1);
            currentPrice = sqrtPriceX96ToPrice(poolData.sqrtPriceX96);
          } catch (poolErr) {
            console.warn('[QUOTER SHOWCASE] Could not get pool price:', poolErr.message);
          }

          quoteResult = await getUniswapV3QuoteWithPriceImpact({
            tokenIn,
            tokenOut,
            amountIn: amount,
            fee: 500,
            provider: ethersProvider,
            chainId: 1,
            slippageBps: 50
          });

          console.log('[QUOTER SHOWCASE] Quote result:', quoteResult);

          // If pool price wasn't fetched above (different fee tier), try with the quoter's fee tier
          if (!poolData && quoteResult.feeTier !== 500) {
            poolData = await getPoolSqrtPrice(tokenIn, tokenOut, quoteResult.feeTier, ethersProvider, 1);
            currentPrice = sqrtPriceX96ToPrice(poolData.sqrtPriceX96);
          }

          executionPrice = sqrtPriceX96ToPrice(quoteResult.sqrtPriceX96After);
        }

        // Determine if we need to invert based on action (Buy/Sell)
        // Goal: Always show prices as "currency per company"
        // Swapr SDK already returns displayPrice in the correct direction
        if (chainId === 1) {
          // Uniswap: Simplify using action
          const isBuy = selectedAction === 'Buy';

          // Pool prices from sqrtPriceX96 are ALWAYS token1/token0
          // For Buy: tokenIn=currency, tokenOut=company
          //   If tokenIn < tokenOut: token0=currency, token1=company → pool=company/currency → INVERT
          //   If tokenOut < tokenIn: token0=company, token1=currency → pool=currency/company → DON'T INVERT
          // For Sell: tokenIn=company, tokenOut=currency
          //   If tokenOut < tokenIn: token0=currency, token1=company → pool=company/currency → INVERT
          //   If tokenIn < tokenOut: token0=company, token1=currency → pool=currency/company → DON'T INVERT
          const shouldInvert = isBuy
            ? (tokenIn.toLowerCase() < tokenOut.toLowerCase())
            : (tokenOut.toLowerCase() < tokenIn.toLowerCase());

          if (shouldInvert) {
            currentPrice = 1 / currentPrice;
            executionPrice = 1 / executionPrice;
          }

          console.log('[QUOTER SHOWCASE] Uniswap Prices:', {
            action: selectedAction,
            tokenIn,
            tokenOut,
            currentPrice,
            executionPrice,
            shouldInvert,
            note: 'Simplified: Buy with tokenIn<tokenOut → invert, Sell with tokenOut<tokenIn → invert'
          });
        } else {
          // For Gnosis with FutarchyHelper, prices are already inverted correctly.
          // For Legacy Gnosis, they are also handled.
          // So we don't need to do anything here except log.
          console.log('[QUOTER SHOWCASE] Gnosis Quote Result:', {
            currentPrice,
            executionPrice,
            method: USING_FUTARCHY_QUOTER ? 'Helper' : 'Legacy'
          });
        }

        if (isActive) {
          const afterPrice = quoteResult.priceAfter ?? executionPrice;
          const priceImpactPct = Number.isFinite(Number(quoteResult.priceImpactPct ?? quoteResult.priceImpact))
            ? Math.abs(Number(quoteResult.priceImpactPct ?? quoteResult.priceImpact))
            : currentPrice && executionPrice
              ? Math.abs((currentPrice - executionPrice) / currentPrice) * 100
              : null;

          setQuoterPreview({
            isLoading: false,
            quotedAmountIn: amount,
            amountOut: quoteResult.amountOutFormatted || quoteResult.amountOut,
            currentPrice,
            executionPrice,
            priceImpact: quoteResult.priceImpact,
            priceImpactPct,
            slippage: quoteResult.slippage,
            priceAfter: afterPrice,
            minimumReceived: quoteResult.minimumReceived,
            amountOutRaw: quoteResult.amountOutRaw,
            decimalsOut: quoteResult.decimalsOut || 18,
            chainId: chainId,
            insufficientLiquidity: false,
            error: null
          });
        }
      } catch (error) {
        if (isActive) {
          console.error('[QUOTER SHOWCASE] Error:', error);

          // Even when the quoter fails (e.g. no liquidity in sell direction),
          // try to show the current pool price so More Info still works
          let fallbackPrice = null;
          try {
            const { getBestRpcProvider } = await import('../../../utils/getBestRpc');
            const ethersProvider = await getBestRpcProvider(chainId);
            if (chainId === 1) {
              const poolData = await getPoolSqrtPrice(tokenIn, tokenOut, 500, ethersProvider, 1);
              fallbackPrice = sqrtPriceX96ToPrice(poolData.sqrtPriceX96);
              // Apply same inversion logic as the main path
              const isBuy = selectedAction === 'Buy';
              const shouldInvert = isBuy
                ? (tokenIn.toLowerCase() < tokenOut.toLowerCase())
                : (tokenOut.toLowerCase() < tokenIn.toLowerCase());
              if (shouldInvert) fallbackPrice = 1 / fallbackPrice;
            } else if (chainId === 100) {
              // Gnosis: try the Algebra pool
              const { getAlgebraQuoteWithSlippage } = await import('../../../utils/algebraQuoter');
              // Can't get pool price without a full quote on Algebra, skip
            }
          } catch (poolErr) {
            console.warn('[QUOTER SHOWCASE] Could not get fallback pool price:', poolErr.message);
          }

          setQuoterPreview({
            isLoading: false,
            amountOut: null,
            currentPrice: fallbackPrice,
            chainId: chainId,
            insufficientLiquidity: true, // Quoter failure means pool can't handle this trade
            error: error.message
          });
        }
      }
    }, 500); // 500ms debounce

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [amount, selectedAction, selectedOutcome, chainId, config]);

  useEffect(() => {
    setTradeAnywayAcknowledged(false);
  }, [amount, selectedAction, selectedOutcome]);

  // Handler for buy/sell selection
  const handleActionSelect = useCallback((action) => {
    setSelectedAction(action);
    console.log('Action selected:', action === 'Buy' ? 'Buy' : 'Sell');
  }, []);

  // Handle max amount click without formatting
  const handleMaxClick = useCallback(() => {
    try {
      let totalAvailable;

      if (selectedAction === 'Buy') {
        // For Buy action, determine max based on selected currency mode
        if (selectedCurrency === getCurrencySymbol()) {
          // Currency mode: Sum position tokens + currency balance
          const outcomeBalance = selectedOutcome === 'approved'
            ? (positions?.currencyYes?.total || '0')
            : (positions?.currencyNo?.total || '0');
          const baseBalance = balances?.currencyBalance || balances?.sdaiBalance || '0';

          const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
          const baseBN = ethers.utils.parseUnits(baseBalance, 18);
          const totalBN = outcomeBN.add(baseBN);
          totalAvailable = ethers.utils.formatUnits(totalBN, 18);
        } else if (selectedCurrency === 'WXDAI') {
          if (redirectToCOW) {
            // When redirectToCOW is true: Show SDAI + position tokens (like currency mode)
            const outcomeBalance = selectedOutcome === 'approved'
              ? (positions?.currencyYes?.total || '0')
              : (positions?.currencyNo?.total || '0');
            const baseBalance = balances?.sdaiBalance || '0';

            const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
            const baseBN = ethers.utils.parseUnits(baseBalance, 18);
            const totalBN = outcomeBN.add(baseBN);
            totalAvailable = ethers.utils.formatUnits(totalBN, 18);
          } else {
            // Original behavior: Use ONLY native xDAI balance (no position tokens)
            totalAvailable = balances?.nativeBalance || '0';
          }
        } else {
          // Fallback mode: Sum position tokens + WXDAI balance
          const outcomeBalance = selectedOutcome === 'approved'
            ? (positions?.currencyYes?.total || '0')
            : (positions?.currencyNo?.total || '0');
          const baseBalance = positions?.wxdai || '0';

          const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
          const baseBN = ethers.utils.parseUnits(baseBalance, 18);
          const totalBN = outcomeBN.add(baseBN);
          totalAvailable = ethers.utils.formatUnits(totalBN, 18);
        }
      } else { // Sell
        // For Sell action: Always sum position tokens + base token balance
        const outcomeBalance = selectedOutcome === 'approved'
          ? (positions?.companyYes?.total || '0')
          : (positions?.companyNo?.total || '0');
        const baseBalance = positions?.faot || '0';

        const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
        const baseBN = ethers.utils.parseUnits(baseBalance, 18);
        const totalBN = outcomeBN.add(baseBN);
        totalAvailable = ethers.utils.formatUnits(totalBN, 18);
      }

      // Set amount to the calculated total AND store raw wei value
      setAmount(totalAvailable);
      // Store raw wei value to avoid precision loss when re-parsing
      // We need to calculate the raw wei value here
      let rawWeiValue = null;
      if (selectedAction === 'Buy') {
        if (selectedCurrency === getCurrencySymbol()) {
          const outcomeBalance = selectedOutcome === 'approved'
            ? (positions?.currencyYes?.total || '0')
            : (positions?.currencyNo?.total || '0');
          const baseBalance = balances?.currencyBalance || balances?.sdaiBalance || '0';
          const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
          const baseBN = ethers.utils.parseUnits(baseBalance, 18);
          rawWeiValue = outcomeBN.add(baseBN).toString();
        } else if (selectedCurrency === 'WXDAI') {
          if (redirectToCOW) {
            const outcomeBalance = selectedOutcome === 'approved'
              ? (positions?.currencyYes?.total || '0')
              : (positions?.currencyNo?.total || '0');
            const baseBalance = balances?.sdaiBalance || '0';
            const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
            const baseBN = ethers.utils.parseUnits(baseBalance, 18);
            rawWeiValue = outcomeBN.add(baseBN).toString();
          } else {
            rawWeiValue = ethers.utils.parseUnits(balances?.nativeBalance || '0', 18).toString();
          }
        } else {
          const outcomeBalance = selectedOutcome === 'approved'
            ? (positions?.currencyYes?.total || '0')
            : (positions?.currencyNo?.total || '0');
          const baseBalance = positions?.wxdai || '0';
          const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
          const baseBN = ethers.utils.parseUnits(baseBalance, 18);
          rawWeiValue = outcomeBN.add(baseBN).toString();
        }
      } else {
        const outcomeBalance = selectedOutcome === 'approved'
          ? (positions?.companyYes?.total || '0')
          : (positions?.companyNo?.total || '0');
        const baseBalance = positions?.faot || '0';
        const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
        const baseBN = ethers.utils.parseUnits(baseBalance, 18);
        rawWeiValue = outcomeBN.add(baseBN).toString();
      }
      setAmountRawWei(rawWeiValue);
    } catch (error) {
      console.error('Error calculating max amount:', error);
      // Fallback to just outcome balance
      const fallbackBalance = selectedAction === 'Buy'
        ? (selectedOutcome === 'approved'
          ? (positions?.currencyYes?.total || '0')
          : (positions?.currencyNo?.total || '0'))
        : (selectedOutcome === 'approved'
          ? (positions?.companyYes?.total || '0')
          : (positions?.companyNo?.total || '0'));
      setAmount(fallbackBalance);
      // Also set raw wei for fallback
      try {
        setAmountRawWei(ethers.utils.parseUnits(fallbackBalance, 18).toString());
      } catch (e) {
        setAmountRawWei(null);
      }
    }
  }, [selectedAction, selectedOutcome, selectedCurrency, positions, balances, redirectToCOW, getCurrencySymbol]);

  // Memoized transaction data object
  const transactionData = useMemo(() => ({
    outcome: selectedOutcome === 'approved' ? 'Event Will Occur' : 'Event Won\'t Occur',
    amount: `${amount} ${getCurrencySymbol()}`,
    action: selectedAction === 'Buy' ? 'Buy' : 'Sell',
    timestamp: new Date().toISOString()
  }), [selectedOutcome, amount, selectedAction, getCurrencySymbol]);

  const handleConfirmClick = () => {
    if (parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
      console.error("Invalid amount entered");
      return;
    }
    if ((chainId === 1 || chainId === 100) && (quoterPreview.isLoading || quoterPreview.quotedAmountIn !== amount || !quoterPreview.amountOut)) {
      console.error('A current on-chain pool quote is required');
      return;
    }

    if (selectedCurrency === 'WXDAI' && !redirectToCOW) {
      // Original behavior: Open native swap modal
      console.log("Opening WXDAI -> SDAI native swap modal with amount:", amount);
      setConfirmModalData(null);
      setIsNativeSwapModalOpen(true);
      setIsConfirmModalOpen(false);
    } else {
      // Direct to ConfirmSwapModal (for SDAI mode or WXDAI with redirectToCOW)
      console.log("Preparing data for direct ConfirmSwapModal opening");

      // Calculate expected receive amount based on current price
      // Use the new Algebra pool prices for accurate calculation
      let expectedReceiveAmount = '0';
      let receiveToken = '';
      const inputAmount = parseFloat(amount);


      // Use the appropriate price based on the selected outcome
      const currentPrice = selectedOutcome === 'approved' ? prices?.yesPrice : prices?.noPrice;

      // If we have a valid quote preview from the new helper, use it!
      if (USING_FUTARCHY_QUOTER && quoterPreview?.amountOut && !quoterPreview.error) {
        console.log('[Confirm] Using cached quote from FutarchyQuoteHelper');
        expectedReceiveAmount = quoterPreview.amountOut;

        if (selectedAction === 'Buy') {
          receiveToken = (selectedOutcome === 'approved' ? 'YES_' : 'NO_') + getCompanySymbol();
        } else {
          receiveToken = getCurrencySymbol();
        }
      } else if (chainId !== 1 && chainId !== 100 && currentPrice && currentPrice > 0) {
        // Fallback to legacy calc — spot price estimate with conservative fee deduction
        const APPROX_POOL_FEE = 0.01; // 1% conservative estimate for pool fees
        if (selectedAction === 'Buy') {
          // Buying company token with currency
          const rawExpected = (inputAmount / currentPrice) * (1 - APPROX_POOL_FEE);
          expectedReceiveAmount = formatWith(rawExpected, 'balance');
          receiveToken = (selectedOutcome === 'approved' ? 'YES_' : 'NO_') + getCompanySymbol();
        } else {
          // Selling company token for currency
          const rawExpected = (inputAmount * currentPrice) * (1 - APPROX_POOL_FEE);
          expectedReceiveAmount = formatWith(rawExpected, 'balance');
          receiveToken = getCurrencySymbol();
        }
      }
      console.log("[SHOWCASE] Confirm Data:", {
        USING_FUTARCHY_QUOTER,
        quoterPreview,
        priceAfter: quoterPreview?.priceAfter,
      });

      const directConfirmData = {
        outcome: selectedOutcome === 'approved' ? 'Event Will Occur' : 'Event Won\'t Occur',
        amount: selectedAction === 'Sell'
          ? `${amount} ${getCompanySymbol()}`
          : `${amount} ${getCurrencySymbol()}`,
        action: selectedAction, // This correctly passes 'Buy' or 'Sell'
        timestamp: new Date().toISOString(),
        expectedReceiveAmount,
        receiveToken,
        inputAmountRaw: amount,
        amountInRaw: amountRawWei, // Raw wei value to avoid precision loss (null if user typed manually)
        selectedOutcome,
        // Pass detailed quote data if available
        priceAfter: (USING_FUTARCHY_QUOTER && quoterPreview?.priceAfter) ? quoterPreview.priceAfter : null,
        minimumReceived: (USING_FUTARCHY_QUOTER && quoterPreview?.minimumReceived) ? quoterPreview.minimumReceived : null,
        amountOutRaw: (USING_FUTARCHY_QUOTER && quoterPreview?.amountOutRaw) ? quoterPreview.amountOutRaw : null,
        // Price Impact: Change in Pool Spot Price (Price After vs Current Price)
        priceImpact: quoterPreview?.priceImpactPct ?? null,

        // Slippage: Execution Price (Avg) vs Current Spot Price
        slippage: (USING_FUTARCHY_QUOTER && quoterPreview?.currentPrice && quoterPreview?.executionPrice)
          ? ((Math.abs(parseFloat(quoterPreview.currentPrice) - parseFloat(quoterPreview.executionPrice)) / parseFloat(quoterPreview.currentPrice)) * 100).toFixed(4)
          : null,

        currentPrice: (USING_FUTARCHY_QUOTER && quoterPreview?.currentPrice) ? quoterPreview.currentPrice : null,
        executionPrice: (USING_FUTARCHY_QUOTER && quoterPreview?.executionPrice) ? quoterPreview.executionPrice : null,
        isApproximate: !(USING_FUTARCHY_QUOTER && quoterPreview?.amountOut && !quoterPreview.error),
        insufficientLiquidity: quoterPreview?.insufficientLiquidity || false,
        outputDecimals: quoterPreview?.decimalsOut || 18,
        tradeAnywayAcknowledged,
      };
      console.log("Opening ConfirmSwapModal directly with data:", directConfirmData);
      setConfirmModalData(directConfirmData);
      setIsConfirmModalOpen(true);
      setIsNativeSwapModalOpen(false);
    }
  };

  const handleTransactionComplete = () => {
    // Balance refresh is handled by parent component's useBalanceManager
    setIsConfirmModalOpen(false);
    setIsNativeSwapModalOpen(false);
  };

  // Add these handlers from the working modal
  const handleTokenApproval = async (tokenAddress, spenderAddress, amount, symbol) => {
    console.log(`Approving ${symbol} token...`);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const allowance = await tokenContract.allowance(account, spenderAddress);

    if (allowance.lt(amount)) {
      const tx = await tokenContract.approve(spenderAddress, approvalAmountFor(amount));
      await tx.wait();
    }
  };

  const handleCollateralAction = async (tokenType, amount, action = 'add') => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      // Convert amount to Wei
      const amountInWei = ethers.utils.parseEther(amount);

      // Get configs based on token type
      const configs = tokenType === 'currency'
        ? {
          yes: MERGE_CONFIG.currencyPositions.yes,
          no: MERGE_CONFIG.currencyPositions.no
        }
        : {
          yes: MERGE_CONFIG.companyPositions.yes,
          no: MERGE_CONFIG.companyPositions.no
        };

      const baseToken = tokenType === 'currency'
        ? BASE_TOKENS_CONFIG.currency
        : BASE_TOKENS_CONFIG.company;

      // 1. First check base token balance
      const baseTokenContract = new ethers.Contract(baseToken.address, ERC20_ABI, signer);
      const balance = await baseTokenContract.balanceOf(userAddress);

      console.log('handleCollateralAction balance check:', {
        baseToken: baseToken.symbol,
        userBalance: ethers.utils.formatEther(balance),
        requestedAmount: amount,
        requestedAmountWei: ethers.utils.formatEther(amountInWei),
        hasEnough: balance.gte(amountInWei)
      });

      if (balance.lt(amountInWei)) {
        throw new Error(`Insufficient ${baseToken.symbol} balance. You have ${ethers.utils.formatEther(balance)} ${baseToken.symbol} but need ${amount} ${baseToken.symbol}`);
      }

      // 2. Check and approve base token for ConditionalTokens contract
      setCurrentSubstep({ step: 1, substep: 0 });
      await handleTokenApproval(
        baseToken.address,
        CONDITIONAL_TOKENS_ADDRESS,
        amountInWei,
        baseToken.symbol
      );

      const conditionalTokens = new ethers.Contract(
        CONDITIONAL_TOKENS_ADDRESS,
        CONDITIONAL_TOKENS_ABI,
        signer
      );

      // 3. Check if the contract is approved to handle tokens for wrapping
      setCurrentSubstep({ step: 1, substep: 1 });
      const isApproved = await conditionalTokens.isApprovedForAll(
        userAddress,
        WRAPPER_SERVICE_ADDRESS
      );

      if (!isApproved) {
        console.log('Approving conditional tokens contract...');
        const approveTx = await conditionalTokens.setApprovalForAll(
          WRAPPER_SERVICE_ADDRESS,
          true,
          { gasLimit: 300000 }
        );
        await approveTx.wait();
      }

      // 4. Split position
      setCurrentSubstep({ step: 1, substep: 2 });
      console.log('Splitting position...', ethers.utils.formatEther(amountInWei));
      const partition = [1, 2].map(i => ethers.BigNumber.from(i));
      const splitTx = await conditionalTokens.splitPosition(
        baseToken.address,
        ethers.constants.HashZero,
        SPLIT_CONFIG.conditionId,
        partition,
        amountInWei,
        { gasLimit: 700000 }
      );
      await splitTx.wait();

      // 5. Wrap YES position
      setCurrentSubstep({ step: 1, substep: 3 });
      console.log('Wrapping YES position...', ethers.utils.formatEther(amountInWei));
      const yesTokenBytes = getTokenBytecode(
        configs.yes.wrap.tokenName,
        configs.yes.wrap.tokenSymbol,
        18,
        configs.yes.wrap.wrappedCollateralTokenAddress
      );

      const wrapYesTx = await conditionalTokens.safeTransferFrom(
        userAddress,
        WRAPPER_SERVICE_ADDRESS,
        configs.yes.positionId,
        amountInWei,
        yesTokenBytes,
        { gasLimit: 700000 }
      );
      await wrapYesTx.wait();

      // 6. Wrap NO position
      setCurrentSubstep({ step: 1, substep: 4 });
      console.log('Wrapping NO position...', ethers.utils.formatEther(amountInWei));
      const noTokenBytes = getTokenBytecode(
        configs.no.wrap.tokenName,
        configs.no.wrap.tokenSymbol,
        18,
        configs.no.wrap.wrappedCollateralTokenAddress
      );

      const wrapNoTx = await conditionalTokens.safeTransferFrom(
        userAddress,
        WRAPPER_SERVICE_ADDRESS,
        configs.no.positionId,
        amountInWei,
        noTokenBytes,
        { gasLimit: 700000 }
      );
      await wrapNoTx.wait();

    } catch (error) {
      console.error(`${action === 'add' ? 'Split-Wrap' : 'Unwrap-Merge'} failed:`, error);
      throw error;
    }
  };

  const handleConfirmSwap = async () => {
    console.log('handleConfirmSwap called');
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    try {
      setIsProcessing(true);
      setCurrentStep(1); // Start with Adding Collateral step
      setCurrentSubstep({ step: 1, substep: 0 });

      // Check if the tab is active and MetaMask is ready
      if (!document.hasFocus()) {
        throw new Error("Please make sure this tab is active and try again");
      }

      // Ensure we're connected to MetaMask and on the correct chain
      let provider = new ethers.providers.Web3Provider(window.ethereum);

      // Check and switch to Gnosis Chain (Chain ID 100)
      const network = await provider.getNetwork();
      if (network.chainId !== 100) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x64' }], // 100 in hex
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x64',
                  chainName: 'Gnosis Chain',
                  nativeCurrency: {
                    name: 'xDAI',
                    symbol: 'xDAI',
                    decimals: 18
                  },
                  rpcUrls: ['https://rpc.gnosischain.com'],
                  blockExplorerUrls: ['https://gnosisscan.io']
                }],
              });
            } catch (addError) {
              throw new Error('Failed to add Gnosis Chain to MetaMask');
            }
          } else {
            throw new Error('Failed to switch to Gnosis Chain');
          }
        }
        // Refresh provider after chain switch
        provider = new ethers.providers.Web3Provider(window.ethereum);
      }

      // Request accounts
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      // Verify we have a valid signer and address
      if (!signer || !userAddress) {
        throw new Error("Failed to get signer or user address. Please check your MetaMask connection.");
      }

      // Convert amount to wei
      const amountInWei = ethers.utils.parseEther(amount);

      // Determine which token to split based on selectedAction
      const tokenType = selectedAction === 'Buy' ? 'currency' : 'company';
      const baseToken = tokenType === 'currency'
        ? BASE_TOKENS_CONFIG.currency
        : BASE_TOKENS_CONFIG.company;

      // Determine which outcome token we need
      const outcomeConfig = tokenType === 'currency'
        ? selectedOutcome === 'approved'
          ? MERGE_CONFIG.currencyPositions.yes
          : MERGE_CONFIG.currencyPositions.no
        : selectedOutcome === 'approved'
          ? MERGE_CONFIG.companyPositions.yes
          : MERGE_CONFIG.companyPositions.no;

      // Check existing balance of the outcome token
      const outcomeTokenContract = new ethers.Contract(
        outcomeConfig.wrap.wrappedCollateralTokenAddress,
        ERC20_ABI,
        signer
      );

      const existingBalance = await outcomeTokenContract.balanceOf(userAddress);
      console.log('=== BALANCE CALCULATION DEBUG ===');
      console.log('Existing outcome token balance:', {
        token: outcomeConfig.wrap.tokenSymbol,
        balance: ethers.utils.formatEther(existingBalance),
        balanceWei: existingBalance.toString(),
        required: ethers.utils.formatEther(amountInWei),
        requiredWei: amountInWei.toString()
      });

      // Calculate how much more we need to split
      const additionalAmountNeeded = amountInWei.sub(existingBalance);
      console.log('Additional amount calculation:', {
        additionalNeeded: ethers.utils.formatEther(additionalAmountNeeded),
        additionalNeededWei: additionalAmountNeeded.toString(),
        isPositive: additionalAmountNeeded.gt(0),
        alreadyHaveEnough: existingBalance.gte(amountInWei)
      });

      // If we need to split more tokens
      if (additionalAmountNeeded.gt(0)) {
        console.log('Need to split additional tokens:', ethers.utils.formatEther(additionalAmountNeeded));

        // STEP 1: ADDING COLLATERAL
        // Substep 1: Approve base token for Futarchy Router
        setCurrentSubstep({ step: 1, substep: 1 });
        setProcessingStep('baseTokenApproval');
        console.log('Starting approval step...');

        const tokenContract = new ethers.Contract(
          baseToken.address,
          ERC20_ABI,
          signer
        );

        // Check token balance first - only check if we actually need additional tokens
        const balance = await tokenContract.balanceOf(userAddress);
        console.log('Balance check:', {
          baseTokenBalance: ethers.utils.formatEther(balance),
          additionalNeeded: ethers.utils.formatEther(additionalAmountNeeded),
          hasEnough: balance.gte(additionalAmountNeeded)
        });

        if (balance.lt(additionalAmountNeeded)) {
          const tokenSymbol = tokenType === 'currency' ? getCurrencySymbol() : getCompanySymbol();
          throw new Error(`Insufficient ${tokenSymbol} balance. You have ${ethers.utils.formatEther(balance)} ${tokenSymbol} but need ${ethers.utils.formatEther(additionalAmountNeeded)} ${tokenSymbol} additional.`);
        }

        const currentAllowance = await tokenContract.allowance(
          userAddress,
          FUTARCHY_ROUTER_ADDRESS
        );

        console.log('Allowance check:', {
          currentAllowance: ethers.utils.formatEther(currentAllowance),
          requiredAmount: ethers.utils.formatEther(additionalAmountNeeded),
          hasEnoughAllowance: currentAllowance.gte(additionalAmountNeeded)
        });

        if (currentAllowance.lt(additionalAmountNeeded)) {
          console.log('Need to approve token...');
          const approveTx = await tokenContract.approve(
            FUTARCHY_ROUTER_ADDRESS,
            approvalAmountFor(additionalAmountNeeded)
          );
          console.log('Waiting for approval confirmation...');
          await approveTx.wait();
          console.log('Token approved successfully');
        } else {
          console.log('Token already approved');
        }

        // Add small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Substep 2: Split Position
        console.log('Starting mint step...');
        setProcessingStep('mint');
        setCurrentSubstep({ step: 1, substep: 2 });

        const futarchyRouter = new ethers.Contract(
          FUTARCHY_ROUTER_ADDRESS,
          FUTARCHY_ROUTER_ABI,
          signer
        );

        console.log('Executing split position...', {
          market: MARKET_ADDRESS,
          tokenAddress: baseToken.address,
          amount: ethers.utils.formatEther(additionalAmountNeeded),
          tokenType: tokenType
        });

        const splitTx = await futarchyRouter.splitPosition(
          MARKET_ADDRESS,
          baseToken.address,
          additionalAmountNeeded,
          { gasLimit: 700000 }
        );

        console.log('Split position transaction sent:', splitTx.hash);
        console.log('Waiting for transaction confirmation...');

        const receipt = await splitTx.wait();

        if (receipt.status !== 1) {
          throw new Error('Split position transaction failed');
        }

        console.log('Split position completed successfully');
        // Add small delay before showing completion
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('Already have enough outcome tokens, skipping split step');
        setCurrentStep(2); // Skip to swap step
      }

      // STEP 2: PROCESSING SWAP
      setCurrentStep(2);

      // Determine which tokens to swap
      let tokenIn, tokenOut;
      if (selectedAction === 'Buy') {
        tokenIn = selectedOutcome === 'approved'
          ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress;

        tokenOut = selectedOutcome === 'approved'
          ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress;
      } else {
        tokenIn = selectedOutcome === 'approved'
          ? MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress;

        tokenOut = selectedOutcome === 'approved'
          ? MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress
          : MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress;
      }

      // Substep 1: Approve token for SushiSwap
      setCurrentSubstep({ step: 2, substep: 1 });
      await handleTokenApproval(
        tokenIn,
        SUSHISWAP_V2_ROUTER,
        amountInWei,
        `${selectedAction === 'Buy' ? 'Currency' : 'Company'} ${selectedOutcome === 'approved' ? 'YES' : 'NO'}`
      );

      // Substep 2: Execute swap
      setCurrentSubstep({ step: 2, substep: 2 });
      const routeData = await fetchSushiSwapRoute({
        tokenIn,
        tokenOut,
        amount: amountInWei,
        userAddress,
        feeReceiver: "0xca226bd9c754F1283123d32B2a7cF62a722f8ADa"
      });

      const swapTx = await executeSushiSwapRoute({
        signer,
        routerAddress: SUSHISWAP_V2_ROUTER,
        routeData,
        options: {
          gasLimit: 400000,
          gasPrice: ethers.utils.parseUnits("0.97", "gwei")
        }
      });

      await swapTx.wait();
      setCurrentStep('completed');

      setTimeout(() => {
        setIsProcessing(false);
        setCurrentStep(null);
        setCurrentSubstep({ step: 1, substep: 0 });
        setIsConfirmModalOpen(false);
      }, 2000);

    } catch (error) {
      console.error('Swap failed:', error);
      setIsProcessing(false);
      setCurrentStep(null);
      setCurrentSubstep({ step: 1, substep: 0 });
      setError(error.message);
    }
  };

  // Add this effect to handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isProcessing) {
        setCurrentStep(null);
        setIsProcessing(false);
        alert("Transaction cancelled: Tab lost focus. Please try again with this tab active.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isProcessing]);

  // Balance fetching is now handled by parent component's useBalanceManager

  // Handler for when the native WXDAI->SDAI swap completes
  const handleNativeSwapComplete = ({ executedAmount, outcome, action }) => {
    console.log("[handleNativeSwapComplete] Function called.");
    console.log("[handleNativeSwapComplete] Received:", executedAmount, "Next step:", outcome, action);
    setIsNativeSwapModalOpen(false); // Close the native modal

    if (!executedAmount) {
      console.error("Native swap completed but no executed amount received.");
      // Optionally show an error to the user
      return;
    }

    try {
      // Format the received amount (assuming 18 decimals for currency token)
      const formattedAmount = formatBalance(ethers.utils.formatUnits(executedAmount, 18), getCurrencySymbol());

      // Prepare data for the ConfirmSwapModal (next step)
      const nextStepData = {
        outcome: outcome === 'approved' ? 'Event Will Occur' : 'Event Won\'t Occur',
        amount: formattedAmount, // Use the actual received SDAI amount
        action: action, // Should be 'Buy' or 'Sell' for the position token
        timestamp: new Date().toISOString(),
      };

      console.log("[handleNativeSwapComplete] Opening ConfirmSwapModal with data:", nextStepData);
      setConfirmModalData(nextStepData); // Set the data for the confirm modal
      setIsConfirmModalOpen(true); // Open the confirm modal
      console.log("[handleNativeSwapComplete] States updated to open ConfirmSwapModal.");

    } catch (formatError) {
      console.error("Error formatting executed amount:", formatError);
      // Optionally show an error
    }
  };

  const displayedPriceImpact = Number(quoterPreview.priceImpactPct);
  const hasPriceImpact = Number.isFinite(displayedPriceImpact);
  const priceImpactTooHigh = hasPriceImpact && displayedPriceImpact > 15;
  const quoteUnavailable = (chainId === 1 || chainId === 100) && (quoterPreview.quotedAmountIn !== amount || !quoterPreview.amountOut);

  return (
    <>
      <div className="relative flex flex-col bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
        {marketHasClosed && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-10 flex items-center justify-center">
            <span className="text-white text-2xl font-bold bg-black/50 px-6 py-3 rounded-lg">
              Market Closed
            </span>
          </div>
        )}
        {/* Add connection status display */}
        {connectionError && (
          <div className="p-4 bg-red-100 text-red-700 text-sm">
            {connectionError}
          </div>
        )}

        {isConnecting && (
          <div className="p-4 bg-blue-100 text-blue-700 text-sm">
            Connecting to MetaMask...
          </div>
        )}

        {/* Add error display */}
        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Yes/No Selector as Tabs */}
        <div className="h-16 px-4 pt-4 border-b-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2">
          <div className="grid grid-cols-2 gap-3 -mb-px">
            <button
              onClick={() => handleOutcomeSelect('approved')}
              className={`group relative overflow-hidden flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors duration-200 ease-in-out rounded-t-2xl ${selectedOutcome === 'approved'
                ? 'bg-futarchyBlue3 dark:bg-futarchyBlue6/40 text-futarchyBlue11 dark:text-futarchyBlue6 border-2 border-b-0 border-futarchyBlue7'
                : 'bg-transparent text-futarchyGray11 border-2 border-transparent'
                }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>If Yes</span>
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent ${selectedOutcome === 'approved' ? 'via-white/20' : 'via-black/10'} dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none`}></div>
            </button>

            <button
              onClick={() => handleOutcomeSelect('reproved')}
              className={`group relative overflow-hidden flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors duration-200 ease-in-out rounded-t-2xl ${selectedOutcome === 'reproved'
                ? 'bg-futarchyGold3 dark:bg-futarchyGold6/30 text-futarchyGold11 dark:text-futarchyGold6 border-2 border-b-0 border-futarchyGold9'
                : 'bg-transparent text-futarchyGray11 border-2 border-transparent'
                }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              <span>If No</span>
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent ${selectedOutcome === 'reproved' ? 'via-white/20' : 'via-black/10'} dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none`}></div>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Buy/Sell Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleActionSelect('Buy')}
              className={`group relative overflow-hidden py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ease-in-out border-2 ${selectedAction === 'Buy'
                ? 'bg-futarchyTeal4 text-futarchyTeal11 border-futarchyTeal7 dark:bg-futarchyTeal6/50 dark:text-futarchyTeal4 dark:border-futarchyTeal6'
                : 'bg-futarchyGray2 text-futarchyGray11 border-futarchyGray62 dark:bg-futarchyDarkGray2 dark:text-futarchyGray112 dark:border-futarchyGray112/40'
                }`}
            >
              Buy
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent ${selectedAction === 'Buy' ? 'via-white/20' : 'via-black/10'} dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none`}></div>
            </button>
            <button
              onClick={() => handleActionSelect('Sell')}
              className={`group relative overflow-hidden py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ease-in-out border-2 ${selectedAction === 'Sell'
                ? 'bg-futarchyCrimson4 text-futarchyCrimson11 border-futarchyCrimson9 dark:bg-futarchyCrimson9/60 dark:text-futarchyCrimson7 dark:border-futarchyCrimson9'
                : 'bg-futarchyGray2 text-futarchyGray11 border-futarchyGray62 dark:bg-futarchyDarkGray2 dark:text-futarchyGray112 dark:border-futarchyGray112/40'
                }`}
            >
              Sell
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent ${selectedAction === 'Sell' ? 'via-white/20' : 'via-black/10'} dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none`}></div>
            </button>
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-futarchyGray12 dark:text-futarchyGray3 text-xs font-semibold mb-1 block">
              Amount ({selectedAction === 'Buy' ? getCurrencySymbol() : getCompanySymbol()})
            </label>
            <div className="relative">
              <div className="flex items-center border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 rounded-xl h-12">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className="flex-1 h-full px-4 bg-transparent text-futarchyGray12 dark:text-futarchyGray3 focus:outline-none rounded-xl"
                  placeholder="0.00"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                  <button
                    onClick={account ? handleMaxClick : undefined}
                    className={`px-2 py-1 bg-futarchyGray4 dark:bg-transparent text-futarchyGray11 rounded text-xs font-medium hover:bg-futarchyGray5 transition-colors ${!account ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Balance Section */}
          <div className="flex justify-between text-xs mt-1">
            <span className="text-futarchyGray11 dark:text-futarchyGray112">Available</span>
            <span
              onClick={account ? handleMaxClick : undefined}
              className={`text-futarchyGray12 dark:text-futarchyGray112 font-medium ${account ? 'cursor-pointer hover:text-futarchyGray11 transition-colors' : ''}`}
            >
              {(() => {
                if (!account) return '-';
                if (!positions || isLoadingBalances) return 'Loading...'; // Show loading when positions or balances are loading

                // Calculate available balance based on selected outcome and action
                let calculatedValueStr, symbol;

                if (selectedAction === 'Buy') {
                  // For Buy action, determine balance based on selected currency mode
                  if (selectedCurrency === getCurrencySymbol()) {
                    // Currency mode: Sum position tokens + currency balance
                    const outcomeBalance = selectedOutcome === 'approved'
                      ? (positions?.currencyYes?.total || '0')
                      : (positions?.currencyNo?.total || '0');
                    const baseBalance = balances?.sdaiBalance || '0';
                    symbol = getCurrencySymbol();

                    try {
                      const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
                      const baseBN = ethers.utils.parseUnits(baseBalance, 18);
                      const totalBN = outcomeBN.add(baseBN);
                      calculatedValueStr = ethers.utils.formatUnits(totalBN, 18);
                    } catch (calcError) {
                      console.error('Error calculating currency balance:', calcError);
                      calculatedValueStr = outcomeBalance || '-';
                    }
                  } else if (selectedCurrency === 'WXDAI') {
                    if (redirectToCOW) {
                      // When redirectToCOW is true: Show currency + position tokens (like currency mode)
                      const outcomeBalance = selectedOutcome === 'approved'
                        ? (positions?.currencyYes?.total || '0')
                        : (positions?.currencyNo?.total || '0');
                      const baseBalance = balances?.sdaiBalance || '0';
                      symbol = getCurrencySymbol();

                      try {
                        const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
                        const baseBN = ethers.utils.parseUnits(baseBalance, 18);
                        const totalBN = outcomeBN.add(baseBN);
                        calculatedValueStr = ethers.utils.formatUnits(totalBN, 18);
                      } catch (calcError) {
                        console.error('Error calculating WXDAI redirectToCOW balance:', calcError);
                        calculatedValueStr = outcomeBalance || '-';
                      }
                    } else {
                      // Original behavior: Show ONLY native xDAI balance (no position tokens)
                      calculatedValueStr = balances?.nativeBalance || '0';
                      symbol = 'xDAI';
                    }
                  } else {
                    // Fallback mode: Sum position tokens + WXDAI balance
                    const outcomeBalance = selectedOutcome === 'approved'
                      ? (positions?.currencyYes?.total || '0')
                      : (positions?.currencyNo?.total || '0');
                    const baseBalance = positions?.wxdai || '0';
                    symbol = 'WXDAI';

                    try {
                      const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
                      const baseBN = ethers.utils.parseUnits(baseBalance, 18);
                      const totalBN = outcomeBN.add(baseBN);
                      calculatedValueStr = ethers.utils.formatUnits(totalBN, 18);
                    } catch (calcError) {
                      console.error('Error calculating fallback balance:', calcError);
                      calculatedValueStr = outcomeBalance || '-';
                    }
                  }
                } else { // Sell
                  // For Sell action: Always sum position tokens + base token balance
                  const outcomeBalance = selectedOutcome === 'approved'
                    ? (positions?.companyYes?.total || '0')
                    : (positions?.companyNo?.total || '0');
                  const baseBalance = positions?.faot || '0'; // Company token balance from positions
                  symbol = getCompanySymbol();

                  try {
                    const outcomeBN = ethers.utils.parseUnits(outcomeBalance, 18);
                    const baseBN = ethers.utils.parseUnits(baseBalance, 18);
                    const totalBN = outcomeBN.add(baseBN);
                    calculatedValueStr = ethers.utils.formatUnits(totalBN, 18);
                  } catch (calcError) {
                    console.error('Error calculating sell balance:', calcError);
                    calculatedValueStr = outcomeBalance || '-';
                  }
                }

                // If we don't have a valid calculated value, show dash
                if (!calculatedValueStr || calculatedValueStr === '0' || calculatedValueStr === '0.0') {
                  return '-';
                }

                return `${formatWith(parseFloat(calculatedValueStr), 'balance')} ${symbol}`;
              })()}
            </span>
          </div>

          {/* GET MORE SDAI Button - Show when redirectToCOW is true, in WXDAI mode, and in Buy mode */}
          {redirectToCOW && selectedCurrency === 'WXDAI' && selectedAction === 'Buy' && (
            <div className="flex justify-end">
              <a
                href={`https://swap.cow.fi/#/${config?.chainId || 100}/swap/_/${config?.BASE_TOKENS_CONFIG?.currency?.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-futarchyBlue11 dark:text-futarchyBlue9 hover:text-futarchyBlue9 dark:hover:text-futarchyBlue7 underline cursor-pointer"
                title={`Get ${getCurrencySymbol()}`}
              >
                Get {getCurrencySymbol()}
              </a>
            </div>
          )}

          {/* Outcomes Section */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-futarchyGray12 dark:text-futarchyGray3 text-xs font-semibold">
                Outcomes
              </h3>
              {/* Show toggle on Ethereum mainnet and Gnosis Chain when quote data is available */}
              {(chainId === 1 || chainId === 100) && quoterPreview.currentPrice && (
                <button
                  onClick={() => setShowPriceInfo(!showPriceInfo)}
                  className="flex items-center gap-1 text-[10px] text-futarchyGray11 dark:text-futarchyGray8 hover:text-futarchyGray12 dark:hover:text-futarchyGray3 transition-colors"
                  title={showPriceInfo ? "Hide price details" : "Show price details"}
                >
                  <span>More info</span>
                  <svg
                    className={`w-3 h-3 transition-transform ${showPriceInfo ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex rounded-2xl border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 overflow-hidden">
              {selectedOutcome === 'reproved' ? (
                <>
                  <div className="flex-1 flex flex-col items-center p-3 border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-futarchyGold7 animate-pulse"></div>
                      <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">If No</span>
                    </div>
                    <span className="text-sm font-semibold h-6 flex items-center text-futarchyGold9">
                      {(() => {
                        // Show quoter preview on Ethereum and Gnosis Chain
                        if ((chainId === 1 || chainId === 100) && quoterPreview.isLoading) {
                          return (
                            <span className="inline-flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span className="text-xs">Loading...</span>
                            </span>
                          );
                        }

                        // Insufficient liquidity check — covers both quoter success (extreme impact) and failure (no liquidity)
                        if ((chainId === 1 || chainId === 100) && quoterPreview.insufficientLiquidity) {
                          return <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 text-[10px]">Insufficient liquidity</span>;
                        }

                        if ((chainId === 1 || chainId === 100) && quoterPreview.amountOut) {
                          const symbol = selectedAction === 'Buy' ? getCompanySymbol() : getCurrencySymbol();
                          return `${formatTokenAmount(quoterPreview.amountOut)} ${symbol}`;
                        }

                        // Fallback to price calculation
                        const inputAmount = parseFloat(amount) || 0;
                        const noPrice = prices?.noPrice;
                        if (!noPrice) return '0.00';

                        const value = selectedAction === 'Buy'
                          ? inputAmount / noPrice
                          : inputAmount * noPrice;
                        const symbol = selectedAction === 'Buy' ? getCompanySymbol() : getCurrencySymbol();
                        return `${formatTokenAmount(value)} ${symbol} (estimate)`;
                      })()}
                    </span>
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                      {chainId === 1 && quoterPreview.amountOut ? 'Receive' : 'Receive'}
                    </span>
                    {/* Price info - on Ethereum mainnet and Gnosis Chain when we have quote data */}
                    {(chainId === 1 || chainId === 100) && quoterPreview.currentPrice && showPriceInfo && (
                      <div className="mt-2 pt-2 border-t border-futarchyGold6 dark:border-futarchyGold6/30 w-full space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-futarchyGray11 dark:text-white/50">Price Now</span>
                          <span className="text-futarchyGold11 dark:text-futarchyGold9 font-mono">{parseFloat(quoterPreview.currentPrice).toFixed(4)}</span>
                        </div>
                        {(() => {
                          const afterPrice = quoterPreview.priceAfter || quoterPreview.executionPrice;
                          const val = Number(quoterPreview.priceImpactPct);
                          if (!afterPrice || !Number.isFinite(val)) {
                            return (
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 text-[9px]">Insufficient liquidity</span>
                              </div>
                            );
                          }
                          return (
                            <>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyGray11 dark:text-white/50">After Swap</span>
                                <span className="text-futarchyGold11 dark:text-futarchyGold9 font-mono">{parseFloat(afterPrice).toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyGray11 dark:text-white/50">
                                  Price Impact
                                </span>
                                <span className={`font-medium ${val > 1 ? 'text-futarchyCrimson9' : 'text-futarchyGreen9'}`}>
                                  {val < 0.01 ? val.toFixed(4) : val.toFixed(2)}%
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col items-center p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-futarchyBlue9 animate-pulse"></div>
                      <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">If Yes</span>
                    </div>
                    <span className="text-sm font-semibold h-6 flex items-center text-futarchyBlue9">
                      {(() => {
                        const value = parseFloat(amount) || 0;
                        const symbol = selectedAction === 'Buy' ? getCurrencySymbol() : getCompanySymbol();
                        return `${formatTokenAmount(value)} ${symbol} (estimate)`;
                      })()}
                    </span>
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">Recover</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 flex flex-col items-center p-3 border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-futarchyBlue9 animate-pulse"></div>
                      <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">If Yes</span>
                    </div>
                    <span className="text-sm font-semibold h-6 flex items-center text-futarchyBlue9">
                      {(() => {
                        // Show quoter preview on Ethereum and Gnosis Chain
                        if ((chainId === 1 || chainId === 100) && quoterPreview.isLoading) {
                          return (
                            <span className="inline-flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span className="text-xs">Loading...</span>
                            </span>
                          );
                        }

                        // Insufficient liquidity check — covers both quoter success (extreme impact) and failure (no liquidity)
                        if ((chainId === 1 || chainId === 100) && quoterPreview.insufficientLiquidity) {
                          return <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 text-[10px]">Insufficient liquidity</span>;
                        }

                        if ((chainId === 1 || chainId === 100) && quoterPreview.amountOut) {
                          const symbol = selectedAction === 'Buy' ? getCompanySymbol() : getCurrencySymbol();
                          return `${formatTokenAmount(quoterPreview.amountOut)} ${symbol}`;
                        }

                        // Fallback to price calculation
                        const inputAmount = parseFloat(amount) || 0;
                        const yesPrice = prices?.yesPrice;
                        if (!yesPrice) return '0.00';

                        const value = selectedAction === 'Buy'
                          ? inputAmount / yesPrice
                          : inputAmount * yesPrice;
                        const symbol = selectedAction === 'Buy' ? getCompanySymbol() : getCurrencySymbol();
                        return `${formatTokenAmount(value)} ${symbol}`;
                      })()}
                    </span>
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
                      {chainId === 1 && quoterPreview.amountOut ? 'Receive' : 'Receive'}
                    </span>
                    {/* Price info - on Ethereum mainnet and Gnosis Chain when we have quote data */}
                    {(chainId === 1 || chainId === 100) && quoterPreview.currentPrice && showPriceInfo && (
                      <div className="mt-2 pt-2 border-t border-futarchyBlue6 dark:border-futarchyBlue6/30 w-full space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-futarchyGray11 dark:text-white/50">Price Now</span>
                          <span className="text-futarchyBlue11 dark:text-futarchyBlue9 font-mono">{parseFloat(quoterPreview.currentPrice).toFixed(4)}</span>
                        </div>
                        {(() => {
                          const afterPrice = quoterPreview.priceAfter || quoterPreview.executionPrice;
                          const val = Number(quoterPreview.priceImpactPct);
                          if (!afterPrice || !Number.isFinite(val)) {
                            return (
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyOrange11 dark:text-futarchyOrangeDark11 text-[9px]">Insufficient liquidity</span>
                              </div>
                            );
                          }
                          return (
                            <>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyGray11 dark:text-white/50">After Swap</span>
                                <span className="text-futarchyBlue11 dark:text-futarchyBlue9 font-mono">{parseFloat(afterPrice).toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-futarchyGray11 dark:text-white/50">
                                  Price Impact
                                </span>
                                <span className={`font-medium ${val > 1 ? 'text-futarchyCrimson9' : 'text-futarchyGreen9'}`}>
                                  {val < 0.01 ? val.toFixed(4) : val.toFixed(2)}%
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col items-center p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-futarchyGold7 animate-pulse"></div>
                      <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">If No</span>
                    </div>
                    <span className="text-sm font-semibold h-6 flex items-center text-futarchyGold9">
                      {(() => {
                        const value = parseFloat(amount) || 0;
                        const symbol = selectedAction === 'Buy' ? getCurrencySymbol() : getCompanySymbol();
                        return `${formatTokenAmount(value)} ${symbol}`;
                      })()}
                    </span>
                    <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">Recover</span>
                  </div>
                </>
              )}
            </div>
            {quoterPreview.amountOut && hasPriceImpact && displayedPriceImpact > 1 && (
              <div className={`mt-2 text-xs ${priceImpactTooHigh ? 'text-futarchyCrimson11' : 'text-futarchyOrange11'}`}>
                Price impact {displayedPriceImpact.toFixed(2)}%
              </div>
            )}
            {priceImpactTooHigh && (
              <label className="mt-2 flex items-start gap-2 text-xs text-futarchyCrimson11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tradeAnywayAcknowledged}
                  onChange={(event) => setTradeAnywayAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Price impact too high — pool depth insufficient for this size. Trade anyway.
                </span>
              </label>
            )}
          </div>

          {/* Confirm Transaction Button */}
          {account ? (
            <button
              onClick={handleConfirmClick}
              className="group relative overflow-hidden w-full py-3 px-4 rounded-xl font-semibold transition-colors text-sm bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-2 border-futarchyGray62 dark:border-futarchyGray112/40 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!amount || parseFloat(amount) <= 0 || marketHasClosed || quoterPreview.isLoading || quoteUnavailable || quoterPreview.insufficientLiquidity || (priceImpactTooHigh && !tradeAnywayAcknowledged)}
            >
              <span className="relative z-10">{quoterPreview.isLoading ? 'Calculating...' : quoterPreview.insufficientLiquidity || quoteUnavailable ? 'Quote Unavailable' : priceImpactTooHigh && !tradeAnywayAcknowledged ? 'Acknowledge High Impact' : 'Confirm Swap'}</span>
              {(amount && parseFloat(amount) > 0 && !marketHasClosed) && (
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none"></div>
              )}
            </button>
          ) : (
            <button
              onClick={onConnectWallet}
              className="group relative overflow-hidden w-full py-3 px-4 rounded-xl font-semibold transition-colors text-sm bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-2 border-futarchyGray62 dark:border-futarchyGray112/40 text-black dark:text-white"
            >
              <span className="relative z-10">Connect Wallet</span>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none"></div>
            </button>
          )}
        </div>
      </div>

      {isConfirmModalOpen && (
        <ConfirmSwapModal
          onClose={() => setIsConfirmModalOpen(false)}
          transactionData={confirmModalData}
          proposalId={proposalId}
          existingBalance={(() => {
            const balance = selectedAction === 'Buy'
              ? (selectedOutcome === 'approved'
                ? positions?.currencyYes?.total
                : positions?.currencyNo?.total)
              : (selectedOutcome === 'approved'
                ? positions?.companyYes?.total
                : positions?.companyNo?.total);

            console.log('Exact balance for swap:', {
              balance,
              action: selectedAction,
              outcome: selectedOutcome,
              positions
            });

            return balance;
          })()}
          additionalCollateralNeeded={(() => {
            // Skip collateral check for sell if not needed
            if (selectedAction === 'Sell' && !SHOWCASE_CHECK_SELL_COLLATERAL) return '0';

            const existingBalance = selectedAction === 'Buy'
              ? (selectedOutcome === 'approved'
                ? positions?.currencyYes?.total || '0'
                : positions?.currencyNo?.total || '0')
              : (selectedOutcome === 'approved'
                ? positions?.companyYes?.total || '0'
                : positions?.companyNo?.total || '0');

            try {
              // Convert to BigNumber for precise calculation
              const amountBN = ethers.utils.parseUnits(amount || '0', 18);
              const existingBalanceBN = ethers.utils.parseUnits(existingBalance || '0', 18);

              console.log('Collateral calculation:', {
                amount,
                amountWei: amountBN.toString(),
                existingBalance,
                existingBalanceWei: existingBalanceBN.toString(),
                action: selectedAction
              });

              // Calculate how much more we need
              const diffBN = amountBN.sub(existingBalanceBN);

              // Return needed amount for both buy and sell
              if (diffBN.gt(ethers.constants.Zero)) {
                const neededAmount = ethers.utils.formatUnits(diffBN, 18);
                console.log('Additional collateral needed:', neededAmount);
                return neededAmount;
              }
              return '0';
            } catch (error) {
              console.error('Error calculating needed amount:', error);
              return '0';
            }
          })()}
          checkSellCollateral={true}
          onTransactionComplete={handleTransactionComplete}
        />
      )}

      {/* Native WXDAI -> SDAI Swap Modal */}
      {isNativeSwapModalOpen && (
        <SwapNativeToCurrencyModal
          isOpen={isNativeSwapModalOpen}
          onClose={() => setIsNativeSwapModalOpen(false)}
          initialAmount={amount}
          nextStepOutcome={selectedOutcome}
          nextStepAction={selectedAction}
          onComplete={handleNativeSwapComplete}
        />
      )}
    </>
  );
};

export default ShowcaseSwapComponent;
