import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { useRouter } from 'next/router';

const CHAIN_STYLE_MAP = {
  1: {
    name: 'Ethereum Mainnet',
    logoSrc: '/assets/ethereum-icon.svg',
    accentBg: 'bg-futarchyBlue3',
    accentBorder: 'border-futarchyBlue5',
    accentText: 'text-futarchyBlue11'
  },
  100: {
    name: 'Gnosis Chain',
    logoSrc: '/assets/gnosis-dao-logo.svg',
    accentBg: 'bg-futarchyGreen3',
    accentBorder: 'border-futarchyGreen5',
    accentText: 'text-futarchyGreen11'
  }
};

const DEFAULT_CHAIN_STYLE = {
  accentBg: 'bg-futarchyGray3',
  accentBorder: 'border-futarchyGray6',
  accentText: 'text-futarchyGray11'
};

const WrongNetworkModal = ({ requiredChainId, isOpen, onClose }) => {
  const { chain: currentChain } = useAccount();
  const { switchChain, chains, isPending, error } = useSwitchChain();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [resolvedIcons, setResolvedIcons] = useState({});

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  const resolveChainIcon = useCallback(async (chainOption) => {
    if (!chainOption) return null;

    const { iconUrl } = chainOption;

    if (typeof iconUrl === 'string') {
      return iconUrl;
    }

    if (typeof iconUrl === 'function') {
      try {
        const maybeIcon = await iconUrl();
        return typeof maybeIcon === 'string' ? maybeIcon : null;
      } catch (err) {
        console.error('Failed to resolve chain icon', err);
        return null;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadIcons = async () => {
      const chainSources = new Map();

      if (Array.isArray(chains)) {
        chains.forEach((chainOption) => {
          if (chainOption?.id != null) {
            chainSources.set(chainOption.id, chainOption);
          }
        });
      }

      if (currentChain?.id != null && !chainSources.has(currentChain.id)) {
        chainSources.set(currentChain.id, currentChain);
      }

      if (requiredChainId != null && !chainSources.has(requiredChainId)) {
        const styleSource = CHAIN_STYLE_MAP[requiredChainId];
        if (styleSource) {
          chainSources.set(requiredChainId, { id: requiredChainId, iconUrl: styleSource.logoSrc });
        }
      }

      if (chainSources.size === 0) return;

      const iconEntries = await Promise.all(
        Array.from(chainSources.values()).map(async (chainOption) => {
          const icon = await resolveChainIcon(chainOption);
          return [chainOption.id, icon];
        })
      );

      if (!cancelled) {
        setResolvedIcons((prev) => {
          const next = { ...prev };
          iconEntries.forEach(([id, icon]) => {
            if (icon) {
              next[id] = icon;
            }
          });
          return next;
        });
      }
    };

    loadIcons();

    return () => {
      cancelled = true;
    };
  }, [chains, currentChain, requiredChainId, resolveChainIcon]);

  if (!isVisible) return null;

  const getChainInfo = (chainId) => {
    const wagmiChain =
      (chainId && chains && chains.find((chainOption) => chainOption.id === chainId)) ||
      (currentChain?.id === chainId ? currentChain : undefined);

    const style =
      (chainId && CHAIN_STYLE_MAP[chainId]) || {
        name: wagmiChain?.name || (chainId ? `Chain ${chainId}` : 'Unknown Network'),
        logoSrc: null,
        ...DEFAULT_CHAIN_STYLE
      };

    const resolvedIcon = chainId != null ? resolvedIcons[chainId] : null;

    return {
      name: wagmiChain?.name || style.name,
      logoSrc: style.logoSrc || resolvedIcon || null,
      accentBg: style.accentBg,
      accentBorder: style.accentBorder,
      accentText: style.accentText
    };
  };

  const requiredChain = getChainInfo(requiredChainId);
  const currentChainInfo = currentChain ? getChainInfo(currentChain.id) : null;
  const canSwitch = chains?.some(c => c.id === requiredChainId);

  const handleSwitch = async () => {
    if (switchChain && canSwitch) {
      try {
        await switchChain({ chainId: requiredChainId });
        // Modal will close automatically when chain changes
      } catch (err) {
        console.error('Failed to switch chain:', err);
      }
    }
  };

  const handleGoBack = () => {
    router.push('/companies');
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[393px] md:max-w-[480px]">
        <div className="relative flex flex-col w-full max-h-[calc(100dvh-3rem)] overflow-y-auto bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl shadow-2xl p-5 md:p-6 gap-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-futarchyCrimson3 text-futarchyCrimson11">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg md:text-xl font-semibold text-futarchyGray12 dark:text-white">
                Wrong Network
              </h3>
              <p className="mt-1 text-sm text-futarchyGray11 dark:text-futarchyGray112">
                Switch to the correct network to continue interacting with this market.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {currentChainInfo && (
              <div className={`flex items-start gap-3 rounded-xl border ${currentChainInfo.accentBorder} bg-futarchyCrimson3/60 px-4 py-3`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-futarchyCrimson3 text-futarchyCrimson11 overflow-hidden">
                  {currentChainInfo.logoSrc ? (
                    <img
                      src={currentChainInfo.logoSrc}
                      alt={`${currentChainInfo.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">🔗</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-futarchyCrimson11">
                    Current Network
                  </p>
                  <p className="text-base font-semibold text-futarchyGray12 dark:text-black">
                    {currentChainInfo.name}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-futarchyCrimson7 text-white">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-futarchyGray3 text-futarchyGray10">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </div>

            <div className={`flex items-start gap-3 rounded-xl border ${requiredChain.accentBorder} ${requiredChain.accentBg} px-4 py-3`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-futarchyGreen11 dark:bg-futarchyDarkGray3/70 overflow-hidden">
                {requiredChain.logoSrc ? (
                  <img
                    src={requiredChain.logoSrc}
                    alt={`${requiredChain.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xl">🔗</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-semibold uppercase tracking-wide ${requiredChain.accentText}`}>
                  Required Network
                </p>
                <p className="text-base font-semibold text-futarchyGray12 dark:text-black">
                  {requiredChain.name}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-futarchyGreen6 text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-futarchyGray3 dark:bg-futarchyDarkGray2 px-4 py-3">
            <p className="text-sm text-futarchyGray11 dark:text-futarchyGray112">
              This proposal runs on <span className="font-semibold text-futarchyGray12 dark:text-white">{requiredChain.name}</span>. Switch networks in your wallet to trade, add liquidity, or manage collateral for this market.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-futarchyCrimson5 bg-futarchyCrimson3 px-4 py-3 text-sm text-futarchyCrimson11">
              {error.message || 'Failed to switch network. Please try again.'}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {canSwitch ? (
              <button
                onClick={handleSwitch}
                disabled={isPending}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors ${isPending
                  ? 'bg-futarchyGray6 text-futarchyGray112'
                  : 'bg-black hover:bg-lightBlack dark:bg-white dark:text-black dark:hover:bg-futarchyGray122'}`}
              >
                {isPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Switching networks…
                  </>
                ) : (
                  `Switch to ${requiredChain.name}`
                )}
              </button>
            ) : (
              <div className="rounded-lg border border-futarchyGray6 bg-futarchyGray3 px-4 py-3 text-center text-sm font-medium text-futarchyGray11 dark:bg-futarchyDarkGray3 dark:text-futarchyGray112">
                Network not available in your wallet. Please add {requiredChain.name} manually.
              </div>
            )}

            <button
              onClick={handleGoBack}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-futarchyGray6 bg-white px-6 py-3 text-sm font-semibold text-futarchyGray11 transition-colors hover:bg-futarchyGray3 dark:bg-futarchyDarkGray3 dark:text-futarchyGray112 dark:hover:bg-futarchyDarkGray4"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Go back to companies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WrongNetworkModal;
