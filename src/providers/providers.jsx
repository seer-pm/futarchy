"use client";

import React from "react";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  lightTheme,
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
import RecentWalletReconnector from '../components/futarchyFi/RecentWalletReconnector';
import { RPC_ENDPOINTS } from '../config/rpcEndpoints';
import { SubgraphRefreshProvider } from '../contexts/SubgraphRefreshContext';
import { useTheme } from '../contexts/ThemeContext';

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

// RainbowKit's MetaMask entry drives window.ethereum through the MetaMask SDK
// whenever that object claims `isMetaMask`, and other extensions claim it too
// (Rabby does, and then answers every request meant for MetaMask). On desktop
// the MetaMask extension announces itself over EIP-6963 (rdns io.metamask) and
// wagmi builds a connector for exactly that provider, so the SDK connector is
// dropped there. It stays on mobile, where it deep-links into the MetaMask app,
// and on desktops with nothing claiming MetaMask, where it shows the QR flow.
const isMobileDevice = () => typeof navigator !== 'undefined' && (
  /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const eip6963MetaMaskWallet = (params) => {
  const wallet = metaMaskWallet(params);
  if (wallet.qrCode || isMobileDevice()) return wallet;
  return { ...wallet, hidden: () => true };
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
      }),
      eip6963MetaMaskWallet,
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

// The wallet modal in Electric Foundation: purple actions, Open Sans, the kit's surfaces, and the
// theme the app is in. RainbowKit renders outside the app's DOM tree, so the values are passed here
// rather than read from the CSS tokens.
const rainbowKitThemeOptions = {
  accentColor: '#7d33ff',
  accentColorForeground: '#ffffff',
  borderRadius: 'small',
  fontStack: 'system',
  overlayBlur: 'small',
};

const withSeerSurfaces = (theme, surfaces) => ({
  ...theme,
  colors: { ...theme.colors, ...surfaces },
  fonts: { body: 'var(--seer-font-sans)' },
});

const rainbowKitThemes = {
  light: withSeerSurfaces(lightTheme(rainbowKitThemeOptions), {
    modalBackground: '#ffffff',
    modalBorder: '#e2e2e9',
    modalText: '#17171c',
    modalTextSecondary: '#5c5c66',
    modalBackdrop: 'rgba(20, 18, 35, 0.56)',
  }),
  dark: withSeerSurfaces(darkTheme(rainbowKitThemeOptions), {
    modalBackground: '#1a1a1e',
    modalBorder: '#34343c',
    modalText: '#ededf2',
    modalTextSecondary: '#a8a8b3',
    modalBackdrop: 'rgba(20, 18, 35, 0.56)',
  }),
};

const Providers = ({ children }) => {
  const { isDarkMode } = useTheme();
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          chains={chains}
          locale="en-US"
          modalSize="compact"
          theme={isDarkMode ? rainbowKitThemes.dark : rainbowKitThemes.light}
          showRecentTransactions={true}
          appInfo={{
            appName: 'Futarchy',
            learnMoreUrl: '#',
            disclaimer: () => (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--seer-muted)' }}>
                  By connecting your wallet, you agree to our terms and acknowledge the risks of using prediction markets.
                </p>
              </div>
            ),
          }}
          initialChain={gnosis}
          coolMode={false}
        >
          <RecentWalletReconnector />
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
