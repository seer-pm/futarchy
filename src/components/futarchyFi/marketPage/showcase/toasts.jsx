

const ProcessingToast = ({ step, onToastClick }) => {
  const steps = {
    'split': 'Splitting Position...',
    'wrapYes': 'Wrapping YES Position...',
    'wrapNo': 'Wrapping NO Position...',
    'done': 'Operation Complete!'
  };

  return (
    <div
      onClick={onToastClick}
      role="status"
      className="fixed top-24 right-6 bg-seer-surface rounded-surface shadow-lg border border-seer-border p-4 z-50 cursor-pointer animate-slide-in"
    >
      <div className="flex items-center gap-3">
        {step === 'done' ? (
          <div className="w-6 h-6 bg-seer-positive/10 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-seer-positive" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-seer-border border-t-seer-purple rounded-full animate-spin" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-seer-text">
            {steps[step]}
          </span>
          <span className="text-xs text-seer-muted">
            Click to view details
          </span>
        </div>
      </div>
    </div>
  );
};

const SafeTransactionToast = ({ onClose }) => {
  return (
    <div
      role="status"
      className="fixed top-24 right-6 bg-seer-surface rounded-surface shadow-lg border border-seer-positive/40 p-4 z-50 animate-slide-in cursor-pointer"
      onClick={onClose}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-seer-positive/10 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-seer-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-seer-text">
            Transaction Sent to Safe App
          </span>
          <span className="text-xs text-seer-muted mt-1">
            Please check your Gnosis Safe app to sign and execute the transaction.
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-2 text-seer-muted hover:text-seer-text"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export { ProcessingToast, SafeTransactionToast };
