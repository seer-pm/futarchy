import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { MOCK_MARKETS } from '../../lib/newDesignMockData';
import Link from 'next/link';
import Head from 'next/head';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import NewSwapInterface from '../../components/new-design/NewSwapInterface';

export default function MarketDetailPage() {
  const router = useRouter();
  const { marketId } = router.query;
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!marketId) return;

    // The Supabase market_event backend is permanently gone; this design
    // prototype resolves markets from local mock data only.
    const mockMarket = MOCK_MARKETS.find(m => m.id === marketId || m.proposal_markdown?.includes(marketId));

    if (mockMarket) {
        setMarket(mockMarket);
    } else {
        console.warn("Market not found in mock data.");
    }

    setLoading(false);
  }, [marketId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!market) {
      return <div className="min-h-screen bg-black text-white flex items-center justify-center">Market not found</div>;
  }

  const title = market.title || market.question;
  const probability = market.eventProbability || 0.5;

  return (
    <>
      <Head>
        <title>{title} | Futarchy</title>
      </Head>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-primary selection:text-black pb-20">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
          <div className="container mx-auto px-6 h-20 flex items-center justify-between">
            <Link href="/new-design" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <svg className="w-4 h-4 text-white group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </div>
              <span className="font-medium text-white/60 group-hover:text-white transition-colors">Back to Markets</span>
            </Link>

            <div className="flex items-center gap-4">
               <ConnectButton />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 pt-32">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Left Column: Market Info & Chart */}
                <div className="lg:col-span-7 space-y-8">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            {market.tags?.map((tag, i) => (
                                <span key={i} className="px-3 py-1 bg-white/5 rounded-full text-xs font-medium text-white/60 uppercase tracking-wider border border-white/5">
                                    {tag}
                                </span>
                            ))}
                            <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${market.event_status === 'open' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                {market.event_status}
                            </span>
                        </div>
                        
                        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
                            {title}
                        </h1>

                        <div className="p-6 bg-white/5 rounded-3xl border border-white/10 mb-8">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <p className="text-sm text-white/40 mb-1">Current Probability</p>
                                    <p className="text-4xl font-mono font-bold text-primary">{(probability * 100).toFixed(0)}% <span className="text-lg text-white/40 font-sans font-normal">YES</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-white/40 mb-1">Volume (24h)</p>
                                    <p className="text-2xl font-mono">$12,450</p>
                                </div>
                            </div>
                            
                            {/* Simple Probability Bar */}
                            <div className="h-4 bg-white/10 rounded-full overflow-hidden relative">
                                <div className="absolute inset-0 flex items-center justify-between px-3 z-10 text-[10px] font-bold tracking-wider">
                                    <span className="text-black/50">YES</span>
                                    <span className="text-white/50">NO</span>
                                </div>
                                <div 
                                    className="h-full bg-primary shadow-[0_0_20px_#45FFC5]" 
                                    style={{ width: `${probability * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Placeholder for Chart */}
                        <div className="h-[400px] bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center text-white/20">
                            Chart Component Placeholder
                        </div>
                    </motion.div>
                </div>

                {/* Right Column: Trading Interface */}
                <div className="lg:col-span-5">
                    <div className="sticky top-24">
                        <NewSwapInterface market={market} />
                    </div>
                </div>
            </div>
        </main>
      </div>
    </>
  );
}
