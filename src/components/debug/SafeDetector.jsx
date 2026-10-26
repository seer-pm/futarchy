import React, { useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';

const SafeDetector = () => {
    const { data: walletClient } = useWalletClient();
    const [debugInfo, setDebugInfo] = useState({});

    useEffect(() => {
        const checkSafe = async () => {
            const info = {
                referrer: typeof document !== 'undefined' ? document.referrer : 'N/A',
                isSafe: typeof window !== 'undefined' ? window.ethereum?.isSafe : 'N/A',
                isSafeApp: typeof window !== 'undefined' ? window.ethereum?.isSafeApp : 'N/A',
                connectorId: walletClient?.connector?.id || 'N/A',
                connectorName: walletClient?.connector?.name || 'N/A',
                location: typeof window !== 'undefined' ? window.location.href : 'N/A',
                parentOrigin: 'N/A',
                sdkStatus: 'Checking...'
            };

            // Try to get parent origin if in iframe
            try {
                info.parentOrigin = window.parent !== window ? document.referrer : 'Same Window';
            } catch (e) {
                info.parentOrigin = 'Blocked (CORS)';
            }

            // SDK Handshake Check
            try {
                const { default: SafeAppsSDK } = await import('@safe-global/safe-apps-sdk');
                const sdk = new SafeAppsSDK();
                const safeInfo = await Promise.race([
                    sdk.safe.getInfo(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
                ]);
                info.sdkStatus = `Connected (Chain: ${safeInfo.chainId})`;
                info.safeAddress = safeInfo.safeAddress;
            } catch (e) {
                info.sdkStatus = `Failed: ${e.message}`;
            }

            setDebugInfo(info);
        };

        checkSafe();
        const interval = setInterval(checkSafe, 5000); // Check every 5s
        return () => clearInterval(interval);
    }, [walletClient]);

    return (
        <div className="fixed bottom-4 right-4 z-[9999] max-w-sm overflow-hidden rounded-surface border border-seer-border bg-seer-surface p-4 font-mono text-xs text-seer-text shadow-lg">
            <h3 className="mb-2 border-b border-seer-border pb-2 font-sans text-sm font-semibold">Safe Environment Detector</h3>
            <div className="space-y-1">
                <div><span className="text-seer-muted">Referrer:</span> <span className="break-all">{debugInfo.referrer}</span></div>
                <div><span className="text-seer-muted">isSafe:</span> {String(debugInfo.isSafe)}</div>
                <div><span className="text-seer-muted">isSafeApp:</span> {String(debugInfo.isSafeApp)}</div>
                <div><span className="text-seer-muted">Connector:</span> {debugInfo.connectorName} ({debugInfo.connectorId})</div>
                <div><span className="text-seer-muted">Parent:</span> <span className="break-all">{debugInfo.parentOrigin}</span></div>
                <div className="mt-2 border-t border-seer-border pt-2">
                    <span className="text-seer-muted">SDK Status:</span>{' '}
                    <span className={debugInfo.sdkStatus?.includes('Connected') ? 'font-semibold text-seer-positive' : 'text-seer-negative'}>
                        {debugInfo.sdkStatus}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SafeDetector;
