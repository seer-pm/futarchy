import React, { useState } from 'react';
import './ActivityPanel.css';
import OpenOrdersTable from './tables/OpenOrdersTable';
import OpenPositionsTable from './tables/OpenPositionsTable';
import RecentTradesTable from './tables/RecentTradesTable';
import { HourglassIcon, CheckCircleIcon, XCircleIcon } from './icons/StatusIcons';

const TABS = [
  { id: 'positions', label: 'Positions' },
  { id: 'open-orders', label: 'Open Orders' },
  { id: 'recent-trades', label: 'Recent Trades' }
];

const ActivityPanel = React.forwardRef(({ 
  initialPositions = [], 
  initialOrders = [], 
  initialTrades = [] 
}, ref) => {
  const [activeTab, setActiveTab] = useState('positions');
  const [selectedRow, setSelectedRow] = useState(null);
  const [positions, setPositions] = useState(initialPositions);
  const [orders, setOrders] = useState(initialOrders);
  const [trades, setTrades] = useState(initialTrades);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [pendingPositions, setPendingPositions] = useState([]);
  const [failedItems, setFailedItems] = useState({ positions: [], orders: [], trades: [] });

  const handleActionClick = (action, rowData) => {
    console.log(`${action} clicked for row:`, rowData);
  };

  const simulateProcessing = async (item, type) => {
    const success = Math.random() > 0.2; // 80% success rate
    const delay = 1000 + Math.random() * 2000; // Random delay between 1-3 seconds
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return success;
  };

  const handleRetry = async (type, item) => {
    switch (type) {
      case 'position':
        setFailedItems(prev => ({
          ...prev,
          positions: prev.positions.filter(p => p.id !== item.id)
        }));
        await ref.current?.addPosition(item);
        break;
      case 'order':
        setFailedItems(prev => ({
          ...prev,
          orders: prev.orders.filter(o => o.id !== item.id)
        }));
        await ref.current?.addOrder(item);
        break;
    }
  };

  React.useImperativeHandle(ref, () => ({
    addPosition: async (newPosition) => {
      const pendingPosition = { ...newPosition, status: 'pending' };
      setPendingPositions(prev => [...prev, pendingPosition]);
      
      const success = await simulateProcessing(newPosition, 'position');
      setPendingPositions(prev => prev.filter(p => p.id !== newPosition.id));
      
      if (success) {
        setPositions(prev => [...prev, { ...newPosition, status: 'confirmed' }]);
      } else {
        setFailedItems(prev => ({
          ...prev,
          positions: [...prev.positions, { ...newPosition, status: 'failed' }]
        }));
      }
    },
    addOrder: async (newOrder) => {
      const pendingOrder = { ...newOrder, status: 'pending' };
      setPendingOrders(prev => [...prev, pendingOrder]);
      
      const success = await simulateProcessing(newOrder, 'order');
      setPendingOrders(prev => prev.filter(o => o.id !== newOrder.id));
      
      if (success) {
        setOrders(prev => [...prev, { ...newOrder, status: 'confirmed' }]);
      } else {
        setFailedItems(prev => ({
          ...prev,
          orders: [...prev.orders, { ...newOrder, status: 'failed' }]
        }));
      }
    },
    addTrade: async (newTrade) => {
      const pendingTrade = { ...newTrade, status: 'pending' };
      setPendingTrades(prev => [...prev, pendingTrade]);
      
      const success = await simulateProcessing(newTrade, 'trade');
      setPendingTrades(prev => prev.filter(t => t.id !== newTrade.id));
      
      if (success) {
        setTrades(prev => [...prev, { ...newTrade, status: 'confirmed' }]);
      }
    }
  }));

  const renderStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return (
          <HourglassIcon 
            className="w-4 h-4 text-futarchyPurple status-icon-processing" 
          />
        );
      case 'confirmed':
        return <CheckCircleIcon className="w-4 h-4 text-futarchyGreenYes" />;
      case 'failed':
        return <XCircleIcon className="w-4 h-4 text-futarchyRedNo" />;
      default:
        return null;
    }
  };

  const renderTable = () => {
    const commonProps = {
      selectedRow,
      setSelectedRow,
      onActionClick: handleActionClick,
      renderStatusIcon,
      onRetry: handleRetry
    };

    switch (activeTab) {
      case 'positions':
        return <OpenPositionsTable {...commonProps} data={[...pendingPositions, ...positions, ...failedItems.positions]} />;
      case 'open-orders':
        return <OpenOrdersTable {...commonProps} data={[...pendingOrders, ...orders, ...failedItems.orders]} />;
      case 'recent-trades':
        return <RecentTradesTable {...commonProps} data={trades} />;
      default:
        return null;
    }
  };

  return (
    <div className="activity-panel bg-white rounded-lg shadow-lg">
      {/* Tabs Header - Made scrollable on mobile */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 sm:px-6 py-2 sm:py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap
                ${activeTab === tab.id 
                  ? 'text-white bg-black' 
                  : 'text-black hover:bg-gray-100'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons - Stack on mobile */}
      {selectedRow && (
        <div className="flex flex-col sm:flex-row gap-2 p-2 bg-gray-50">
          <button 
            onClick={() => handleActionClick('limit', selectedRow)}
            className="w-full sm:w-auto px-4 py-1 text-sm rounded-md bg-futarchyGreenYes text-white hover:bg-futarchyGreenYes/80"
          >
            Limit
          </button>
          <button 
            onClick={() => handleActionClick('market', selectedRow)}
            className="w-full sm:w-auto px-4 py-1 text-sm rounded-md bg-futarchyRedNo text-white hover:bg-futarchyRedNo/80"
          >
            Market
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="p-2 sm:p-4">
        {renderTable()}
      </div>
    </div>
  );
});

ActivityPanel.displayName = 'ActivityPanel';

export default ActivityPanel; 