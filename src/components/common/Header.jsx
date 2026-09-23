// components/common/Header.jsx
import React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletIcon } from "../futarchyFi/proposalsList/cards/Resources";
import HeaderDropdown from "./HeaderDropdown";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../../contexts/ThemeContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { useAccount, useSwitchChain, useDisconnect } from 'wagmi';
import RpcRefreshButton from './RpcRefreshButton';
import BrandLogo from './BrandLogo';

const Header = ({ config = 'landing' }) => {
  const { selectedCurrency, setSelectedCurrency, baseTokenSymbol, allowWXDAI } = useCurrency();
  const { isDarkMode } = useTheme();

  // Get chain info from wagmi v2
  const { chain, isConnected } = useAccount();
  const { chains, switchChain } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const isGnosis = chain?.id === 100;

  const navigationOptions = [
    {
      label: 'Connect Wallet',
      href: '#',
      isWallet: true
    },
  ];

  // Header configurations
  const headerConfigs = {
    landing: {
      button: (
        <Link
          href="/companies"
          className="h-12 border-2 border-black hover:border-black bg-black px-4 py-3 rounded-xl text-base font-semibold text-white hover:bg-white hover:text-black transition-colors shadow-xs dark:border-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white"
        >
          Launch App
        </Link>
      )
    },
    app: {
      additionalElements: (
        <div className="hidden md:flex items-center gap-4">
        </div>
      ),
      button: (
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            // Until mounted, render size-matched placeholders: the server always
            // renders the disconnected state, so rendering the real (possibly
            // connected) markup on the first client pass breaks hydration.
            if (!ready) {
              return (
                <>
                  <div className="md:hidden h-12 w-12" aria-hidden />
                  <div className="hidden md:block h-12 w-48" aria-hidden />
                </>
              );
            }

            // Update navigation options based on connection state
            let currentNavigationOptions = navigationOptions.map(option => {
              if (option.isWallet && connected) {
                return {
                  ...option,
                  label: account.displayName || 'Account',
                  href: '#',
                  onClick: openAccountModal
                };
              }
              return option;
            });

            if (connected) {
              currentNavigationOptions.push({
                label: 'Disconnect',
                href: '#',
                isDisconnect: true,
                onClick: () => disconnect()
              });
            }

            return (
              <>
                <div className="md:hidden">
                  <HeaderDropdown
                    options={currentNavigationOptions}
                    onWalletConnectClick={() => {
                      if (connected && openAccountModal) {
                        openAccountModal();
                      } else if (openConnectModal) {
                        openConnectModal();
                      }
                    }}
                    chain={chain}
                    mounted={ready}
                  />
                </div>
                <div className="hidden md:block">
                  <div>
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            className="w-48 h-12 py-3 px-4 flex items-center justify-between border-2 border-transparent rounded-lg bg-futarchyGray122 hover:border-futarchyGray122 hover:bg-transparent group dark:bg-white dark:hover:border-white dark:hover:bg-transparent"
                          >
                            <div className="flex items-center gap-2 text-futarchyDarkGray2 group-hover:text-futarchyGray122 transition-colors dark:text-black dark:group-hover:text-white">
                              <WalletIcon className="transition-colors" />
                              <span className="font-semibold text-base leading-6">
                                Connect Wallet
                              </span>
                            </div>
                          </button>
                        );
                      }
                      return <ConnectButton />;
                    })()}
                  </div>
                </div>
              </>
            );
          }}
        </ConnectButton.Custom>
      ),
      className: "bg-futarchyDarkGray2 border-futarchyDarkGray42 dark:bg-futarchyDarkGray2 dark:border-futarchyDarkGray42"
    }
  };

  const currentConfig = headerConfigs[config] || headerConfigs['app'];

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 ${currentConfig.className || 'bg-futarchyDarkGray2 dark:bg-futarchyDarkGray2'}`}>
      <div className="h-20 border-b-2 border-futarchyDarkGray42 dark:border-futarchyDarkGray42">
        <div className="container mx-auto px-5 h-full flex items-center justify-between">
          <div className="flex items-center gap-14">
            {/* Logo Section */}
            <Link
              href="/"
              className="flex items-center gap-2 group cursor-pointer"
            >
              <BrandLogo className="transition-opacity group-hover:opacity-70" />
            </Link>

            {/* Additional Elements (e.g., Home button for proposals) */}
            {currentConfig.additionalElements}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side buttons */}
          <div className="flex items-center gap-4">
            {/* Chain Selector Button - Mobile */}
            {config !== 'landing' && (
              <div className="md:hidden">
                <ConnectButton.Custom>
                  {({ chain, openChainModal, mounted }) => {
                    if (!mounted) {
                      return <div aria-hidden />;
                    }
                    return (
                      <div>
                        {chain && openChainModal && (
                          <button
                            onClick={openChainModal}
                            className="h-12 w-12 bg-transparent border-2 border-futarchyDarkGray42 rounded-xl text-futarchyGray122 hover:text-futarchyGray122/70 hover:border-futarchyGray122 dark:border-futarchyDarkGray42 dark:text-white dark:hover:text-white/70 dark:hover:border-white transition-colors flex items-center justify-center"
                            aria-label="Switch network"
                          >
                            {chain.hasIcon && chain.iconUrl && (
                              <img
                                alt={chain.name ?? 'Chain icon'}
                                src={chain.iconUrl}
                                className="w-6 h-6"
                              />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            )}

            {/* RPC Refresh Button - Desktop */}
            {config !== 'landing' && chain && (
              <div className="hidden md:block">
                <RpcRefreshButton
                  chain={chain}
                  isDarkMode={isDarkMode}
                  showLabel={false}
                  className="p-2 text-futarchyGray122 hover:text-futarchyGray122/70 dark:text-white dark:hover:text-white/70 border border-futarchyGray122/20 rounded-lg dark:border-white/20"
                />
              </div>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Currency selector - show on Gnosis Chain (or assume Gnosis if no chain detected) */}
            {config !== 'landing' && (!chain || isGnosis) && allowWXDAI && baseTokenSymbol && (
              <div className="hidden md:flex items-center gap-2 p-1 text-sm font-medium text-futarchyGray122 border border-futarchyGray122/20 rounded-lg dark:text-white dark:border-white/20">
                {/* Base token from config (e.g., SDAI, USDS, etc.) */}
                <button
                  onClick={() => setSelectedCurrency(baseTokenSymbol)}
                  className={`py-1 px-3 rounded transition-colors ${selectedCurrency === baseTokenSymbol
                    ? 'bg-futarchyGray122/10 text-futarchyGray122 dark:bg-white/10 dark:text-white'
                    : 'text-futarchyGray122 hover:bg-futarchyGray122/10 dark:text-white dark:hover:bg-white/10'
                    }`}
                >
                  {baseTokenSymbol}
                </button>
                {/* WXDAI option - only on Gnosis Chain */}
                {allowWXDAI && (
                  <button
                    onClick={() => setSelectedCurrency('WXDAI')}
                    className={`py-1 px-3 rounded transition-colors ${selectedCurrency === 'WXDAI'
                      ? 'bg-futarchyGray122/10 text-futarchyGray122 dark:bg-white/10 dark:text-white'
                      : 'text-futarchyGray122 hover:bg-futarchyGray122/10 dark:text-white dark:hover:bg-white/10'
                      }`}
                  >
                    WXDAI
                  </button>
                )}
              </div>
            )}
            {currentConfig.button}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
