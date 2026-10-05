import dynamic from 'next/dynamic';
import { ethers } from 'ethers';
import { AnimatePresence } from 'framer-motion';
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from '../../../../constants/addresses';
import AddLiquidityModal from '../AddLiquidityModal';
import CreatePoolModal from '../CreatePoolModal';
import { PredictionMarketModal } from './PredictionMarketModal';

// Opens only on user action, and it is one of the heaviest components in
// the market bundle — load it on demand.
const ConfirmSwapModal = dynamic(() => import('../ConfirmSwapModal'), { ssr: false });

// Opens only from the collateral actions — load it on demand.
const CollateralModal = dynamic(() => import("../collateralModal/CollateralModal"), { ssr: false });

// Opens only from the native-swap action — load it on demand.

// Debug-only editor, opened from the proposal menu — load it on demand.
const EditProposalModal = dynamic(() => import('../../../debug/EditProposalModal'), { ssr: false });

const MarketModals = ({
  collateral,
  confirmSwap,
  badgeModals,
  isDebugMode,
  handleSafeTransaction,
  address,
  positions,
  proposalId,
  config,
  configLoading,
  refetchConfig
}) => {
  const {
    isCollateralModalOpen,
    collateralModalType,
    processingStep,
    handleCloseCollateralModal,
    handleBackdropClick
  } = collateral;
  const {
    isConfirmModalOpen,
    setIsConfirmModalOpen,
    currentTransactionData,
    handleTransactionComplete,
    selectedAction,
    selectedOutcome,
    amount
  } = confirmSwap;
  const {
    isPredictionMarketModalOpen,
    setIsPredictionMarketModalOpen,
    isAddLiquidityModalOpen,
    setIsAddLiquidityModalOpen,
    isCreatePoolModalOpen,
    setIsCreatePoolModalOpen,
    isEditProposalModalOpen,
    setIsEditProposalModalOpen
  } = badgeModals;

  return (
    <>
      {/* ... existing CollateralModal rendering ... */}
      <AnimatePresence>
        {isCollateralModalOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
            onClick={handleBackdropClick}
          >
            <CollateralModal
              onSafeTransaction={handleSafeTransaction}
              // ... props ...
              title={collateralModalType === 'add' ? 'Add Collateral' : 'Merge Collateral'}
              supportText=""
              handleClose={handleCloseCollateralModal}
              connectedWalletAddress={address}
              alertContainerTitle="Collateral Information"
              alertSupportText="Only deposit funds you intend to use for interactions within this proposal. Your collateral remains yours and can be retrieved at any time when not actively used in ongoing trades."
              tokenConfig={config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG}
              balances={positions}
              processingStep={processingStep}
              action={collateralModalType}
              proposalId={proposalId}
              config={config}
              configLoading={configLoading}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ... existing ConfirmSwapModal rendering ... */}
      <AnimatePresence>
        {isConfirmModalOpen && currentTransactionData && (
          <ConfirmSwapModal
            toggleHideCowSwap={!isDebugMode}
            onSafeTransaction={handleSafeTransaction}
            // ... props ...
            onClose={() => setIsConfirmModalOpen(false)}
            transactionData={{
              ...currentTransactionData,
              isClosingPosition: currentTransactionData?.isClosingPosition || false,
              useExistingCollateral: currentTransactionData?.useExistingCollateral || false
            }}
            existingBalance={selectedAction === 'buy'
              ? (selectedOutcome === 'approved'
                ? positions?.currencyYes?.total
                : positions?.currencyNo?.total)
              : (selectedOutcome === 'approved'
                ? positions?.companyYes?.total
                : positions?.companyNo?.total)
            }
            additionalCollateralNeeded={(() => {
              // If we're selling or using existing collateral, we don't need additional collateral
              if (currentTransactionData?.action === 'Sell' || currentTransactionData?.useExistingCollateral) {
                return '0';
              }

              const existingBalance = selectedAction === 'buy'
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

                // Calculate difference
                const diffBN = amountBN.sub(existingBalanceBN);

                // Only return positive differences
                if (diffBN.gt(ethers.constants.Zero)) {
                  return ethers.utils.formatUnits(diffBN, 18);
                }
                return '0';
              } catch (error) {
                console.error('Error calculating needed amount:', error);
                return '0';
              }
            })()}
            onTransactionComplete={handleTransactionComplete}
            proposalId={proposalId}
          />
        )}
      </AnimatePresence>

      {isPredictionMarketModalOpen && (
        <PredictionMarketModal
          isOpen={isPredictionMarketModalOpen}
          onClose={() => setIsPredictionMarketModalOpen(false)}
          config={config}
        />
      )}
      <AddLiquidityModal
        isOpen={isAddLiquidityModalOpen}
        onClose={() => setIsAddLiquidityModalOpen(false)}
        config={config}
      />
      <CreatePoolModal
        isOpen={isCreatePoolModalOpen}
        onClose={() => setIsCreatePoolModalOpen(false)}
        config={config}
        onPoolCreated={refetchConfig}
      />
      {isEditProposalModalOpen && (
        <EditProposalModal
          isOpen={isEditProposalModalOpen}
          onClose={() => setIsEditProposalModalOpen(false)}
          proposalMetadataAddress={config?.proposalMetadataAddress}
        />
      )}
    </>
  );
};

export { MarketModals };
