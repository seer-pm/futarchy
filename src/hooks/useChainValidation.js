import { useEffect, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { isWrongChain } from '../utils/chainGuard';

// Get chain name helper
function getChainName(chainId) {
  switch (Number(chainId)) {
    case 1:
      return 'Ethereum Mainnet';
    case 100:
      return 'Gnosis Chain';
    case 137:
      return 'Polygon';
    case 42161:
      return 'Arbitrum';
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Hook to validate that the user is on the correct chain based on config
 * Returns state to control modal visibility
 *
 * @param {Object} config - Contract config that may contain required chainId
 * @param {boolean} configLoading - Whether config is still loading
 * @returns {Object} - Chain validation state and helper functions
 */
export const useChainValidation = (config, configLoading = false) => {
  const { chain: currentChain, isConnected } = useAccount();
  const { switchChain, chains, isPending: isSwitching, error: switchError } = useSwitchChain();

  const [isCorrectChain, setIsCorrectChain] = useState(true);
  const [requiredChainId, setRequiredChainId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Get required chain from config (default to Gnosis - 100)
  const configChainId = config?.chainId || 100;

  useEffect(() => {
    // Don't validate if config is still loading
    if (configLoading) {
      console.log('[CHAIN VALIDATION] Waiting for config to load...');
      return;
    }

    // Don't show warning when not connected
    if (!isConnected) {
      setIsCorrectChain(true);
      setShowModal(false);
      return;
    }

    // Don't validate if we don't have a valid config yet
    if (!config || !config.chainId) {
      console.log('[CHAIN VALIDATION] No valid config or chainId yet');
      setIsCorrectChain(true); // Assume correct until we know otherwise
      setShowModal(false);
      return;
    }

    const currentChainId = currentChain?.id;
    const isCorrect = currentChainId === configChainId;

    setIsCorrectChain(isCorrect);
    setRequiredChainId(configChainId);

    // Log chain validation
    console.log('[CHAIN VALIDATION]', {
      currentChainId,
      requiredChainId: configChainId,
      isCorrect,
      config: config?.MARKET_ADDRESS || 'no-config',
      configLoading
    });

    // Show modal if on wrong chain
    if (!isCorrect && switchChain && !isSwitching) {
      const supportedChain = chains?.find(c => c.id === configChainId);

      if (supportedChain) {
        console.log(`[CHAIN VALIDATION] User on wrong chain, showing modal`);
        setShowModal(true);
      } else {
        console.warn(`[CHAIN VALIDATION] Required chain ${configChainId} is not configured in wagmi`);
      }
    } else if (isCorrect) {
      setShowModal(false);
    }
  }, [currentChain, configChainId, isConnected, switchChain, chains, isSwitching, config, configLoading]);

  // Helper function to manually trigger chain switch
  const promptChainSwitch = () => {
    if (!switchChain || isCorrectChain) return;

    const supportedChain = chains?.find(c => c.id === configChainId);
    if (supportedChain) {
      switchChain({ chainId: configChainId });
    } else {
      console.error(`Chain ${configChainId} is not supported`);
    }
  };

  return {
    isCorrectChain,
    currentChainId: currentChain?.id,
    requiredChainId: configChainId,
    currentChainName: currentChain ? getChainName(currentChain.id) : null,
    requiredChainName: getChainName(configChainId),
    isSwitching,
    switchError,
    promptChainSwitch,
    canSwitch: !!switchChain && chains?.some(c => c.id === configChainId),
    showModal,
    setShowModal
  };
};

/**
 * Guard for modals that submit a market's transactions. Unlike
 * useChainValidation it holds no state, so it is correct on the render where
 * the wallet changes chain, and it does not drive the WrongNetworkModal (which
 * the user may have dismissed).
 *
 * @param {number} requiredChainId - Chain the market lives on (config.chainId)
 */
export const useRequiredChain = (requiredChainId = 100) => {
  const { chainId: walletChainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  return {
    isWrongChain: isWrongChain({ isConnected, walletChainId, requiredChainId }),
    walletChainName: walletChainId ? getChainName(walletChainId) : null,
    requiredChainName: getChainName(requiredChainId),
    isSwitching,
    switchToRequiredChain: () => switchChain({ chainId: Number(requiredChainId) }),
  };
};
