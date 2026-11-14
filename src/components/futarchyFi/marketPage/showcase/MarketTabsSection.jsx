import RedeemTokens from '../redeemTokens/RedeemTokens';
import PositionsTable from '../PositionsTable';
import SubgraphTradesDataLayer from '../SubgraphTradesDataLayer';
import { TradeHistoryTable } from './TradeHistoryTable';

const MarketTabsSection = ({
  tabs,
  balances,
  config,
  tokenImages,
  selectedCurrency,
  rate,
  setCurrentTransactionData,
  setIsConfirmModalOpen
}) => {
  const { marketHasClosed, activeTab, setActiveTab, tradesLimit, setTradesLimit } = tabs;
  const { positions, isLoadingPositions, balanceError, refetchBalances } = balances;
  const { sdaiRate, isLoadingRate, rateError } = rate;

  return (
    <div className="mt-8">
      {/* Tab Headers */}
      {/* NEW: Conditionally render the first button */}
      <div className="flex flex-row gap-4">
        {marketHasClosed ? (
          <button
            onClick={() => setActiveTab('redeem-tokens')}
            className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'redeem-tokens'
              ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
              : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
              }`}
          >
            Redeem Tokens
          </button>
        ) : (
          <>
            {/* Recent Activity button - first */}
            <button
              onClick={() => setActiveTab('recent-trades-sdk')}
              className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'recent-trades-sdk'
                ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                }`}
            >
              Recent Activity
            </button>

            {/* My Trades button - second */}
            <button
              onClick={() => setActiveTab('my-trades-sdk')}
              className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'my-trades-sdk'
                ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                }`}
            >
              My Trades
            </button>

            {/* Position button - third */}
            <button
              onClick={() => setActiveTab('position')}
              className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'position'
                ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                }`}
            >
              Position
            </button>
          </>
        )}
      </div>

      {/* Filter controls for Recent Activity - only show dropdown */}
      {activeTab === 'recent-trades-sdk' && (
        <div className="flex items-center justify-end mt-6 mb-4">
          <select
            value={tradesLimit}
            onChange={(e) => setTradesLimit(Number(e.target.value))}
            className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
          >
            <option value={30}>Last 30 trades</option>
            <option value={60}>Last 60 trades</option>
            <option value={90}>Last 90 trades</option>
          </select>
        </div>
      )}

      {/* Filter controls for My Trades tab - only show dropdown */}
      {activeTab === 'my-trades-sdk' && (
        <div className="flex items-center justify-end mt-6 mb-4">
          <select
            value={tradesLimit}
            onChange={(e) => setTradesLimit(Number(e.target.value))}
            className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
          >
            <option value={30}>Last 30 trades</option>
            <option value={60}>Last 60 trades</option>
            <option value={90}>Last 90 trades</option>
          </select>
        </div>
      )}

      {/* Tab Content */}
      <div className={activeTab === 'recent-trades-sdk' || activeTab === 'my-trades-sdk' ? 'mt-2' : 'mt-7'}>
        {activeTab === 'position' && (
          <PositionsTable
            positions={positions}
            selectedCurrency={selectedCurrency}
            sdaiRate={sdaiRate}
            isLoadingRate={isLoadingRate}
            rateError={rateError}
            setCurrentTransactionData={setCurrentTransactionData}
            setIsConfirmModalOpen={setIsConfirmModalOpen}
            config={config}
            isLoadingPositions={isLoadingPositions}
            balanceError={balanceError}
            refetchBalances={refetchBalances}
          />
        )}
        {activeTab === 'trade-history' && (
          <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
            <TradeHistoryTable tokenImages={tokenImages} config={config} />
          </div>
        )}
        {activeTab === 'recent-trades-sdk' && (
          <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
            <SubgraphTradesDataLayer
              tokenImages={tokenImages}
              config={config}
              showMyTrades={false}
              limit={tradesLimit}
            />
          </div>
        )}
        {activeTab === 'my-trades-sdk' && (
          <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
            <SubgraphTradesDataLayer
              tokenImages={tokenImages}
              config={config}
              showMyTrades={true}
              limit={tradesLimit}
            />
          </div>
        )}
        {activeTab === 'redeem-tokens' && (
          <RedeemTokens config={config} positions={positions} isLoadingPositions={isLoadingPositions} onBalancesChanged={refetchBalances} balanceError={balanceError} onRetryBalances={refetchBalances} />
        )}
      </div>
    </div>
  );
};

export { MarketTabsSection };
