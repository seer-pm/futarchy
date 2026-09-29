import React, { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { formatBalance } from '../../../../utils/formatters';
import RedemptionModal from './RedemptionModal';

const RedeemButton = ({ onClick, disabled = false, isConnected = false, isWinningOutcomeYes = true }) => {
  const baseClasses = "font-semibold py-2 px-4 rounded text-sm border-2 transition-colors";
  const colorClasses = !isConnected
    ? "bg-futarchyGray4 text-futarchyGray8 border-futarchyGray6 cursor-not-allowed"
    : disabled
      ? "bg-futarchyGray4 text-futarchyGray8 border-futarchyGray6 cursor-not-allowed"
      : isWinningOutcomeYes
        ? "bg-futarchyBlue3 dark:bg-futarchyBlue6/20 text-futarchyBlue11 dark:text-futarchyBlue6 border-futarchyBlue7 hover:bg-futarchyBlue4 dark:hover:bg-futarchyBlue6/50"
        : "bg-futarchyGold3 dark:bg-futarchyGold6/20 text-futarchyGold11 dark:text-futarchyGold6 border-futarchyGold9 hover:bg-futarchyGold4 dark:hover:bg-futarchyGold6/40";

  return (
    <button
      onClick={onClick}
      disabled={disabled || !isConnected}
      className={`${baseClasses} ${colorClasses}`}
    >
      {!isConnected ? 'Connect Wallet' : 'Redeem All'}
    </button>
  );
};

export const RedeemTokens = ({ config, positions = {}, isLoadingPositions = false, onBalancesChanged }) => {
  const { address, isConnected } = useAccount();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Determine winning outcome and corresponding tokens
  const winningOutcome = config?.marketInfo?.finalOutcome; // "Yes", "No", etc.
  const isWinningOutcomeYes = winningOutcome?.toLowerCase() === 'yes';

  // Get the winning outcome token balances
  const winningTokens = useMemo(() => {
    if (!config?.MERGE_CONFIG || !positions) {
      return null;
    }

    const mergeConfig = config.MERGE_CONFIG;
    const baseTokenConfig = config.BASE_TOKENS_CONFIG;

    if (isWinningOutcomeYes) {
      // YES won - get YES currency and company tokens
      return {
        currencyAmount: positions.currencyYes?.total || '0',
        currencySymbol: mergeConfig.currencyPositions?.yes?.wrap?.tokenSymbol || 'YES_CURRENCY',
        currencyTokenAddress: mergeConfig.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
        companyAmount: positions.companyYes?.total || '0',
        companySymbol: mergeConfig.companyPositions?.yes?.wrap?.tokenSymbol || 'YES_COMPANY',
        companyTokenAddress: mergeConfig.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
      };
    } else {
      // NO won - get NO currency and company tokens
      return {
        currencyAmount: positions.currencyNo?.total || '0',
        currencySymbol: mergeConfig.currencyPositions?.no?.wrap?.tokenSymbol || 'NO_CURRENCY',
        currencyTokenAddress: mergeConfig.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
        companyAmount: positions.companyNo?.total || '0',
        companySymbol: mergeConfig.companyPositions?.no?.wrap?.tokenSymbol || 'NO_COMPANY',
        companyTokenAddress: mergeConfig.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
      };
    }
  }, [config, positions, isWinningOutcomeYes]);

  // Check if user has any winning tokens to redeem
  const hasRedeemableTokens = winningTokens && (
    parseFloat(winningTokens.currencyAmount) > 0 ||
    parseFloat(winningTokens.companyAmount) > 0
  );

  const handleRedeemClick = () => {
    if (!isConnected || !hasRedeemableTokens) return;
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // A redemption may have just landed: refresh now, not on the next poll
    onBalancesChanged?.();
  };

  // If market is not resolved, show message
  if (!config?.marketInfo?.resolved) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-futarchyDarkGray2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70">
        <h3 className="h-[52px] text-base font-semibold text-futarchyGray11 dark:text-futarchyGray3 uppercase px-4 py-3 border-b border-futarchyGray62 dark:border-futarchyGray11/70">
          Market Status
        </h3>
        <div className="text-center py-8 text-futarchyGray11 dark:text-white/70">
          Market has not been resolved yet. Redemption will be available once the market is resolved.
        </div>
      </div>
    );
  }

  // Show loading state while positions are loading
  if (isLoadingPositions) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-futarchyDarkGray2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70">
        <h3 className="h-[52px] text-base font-semibold text-futarchyGray11 dark:text-futarchyGray3 uppercase px-4 py-3 border-b border-futarchyGray62 dark:border-futarchyGray11/70">
          Redeem Tokens
        </h3>
        <div className="text-center py-8 text-futarchyGray11 dark:text-white/70">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-futarchyGray11"></div>
            <span>Loading positions...</span>
          </div>
        </div>
      </div>
    );
  }

  // If no winning outcome determined, show message
  if (!winningOutcome) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-futarchyDarkGray2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70">
        <h3 className="h-[52px] text-base font-semibold text-futarchyGray11 dark:text-futarchyGray3 uppercase px-4 py-3 border-b border-futarchyGray62 dark:border-futarchyGray11/70">
          Market Resolved
        </h3>
        <div className="text-center py-8 text-futarchyGray11 dark:text-white/70">
          Market outcome could not be determined. Please check the market details.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-white dark:bg-futarchyDarkGray2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70">
        <h3 className="h-[52px] text-base font-semibold text-futarchyGray11 dark:text-futarchyGray3 uppercase px-4 py-3 border-b border-futarchyGray62 dark:border-futarchyGray11/70 flex items-center justify-between">
          <span>
            Winning Outcome: <span className={isWinningOutcomeYes ? "text-futarchyBlue9" : "text-futarchyGold11"}>{winningOutcome}</span>
          </span>
        </h3>

        {!isConnected ? (
          <div className="text-center py-8 text-futarchyGray11 dark:text-white/70">
            <p className="mb-4">Connect your wallet to view redeemable tokens</p>
            <RedeemButton isConnected={false} isWinningOutcomeYes={isWinningOutcomeYes} />
          </div>
        ) : hasRedeemableTokens ? (
          <div className="p-4">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-futarchyGray62 dark:border-futarchyGray11/70">
                  <th className="text-left py-2 text-futarchyGray11 dark:text-futarchyGray112 font-medium">Token</th>
                  <th className="text-right py-2 text-futarchyGray11 dark:text-futarchyGray112 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parseFloat(winningTokens.currencyAmount) > 0 && (
                  <tr className="hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGrayBG">
                    <td className="py-3">
                      <span className="font-semibold text-futarchyGray12 dark:text-white">
                        {winningTokens.currencySymbol}
                      </span>
                    </td>
                    <td className="text-right py-3">
                      <span className="font-semibold text-futarchyGray12 dark:text-white">
                        {formatBalance(winningTokens.currencyAmount, '')}
                      </span>
                    </td>
                  </tr>
                )}
                {parseFloat(winningTokens.companyAmount) > 0 && (
                  <tr className="hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGrayBG">
                    <td className="py-3">
                      <span className="font-semibold text-futarchyGray12 dark:text-white">
                        {winningTokens.companySymbol}
                      </span>
                    </td>
                    <td className="text-right py-3">
                      <span className="font-semibold text-futarchyGray12 dark:text-white">
                        {formatBalance(winningTokens.companyAmount, '')}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-6 flex justify-center">
              <RedeemButton
                onClick={handleRedeemClick}
                disabled={!hasRedeemableTokens}
                isConnected={isConnected}
                isWinningOutcomeYes={isWinningOutcomeYes}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-futarchyGray11 dark:text-white/70">
            <p className="mb-2">No redeemable tokens found</p>
            <p className="text-xs text-futarchyGray9">
              You don't have any {winningOutcome.toLowerCase()} outcome tokens to redeem.
            </p>
          </div>
        )}
      </div>

      {isModalOpen && winningTokens && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <RedemptionModal
            title="Redeem Winning Tokens"
            handleClose={handleCloseModal}
            connectedWalletAddress={address}
            config={config}
            winningTokens={winningTokens}
            useSDK={true}
            useBlockExplorer={true}
          />
        </div>
      )}
    </>
  );
};

export default RedeemTokens;
