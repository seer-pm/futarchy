import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { MOCK_MARKETS } from '../../lib/newDesignMockData';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Head from 'next/head';

export default function NewDesignPage() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // The Supabase market_events backend is permanently gone; this design
    // prototype renders from local mock data only.
    setMarkets(MOCK_MARKETS);
    setLoading(false);
  }, []);

  const filteredMarkets = markets.filter(m => {
      if (filter === 'all') return true;
      // Add logic for other filters if needed
      return true;
  });

  return (
    <>
      <Head>
        <title>Futarchy - New Design</title>
        <meta name="description" content="Predict the future with Futarchy" />
      </Head>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-primary selection:text-black">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
          <div className="container mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-full animate-pulse-slow" />
              <span className="text-2xl font-bold tracking-tighter">FUTARCHY<span className="text-primary">.FI</span></span>
            </div>
            
            <nav className="hidden md:flex items-center gap-8">
              <Link href="#" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Markets</Link>
              <Link href="#" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Portfolio</Link>
              <Link href="#" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Governance</Link>
            </nav>

            <div className="flex items-center gap-4">
               <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                  authenticationStatus,
                  mounted,
                }) => {
                  const ready = mounted && authenticationStatus !== 'loading';
                  const connected =
                    ready &&
                    account &&
                    chain &&
                    (!authenticationStatus ||
                      authenticationStatus === 'authenticated');

                  return (
                    <div
                      {...(!ready && {
                        'aria-hidden': true,
                        'style': {
                          opacity: 0,
                          pointerEvents: 'none',
                          userSelect: 'none',
                        },
                      })}
                    >
                      {(() => {
                        if (!connected) {
                          return (
                            <button onClick={openConnectModal} type="button" className="px-6 py-2.5 bg-white text-black font-bold rounded-full hover:bg-primary transition-all duration-300 transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                              Connect Wallet
                            </button>
                          );
                        }
                        if (chain.unsupported) {
                          return (
                            <button onClick={openChainModal} type="button" className="px-6 py-2.5 bg-red-500 text-white font-bold rounded-full hover:bg-red-600 transition-all">
                              Wrong network
                            </button>
                          );
                        }
                        return (
                          <div style={{ display: 'flex', gap: 12 }}>
                            <button
                              onClick={openChainModal}
                              style={{ display: 'flex', alignItems: 'center' }}
                              type="button"
                              className="px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-all border border-white/10"
                            >
                              {chain.hasIcon && (
                                <div
                                  style={{
                                    background: chain.iconBackground,
                                    width: 12,
                                    height: 12,
                                    borderRadius: 999,
                                    overflow: 'hidden',
                                    marginRight: 4,
                                  }}
                                >
                                  {chain.iconUrl && (
                                    <img
                                      alt={chain.name ?? 'Chain icon'}
                                      src={chain.iconUrl}
                                      style={{ width: 12, height: 12 }}
                                    />
                                  )}
                                </div>
                              )}
                              {chain.name}
                            </button>
                            <button onClick={openAccountModal} type="button" className="px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-all border border-white/10 font-mono">
                              {account.displayName}
                              {account.displayBalance
                                ? ` (${account.displayBalance})`
                                : ''}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-40 pb-20 px-6 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="container mx-auto text-center relative z-10">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-6xl md:text-8xl font-bold mb-6 tracking-tight"
            >
              Predict the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-white">Future</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-white/60 max-w-2xl mx-auto mb-10"
            >
              Trade on the outcome of governance proposals and real-world events. 
              Your knowledge has value.
            </motion.p>
          </div>
        </section>

        {/* Markets Grid */}
        <section className="py-20 px-6 bg-black">
          <div className="container mx-auto">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-3xl font-bold">Active Markets</h2>
              <div className="flex gap-2">
                  {['all', 'governance', 'financial'].map((f) => (
                      <button 
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === f ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                      >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                  ))}
              </div>
            </div>

            {loading ? (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="h-[400px] bg-white/5 rounded-3xl animate-pulse" />
                  ))}
               </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredMarkets.map((market, idx) => (
                      <MarketCard key={market.id || idx} market={market} index={idx} />
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function MarketCard({ market, index }) {
    // Extract data safely
    const title = market.title || market.question || "Untitled Market";
    const probability = market.eventProbability || 0.5;
    const volume = market.metadata?.pools?.[0]?.volume24h || 0;
    const endDate = market.end_date ? new Date(market.end_date).toLocaleDateString() : "Unknown";
    const tags = market.tags || [];

    return (
        <Link href={`/new-design/${market.id}`}>
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group relative bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(69,255,197,0.1)] cursor-pointer flex flex-col h-full"
            >
                <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2">
                        {tags.slice(0, 2).map((tag, i) => (
                            <span key={i} className="px-2 py-1 bg-white/5 rounded-lg text-xs font-medium text-white/60 uppercase tracking-wider">
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div className={`w-2 h-2 rounded-full ${market.event_status === 'open' ? 'bg-primary shadow-[0_0_10px_#45FFC5]' : 'bg-red-500'}`} />
                </div>

                <h3 className="text-xl font-medium leading-snug mb-4 line-clamp-3 flex-grow group-hover:text-primary transition-colors">
                    {title}
                </h3>

                <div className="space-y-4 mt-auto">
                    {/* Probability Bar */}
                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-white/60">Probability</span>
                            <span className="text-primary font-bold">{(probability * 100).toFixed(0)}% YES</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-primary to-blue-500" 
                                style={{ width: `${probability * 100}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                        <div>
                            <p className="text-xs text-white/40 mb-1">Volume (24h)</p>
                            <p className="text-lg font-mono">${volume.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-white/40 mb-1">End Date</p>
                            <p className="text-sm font-medium">{endDate}</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}
