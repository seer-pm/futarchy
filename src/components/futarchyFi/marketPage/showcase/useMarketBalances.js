import { useEffect, useMemo, useState } from 'react';
import { useBalanceManager } from '../../../../hooks/useBalanceManager';

const useMarketBalances = (config, address, isConnected) => {
  // Connection state for tracking wallet connection changes
  const [previousConnectionState, setPreviousConnectionState] = useState(isConnected);

  // Track wallet connection state changes explicitly
  useEffect(() => {
    // If connection state changed
    if (previousConnectionState !== isConnected) {
      setPreviousConnectionState(isConnected);
      console.log('Wallet connection state changed:', {
        previous: previousConnectionState,
        current: isConnected,
        address
      });

      // Balance manager handles connection state changes automatically
    }
  }, [isConnected, address, previousConnectionState]);

  // Use centralized balance manager
  const { balances: rawBalances, isLoading: isLoadingPositions, error: balanceError, refetch: refetchBalances } = useBalanceManager(config, address, isConnected);

  // Transform balances to match existing position structure for compatibility
  const positions = useMemo(() => ({
    currencyYes: {
      unwrapped: rawBalances.currencyYes,
      wrapped: rawBalances.wrappedCurrencyYes,
      total: rawBalances.totalCurrencyYes
    },
    currencyNo: {
      unwrapped: rawBalances.currencyNo,
      wrapped: rawBalances.wrappedCurrencyNo,
      total: rawBalances.totalCurrencyNo
    },
    companyYes: {
      unwrapped: rawBalances.companyYes,
      wrapped: rawBalances.wrappedCompanyYes,
      total: rawBalances.totalCompanyYes
    },
    companyNo: {
      unwrapped: rawBalances.companyNo,
      wrapped: rawBalances.wrappedCompanyNo,
      total: rawBalances.totalCompanyNo
    },
    wxdai: rawBalances.currency, // SDAI balance for compatibility
    faot: rawBalances.company,   // GNO balance for compatibility
    native: rawBalances.native   // Native xDAI balance
  }), [rawBalances]);

  // Balance manager handles wallet disconnection automatically

  return { rawBalances, positions, isLoadingPositions, balanceError, refetchBalances };
};

export { useMarketBalances };
