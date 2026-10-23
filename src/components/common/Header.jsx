// components/common/Header.jsx
import React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BrandLockup } from "@seer-pm/ui-kit/react";
import { WalletIcon } from "@heroicons/react/24/outline";
import HeaderDropdown from "./HeaderDropdown";
import ThemeToggle from "./ThemeToggle";
import { useCurrency } from "../../contexts/CurrencyContext";
import { useAccount, useDisconnect } from "wagmi";
import RpcRefreshButton from "./RpcRefreshButton";
import Button from "../ui/Button";

// The header follows the page theme, as on every Seer site: the lockup, then the controls that
// change how the app reads (currency, theme, RPC) and the wallet last, where the eye ends.
// It stays 80px tall because the page shells offset their content by that height (top-20, mt-20).
const Header = () => {
  const { selectedCurrency, setSelectedCurrency, baseTokenSymbol, allowWXDAI } = useCurrency();
  const { chain } = useAccount();
  const { disconnect } = useDisconnect();
  const isGnosis = chain?.id === 100;
  const showCurrency = (!chain || isGnosis) && allowWXDAI && baseTokenSymbol;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-seer-page text-seer-text border-b border-seer-border">
      <div className="container mx-auto px-5 h-full flex items-center gap-3">
        <Link href="/" aria-label="Seer Futarchy home" className="mr-auto rounded-control text-seer-text">
          <BrandLockup appName="Futarchy" />
        </Link>

        {showCurrency && (
          <div
            role="group"
            aria-label="Show prices in"
            className="hidden md:flex items-center gap-1 p-1 rounded-control border border-seer-border"
          >
            {[baseTokenSymbol, "WXDAI"].map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => setSelectedCurrency(symbol)}
                aria-pressed={selectedCurrency === symbol}
                className={`h-8 px-3 rounded-control text-[13px] font-semibold transition-colors ${
                  selectedCurrency === symbol
                    ? "bg-seer-accent-soft text-seer-accent-text"
                    : "text-seer-muted hover:text-seer-text"
                }`}
              >
                {symbol}
              </button>
            ))}
          </div>
        )}

        {chain && (
          <div className="hidden md:block">
            <RpcRefreshButton chain={chain} />
          </div>
        )}

        <div className="hidden md:block">
          <ThemeToggle />
        </div>

        <ConnectButton.Custom>
          {({ account, chain: connectedChain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
            // The server always renders the disconnected state, so until mount the slot is a
            // size-matched placeholder rather than markup that would break hydration.
            if (!mounted) {
              return <div className="h-10 w-10 md:w-36" aria-hidden />;
            }
            const connected = account && connectedChain;

            return (
              <>
                <div className="md:hidden">
                  <HeaderDropdown
                    chain={connectedChain}
                    connected={Boolean(connected)}
                    accountLabel={account?.displayName}
                    onWallet={connected ? openAccountModal : openConnectModal}
                    onSwitchChain={openChainModal}
                    onDisconnect={() => disconnect()}
                  />
                </div>
                <div className="hidden md:block">
                  {connected ? (
                    <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
                  ) : (
                    <Button onClick={openConnectModal}>
                      <WalletIcon className="w-[18px] h-[18px]" aria-hidden="true" />
                      Connect Wallet
                    </Button>
                  )}
                </div>
              </>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
};

export default Header;
