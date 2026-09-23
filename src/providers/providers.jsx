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
import { RPC_ENDPOINTS } from '../config/rpcEndpoints';
import { SubgraphRefreshProvider } from '../contexts/SubgraphRefreshContext';

const chains = [mainnet, gnosis];
const projectId = "76fa3deb89f7aa56f09cf1ac472eccb4";

// Enhanced app metadata for better mobile wallet recognition
const appMetadata = {
  appName: 'Futarchy',
  projectId,
  chains,
  metadata: {
    name: 'Futarchy',
    description: 'Decentralized prediction markets platform',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://futarchy.seer.pm',
    icons: [
      typeof window !== 'undefined' ? `${window.location.origin}/assets/favicon.svg` : 'https://futarchy.seer.pm/assets/favicon.svg'
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

// Endpoints come from config/rpcEndpoints.js: the configured endpoint first,
// a public one behind it, so a paid endpoint hitting its limit degrades
// instead of taking the app down.
//
// `batch: true` is the part that matters for traffic. viem leaves JSON-RPC
// batching off by default, so every wagmi read used to cost its own POST;
// batched, the reads issued in the same tick share one.
const buildTransport = (chainId) => fallback(
  RPC_ENDPOINTS[chainId].map(rpc => http(rpc, { batch: true })),
  {
    rank: false, // Use RPCs in order (don't rank by speed)
    retryCount: 3, // Increased retry count
    retryDelay: 1500, // Slightly longer delay
  }
);

const ethereumTransport = buildTransport(mainnet.id);
const gnosisTransport = buildTransport(gnosis.id);

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
            appName: 'Futarchy',
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
