import { SHOW_DATA_DEBUG } from '../../../../config/featureFlags';
import MarketStatsDebugToast from '../MarketStatsDebugToast';

const MarketDebugPanels = ({ isDebugMode, marketAddress, snapshot, prices, positions, config }) => {
  const {
    loading: snapshotLoading,
    data: snapshotData,
    error: snapshotError,
    source: snapshotSource,
    snapshotProposalId
  } = snapshot;
  const { newYesPrice, newNoPrice, newThirdPrice, newBasePrice, livePriceError } = prices;

  return (
    <>
      {/* Snapshot Debug Console - Shows when debug mode is active */}
      {SHOW_DATA_DEBUG && isDebugMode && (
        <div className="fixed top-4 right-4 z-50 bg-black/90 text-white p-4 rounded-lg max-w-md text-xs font-mono">
          <div className="font-bold mb-2 text-futarchyViolet9">📊 Snapshot Widget Debug</div>
          <div className="space-y-1">
            <div><span className="text-futarchyGray112">Market Address:</span> {marketAddress || 'N/A'}</div>
            <div><span className="text-futarchyGray112">Loading:</span> {snapshotLoading ? '⏳ Yes' : '✅ No'}</div>
            <div><span className="text-futarchyGray112">Error:</span> {snapshotError || 'None'}</div>
            <div><span className="text-futarchyGray112">Source:</span> {snapshotSource || 'N/A'}</div>
            <div><span className="text-futarchyGray112">Snapshot Proposal ID:</span> {snapshotProposalId || '❌ Not Found'}</div>
            <div><span className="text-futarchyGray112">Has Data:</span> {snapshotData ? '✅ Yes' : '❌ No'}</div>
            {snapshotData && (
              <>
                <div><span className="text-futarchyGray112">Items:</span> {snapshotData.items?.length || 0}</div>
                <div><span className="text-futarchyGray112">Total Votes:</span> {snapshotData.totalCount || 0}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Market Analytics Toast - Hidden on Mobile and when debug mode is false */}
      {SHOW_DATA_DEBUG && isDebugMode && (
        <div className="hidden md:block">
          <MarketStatsDebugToast
            prices={{ yesPrice: newYesPrice, noPrice: newNoPrice, isLoading: false, error: livePriceError }}
            positions={positions}
            newYesPrice={newYesPrice}
            newNoPrice={newNoPrice}
            newThirdPrice={newThirdPrice}
            newBasePrice={newBasePrice}
            contractConfig={config}
          />
        </div>
      )}

      {/* Commenting out the debug display for new Algebra prices as they are now integrated into the main display */}
      {/* <div style={{marginTop: 16, marginBottom: 16, padding: 12, background: '#23272c', borderRadius: 8}}>
        <div style={{color: '#fff', fontWeight: 'bold'}}>New Yes Price (Algebra): {newYesPrice !== null ? newYesPrice : 'Loading...'}</div>
        <div style={{color: '#fff', fontWeight: 'bold'}}>New No Price (Algebra): {newNoPrice !== null ? newNoPrice : 'Loading...'}</div>
        <div style={{color: '#fff', fontWeight: 'bold'}}>New Third Price (Algebra): {newThirdPrice !== null ? newThirdPrice : 'Loading...'}</div>
        <div style={{color: '#aaa', fontSize: 12}}>These are from the Algebra pool. Old prices are still shown for comparison.</div>
      </div> */}
    </>
  );
};

export { MarketDebugPanels };
