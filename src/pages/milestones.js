"use client";

import { useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import Link from "next/link";
import Proposals from "../components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPage";
import dynamic from 'next/dynamic';

// Import MarketPageShowcase with no SSR
const MarketPageShowcase = dynamic(
  () => import("../components/futarchyFi/marketPage/MarketPageShowcase"),
  {
    ssr: false, loading: () => (
      <div className="flex justify-center items-center min-h-screen bg-white dark:bg-futarchyDarkGray2">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-futarchyLavender"></div>
      </div>
    )
  }
);

export default function MilestonesPage() {
  const router = useRouter();
  const { company_id } = router.query;

  // State to track which component to render
  const [showMarket, setShowMarket] = useState(false);
  // State to track if we're in a loading state
  const [isLoading, setIsLoading] = useState(true);
  // Store the hash to preserve it
  const [hash, setHash] = useState('');
  // Store the effective company ID
  const [effectiveCompanyId, setEffectiveCompanyId] = useState(null);
  // company_id that matches no known organization
  const [unknownCompanyId, setUnknownCompanyId] = useState(null);

  useEffect(() => {
    // Wait for router to be ready
    if (!router.isReady) return;

    // Check URL hash when component mounts on client side
    if (typeof window !== 'undefined') {
      // Get and store the current hash
      const currentHash = window.location.hash;
      setHash(currentHash);

      // If the hash matches specific milestone patterns, show MarketPageShowcase instead.
      // Also extract the proposal address from `#milestone:0x...` / `#market:0x...` and
      // surface it as `?proposalId=0x...`, since useContractConfig only reads the proposal
      // ID from the path or query string — without it the swap quoter falls back to v1
      // defaults and shows "Insufficient liquidity".
      //
      // Shallow router.replace (not history.replaceState) keeps Next's router
      // state in step with the URL.
      const syncProposalIdFromHash = (targetHash, { overwrite }) => {
        const hashAddrMatch = targetHash.match(/0x[a-fA-F0-9]{40}/);
        const urlParams = new URLSearchParams(window.location.search);
        const current = urlParams.get('proposalId');
        if (hashAddrMatch && (overwrite ? current !== hashAddrMatch[0] : !current)) {
          urlParams.set('proposalId', hashAddrMatch[0]);
          Router.replace(
            window.location.pathname + '?' + urlParams.toString() + targetHash,
            undefined,
            { shallow: true, scroll: false }
          );
        }
      };

      if (currentHash.includes('milestone') || currentHash.includes('market')) {
        setShowMarket(true);
        syncProposalIdFromHash(currentHash, { overwrite: false });
      }

      // Map legacy numeric/slug company IDs to the on-chain Organization
      // contract address used by the aggregator subgraph.
      const LEGACY_ID_TO_ORG_ADDRESS = {
        '9': '0x3Fd2e8E71f75eED4b5c507706c413E33e0661bBf',     // Gnosis DAO
        '10': '0xaAB097ead5c2Db1Ca7b1E5034224A2118EDAbe36',    // Kleros DAO
        '11': '0x2F345ce868Cc7840A89472F2503944E4ef8F797c',    // VeloraDAO
        gnosis: '0x3Fd2e8E71f75eED4b5c507706c413E33e0661bBf',
        kleros: '0xaAB097ead5c2Db1Ca7b1E5034224A2118EDAbe36',
        velora: '0x2F345ce868Cc7840A89472F2503944E4ef8F797c',
        aave: '0xb84b41518806b70FeE6dAE06982aBD9526cb59C7',
        cow: '0xe071734B1cE5332Da778fb1FFD79456375d420D9',
      };
      const DEFAULT_COMPANY_ID = LEGACY_ID_TO_ORG_ADDRESS.gnosis;

      let companyIdToUse = company_id;
      setUnknownCompanyId(null);

      if (!companyIdToUse) {
        console.warn('No company_id provided, defaulting to Gnosis');
        companyIdToUse = DEFAULT_COMPANY_ID;
      } else if (
        typeof companyIdToUse === 'string' &&
        companyIdToUse.startsWith('0x') &&
        companyIdToUse.length === 42
      ) {
        // Already an address — pass through
        console.log('[Milestones] Using address-based ID:', companyIdToUse);
      } else {
        const key = String(companyIdToUse).toLowerCase();
        const mapped = LEGACY_ID_TO_ORG_ADDRESS[key];
        if (mapped) {
          console.log(`[Milestones] Mapped legacy ID "${companyIdToUse}" → ${mapped}`);
          companyIdToUse = mapped;
        } else {
          console.warn(`[Milestones] Unknown company_id "${companyIdToUse}"`);
          setUnknownCompanyId(String(companyIdToUse));
          companyIdToUse = null;
        }
      }

      setEffectiveCompanyId(companyIdToUse);

      console.log('Milestones page initialized:', {
        originalCompanyId: company_id,
        effectiveCompanyId: companyIdToUse,
        hash: currentHash,
        showMarket: currentHash.includes('milestone') || currentHash.includes('market')
      });

      // Listen for hash changes
      const handleHashChange = () => {
        const newHash = window.location.hash;
        setHash(newHash);
        const isMilestone = newHash.includes('milestone') || newHash.includes('market');
        setShowMarket(isMilestone);

        if (isMilestone) {
          syncProposalIdFromHash(newHash, { overwrite: true });
        }
      };

      window.addEventListener('hashchange', handleHashChange);

      // Set loading to false after a brief delay
      const loadingTimer = setTimeout(() => {
        setIsLoading(false);
      }, 300);

      // Clean up
      return () => {
        clearTimeout(loadingTimer);
        window.removeEventListener('hashchange', handleHashChange);
      };
    }
  }, [router.isReady, company_id]);

  if (unknownCompanyId !== null && !showMarket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-futarchyDarkGray2 text-gray-800 dark:text-white px-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-3">Organization not found</h1>
          <p className="text-gray-600 dark:text-futarchyGray11 mb-6">
            There is no organization with the id &quot;{unknownCompanyId}&quot;.
          </p>
          <Link href="/companies" className="text-futarchyBlue9 underline">See all organizations</Link>
        </div>
      </div>
    );
  }

  // Show loading state initially or while router is not ready
  if (isLoading || !router.isReady || (effectiveCompanyId === null && !showMarket)) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-white dark:bg-futarchyDarkGray2">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-futarchyLavender"></div>
      </div>
    );
  }

  // For Proposals component, create a custom props object with the dynamic company ID
  const proposalsProps = {
    initialCompanyId: effectiveCompanyId,
    // Add this special flag to tell our component not to modify URL
    preserveHash: true
  };

  // Render different component based on hash
  return showMarket ? <MarketPageShowcase /> : <Proposals {...proposalsProps} />;
} 