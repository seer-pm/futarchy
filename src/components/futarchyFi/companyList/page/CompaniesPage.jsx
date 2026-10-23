import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount } from 'wagmi';
import RootLayout from "../../../layout/RootLayout";

import { OrganizationsTable } from "../table";
import { useAggregatorCompanies } from "../../../../hooks/useAggregatorCompanies";
import { DEFAULT_AGGREGATOR } from "../../../../config/subgraphEndpoints";
import { fetchEventHighlightData } from "./EventsHighlightDataTransformer";
import { fetchResolvedEventHighlightData } from "./ResolvedEventsDataTransformer";
import ForkTile, { ForkTileSkeleton } from "../forkWall/ForkTile";
import Button from "../../../ui/Button";
import DynamicShareCard from "../../../dynamicImageFolder/DynamicShareCard";
import CreateProposalModal from "../../../debug/CreateProposalModal";
import OrganizationManagerModal from "../../../debug/OrganizationManagerModal";
import EditProposalModal from "../../../debug/EditProposalModal";
import { CONTRACT_ADDRESSES } from "../../marketPage/constants/contracts";
import { ENABLE_V2_SUBGRAPH, DEBUG_MODE } from "../../../../config/featureFlags";

// Configuration flags
// Recently Closed works with V2 subgraph via fetchProposalsFromAggregator
const HIDE_RECENTLY_CLOSED = false;

/** Loads one of the home page's proposal lists, with a retry for a registry that did not answer. */
const useProposalList = (load, deps) => {
  const [state, setState] = useState({ items: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ items: null, error: null });
    load()
      .then((items) => !cancelled && setState({ items: items || [], error: null }))
      .catch((error) => !cancelled && setState({ items: null, error }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
};

const WallHeading = ({ id, title, count }) => (
  <h2 id={id} className="mb-5 flex items-baseline gap-2 text-lg font-semibold tracking-tight">
    {title}
    {typeof count === 'number' && <span className="text-sm font-semibold text-seer-muted tabular-nums">{count}</span>}
  </h2>
);

const WallGrid = ({ list, variant, className, skeletons, empty, onEditProposal }) => {
  if (list.error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-surface border border-seer-border bg-seer-surface p-5">
        <p className="text-sm text-seer-text">
          <span className="font-semibold">Couldn&apos;t load proposals.</span>{' '}
          <span className="text-seer-muted">The registry did not respond.</span>
        </p>
        <Button variant="outline" size="sm" onClick={list.retry}>Retry</Button>
      </div>
    );
  }
  if (!list.items) {
    return (
      <div className={`grid gap-5 ${className}`}>
        {Array.from({ length: skeletons }, (_, i) => <ForkTileSkeleton key={i} variant={variant} />)}
      </div>
    );
  }
  if (list.items.length === 0) {
    return <p className="rounded-surface border border-dashed border-seer-border p-5 text-sm text-seer-muted">{empty}</p>;
  }
  // A single open proposal takes the whole row, so the wall never opens on half a row of nothing.
  const solo = variant === 'open' && list.items.length === 1;
  return (
    <div className={`grid gap-5 ${solo ? 'grid-cols-1' : className}`}>
      {list.items.map((event) => (
        <ForkTile key={event.eventId} event={event} variant={variant} wide={solo} onEditProposal={onEditProposal} />
      ))}
    </div>
  );
};

const CompaniesPage = ({ useStorybookUrl = false }) => {
  const { address: connectedWallet } = useAccount();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCreateProposalOpen, setIsCreateProposalOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [aggregatorAddress, setAggregatorAddress] = useState(null);
  // Edit Proposal Modal state (Registry is always on Gnosis, no chainId needed)
  const [editProposalModal, setEditProposalModal] = useState({ isOpen: false, proposalMetadataAddress: null });

  // Fetch organizations for table view
  const effectiveAggregator = ENABLE_V2_SUBGRAPH ? DEFAULT_AGGREGATOR : aggregatorAddress;
  const {
    companies: organizations,
    loading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useAggregatorCompanies(effectiveAggregator);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setDebugMode(DEBUG_MODE && urlParams.get('debugMode') === 'true');

      // Check for useAggregator param to load companies from subgraph
      const aggregator = urlParams.get('useAggregator');
      if (aggregator) {
        setAggregatorAddress(aggregator);
      }
    }
  }, []);


  const openList = useProposalList(
    () => fetchEventHighlightData("all", { aggregatorAddress, connectedWallet }),
    [aggregatorAddress, connectedWallet]
  );
  const decidedList = useProposalList(
    () => fetchResolvedEventHighlightData("all", 8, { aggregatorAddress, connectedWallet }),
    [aggregatorAddress, connectedWallet]
  );
  const editProposal = (proposalMetadataAddress) => setEditProposalModal({ isOpen: true, proposalMetadataAddress });

  // The home page is a wall of forks: every proposal drawn as its two prices since the market
  // opened, open ones first and larger, decided ones after, then the organizations that ask.
  return (
    <RootLayout>
      <div className="bg-seer-page text-seer-text">
        <div className="container mx-auto px-5 pt-28 pb-20">
          <header className="max-w-3xl">
            <h1 className="text-[30px] md:text-[40px] leading-[1.1] font-semibold tracking-tight [text-wrap:balance]">
              Proposals, priced before they are decided
            </h1>
            <p className="mt-4 text-[17px] leading-relaxed text-seer-muted max-w-[62ch]">
              Each proposal opens two markets on its DAO&apos;s token: its price{' '}
              <span className="font-semibold text-pass-text">if the proposal passes</span> and{' '}
              <span className="font-semibold text-fail-text">if it fails</span>. The gap between the two is the
              market&apos;s estimate of the proposal&apos;s impact.
            </p>
          </header>

          <section aria-labelledby="home-open" className="mt-12">
            <WallHeading id="home-open" title="Open now" count={openList.items?.length} />
            <WallGrid
              list={openList}
              variant="open"
              className="grid-cols-1 lg:grid-cols-2"
              skeletons={2}
              empty="No proposal is open right now. The decided ones are below."
              onEditProposal={editProposal}
            />
          </section>

          {!HIDE_RECENTLY_CLOSED && (
            <section aria-labelledby="home-decided" className="mt-14">
              <WallHeading id="home-decided" title="Recently decided" />
              <WallGrid
                list={decidedList}
                variant="decided"
                className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
                skeletons={4}
                empty="No proposal has closed yet."
                onEditProposal={editProposal}
              />
            </section>
          )}

          <section aria-labelledby="home-orgs" className="mt-14">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 id="home-orgs" className="text-lg font-semibold tracking-tight">Who is asking</h2>
              <Button as={Link} href="/markets/new" variant="ghost" size="sm">
                Create market
              </Button>
            </div>
            <OrganizationsTable
              organizations={organizations}
              connectedWallet={connectedWallet}
              loading={orgsLoading}
              error={orgsError}
              onRetry={refetchOrgs}
              onOrgClick={(org) => {
                // Navigate to milestones page
                const url = `/milestones?company_id=${org.companyID}`;
                window.location.href = url;
              }}
            />
          </section>
        </div>
      </div>

      {debugMode && (
        <>
          {/* Debug Mode: Share Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="fixed left-4 bottom-4 z-50 bg-futarchyBlue9 hover:bg-futarchyBlue10 text-white font-bold py-3 px-4 rounded-full shadow-lg transition-colors duration-200"
          >
            <span className="text-xl">📤</span>
          </button>

          {/* Debug Mode: Create Proposal Button */}
          <button
            onClick={() => setIsCreateProposalOpen(true)}
            className="fixed right-4 bottom-4 z-50 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold py-3 px-5 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2"
          >
            <span className="text-xl">🏛️</span>
            <span>Create Proposal</span>
          </button>

          <DynamicShareCard
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
          />

          <CreateProposalModal
            isOpen={isCreateProposalOpen}
            onClose={() => setIsCreateProposalOpen(false)}
          />

          {/* Debug Mode: Create Organization Button */}
          <button
            onClick={() => setIsOrgModalOpen(true)}
            className="fixed right-4 bottom-20 z-50 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white font-bold py-3 px-5 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2"
          >
            <span>Manage Aggregator</span>
          </button>

          <OrganizationManagerModal
            isOpen={isOrgModalOpen}
            onClose={() => setIsOrgModalOpen(false)}
            mode="aggregator"
            entityId={aggregatorAddress || CONTRACT_ADDRESSES.DEFAULT_AGGREGATOR}
          />
        </>
      )}

      {/* Edit Proposal Modal - Registry contracts are always on Gnosis */}
      <EditProposalModal
        isOpen={editProposalModal.isOpen}
        onClose={() => setEditProposalModal({ isOpen: false, proposalMetadataAddress: null })}
        proposalMetadataAddress={editProposalModal.proposalMetadataAddress}
      />
    </RootLayout>
  );
};

export default CompaniesPage;
