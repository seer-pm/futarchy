import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatBalance } from '../../../utils/formatters';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { formatWith } from '../../../utils/precisionFormatter';

const LoadingSpinner = ({ className = "h-4 w-4" }) => (
  <div className="flex items-center justify-center">
    <div className={`animate-spin rounded-full border-b-2 border-futarchyGray12 dark:border-white ${className}`}></div>
  </div>
);

const PlusIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const SplitIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* trunk */}
    <path d="M8 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    {/* branches */}
    <path d="M8 7L5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M8 7l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    {/* arrow hints */}
    <path d="M5 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M11 10H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const MergeIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* branches */}
    <path d="M5 6l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M11 6L8 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    {/* trunk */}
    <path d="M8 9v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    {/* merge hint */}
    <path d="M7 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const MintIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 9H9v2.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V9H6.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5H8V6.5c0-.28.22-.5.5-.5s.5.22.5.5V8h2.5c.28 0 .5.22.5.5s-.22.5-.5.5z" />
  </svg>
);

const ChevronDownIcon = ({ className, isOpen }) => (
  <svg
    className={`${className} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
    viewBox="0 0 16 16"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M4.646 6.646a.5.5 0 0 1 .708 0L8 9.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z" />
  </svg>
);

// Simple dropdown selector for collateral actions
const CollateralDropdown = ({ onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (action) => {
    onSelect(action);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200 bg-futarchyGray4 dark:bg-futarchyGray8 hover:bg-futarchyGray5 dark:hover:bg-futarchyGray7 text-futarchyGray11 dark:text-futarchyGray12 border border-futarchyGray6 dark:border-futarchyGray6"
      >
        <span>Collateral</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-36 bg-white dark:bg-futarchyDarkGray3 border border-futarchyGray6 dark:border-futarchyGray6 rounded-lg shadow-lg z-50">
          <button
            onClick={() => handleSelect('add')}
            className="w-full px-3 py-2 text-left text-xs text-futarchyGray12 dark:text-futarchyGray3 hover:bg-futarchyGray3 dark:hover:bg-futarchyGray7 rounded-t-lg transition-colors"
          >
            Split Collateral
          </button>
          <button
            onClick={() => handleSelect('remove')}
            className="w-full px-3 py-2 text-left text-xs text-futarchyGray12 dark:text-futarchyGray3 hover:bg-futarchyGray3 dark:hover:bg-futarchyGray7 rounded-b-lg transition-colors"
          >
            Merge Collateral
          </button>
        </div>
      )}
    </div>
  );
};

const WalletBalanceItem = ({ tokenName, walletBalance, isLoading, showBorder = false }) => (
  <div className={`flex-1 flex flex-col items-center justify-center p-3 ${showBorder ? 'border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40' : ''}`}>
    <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">{tokenName}</span>
    <span className="text-sm font-semibold text-futarchyGray12 dark:text-white h-6 flex items-center">
      {isLoading ? <LoadingSpinner /> : `${formatWith(parseFloat(walletBalance || '0'), 'balance')} ${tokenName}`}
    </span>
  </div>
);

// positionBalance is min(YES, NO): the amount that can be merged back into
// the base token. Label it as such and show the YES/NO holdings, otherwise a
// wallet holding only YES tokens reads as "0 GNO".
const BalanceItem = ({ tokenName, positionBalance, yesBalance, noBalance, walletBalance, isLoading, showBorder = false, buyTokenUrl }) => (
  <div className={`flex-1 min-w-0 flex flex-col items-center p-3 ${showBorder ? 'border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40' : ''}`}>
    <span className="text-sm text-futarchyGray11 dark:text-white/70 font-medium">{tokenName}</span>
    <span
      className="text-sm font-semibold text-futarchyGray12 dark:text-white h-6 flex items-center gap-1"
      title={`Mergeable = min(YES_${tokenName}, NO_${tokenName}): the amount you can merge back into ${tokenName}`}
    >
      {isLoading ? <LoadingSpinner /> : (
        <>
          {`${formatWith(parseFloat(positionBalance || '0'), 'balance')} ${tokenName}`}
          <span className="text-[10px] font-medium text-futarchyGray11 dark:text-white/60">mergeable</span>
        </>
      )}
    </span>
    {!isLoading && (
      <span className="text-[10px] text-futarchyGray11 dark:text-white/60 whitespace-nowrap">
        <span className="text-futarchyBlue11 dark:text-futarchyBlue9">YES {formatWith(parseFloat(yesBalance || '0'), 'balance')}</span>
        {' · '}
        <span className="text-futarchyGold11 dark:text-futarchyGold8">NO {formatWith(parseFloat(noBalance || '0'), 'balance')}</span>
      </span>
    )}
    <a
      href={buyTokenUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-futarchyGray11 dark:text-futarchyGray112 hover:text-futarchyGray12 dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1 relative"
    >
      <span className="font-medium">
        Wallet:
      </span>
      <span className="font-semibold">
        {isLoading ? '...' : `${formatWith(parseFloat(walletBalance || '0'), 'balance')} ${tokenName}`}
      </span>
      <PlusIcon className="w-3 h-3 ml-0.5 -mt-0.5 opacity-70 hover:opacity-100 transition-opacity" />
    </a>
  </div>
);

const ActionButton = ({ onClick, icon, text }) => (
  <button
    onClick={onClick}
    className="group relative overflow-hidden w-full py-3 px-4 rounded-xl font-semibold transition-colors cursor-pointer xl:text-sm text-xs bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-2 border-futarchyGray62 dark:border-futarchyGray112/40 text-black dark:text-white flex items-center justify-center gap-2"
  >
    {icon}
    <span className="relative z-10">{text}</span>
    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none"></div>
  </button>
);

const LinkButton = ({ href, text }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group relative overflow-hidden w-full py-3 px-4 rounded-xl font-semibold transition-colors cursor-pointer xl:text-sm text-xs bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-2 border-futarchyGray62 dark:border-futarchyGray112/40 text-black dark:text-white flex items-center justify-center gap-2 text-center"
  >
    <span className="relative z-10">{text}</span>
    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none"></div>
  </a>
);

const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center p-6 space-y-4">
    <div className="text-center">
      <p className="text-sm font-semibold text-futarchyGray12 dark:text-white mb-1">
        Failed to load balances
      </p>
      <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112">
        {error || 'RPC connection failed'}
      </p>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg text-xs font-semibold bg-futarchyGray4 dark:bg-futarchyGray8 hover:bg-futarchyGray5 dark:hover:bg-futarchyGray7 text-futarchyGray12 dark:text-white border border-futarchyGray6 dark:border-futarchyGray6 transition-colors"
      >
        Try Again
      </button>
    )}
  </div>
);

const ConnectWalletState = () => {
  const { openConnectModal } = useConnectModal();
  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-3">
      <p className="text-sm text-futarchyGray11 dark:text-white/70 text-center">
        Connect a wallet to see balances
      </p>
      {openConnectModal && (
        <button
          onClick={openConnectModal}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-futarchyGray4 dark:bg-futarchyGray8 hover:bg-futarchyGray5 dark:hover:bg-futarchyGray7 text-futarchyGray12 dark:text-white border border-futarchyGray6 dark:border-futarchyGray6 transition-colors"
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
};

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center p-6 space-y-3">
    <LoadingSpinner className="h-8 w-8" />
    <p className="text-sm text-futarchyGray11 dark:text-white/70">
      Loading balances...
    </p>
  </div>
);

const MarketBalancePanel = ({
  positions,
  openSwapNativeModal,
  address,
  handleOpenCollateralModal,
  isLoadingPositions = false,
  balanceError = null,
  refetchBalances = null,
  proposalId,
  devMode = false,
  getMoreTokensConfig,
}) => {
  // Use contract config for dynamic token symbols
  const { config } = useContractConfig(proposalId);

  // Helper functions for dynamic token symbols with fallbacks
  const getCurrencySymbol = () => config?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    (Number(config?.chainId) === 1 ? 'USDS' : 'sDAI');
  const getCompanySymbol = () => config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';

  // Get token URLs for "BUY" links - use chain ID from config (1 for mainnet, 100 for Gnosis)
  const chainId = config?.chainId || 100; // Default to Gnosis Chain
  const getCurrencyUrl = () => config?.BASE_TOKENS_CONFIG?.currency?.getTokenUrl || `https://swap.cow.fi/#/${chainId}/swap/_/${config?.BASE_TOKENS_CONFIG?.currency?.address}`;
  const getCompanyUrl = () => config?.BASE_TOKENS_CONFIG?.company?.getTokenUrl || `https://swap.cow.fi/#/${chainId}/swap/_/${config?.BASE_TOKENS_CONFIG?.company?.address}`;

  // Default buy tokens config
  const defaultGetMoreTokensConfig = {
    token1: { text: `BUY ${getCurrencySymbol()}`, link: getCurrencyUrl() },
    token2: { text: `BUY ${getCompanySymbol()}`, link: getCompanyUrl() },
  };

  const finalGetMoreTokensConfig = getMoreTokensConfig || defaultGetMoreTokensConfig;

  const sdiPositionBalance = Math.min(
    parseFloat(positions?.currencyYes?.total || 0),
    parseFloat(positions?.currencyNo?.total || 0)
  ).toString();

  const gnoPositionBalance = Math.min(
    parseFloat(positions?.companyYes?.total || 0),
    parseFloat(positions?.companyNo?.total || 0)
  ).toString();

  return (
    <div className="flex flex-col bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      {/* Balance Header with Collateral Dropdown */}
      <div className="flex h-16 py-3 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center justify-between">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">Balance</h3>
        {!devMode && (
          <CollateralDropdown onSelect={handleOpenCollateralModal} />
        )}
      </div>
      {/* Balance Content */}
      <div className="flex flex-col justify-between p-4">
        {/* Show error state if there's an error */}
        {!address ? (
          <ConnectWalletState />
        ) : balanceError ? (
          <ErrorState error={balanceError} onRetry={refetchBalances} />
        ) : isLoadingPositions || !positions?.wxdai ? (
          /* Show loading state while fetching OR if balances are null (not loaded yet) */
          <LoadingState />
        ) : devMode ? (
          <>
            {/* Unified Balance Card for devMode=true */}
            <div className="flex rounded-2xl min-h-[90px] border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 overflow-hidden">
              <BalanceItem
                tokenName={getCurrencySymbol()}
                positionBalance={sdiPositionBalance}
                yesBalance={positions?.currencyYes?.total}
                noBalance={positions?.currencyNo?.total}
                walletBalance={positions?.wxdai}
                isLoading={isLoadingPositions}
                showBorder
                buyTokenUrl={getCurrencyUrl()}
              />
              <BalanceItem
                tokenName={getCompanySymbol()}
                positionBalance={gnoPositionBalance}
                yesBalance={positions?.companyYes?.total}
                noBalance={positions?.companyNo?.total}
                walletBalance={positions?.faot}
                isLoading={isLoadingPositions}
                buyTokenUrl={getCompanyUrl()}
              />
            </div>

            {/* Action Buttons for devMode=true */}
            <div className="flex flex-row gap-3 mt-4 h-[50px]">
              <ActionButton
                onClick={() => handleOpenCollateralModal('add')}
                icon={<SplitIcon className="w-4 h-4 animate-pulse-strong" />}
                text="Split Collateral"
              />
              <ActionButton
                onClick={() => handleOpenCollateralModal('remove')}
                icon={<MergeIcon className="w-4 h-4 animate-pulse-strong" />}
                text="Merge Collateral"
              />
            </div>
          </>
        ) : (
          <>
            {/* Simplified Balance Card for devMode=false */}
            <div className="flex rounded-2xl h-[90px] border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 overflow-hidden">
              <WalletBalanceItem
                tokenName={getCurrencySymbol()}
                walletBalance={positions?.wxdai}
                isLoading={isLoadingPositions}
                showBorder
              />
              <WalletBalanceItem
                tokenName={getCompanySymbol()}
                walletBalance={positions?.faot}
                isLoading={isLoadingPositions}
              />
            </div>

            {/* Buy Tokens Buttons */}
            <div className="flex flex-row gap-3 mt-4 h-[50px]">
              {finalGetMoreTokensConfig?.token1 && (
                <LinkButton
                  href={finalGetMoreTokensConfig.token1.link}
                  text={finalGetMoreTokensConfig.token1.text}
                />
              )}
              {finalGetMoreTokensConfig?.token2 && (
                <LinkButton
                  href={finalGetMoreTokensConfig.token2.link}
                  text={finalGetMoreTokensConfig.token2.text}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MarketBalancePanel;
