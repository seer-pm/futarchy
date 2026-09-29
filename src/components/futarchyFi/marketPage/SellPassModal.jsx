import React, { memo, useState, useEffect } from 'react';
import ProcessingSteps from './ProcessingSteps';

// Mock steps data with substeps
const STEPS_DATA = {
  1: {
    title: 'Approving Transaction',
    substeps: [
      { id: 1, text: 'Initializing wallet connection', completed: false },
      { id: 2, text: 'Requesting signature', completed: false },
      { id: 3, text: 'Confirming approval on blockchain', completed: false }
    ]
  },
  2: {
    title: 'Processing Sale',
    substeps: [
      { id: 1, text: 'Preparing sale transaction', completed: false },
      { id: 2, text: 'Broadcasting to network', completed: false },
      { id: 3, text: 'Awaiting confirmation', completed: false }
    ]
  },
  3: {
    title: 'Finalizing',
    substeps: [
      { id: 1, text: 'Updating balances', completed: false },
      { id: 2, text: 'Syncing with database', completed: false },
      { id: 3, text: 'Completing transaction', completed: false }
    ]
  }
};

const StepWithSubsteps = ({ step, title, substeps, expanded, onToggle, isSimulating }) => {
  const [completedSubsteps, setCompletedSubsteps] = useState([]);

  useEffect(() => {
    if (isSimulating && expanded) {
      const interval = setInterval(() => {
        setCompletedSubsteps(prev => {
          if (prev.length < substeps.length) {
            return [...prev, substeps[prev.length].id];
          }
          clearInterval(interval);
          return prev;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isSimulating, expanded, substeps]);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
          completedSubsteps.length === substeps.length 
            ? 'bg-futarchyLavender text-white' 
            : 'bg-futarchyGray6 text-futarchyGray11'
        }`}>
          {completedSubsteps.length === substeps.length ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : step}
        </div>
        <span className="font-medium text-futarchyGray12">{title}</span>
      </div>
      
      <button 
        onClick={onToggle}
        className="text-sm text-futarchyLavender hover:text-futarchyLavender/80 ml-9 mb-2"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="ml-9 space-y-2">
          {substeps.map((substep) => (
            <div key={substep.id} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                completedSubsteps.includes(substep.id)
                  ? 'text-futarchyLavender'
                  : 'text-futarchyGray8'
              }`}>
                {completedSubsteps.includes(substep.id) ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              <span className={`text-sm ${
                completedSubsteps.includes(substep.id)
                  ? 'text-futarchyGray12'
                  : 'text-futarchyGray11'
              }`}>
                {substep.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SellPassModal = memo(({
    title,
    supportText,
    alertContainerTitle,
    alertSupportText,
    handleClose,
    handleSellPass,
    connectedWalletAddress,
    tokenConfig,
    balances,
    processingStep,
    isSimulating = false
}) => {
    const [amount, setAmount] = useState('');
    const [isValidAmount, setIsValidAmount] = useState(false);
    const [expandedSteps, setExpandedSteps] = useState({});

    const toggleStepExpansion = (step) => {
        setExpandedSteps(prev => ({
            ...prev,
            [step]: !prev[step]
        }));
    };

    const handleAmountChange = (e) => {
        const value = e.target.value;
        setAmount(value);
        // Validate amount is a positive number and user has sufficient balance
        const totalBalance = Number(balances?.companyYes?.total || 0);
        const isValid = !isNaN(value) && parseFloat(value) > 0 && parseFloat(value) <= totalBalance;
        setIsValidAmount(isValid);
    };

    const handleMaxClick = () => {
        const totalBalance = Number(balances?.companyYes?.total || 0);
        setAmount(totalBalance.toString());
        setIsValidAmount(true);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-futarchyGray12">{title}</h2>
                    <button onClick={handleClose} className="text-futarchyGray11 hover:text-futarchyGray12">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <p className="text-futarchyGray11 mb-6">{supportText}</p>

                <div className="bg-futarchyGray4 p-4 rounded-lg mb-6">
                    <h3 className="font-medium text-futarchyGray12 mb-2">{alertContainerTitle}</h3>
                    <p className="text-sm text-futarchyGray11">{alertSupportText}</p>
                </div>

                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-futarchyGray11">Amount</label>
                        <span className="text-sm text-futarchyGray11">
                            Available: {Number(balances?.companyYes?.total || 0).toFixed(2)} Company YES
                        </span>
                    </div>
                    <div className="relative">
                        <input
                            type="number"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder="0.0"
                            className="w-full px-4 py-2 border border-futarchyGray6 rounded-lg focus:outline-none focus:ring-2 focus:ring-futarchyLavender/50"
                        />
                        <button
                            onClick={handleMaxClick}
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-futarchyLavender bg-futarchyLavender/10 rounded hover:bg-futarchyLavender/20"
                        >
                            MAX
                        </button>
                    </div>
                </div>

                {processingStep && (
                    <div className="mb-6">
                        {Object.entries(STEPS_DATA).map(([step, data]) => (
                            <StepWithSubsteps
                                key={step}
                                step={parseInt(step)}
                                title={data.title}
                                substeps={data.substeps}
                                expanded={expandedSteps[step]}
                                onToggle={() => toggleStepExpansion(step)}
                                isSimulating={isSimulating && parseInt(step) === processingStep}
                            />
                        ))}
                    </div>
                )}

                <button
                    onClick={() => handleSellPass(amount)}
                    disabled={!isValidAmount || processingStep}
                    className={`w-full py-3 px-4 rounded-lg font-medium ${
                        !isValidAmount || processingStep
                            ? 'bg-futarchyGray6 text-futarchyGray11 cursor-not-allowed'
                            : 'bg-futarchyLavender text-white hover:bg-futarchyLavender/90'
                    }`}
                >
                    {processingStep ? 'Processing...' : 'Sell YES'}
                </button>
            </div>
        </div>
    );
});

SellPassModal.displayName = 'SellPassModal';

export default SellPassModal; 