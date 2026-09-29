import React, { memo, useState } from 'react';
import ProcessingSteps from './ProcessingSteps';

const SellFailModal = memo(({
    title,
    supportText,
    alertContainerTitle,
    alertSupportText,
    handleClose,
    handleSellFail,
    connectedWalletAddress,
    tokenConfig,
    balances,
    processingStep
}) => {
    const [amount, setAmount] = useState('');
    const [isValidAmount, setIsValidAmount] = useState(false);

    const handleAmountChange = (e) => {
        const value = e.target.value;
        setAmount(value);
        // Validate amount is a positive number and user has sufficient balance
        const totalBalance = Number(balances?.companyNo?.total || 0);
        const isValid = !isNaN(value) && parseFloat(value) > 0 && parseFloat(value) <= totalBalance;
        setIsValidAmount(isValid);
    };

    const handleMaxClick = () => {
        const totalBalance = Number(balances?.companyNo?.total || 0);
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
                            Available: {Number(balances?.companyNo?.total || 0).toFixed(2)} Company NO
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
                        <ProcessingSteps currentStep={processingStep} />
                    </div>
                )}

                <button
                    onClick={() => handleSellFail(amount)}
                    disabled={!isValidAmount || processingStep}
                    className={`w-full py-3 px-4 rounded-lg font-medium ${
                        !isValidAmount || processingStep
                            ? 'bg-futarchyGray6 text-futarchyGray11 cursor-not-allowed'
                            : 'bg-futarchyLavender text-white hover:bg-futarchyLavender/90'
                    }`}
                >
                    {processingStep ? 'Processing...' : 'Sell NO'}
                </button>
            </div>
        </div>
    );
});

SellFailModal.displayName = 'SellFailModal';

export default SellFailModal; 