import RedeemTokens from '../redeemTokens/RedeemTokens';
import PositionsTable from '../PositionsTable';
import SubgraphTradesDataLayer from '../SubgraphTradesDataLayer';
import { TradeHistoryTable } from './TradeHistoryTable';
import { Surface } from '../../../ui/Surface';

const tabClassName = (selected) =>
  `-mb-px h-11 px-1 text-sm font-semibold border-b-2 transition-colors duration-150 ${selected
    ? 'text-seer-text border-seer-purple'
    : 'text-seer-muted border-transparent hover:text-seer-text'
  }`;

const TradesLimitSelect = ({ tradesLimit, setTradesLimit }) => (
  <select
    value={tradesLimit}
    onChange={(e) => setTradesLimit(Number(e.target.value))}
    aria-label="Trades to show"
    className="seer-input !min-h-0 !w-auto h-8 !py-0 !pl-3 text-[13px]"
  >
    <option value={30}>Last 30 trades</option>
    <option value={60}>Last 60 trades</option>
    <option value={90}>Last 90 trades</option>
  </select>
);

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

  // Before close the market's activity and the reader's own trades and position; after close,
  // redemption replaces them.
  const tabList = marketHasClosed
    ? [{ id: 'redeem-tokens', label: 'Redeem Tokens' }]
    : [
      { id: 'recent-trades-sdk', label: 'Recent Activity' },
      { id: 'my-trades-sdk', label: 'My Trades' },
      { id: 'position', label: 'Position' },
    ];
  const showsTrades = activeTab === 'recent-trades-sdk' || activeTab === 'my-trades-sdk';

  return (
    <div className="mt-10">
      <div className="flex flex-wrap-reverse items-end justify-between gap-x-4 gap-y-2 border-b border-seer-border">
        <div role="tablist" aria-label="Market activity" className="flex gap-6 overflow-x-auto no-scrollbar">
          {tabList.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={tabClassName(activeTab === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {showsTrades && (
          <div className="pb-1.5">
            <TradesLimitSelect tradesLimit={tradesLimit} setTradesLimit={setTradesLimit} />
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div role="tabpanel" className="mt-4">
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
          <Surface as="div" className="overflow-hidden">
            <TradeHistoryTable tokenImages={tokenImages} config={config} />
          </Surface>
        )}
        {activeTab === 'recent-trades-sdk' && (
          <Surface as="div" className="overflow-hidden">
            <SubgraphTradesDataLayer
              tokenImages={tokenImages}
              config={config}
              showMyTrades={false}
              limit={tradesLimit}
            />
          </Surface>
        )}
        {activeTab === 'my-trades-sdk' && (
          <Surface as="div" className="overflow-hidden">
            <SubgraphTradesDataLayer
              tokenImages={tokenImages}
              config={config}
              showMyTrades={true}
              limit={tradesLimit}
            />
          </Surface>
        )}
        {activeTab === 'redeem-tokens' && (
          <RedeemTokens config={config} positions={positions} isLoadingPositions={isLoadingPositions} onBalancesChanged={refetchBalances} balanceError={balanceError} onRetryBalances={refetchBalances} />
        )}
      </div>
    </div>
  );
};

export { MarketTabsSection };
