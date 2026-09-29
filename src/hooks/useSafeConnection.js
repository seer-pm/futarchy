import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { isSafeWallet, isSafePeerMetadata } from '../utils/ethersAdapters';

/**
 * Safe detection for transaction flows, bound to the connector from
 * useAccount(). Returns `isSafeConnection(walletClient)`, a drop-in for
 * `isSafeWallet(walletClient)` that also recognises a Safe connected over
 * WalletConnect, which is only visible in the session's peer metadata (read
 * asynchronously from the connector's provider, so it is resolved here ahead
 * of the transaction).
 *
 * Deliberately separate from useSafeDetection: that hook drives
 * SafeAutoConnector, which must only fire inside the Safe app iframe.
 */
export const useSafeConnection = () => {
  const { connector } = useAccount();
  const [isSafePeer, setIsSafePeer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsSafePeer(false);
    if (connector?.type !== 'walletConnect') return undefined;

    connector.getProvider()
      .then((provider) => {
        if (!cancelled) setIsSafePeer(isSafePeerMetadata(provider?.session?.peer?.metadata));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [connector]);

  return useCallback(
    (walletClient) => isSafePeer || isSafeWallet(walletClient, connector),
    [isSafePeer, connector]
  );
};
