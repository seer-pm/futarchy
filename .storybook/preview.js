import React from 'react';
import { GlobalProvider } from '@contexts/GlobalContext.js';
import '@seer-pm/ui-kit/fonts.css';
import '@seer-pm/ui-kit/tokens.css';
import '@seer-pm/ui-kit/base.css';
import '@seer-pm/ui-kit/components.css';
import '@rainbow-me/rainbowkit/styles.css';
import '../src/styles/globals.css';
import {
  RainbowKitProvider,
  getDefaultWallets,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "wagmi";
import { http } from 'viem';
import { gnosis } from "wagmi/chains";

const chains = [gnosis];
const projectId = "76fa3deb89f7aa56f09cf1ac472eccb4";

// Configure wallets
const { connectors } = getDefaultWallets({
  appName: 'Futarchy',
  projectId,
  chains,
});

// Create wagmi config
const config = createConfig({
  chains,
  transports: {
    [gnosis.id]: http(),
  },
  connectors,
});

// Create a new QueryClient instance
const queryClient = new QueryClient();

export const decorators = [
  (Story, context) => (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          chains={chains} 
          locale="en-US" 
          modalSize="compact"
          theme={darkTheme({
            borderRadius: 'small',
            fontStack: 'system',
            overlayBlur: 'small',
            accentColor: '#7d33ff',
          })}
          showRecentTransactions={false}
          appInfo={{
            appName: 'Futarchy',
            learnMoreUrl: '#',
          }}
          initialChain={gnosis}
        >
          <GlobalProvider
            currencyMarketValue={context.args.currencyMarketValue}
            selectedCurrency={context.args.selectedCurrency}
            selectedSymbol={context.args.selectedSymbol}
            precision={context.args.precision}
          >
            <Story />
          </GlobalProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  ),
];

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  }
};
