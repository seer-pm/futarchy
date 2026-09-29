

const PendingOrderToast = ({ count, userAddress }) => {
  // ---> Accept count and userAddress, return null if count is 0 <---
  if (!count || count === 0 || !userAddress) return null;

  // ---> Link to user's address page on CoW Explorer <---
  const explorerUrl = `https://explorer.cow.fi/gc/address/${userAddress}`;

  return (
    <div
      className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg border border-futarchyGray4 p-4 z-50 animate-slide-in-bottom"
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-futarchyOrange9 border-t-transparent rounded-full animate-spin" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            {/* ---> Show count in message <--- */}
            {count} Pending CoW Swap Order{count > 1 ? 's' : ''}
          </span>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-futarchyBlue11 hover:text-futarchyBlue9 underline"
            title="View your orders on CoW Explorer"
          >
            View Orders
          </a>
        </div>
      </div>
    </div>
  );
};

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
      className="fixed top-24 right-6 bg-white rounded-lg shadow-lg border border-futarchyGray4 p-4 z-50 cursor-pointer transform transition-transform hover:scale-102 animate-slide-in"
    >
      <div className="flex items-center gap-3">
        {step === 'done' ? (
          <div className="w-6 h-6 bg-futarchyEmerald3 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-futarchyEmerald11" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-futarchyGray12 border-t-transparent rounded-full animate-spin" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            {steps[step]}
          </span>
          <span className="text-xs text-futarchyGray11">
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
      className="fixed top-24 right-6 bg-white rounded-lg shadow-lg border border-futarchyGreen9 p-4 z-50 animate-slide-in cursor-pointer"
      onClick={onClose}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-futarchyGreen3 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-futarchyGreen11" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            Transaction Sent to Safe App
          </span>
          <span className="text-xs text-futarchyGray11 mt-1">
            Please check your Gnosis Safe app to sign and execute the transaction.
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-2 text-futarchyGray11 hover:text-futarchyGray12"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export { PendingOrderToast, ProcessingToast, SafeTransactionToast };
