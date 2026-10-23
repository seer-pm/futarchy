import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatBalance } from '../../../utils/formatters';
import { useContractConfig } from '../../../hooks/useContractConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { formatWith } from '../../../utils/precisionFormatter';
import Button, { buttonClassName } from '../../ui/Button';
import { Surface, SurfaceHeader } from '../../ui/Surface';

const LoadingSpinner = ({ className = "h-4 w-4" }) => (
  <div className="flex items-center justify-center">
    <div className={`animate-spin rounded-full border-2 border-seer-border border-t-seer-purple ${className}`}></div>
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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={buttonClassName({ variant: 'outline', size: 'sm' })}
      >
        <span>Collateral</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-44 p-1 bg-seer-surface border border-seer-border rounded-surface shadow-lg z-50">
          <button
            type="button"
            onClick={() => handleSelect('add')}
            className="w-full h-9 px-3 text-left text-sm text-seer-text hover:bg-seer-surface-raised rounded-control transition-colors"
          >
            Split Collateral
          </button>
          <button
            type="button"
            onClick={() => handleSelect('remove')}
            className="w-full h-9 px-3 text-left text-sm text-seer-text hover:bg-seer-surface-raised rounded-control transition-colors"
          >
            Merge Collateral
          </button>
        </div>
      )}
    </div>
  );
};

const WalletBalanceItem = ({ tokenName, walletBalance, isLoading, showBorder = false }) => (
  <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 p-3 ${showBorder ? 'border-r border-seer-border' : ''}`}>
    <span className="text-[13px] text-seer-muted">{tokenName}</span>
    <span className="text-sm font-semibold tabular-nums text-seer-text h-6 flex items-center">
      {isLoading ? <LoadingSpinner /> : `${formatWith(parseFloat(walletBalance || '0'), 'balance')} ${tokenName}`}
    </span>
  </div>
);

// positionBalance is min(YES, NO): the amount that can be merged back into
// the base token. Label it as such and show the YES/NO holdings, otherwise a
// wallet holding only YES tokens reads as "0 GNO".
const BalanceItem = ({ tokenName, positionBalance, yesBalance, noBalance, walletBalance, isLoading, showBorder = false, buyTokenUrl }) => (
  <div className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 p-3 ${showBorder ? 'border-r border-seer-border' : ''}`}>
    <span className="text-[13px] text-seer-muted">{tokenName}</span>
    <span
      className="text-sm font-semibold tabular-nums text-seer-text h-6 flex items-center gap-1"
      title={`Mergeable = min(YES_${tokenName}, NO_${tokenName}): the amount you can merge back into ${tokenName}`}
    >
      {isLoading ? <LoadingSpinner /> : (
        <>
          {`${formatWith(parseFloat(positionBalance || '0'), 'balance')} ${tokenName}`}
          <span className="text-[11px] font-normal text-seer-muted">mergeable</span>
        </>
      )}
    </span>
    {!isLoading && (
      <span className="text-[11px] tabular-nums text-seer-muted whitespace-nowrap">
        <span className="text-pass-text">YES {formatWith(parseFloat(yesBalance || '0'), 'balance')}</span>
        {' · '}
        <span className="text-fail-text">NO {formatWith(parseFloat(noBalance || '0'), 'balance')}</span>
      </span>
    )}
    <a
      href={buyTokenUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 text-xs text-seer-muted hover:text-seer-accent-text transition-colors cursor-pointer flex items-center gap-1 relative"
    >
      <span className="font-medium">
        Wallet:
      </span>
      <span className="font-semibold">
        {isLoading ? '...' : `${formatWith(parseFloat(walletBalance || '0'), 'balance')} ${tokenName}`}
      </span>
      <PlusIcon className="w-3 h-3 ml-0.5" />
    </a>
  </div>
);

const ActionButton = ({ onClick, icon, text }) => (
  <Button variant="outline" block onClick={onClick}>
    {icon}
    {text}
  </Button>
);

const LinkButton = ({ href, text }) => (
  <Button as="a" variant="outline" block href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </Button>
);

const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center p-6 space-y-4">
    <div className="text-center">
      <p className="text-sm font-semibold text-seer-text mb-1">
        Couldn&apos;t load balances
      </p>
      <p className="text-[13px] text-seer-muted">
        {error || 'RPC connection failed'}
      </p>
    </div>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

// Shown above balances we read earlier when the latest refresh failed, so the
// user knows the numbers may be out of date instead of seeing them zeroed.
const StaleBalancesNotice = ({ onRetry }) => (
  <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-control text-xs bg-seer-warning/10 text-seer-warning">
    <span>Couldn&apos;t refresh balances. Showing the last known values.</span>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold hover:underline"
      >
        Retry
      </button>
    )}
  </div>
);

const ConnectWalletState = () => {
  const { openConnectModal } = useConnectModal();
  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-3">
      <p className="text-sm text-seer-muted text-center">
        Connect a wallet to see balances
      </p>
      {openConnectModal && (
        <Button variant="secondary" size="sm" onClick={openConnectModal}>
          Connect Wallet
        </Button>
      )}
    </div>
  );
};

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center p-6 space-y-3">
    <LoadingSpinner className="h-8 w-8" />
    <p className="text-sm text-seer-muted">
      Loading balances...
    </p>
  </div>
);

const MarketBalancePanel = ({
  positions,
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

  // Outcome positions held unwrapped (ERC1155). They cannot be traded or
  // merged here, so they are listed apart from the balances above.
  const unwrappedHoldings = [
    [positions?.currencyYes?.unwrapped, `YES ${getCurrencySymbol()}`],
    [positions?.currencyNo?.unwrapped, `NO ${getCurrencySymbol()}`],
    [positions?.companyYes?.unwrapped, `YES ${getCompanySymbol()}`],
    [positions?.companyNo?.unwrapped, `NO ${getCompanySymbol()}`],
  ].filter(([amount]) => parseFloat(amount) > 0);

  return (
    <Surface className="flex flex-col">
      {/* Balance Header with Collateral Dropdown */}
      <SurfaceHeader
        as="h3"
        title="Balance"
        action={!devMode && <CollateralDropdown onSelect={handleOpenCollateralModal} />}
      />
      {/* Balance Content */}
      <div className="flex flex-col justify-between p-4">
        {address && balanceError && positions?.wxdai && (
          <StaleBalancesNotice onRetry={refetchBalances} />
        )}
        {/* No wallet: prompt to connect. Error with nothing loaded: error state. */}
        {!address ? (
          <ConnectWalletState />
        ) : balanceError && !positions?.wxdai ? (
          <ErrorState error={balanceError} onRetry={refetchBalances} />
        ) : isLoadingPositions || !positions?.wxdai ? (
          /* Show loading state while fetching OR if balances are null (not loaded yet) */
          <LoadingState />
        ) : devMode ? (
          <>
            {/* Unified Balance Card for devMode=true */}
            <div className="flex min-h-[90px] rounded-surface border border-seer-border overflow-hidden">
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
            <div className="flex flex-row gap-3 mt-4">
              <ActionButton
                onClick={() => handleOpenCollateralModal('add')}
                icon={<SplitIcon className="w-4 h-4" />}
                text="Split Collateral"
              />
              <ActionButton
                onClick={() => handleOpenCollateralModal('remove')}
                icon={<MergeIcon className="w-4 h-4" />}
                text="Merge Collateral"
              />
            </div>
          </>
        ) : (
          <>
            {/* Simplified Balance Card for devMode=false */}
            <div className="flex h-[90px] rounded-surface border border-seer-border overflow-hidden">
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
            <div className="flex flex-row gap-3 mt-4">
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
        {address && unwrappedHoldings.length > 0 && (
          <p className="mt-3 text-xs text-seer-muted">
            Held unwrapped, not counted above and not tradable here:{' '}
            {unwrappedHoldings.map(([amount, label]) => `${formatBalance(amount, '')} ${label}`).join(', ')}
          </p>
        )}
      </div>
    </Surface>
  );
};

export default MarketBalancePanel;
