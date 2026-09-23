import React from 'react';
import ConditionalMarketInfoPanel from './ConditionalMarketInfoPanel';
import BuySellPanel from './BuySellPanel';
import ActivityPanel from './activityPanel/ActivityPanel';
import Image from 'next/image';
import './MarketPage.css';
import RulesModal from './RulesModal';
import AddLiquidityModal from './AddLiquidityModal';
import MarketCharts from './MarketCharts';
import ProbabilityChart from './ProbabilityChart';
import PredictionMarketPanel from './PredictionMarketPanel';
import SpotMarketPanel from './SpotMarketPanel';
import SpotMarketChart from './SpotMarketChart';
import MergeStep from './steps/MergeStep';
import { useContractConfig } from '@/hooks/useContractConfig';

const MarketPage = ({ selectedMarket, availableToTrade, priceBand }) => {
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = React.useState(false);
  const { config } = useContractConfig(selectedMarket?.id); // Fetch config using market ID

  const [activeTab, setActiveTab] = React.useState('futures');
  const activityPanelRef = React.useRef(null);
  const [balances, setBalances] = React.useState({});
  const [direction, setDirection] = React.useState('USDC');

  return (
    <div className="min-h-screen">
      {/* Hero Section - Black with Futarchy branding */}
      <div className="relative bg-black pt-20">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 background-gradient opacity-20" />

        {/* Giant watermark logo */}
        <div className="absolute inset-0 flex items-center justify-start pointer-events-none">
          <Image
            src="/assets/seer-logo.svg"
            alt="Futarchy Watermark"
            width={600}
            height={600}
            className="opacity-[0.1] ml-16 watermark-blur"
            priority
          />
        </div>

        {/* Market Overview Content */}
        <div className="container mx-auto px-6 py-24">
          <div className="flex items-start gap-16">
            {/* Left side - Market Info */}
            <div className="w-1/3">
              <div className="flex flex-col items-center text-center">
                <Image
                  src="/assets/market-logo.svg"
                  alt="Market Logo"
                  width={120}
                  height={120}
                  className="mb-6 rounded-full"
                  priority
                />
                <h2 className="text-2xl font-oxanium text-white mb-4">
                  Market Overview
                </h2>
                <div className="flex items-center gap-2 mb-6">
                  <div className="h-2 w-2 bg-futarchyGreen rounded-full animate-pulse" />
                  <span className="text-white/80">Active</span>
                </div>

                {/* Add Liquidity Button */}
                <button
                  onClick={() => setIsAddLiquidityModalOpen(true)}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all duration-200 backdrop-blur-sm border border-white/10 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Liquidity
                </button>
              </div>
            </div>

            {/* Right side - Market Stats */}
            <div className="flex-1">
              <h1 className="text-6xl font-oxanium mb-6 text-white">
                {activeTab === 'futures'
                  ? 'Approve Budget for Pre-Governance Hackathon Development'
                  : 'Will ETH reach $5000 by EOY 2024?'
                }
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* White Content Section with Tabs */}
      <div className="bg-white relative py-12">
        {/* Dotted Grid Background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle, #E5E5E5 1px, transparent 1px),
              radial-gradient(circle, #E5E5E5 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px',
            opacity: 0.5
          }}
        />

        {/* Content container */}
        <div className="container mx-auto px-6 relative z-10">
          {/* Market Type Tabs */}
          <div className="mb-8">
            <div className="flex gap-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('futures')}
                className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === 'futures'
                    ? 'text-black border-black'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
              >
                Futures
              </button>
              <button
                onClick={() => setActiveTab('prediction')}
                className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === 'prediction'
                    ? 'text-black border-black'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
              >
                Prediction Market
              </button>
              <button
                onClick={() => setActiveTab('spot')}
                className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === 'spot'
                    ? 'text-black border-black'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
              >
                Spot Market
              </button>
            </div>
          </div>

          {activeTab === 'spot' ? (
            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2">
                {/* Chart Area */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-8">
                  <SpotMarketChart marketSeed={selectedMarket?.id || 12345} />
                </div>

                {/* Activity Panel */}
                <ActivityPanel
                  ref={activityPanelRef}
                  initialPositions={[]}
                  initialOrders={[]}
                  initialTrades={[]}
                />

                {/* Claim Panel */}
                <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
                  <h3 className="text-lg font-semibold mb-4">Claim USDC</h3>
                  <MergeStep
                    direction={direction}
                    balances={balances}
                    setBalances={setBalances}
                  />
                </div>
              </div>

              {/* Trading Panel */}
              <div>
                <SpotMarketPanel
                  selectedMarket={selectedMarket}
                  availableToTrade={availableToTrade}
                />
              </div>
            </div>
          ) : activeTab === 'prediction' ? (
            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2">
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-8">
                  <MarketCharts marketSeed={selectedMarket?.id || 12345} />
                </div>
                <ActivityPanel
                  ref={activityPanelRef}
                  initialPositions={[]}
                  initialOrders={[]}
                  initialTrades={[]}
                />
              </div>
              <div>
                <PredictionMarketPanel
                  marketPrice={105000}
                  outcomes={{
                    yes: selectedMarket.approval.marketValue,
                    no: selectedMarket.refusal.marketValue
                  }}
                />
              </div>
            </div>
          ) : (
            // Futures tab content
            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2">
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-8">
                  <MarketCharts marketSeed={selectedMarket?.id || 12345} />
                </div>
                <ActivityPanel
                  ref={activityPanelRef}
                  initialPositions={[]}
                  initialOrders={[]}
                  initialTrades={[]}
                />
              </div>
              <div>
                <BuySellPanel
                  selectedMarket={selectedMarket}
                  availableToTrade={availableToTrade}
                  priceBand={priceBand}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <RulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />

      <AddLiquidityModal
        isOpen={isAddLiquidityModalOpen}
        onClose={() => setIsAddLiquidityModalOpen(false)}
        config={config}
      />
    </div>
  );
};

export default MarketPage;