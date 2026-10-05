import { useEffect, useRef } from 'react';
import { useConfig, useConnectors, useReconnect } from 'wagmi';

// Restores the last wallet after a page load.
//
// wagmi's own reconnect-on-mount asks every installed wallet whether it is
// authorized, one after another, and only reports "connected" when the last
// one has answered. A wallet that never answers (a locked or idle Rabby does
// this to eth_accounts) leaves the session stuck on "connecting" although the
// wallet the user actually picked has already been restored. So reconnect-on-
// mount is off in providers.jsx and only the last used wallet is asked here.
const RecentWalletReconnector = () => {
    const config = useConfig();
    const connectors = useConnectors();
    const { reconnect } = useReconnect();
    const attempted = useRef(false);

    useEffect(() => {
        if (attempted.current) return;
        let cancelled = false;

        (async () => {
            // Let WagmiProvider finish its own mount work first: with
            // reconnect-on-mount off it clears the stored connections, and that
            // must not land on top of the one restored here.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const recentId = await config.storage?.getItem('recentConnectorId');
            if (cancelled || attempted.current || !recentId) return;
            // EIP-6963 wallets are added to the list after mount, so this effect
            // runs again until the recent one shows up.
            const recent = connectors.filter((connector) => connector.id === recentId);
            if (recent.length === 0) return;
            attempted.current = true;
            reconnect({ connectors: recent });
        })();

        return () => { cancelled = true; };
    }, [config, connectors, reconnect]);

    return null; // This component renders nothing
};

export default RecentWalletReconnector;
