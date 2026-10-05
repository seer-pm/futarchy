import { useState } from 'react';

const useCollateralFlow = (refetchBalances) => {
  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalType, setCollateralModalType] = useState('add');
  const [isApproving, setIsApproving] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showProcessingToast, setShowProcessingToast] = useState(false);

  // Modal handlers
  const handleOpenCollateralModal = (type) => {
    console.log('Opening modal:', type);
    setCollateralModalType(type);
    setIsCollateralModalOpen(true);
  };

  const handleCloseCollateralModal = () => {
    setIsCollateralModalOpen(false);
    // A split or merge may have just landed: refresh now, not on the next poll
    refetchBalances();
    // Reset all states when closing modal
    setProcessingStep(null);
    setCurrentSubstep({ step: 1, substep: 0 });
  };

  // Add processing state
  const [processingStep, setProcessingStep] = useState(null);
  const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 0 });

  // Add click outside handler
  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself, not the modal
    if (e.target === e.currentTarget) {
      handleCloseCollateralModal();
    }
  };

  // Add handler for toast click
  const handleToastClick = () => {
    setIsCollateralModalOpen(true);
  };

  return {
    isCollateralModalOpen,
    collateralModalType,
    showProcessingToast,
    processingStep,
    handleOpenCollateralModal,
    handleCloseCollateralModal,
    handleBackdropClick,
    handleToastClick
  };
};

export { useCollateralFlow };
