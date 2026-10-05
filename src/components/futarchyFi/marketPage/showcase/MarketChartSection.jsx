import dynamic from 'next/dynamic';
import TripleChart from '@components/chart/TripleChart';
import ChartParameters from '../tripleChart/chartParameters/ChartParameters';
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from '../../../../constants/addresses';

// Renders only when the useSubgraph query param asks for it.
const SubgraphChart = dynamic(() => import("@components/chart/SubgraphChart"), { ssr: false });

const MarketChartSection = ({
  showTripleChart,
  showSubgraphChart,
  config,
  currencySymbol,
  selectedCurrency,
  rate,
  prices,
  latestPrices,
  hasSpot,
  chartFilters,
  handleChartFilterClick,
  marketHasClosed,
  spot
}) => {
  const { sdaiRate, isLoadingRate, rateError } = rate;
  const { newYesPrice, newNoPrice, newThirdPrice, thirdCandles, newBasePrice } = prices;
  const { effectiveSpotPriceParam, configSpotError, stableSpotData, finalSpotPrice, refetchConfigSpot } = spot;

  return (
    <>
      {/* Market Container - Only shows if TripleChart is enabled */}
      {showTripleChart && (
        <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden flex flex-col h-[550px]">
          {/* Market Stats Header */}
          <div className="h-16 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
            <ChartParameters
              tradingPair={`${config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG.company.symbol}/${selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}`}
              spotPrice={(() => {
                const value = Number(newBasePrice !== null ? newBasePrice : (latestPrices.spotPriceSDAI || 0));
                const displayValue = selectedCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                  ? value * sdaiRate
                  : value;
                return displayValue;
              })()}
              yesPrice={(newYesPrice === null || typeof newYesPrice === 'undefined') ? null : (() => {
                const value = Number(newYesPrice);
                const displayCurrency = selectedCurrency;
                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                  ? value * sdaiRate
                  : value;
                return displayValue;
              })()}
              noPrice={(newNoPrice === null || typeof newNoPrice === 'undefined') ? null : (() => {
                const value = Number(newNoPrice);
                const displayCurrency = selectedCurrency;
                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                  ? value * sdaiRate
                  : value;
                return displayValue;
              })()}
              eventProbability={(newThirdPrice === null || typeof newThirdPrice === 'undefined') ? null : typeof newThirdPrice === 'number' ? Math.min((Number(newThirdPrice)), 1) : 0}
              currency={selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}
              precision={config?.precisions?.main || 4}
              showSpot={hasSpot}
              chartFilters={chartFilters}
              onFilterClick={handleChartFilterClick}
              predictionMarketLink={config?.BASE_TOKENS_CONFIG?.currency?.address && config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
                ? (config?.chainId === 1
                  ? `https://app.uniswap.org/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`
                  : `https://v3.swapr.eth.limo/#/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`)
                : null}
              config={config}
              resolutionDetails={(() => {
                if (config?.marketInfo?.resolved && config?.marketInfo?.finalOutcome) {
                  return {
                    label: 'OUTCOME',
                    value: config.marketInfo.finalOutcome.toUpperCase(),
                    link: config.marketInfo.trackProgressLink
                  };
                }
                return null;
              })()}
            />
          </div>

          {/* Chart Area */}
          <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 flex-grow overflow-hidden">
            <div className="w-full h-full flex flex-col">
              <TripleChart
                propYesData={latestPrices.yesData}
                propNoData={latestPrices.noData}
                propBaseData={latestPrices.baseData}
                propEventProbabilityData={thirdCandles}
                shouldFetchData={false}
                // Pass down currency selection and rate info
                selectedCurrency={selectedCurrency}
                sdaiRate={sdaiRate}
                isLoadingRate={isLoadingRate}
                rateError={rateError}
                // Pass dynamic config for pool addresses
                config={config}
                // Pass spot price for inversion logic
                spotPrice={newBasePrice !== null ? newBasePrice : latestPrices.spotPriceSDAI}
                // Pass chart filters
                chartFilters={{ ...chartFilters, spot: hasSpot && chartFilters.spot }}
                // Pass market status for smart data fetching
                marketHasClosed={marketHasClosed}
              />
            </div>
          </div>
        </div>
      )}

      {/* SubgraphChart - Only renders when useSubgraph=true or useSubgraph=only */}
      {showSubgraphChart && (
        <div className={showTripleChart ? "mt-6" : ""}>
          <SubgraphChart
            proposalId={config?.proposalId || config?.MARKET_ADDRESS}
            chainId={config?.chainId || 100}
            height={448}
            candleLimit={1000}
            config={config}
            // External spot price from CoinGecko (via ?useSpotPrice=... or config.marketInfo.coingecko_ticker)
            // Hidden when the spot fetch or its rate read failed
            showSpot={!!effectiveSpotPriceParam && !configSpotError}
            spotData={stableSpotData}
            spotPrice={finalSpotPrice}
            onSpotRefresh={refetchConfigSpot}
          />
        </div>
      )}
    </>
  );
};

export { MarketChartSection };
