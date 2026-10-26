import React, { useState } from 'react';
import { ethers } from 'ethers';
import RedirectConfirmationModal from '../../common/RedirectConfirmationModal';
import { formatWith } from '../../../utils/precisionFormatter';

// Calculate net surplus of YES minus NO with full precision
const calculateSurplus = (yesAmount, noAmount) => {
  try {
    const yesBN = ethers.utils.parseUnits(yesAmount || '0', 18);
    const noBN = ethers.utils.parseUnits(noAmount || '0', 18);
    const diffBN = yesBN.sub(noBN);
    return ethers.utils.formatUnits(diffBN, 18);
  } catch (error) {
    console.error('Error calculating surplus:', { error, yesAmount, noAmount });
    return '0';
  }
};

// Format small amounts for display
const formatSmallAmount = (value, symbol) => {
  if (!value || isNaN(value)) return `0 ${symbol}`;
  try {
    const bn = ethers.utils.parseUnits(value.toString(), 18);
    if (bn.isZero()) return `0 ${symbol}`;
    const num = parseFloat(ethers.utils.formatUnits(bn, 18));
    if (num > 0 && num < 0.00001) return `< 0.00001 ${symbol}`;
    if (num < 0.1) return `${formatWith(num, 'amount')} ${symbol}`;
    return `${formatWith(num, 'balance')} ${symbol}`;
  } catch (error) {
    console.error('Error in formatSmallAmount:', { value, symbol, error });
    return `0 ${symbol}`;
  }
};

// Treat very small numbers as zero
const isVisuallyZero = (val) => {
  if (!val || isNaN(val)) return true;
  return parseFloat(val) < 0.00001;
};

// Prepare transaction data for closing/redeeming positions
const getTransactionData = (isYes, diff, action = 'Sell', isCompany = true, config = null) => {
  try {
    const d = diff.toString();
    const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';
    const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'sDAI';
    const amount = `${d} ${isCompany ? companySymbol : currencySymbol}`;
    const outcome = isYes ? 'Event Will Occur' : 'Event Will Not Occur';
    return { amount, action, outcome, isClosingPosition: false, useExistingCollateral: true };
  } catch (error) {
    console.error('Error preparing transaction data:', { error, diff, isYes, action, isCompany });
    return null;
  }
};

const PositionsTable = ({
  positions,
  selectedCurrency,
  sdaiRate,
  isLoadingRate,
  rateError,
  setCurrentTransactionData,
  setIsConfirmModalOpen,
  config, // Add config prop for dynamic token addresses
  isLoadingPositions = false, // Add loading state prop
  balanceError = null, // Add error state prop
  refetchBalances = null, // Add refetch function prop
}) => {
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');

  // Show error state if there's an error fetching balances
  if (balanceError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 bg-seer-page rounded-xl border border-seer-border">
        <div className="text-center">
          <p className="text-sm font-semibold text-seer-text mb-1">
            Failed to load positions
          </p>
          <p className="text-xs text-seer-muted">
            {balanceError || 'RPC connection failed'}
          </p>
        </div>
        {refetchBalances && (
          <button
            onClick={refetchBalances}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-seer-surface-raised hover:bg-seer-border text-seer-text border border-seer-border transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // Show loading state if positions are being loaded
  if (isLoadingPositions || !positions) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-seer-page rounded-xl border border-seer-border">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-seer-border border-t-seer-purple"></div>
        <p className="text-sm text-seer-muted ">
          Loading positions...
        </p>
      </div>
    );
  }

  // Determine existence of any positions
  const yDiffRaw = calculateSurplus(positions?.currencyYes?.total, positions?.currencyNo?.total);
  const cDiffRaw = calculateSurplus(positions?.companyYes?.total, positions?.companyNo?.total);
  const hasPos = !ethers.utils.parseUnits(cDiffRaw, 18).isZero() || !ethers.utils.parseUnits(yDiffRaw, 18).isZero();
  if (!hasPos) {
    return <div className="text-center py-8 text-seer-muted">No active positions</div>;
  }

  // Use these for display and logic
  const currencyDiff = yDiffRaw;
  const companyDiff = cDiffRaw;

  PositionsTable.shouldShowEarlyRedeem = () => {
    if (isVisuallyZero(Math.abs(companyDiff))) return true;
    const pos = Number(currencyDiff) >= 0 && Number(companyDiff) >= 0;
    const neg = Number(currencyDiff) < 0 && Number(companyDiff) < 0;
    return pos || neg;
  };

  return (
    <div>
      <div className="flex flex-col bg-seer-page rounded-xl border border-seer-border">
        <div className="px-5 py-3 border-b border-seer-border">
          <div className="grid grid-cols-4 gap-4 items-center">
            <div className="text-sm text-seer-muted font-semibold">Condition</div>
          </div>
        </div>

        {/* Company position row */}
        {!isVisuallyZero(Math.abs(companyDiff)) && (
          <div className="px-5 py-3">
            <div className="grid grid-cols-4 gap-4 items-center text-sm">
              <div className="flex items-center gap-2">
                <svg className={`w-5 h-5 ${Number(companyDiff) >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`} viewBox="0 0 20 20" fill="currentColor">
                  {Number(companyDiff) >= 0 ? (
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  )}
                </svg>
                <span className="text-seer-text font-semibold">
                  {Number(companyDiff) >= 0 ? 'If the event occurs' : "If the event doesn't occur"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-seer-muted">Receive</span>
              </div>
              <div className={`font-medium ${Number(companyDiff) >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`}>
                {formatSmallAmount(Math.abs(companyDiff), config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY')}
              </div>
              <div>
                <button
                  onClick={() => {
                    const tx = getTransactionData(
                      Number(companyDiff) >= 0,
                      Number(companyDiff) >= 0 ? companyDiff : companyDiff.replace('-', ''),
                      'Sell',
                      true,
                      config
                    );
                    setCurrentTransactionData(tx);
                    setIsConfirmModalOpen(true);
                  }}
                  className="w-full py-2 px-4 rounded-lg font-medium transition-colors hover:bg-seer-surface hover:text-seer-negative hover:border-seer-negative/40 dark:bg-transparent bg-seer-negative/10 text-seer-negative border border-seer-negative/40 hover:bg-seer-negative/10"
                >
                  {Number(companyDiff) >= 0 ? `Sell YES_${config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY'} to close` : `Sell NO_${config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY'} to close`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Currency position row */}
        {!isVisuallyZero(Math.abs(currencyDiff)) && (
          <div className="px-5 py-3">
            <div className="grid grid-cols-4 gap-4 items-center text-sm">
              <div className="flex items-center gap-2">
                <svg className={`w-5 h-5 ${Number(currencyDiff) >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`} viewBox="0 0 20 20" fill="currentColor">
                  {Number(currencyDiff) >= 0 ? (
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  )}
                </svg>
                <span className="text-seer-text font-semibold">
                  {Number(currencyDiff) >= 0 ? 'If the event occurs' : "If the event doesn't occur"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-seer-muted">Receive</span>
              </div>
              <div className={`font-medium ${Number(currencyDiff) >= 0 ? 'text-seer-positive' : 'text-seer-negative'}`}>
                {(() => {
                  const val = Math.abs(Number(currencyDiff));
                  const curr = selectedCurrency;
                  const disp = curr === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError ? val * sdaiRate : val;
                  const prec = curr === 'WXDAI' ? 4 : 2;
                  const fmt = disp.toFixed(prec);
                  if (disp > 0 && disp < (curr === 'WXDAI' ? 0.00001 : 0.0001)) {
                    return `< 0.00001 ${curr}`;
                  } else if (disp === 0) {
                    return `0 ${curr}`;
                  }
                  return `${fmt} ${curr}`;
                })()}
              </div>
              <div>
                <button
                  onClick={() => {
                    // Check if this is the special case: only currency position exists (no company position)
                    const onlyCurrencyPosition = isVisuallyZero(Math.abs(companyDiff));

                    if (onlyCurrencyPosition) {
                      // Special button: "Close on prediction market"
                      // Use dynamic config for token addresses
                      const outputCurrency = config?.BASE_TOKENS_CONFIG?.currency?.address || '0xaf204776c7245bF4147c2612BF6e5972Ee483701';
                      const inputCurrencyYes = config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress || '0x9ea98d3f845c3b3bdb2310aa5c301505b61402c7';
                      const inputCurrencyNo = config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress || '0x24334a29a324ed40a08aaf035bbedff374313145';

                      // Use Uniswap V3 for Ethereum mainnet (chain 1), Swapr for other chains
                      const baseUrl = config?.chainId === 1
                        ? `https://app.uniswap.org/swap?outputCurrency=${outputCurrency}`
                        : `https://v3.swapr.eth.limo/#/swap?outputCurrency=${outputCurrency}`;
                      const url = Number(currencyDiff) >= 0
                        ? `${baseUrl}&inputCurrency=${inputCurrencyYes}`
                        : `${baseUrl}&inputCurrency=${inputCurrencyNo}`;
                      setRedirectUrl(url);
                      setShowRedirectModal(true);
                    } else {
                      // Normal button: "Buy YES_GNO/NO_GNO to close"
                      const tx = getTransactionData(
                        Number(currencyDiff) >= 0,
                        Number(currencyDiff) >= 0 ? currencyDiff : currencyDiff.replace('-', ''),
                        'Buy',
                        false,
                        config
                      );
                      setCurrentTransactionData(tx);
                      setIsConfirmModalOpen(true);
                    }
                  }}
                  className="w-full py-2 px-4 rounded-lg font-medium transition-colors hover:bg-seer-surface hover:text-seer-negative hover:border-seer-negative/40 dark:bg-transparent bg-seer-negative/10 text-seer-negative border border-seer-negative/40 hover:bg-seer-negative/10"
                >
                  {(() => {
                    // Check if this is the special case: only currency position exists (no company position)
                    const onlyCurrencyPosition = isVisuallyZero(Math.abs(companyDiff));

                    if (onlyCurrencyPosition) {
                      return 'Close on prediction market';
                    } else {
                      // Normal case: "Buy YES_GNO/NO_GNO to close"
                      const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';
                      return Number(currencyDiff) >= 0
                        ? `Buy YES_${companySymbol} to close`
                        : `Buy NO_${companySymbol} to close`;
                    }
                  })()}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <RedirectConfirmationModal
        showModal={showRedirectModal}
        onClose={() => setShowRedirectModal(false)}
        onAccept={() => {
          // Create a temporary anchor element
          const link = document.createElement('a');
          link.href = redirectUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer'; // Good practice for security and to prevent tab-nabbing
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setShowRedirectModal(false);
        }}
      />
    </div>
  );
};

export default PositionsTable;