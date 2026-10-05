import { useEffect, useState } from 'react';

const useMarketTabs = (config) => {
  const [marketHasClosed, setMarketHasClosed] = useState(false);

  // Add state for active tab - default to redeem-tokens if market is resolved, otherwise recent-trades-sdk
  const [activeTab, setActiveTab] = useState(
    config?.marketInfo?.resolved ? 'redeem-tokens' : 'recent-trades-sdk'
  );

  // State for Recent Trades filter controls
  const [showMyTrades, setShowMyTrades] = useState(false);
  const [tradesLimit, setTradesLimit] = useState(30);

  // Split Configuration
  useEffect(() => {
    if (config?.marketInfo) {
      // Check if market is resolved based on resolution status only
      if (config.marketInfo.resolved) {
        setMarketHasClosed(true);
        // Switch to redeem-tokens tab when market is resolved
        setActiveTab('redeem-tokens');
      } else {
        setMarketHasClosed(false);
      }
    }
  }, [config]);

  return {
    marketHasClosed,
    activeTab,
    setActiveTab,
    showMyTrades,
    setShowMyTrades,
    tradesLimit,
    setTradesLimit
  };
};

export { useMarketTabs };
