import { useState } from 'react';

const useConfirmSwapState = (refetchBalances) => {
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [currentTransactionData, setCurrentTransactionData] = useState(null);

  // Add handler for transaction completion
  const handleTransactionComplete = (transactionDetails) => {
    // Refresh balances or any other state that needs updating
    refetchBalances();
  };

  // Add selectedAction state
  const [selectedAction, setSelectedAction] = useState('buy');
  // Add selectedOutcome state
  const [selectedOutcome, setSelectedOutcome] = useState('approved');
  // Add amount state
  const [amount, setAmount] = useState('1');

  return {
    isConfirmModalOpen,
    setIsConfirmModalOpen,
    currentTransactionData,
    setCurrentTransactionData,
    handleTransactionComplete,
    selectedAction,
    selectedOutcome,
    amount
  };
};

export { useConfirmSwapState };
