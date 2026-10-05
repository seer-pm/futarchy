import { useEffect, useMemo, useState } from 'react';
import { getRealityQuestionUrl } from '../../../debug/constants/chainConfig';
import { normalizeRealityQuestionUrl } from '../../../../utils/marketPageUtils.mjs';

const useMarketData = ({ config, configLoading, configError }) => {
  // Dynamic market data state. Starts empty (the hero shows a skeleton while
  // isLoading) — never another market's copy.
  const [marketData, setMarketData] = useState({
    display_title_0: "",
    display_title_1: "",
    title: "",
    description: "",
    question_title: null,
    question_link: null,
    isLoading: true,
    error: null
  });

  const marketSubject = useMemo(() => {
    const displayTexts = [
      marketData.display_title_1,
      marketData.display_title_0,
      marketData.title,
      config?.marketInfo?.display_text_1,
      config?.marketInfo?.title
    ].filter(Boolean);
    const identifier = displayTexts.join(' ').match(/\b(?:EIP|GIP|KIP|ERC|RIP|SIP|AIP|MIP|TIP)[-\s]?\d+\b/i)?.[0];

    if (identifier) return identifier.replace(/\s+/, '-').toUpperCase();

    const fallback = String(displayTexts[0] || 'this market')
      .replace(/^\s*if\s+/i, '')
      .replace(/[?.!]+$/, '')
      .trim();
    return fallback.length > 48 ? `${fallback.slice(0, 45).trimEnd()}…` : fallback;
  }, [
    marketData.display_title_1,
    marketData.display_title_0,
    marketData.title,
    config?.marketInfo?.display_text_1,
    config?.marketInfo?.title
  ]);

  // Function to fetch dynamic market data from Supabase
  const fetchMarketData = async () => {
    // Don't fetch if config is not loaded yet - we'll get the data from useContractConfig instead
    if (!config || !config.marketInfo) {
      console.log('Config not loaded yet, skipping fetchMarketData');
      return;
    }

    try {
      console.log('Using market data from config:', config.marketInfo);
      console.log('Checking for display_text fields:', {
        display_text_0: config.marketInfo?.display_text_0,
        display_text_1: config.marketInfo?.display_text_1
      });
      setMarketData(prev => ({ ...prev, isLoading: true, error: null }));

      // Use the market info from useContractConfig hook instead of querying again
      const marketInfo = config.marketInfo;

      // Parse the market event data to extract display titles
      // Neutral fallbacks: a market without metadata shows its address, not
      // another market's title/description.
      const fallbackTitle = config?.MARKET_ADDRESS
        ? `Market ${config.MARKET_ADDRESS.slice(0, 6)}…${config.MARKET_ADDRESS.slice(-4)}`
        : 'Market';
      let parsedData = {
        display_title_0: marketInfo.title || fallbackTitle,
        display_title_1: "",
        title: marketInfo.title || fallbackTitle,
        description: marketInfo.description || "",
        question_title: marketInfo.title || null,
        question_link: normalizeRealityQuestionUrl(marketInfo.questionLink, config?.chainId) || null,
        isLoading: false,
        error: null
      };

      // Auto-generate Reality.eth link if not provided
      if (!parsedData.question_link && config?.MARKET_ADDRESS && config?.chainId) {
        try {
          const realityUrl = await getRealityQuestionUrl(config.chainId, config.MARKET_ADDRESS);
          if (realityUrl) {
            parsedData.question_link = realityUrl;
            console.log('[Reality] Auto-generated question link:', realityUrl);
          }
        } catch (e) {
          console.warn('[Reality] Failed to generate question link:', e);
        }
      }

      // First, try to use display_text_0 and display_text_1 from metadata if available
      if (marketInfo.display_text_0 && marketInfo.display_text_1) {
        parsedData.display_title_0 = marketInfo.display_text_0;
        parsedData.display_title_1 = marketInfo.display_text_1;
      } else if (marketInfo.title) {
        // Fallback: Try to split the title into two parts if it contains "if"
        const title = marketInfo.title;
        const ifIndex = title.toLowerCase().indexOf(' if ');

        if (ifIndex !== -1) {
          parsedData.display_title_0 = title.substring(0, ifIndex);
          parsedData.display_title_1 = "if " + title.substring(ifIndex + 4);
        } else {
          // If no "if" found, use the full title as display_title_0
          parsedData.display_title_0 = title;
          parsedData.display_title_1 = "";
        }
      }

      setMarketData(parsedData);

    } catch (error) {
      console.error('Failed to process market data from config:', error);
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to process market data'
      }));
    }
  };

  // Fetch market data when config is loaded
  useEffect(() => {
    if (config && config.marketInfo) {
      fetchMarketData();
    }
  }, [config]);

  // Surface config failures instead of leaving the hero stuck on
  // "Loading badges…" / "Loading description…" forever
  useEffect(() => {
    if (!configLoading && configError) {
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: configError.message || 'Market data unavailable'
      }));
    }
  }, [configLoading, configError]);

  return { marketData, marketSubject };
};

export { useMarketData };
