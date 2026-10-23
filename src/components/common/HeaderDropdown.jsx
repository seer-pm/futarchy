import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  MoonIcon,
  SunIcon,
  WalletIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import RpcRefreshButton from "./RpcRefreshButton";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../ui/Button";

const itemClassName =
  "flex items-center gap-3 w-full h-11 px-3 rounded-control text-sm text-left text-seer-text hover:bg-seer-surface-raised transition-colors";

/** The phone header's menu: wallet, network, theme and RPC, which sit inline on wider screens. */
const HeaderDropdown = ({ chain, connected, accountLabel, onWallet, onSwitchChain, onDisconnect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { isDarkMode, cycleTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const run = (action) => () => {
    setIsOpen(false);
    action?.();
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        icon
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls="header-menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <XMarkIcon className="w-5 h-5" aria-hidden="true" /> : <Bars3Icon className="w-5 h-5" aria-hidden="true" />}
      </Button>

      {isOpen && (
        <div
          id="header-menu"
          className="absolute top-full right-0 mt-2 w-64 p-2 rounded-surface bg-seer-surface border border-seer-border shadow-lg z-50"
        >
          <button type="button" className={itemClassName} onClick={run(onWallet)}>
            <WalletIcon className="w-5 h-5 text-seer-muted" aria-hidden="true" />
            <span className="truncate">{connected ? accountLabel || "Account" : "Connect Wallet"}</span>
          </button>

          {connected && chain && (
            <button type="button" className={itemClassName} onClick={run(onSwitchChain)}>
              {chain.hasIcon && chain.iconUrl ? (
                <img src={chain.iconUrl} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <span className="w-5 h-5" aria-hidden="true" />
              )}
              <span>Network: {chain.name}</span>
            </button>
          )}

          <button type="button" className={itemClassName} onClick={cycleTheme}>
            {isDarkMode ? (
              <SunIcon className="w-5 h-5 text-seer-muted" aria-hidden="true" />
            ) : (
              <MoonIcon className="w-5 h-5 text-seer-muted" aria-hidden="true" />
            )}
            <span>{isDarkMode ? "Light mode" : "Dark mode"}</span>
          </button>

          {chain && <RpcRefreshButton chain={chain} showLabel className={itemClassName} />}

          {connected && (
            <>
              <div className="my-1 h-px bg-seer-border" aria-hidden="true" />
              <button type="button" className={`${itemClassName} text-seer-negative`} onClick={run(onDisconnect)}>
                <ArrowRightStartOnRectangleIcon className="w-5 h-5" aria-hidden="true" />
                <span>Disconnect</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HeaderDropdown;
