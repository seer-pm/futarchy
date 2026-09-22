"use client";

import React from "react";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  Theme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "wagmi";
import { http, fallback } from 'viem';
import { mainnet, gnosis } from "wagmi/chains";
import {
  metaMaskWallet,
  walletConnectWallet,
  trustWallet,
  rainbowWallet,
  safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import SafeAutoConnector from '../components/futarchyFi/SafeAutoConnector';
import { SubgraphRefreshProvider } from '../contexts/SubgraphRefreshContext';

// Gnosis Chain RPC endpoints, tried in order by the fallback transport.
// A private endpoint in NEXT_PUBLIC_GNOSIS_RPC_URL goes first and the public
// ones stay behind it as fallbacks, so a paid endpoint hitting its limit
// degrades instead of taking the app down.
const GNOSIS_RPCS = [
  process.env.NEXT_PUBLIC_GNOSIS_RPC_URL,
  "https://gnosis.drpc.org",
  "https://rpc.gnosischain.com",
  "https://gnosis-rpc.publicnode.com",
  "https://1rpc.io/gnosis"
].filter(Boolean);

// Ethereum mainnet, same arrangement.
const ETHEREUM_RPCS = [
  process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  "https://eth.drpc.org",
  "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
  "https://rpc.ankr.com/eth"
].filter(Boolean);

const chains = [mainnet, gnosis];
const projectId = "76fa3deb89f7aa56f09cf1ac472eccb4";

// Enhanced app metadata for better mobile wallet recognition
const appMetadata = {
  appName: 'Futarchy Fi',
  projectId,
  chains,
  metadata: {
    name: 'Futarchy Fi',
    description: 'Decentralized prediction markets platform',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://app.futarchy.fi',
    icons: [
      typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : 'https://app.futarchy.fi/favicon.ico'
    ],
  }
};

// Configure wallets with better mobile support
const connectors = connectorsForWallets([
  {
    groupName: 'Popular',
    wallets: [
      ({ chains, projectId }) => safeWallet({
        chains,
        projectId,
        allowedDomains: [/gnosis-safe.io$/, /app.safe.global$/, /.*\.trycloudflare\.com$/, /.*\.ngrok-free\.app$/, /.*\.ngrok\.io$/],
        debug: true,
      }),
      metaMaskWallet,
      walletConnectWallet,
      trustWallet,
      rainbowWallet,
    ]
  }
], appMetadata);

// Create a new QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

// Create fallback transport with multiple RPC endpoints
const gnosisTransport = fallback(
  GNOSIS_RPCS.map(rpc => http(rpc)),
  {
    rank: false, // Use RPCs in order (don't rank by speed)
    retryCount: 3, // Increased retry count
    retryDelay: 1500, // Slightly longer delay
  }
);

// Create fallback transport for Ethereum mainnet
const ethereumTransport = fallback(
  ETHEREUM_RPCS.map(rpc => http(rpc)),
  {
    rank: false,
    retryCount: 3,
    retryDelay: 1500,
  }
);

// Create a new WagmiConfig instance
const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: ethereumTransport,
    [gnosis.id]: gnosisTransport,

  },
  // Defer rehydration of the persisted connection to a post-mount effect so the
  // first client render matches the server HTML (avoids hydration mismatches).
  ssr: true,
});

const customTheme = {
  blurs: {
    modalOverlay: 'small',
  },
  colors: {
    accentColor: '#1F1F1F',
    accentColorForeground: '#FFFFFF',
    modalBackground: '#FFFFFF',
    modalText: '#1F1F1F',
  },
  fonts: {
    body: 'Oxanium, sans-serif',
  },
  radii: {
    modal: '8px',
    connectButton: '8px',
    menuButton: '8px',
  },
};

const Providers = ({ children }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          chains={chains}
          locale="en-US"
          modalSize="compact"
          theme={darkTheme({
            borderRadius: 'small',
            fontStack: 'system',
            overlayBlur: 'small',
            accentColor: '#1F1F1F',
          })}
          showRecentTransactions={true}
          appInfo={{
            appName: 'Futarchy Fi',
            learnMoreUrl: '#',
            disclaimer: () => (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  By connecting your wallet, you agree to our terms and acknowledge the risks of using prediction markets.
                </p>
              </div>
            ),
          }}
          initialChain={mainnet}
          coolMode={false}
        >
          <SafeAutoConnector />
          <SubgraphRefreshProvider>
            {children}
          </SubgraphRefreshProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default Providers;
