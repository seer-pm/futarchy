import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { WalletIcon, OpenMenuIcon, DocumentationIcon, HomeIcon } from "../futarchyFi/proposalsList/cards/Resources";
import { useSwitchChain } from 'wagmi';
import RpcRefreshButton from './RpcRefreshButton';
import { useTheme, THEMES } from '../../contexts/ThemeContext';

const HeaderDropdown = ({ options, config, onWalletConnectClick, chain, mounted }) => {
  // const { chain } = useAccount(); // Removed in favor of prop
  const { chains, switchChain } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { theme, cycleTheme, isDarkMode } = useTheme();

  const isCompaniesSection = config === 'companies';

  const getIcon = (option) => {
    // Determine icon color based on dark mode and section
    const iconColor = isDarkMode ? "white" : (isCompaniesSection ? "#000000" : "currentColor");

    if (option.isWallet) {
      return <WalletIcon className="w-4 h-4 transition-colors" fill={iconColor} />;
    }
    if (option.isDisconnect) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      );
    }
    switch (option.label) {
      case 'Home':
        return <HomeIcon className="w-4 h-4 transition-colors" fill={iconColor} />;
      case 'Documentation':
        return <DocumentationIcon className="w-4 h-4 transition-colors" fill={iconColor} />;
      default:
        return null;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-12 w-12 bg-transparent border-2 rounded-xl text-base font-semibold transition-colors flex items-center justify-center
          ${isCompaniesSection && !isDarkMode
            ? 'border-futarchyGray62 text-futarchyGray11 hover:text-futarchyGray11/70 hover:border-futarchyGray11'
            : 'border-futarchyDarkGray42 text-futarchyGray122 hover:text-futarchyGray122/70 hover:border-futarchyGray122'
          }
          ${isDarkMode ? 'dark:border-futarchyDarkGray42 dark:text-white dark:hover:text-white/70 dark:hover:border-white' : ''}`}
      >
        <OpenMenuIcon
          className="w-5 h-5"
          fill="white"
        />
      </button>

      {isOpen && (
        <div className={`absolute top-full right-0 mt-1 w-48 rounded-xl shadow-lg z-50 
          ${isCompaniesSection && !isDarkMode
            ? 'bg-futarchyGray2 border border-futarchyGray4'
            : 'bg-futarchyDarkGray2 border border-futarchyDarkGray42'
          }
          ${isDarkMode ? 'dark:bg-futarchyDarkGray2 dark:border-futarchyDarkGray42' : ''}`}
        >
          {/* Chain Selector */}
          {mounted && chain && chains && chains.length > 1 && (
            <>
              <div className={`px-4 py-2 text-xs font-semibold ${isDarkMode ? 'text-futarchyGray122' : 'text-futarchyGray122'}`}>
                Network
              </div>
              {chains.map((availableChain) => (
                <button
                  key={availableChain.id}
                  onClick={() => {
                    if (switchChain && availableChain.id !== chain?.id) {
                      switchChain({ chainId: availableChain.id });
                    }
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 w-full px-4 py-3 transition-colors text-sm leading-5 font-normal text-left
                    ${isCompaniesSection && !isDarkMode
                      ? 'text-futarchyGray11 hover:text-futarchyGray11/70 hover:bg-futarchyGray4'
                      : 'text-futarchyGray122 hover:text-futarchyGray122/70 hover:bg-futarchyDarkGray42'
                    }
                    ${isDarkMode ? 'dark:text-white dark:hover:text-white/70 dark:hover:bg-futarchyDarkGray42' : ''}`}
                >
                  <span>{availableChain.name}</span>
                  {chain?.id === availableChain.id && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}

              {/* RPC Refresh Button */}
              <RpcRefreshButton
                chain={chain}
                isDarkMode={isDarkMode}
                className={`w-full px-4 py-3 text-sm leading-5 font-normal text-left
                  ${isCompaniesSection && !isDarkMode
                    ? 'text-futarchyGray11 hover:text-futarchyGray11/70 hover:bg-futarchyGray4'
                    : 'text-futarchyGray122 hover:text-futarchyGray122/70 hover:bg-futarchyDarkGray42'
                  }
                  ${isDarkMode ? 'dark:text-white dark:hover:text-white/70 dark:hover:bg-futarchyDarkGray42' : ''}`}
              />

              <div className={`border-t ${isDarkMode ? 'border-futarchyDarkGray42' : 'border-futarchyGray122/20'}`}></div>
            </>
          )}

          {/* Theme Toggle in dropdown */}
          <button
            onClick={() => {
              cycleTheme();
              setIsOpen(false);
            }}
            className={`flex items-center gap-2 w-full px-4 py-3 transition-colors text-sm leading-5 font-normal text-left first:rounded-t-xl
              ${isCompaniesSection && !isDarkMode
                ? 'text-futarchyGray11 hover:text-futarchyGray11/70 hover:bg-futarchyGray4'
                : 'text-futarchyGray122 hover:text-futarchyGray122/70 hover:bg-futarchyDarkGray42'
              }
              ${isDarkMode ? 'dark:text-white dark:hover:text-white/70 dark:hover:bg-futarchyDarkGray42' : ''}`}
          >
            {theme === THEMES.LIGHT && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <span>Dark Mode</span>
              </>
            )}
            {theme === THEMES.DARK && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <span>Light Mode</span>
              </>
            )}
          </button>

          {options.map((option, index) => (
            option.isWallet || option.isDisconnect ? (
              <button
                key={index}
                onClick={() => {
                  setIsOpen(false);
                  if (option.onClick) {
                    option.onClick();
                  } else if (option.isWallet && onWalletConnectClick) {
                    onWalletConnectClick();
                  }
                }}
                className={`flex items-center gap-2 w-full px-4 py-3 transition-colors text-sm leading-5 font-normal text-left ${index === options.length - 1 ? 'last:rounded-b-xl' : ''}
                  ${isCompaniesSection && !isDarkMode
                    ? 'text-futarchyGray11 hover:text-futarchyGray11/70 hover:bg-futarchyGray4'
                    : 'text-futarchyGray122 hover:text-futarchyGray122/70 hover:bg-futarchyDarkGray42'
                  }
                  ${isDarkMode ? 'dark:text-white dark:hover:text-white/70 dark:hover:bg-futarchyDarkGray42' : ''}
                  ${option.isDisconnect ? 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300' : ''}`}
              >
                {getIcon(option)}
                {option.label}
              </button>
            ) : (
              <Link
                key={index}
                href={option.href}
                className={`flex items-center gap-2 w-full px-4 py-3 transition-colors text-sm leading-5 font-normal text-left ${index === options.length - 1 ? 'last:rounded-b-xl' : ''}
                  ${isCompaniesSection && !isDarkMode
                    ? 'text-futarchyGray11 hover:text-futarchyGray11/70 hover:bg-futarchyGray4'
                    : 'text-futarchyGray122 hover:text-futarchyGray122/70 hover:bg-futarchyDarkGray42'
                  }
                  ${isDarkMode ? 'dark:text-white dark:hover:text-white/70 dark:hover:bg-futarchyDarkGray42' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                {getIcon(option)}
                {option.label}
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default HeaderDropdown;