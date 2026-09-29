import { useState, useEffect } from 'react';
import { useWalletClient } from 'wagmi';
import { isSafeWallet as isSafeWalletSync } from '../utils/ethersAdapters';

// Safe Apps load the app inside an iframe. Outside one there is no parent
// to answer the SDK handshake, so it can only time out.
const isInIframe = () => {
    if (typeof window === 'undefined') return false;
    try {
        return window.parent !== window;
    } catch {
        return true; // cross-origin access blocked: we are framed
    }
};

export const useSafeDetection = () => {
    const { data: walletClient } = useWalletClient();
    const [isSafe, setIsSafe] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [safeInfo, setSafeInfo] = useState(null);

    useEffect(() => {
        let mounted = true;

        const detectSafe = async () => {
            setIsLoading(true);

            // 1. Fast Sync Check (Connector, Referrer, Window flags)
            if (walletClient && isSafeWalletSync(walletClient)) {
                if (mounted) {
                    setIsSafe(true);
                    setIsLoading(false);
                }
                // Continue to verify with SDK...
            }

            // 2. Robust Async Check (SDK Handshake) - only when framed
            if (!isInIframe()) {
                if (mounted) setIsLoading(false);
                return;
            }
            try {
                // Dynamic import to avoid SSR issues
                const { default: SafeAppsSDK } = await import('@safe-global/safe-apps-sdk');
                const sdk = new SafeAppsSDK();

                // Race the getInfo call with a timeout
                const info = await Promise.race([
                    sdk.safe.getInfo(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
                ]);

                if (mounted && info) {
                    console.log('[useSafeDetection] Safe SDK Connected:', info);
                    setIsSafe(true);
                    setSafeInfo(info);
                }
            } catch (error) {
                // If SDK fails but sync check passed, we keep isSafe=true (fallback)
                // If both failed, isSafe remains false
                console.warn('[useSafeDetection] Safe SDK Handshake failed or timed out:', error.message);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        detectSafe();

        return () => { mounted = false; };
    }, [walletClient]);

    return { isSafe, isLoading, safeInfo };
};
