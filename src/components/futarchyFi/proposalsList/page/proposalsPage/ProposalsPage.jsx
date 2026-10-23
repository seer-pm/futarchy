import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ProposalsCard, MobileProposalsCard } from "../../cards/ProposalsCard";
import Image from "next/image";
import RootLayout from "../../../../layout/RootLayout";
import {
  DropdownListIcon,
  DropdownCheckIcon,
  DropdownCancelIcon,
  DropdownOngoingIcon,
} from "../../cards/Resources";
import CustomDropdown from "../../components/CustomDropdown";
import SearchBox from "../../components/SearchBox";
import ProposalsListCarousel from "../../components/ProposalsListCarousel";
import PageHeader from "../../../../layout/PageHeader";
import PageLayout from "../../../../layout/PageLayout";
import Badge from "../../../../ui/Badge";
import Button from "../../../../ui/Button";
import ChainBadge from "../../../companyList/components/ChainBadge";
import { useOrganization } from "../../../../../hooks/useOrganization";
import { useChainId } from "wagmi";
import OrganizationManagerModal from "../../../../debug/OrganizationManagerModal";
import { SHOW_DATA_DEBUG } from "../../../../../config/featureFlags";
import { fetchOnChainResolutions, resolutionKey } from "../../../../../utils/onChainResolution";
import {
  describeMarketStatus,
  needsOnChainResolution,
  resolveMarketStatus,
} from "../../../../../utils/proposalLifecycle";

const PROPOSAL_IMAGES = {
  "ethereum-budget": "/assets/ethereum-budget-picture.webp",
  "gnosis-pay": "/assets/gnosis-pay.png",
  "protocol-upgrade": "/assets/protocol-update-picture.webp",
};

// Card colour theme for a resolved outcome; everything else uses "ongoing".
const APPROVAL_STATUS_BY_OUTCOME = { yes: "approved", no: "refused" };

const DEFAULT_COMPANY_ID = "0x3Fd2e8E71f75eED4b5c507706c413E33e0661bBf"; // Gnosis DAO

const ProposalsPage = ({
  initialCompanyId = DEFAULT_COMPANY_ID,
  preserveHash = false,
  useNewCards = false,
}) => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyData, setCompanyData] = useState(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState(true);

  // Check for debug mode
  const [debugMode, setDebugMode] = useState(false);

  // Detect if company_id is an Ethereum address (for subgraph path)
  const isAddressId = typeof initialCompanyId === 'string' &&
    initialCompanyId.startsWith('0x') &&
    initialCompanyId.length === 42;

  // Use subgraph hook for address-based IDs
  const {
    org: subgraphOrg,
    isOwner,
    loading: subgraphLoading,
    error: orgError,
    refetch: refetchOrg
  } = useOrganization(isAddressId ? initialCompanyId : null);

  // Edit Manager State
  const [showManager, setShowManager] = useState(false);

  // Get current chain
  const currentChainId = useChainId();



  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setDebugMode(urlParams.get('debugMode') === 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !preserveHash) {
      window.history.pushState({}, "", `/${initialCompanyId}/milestones`);
    }
  }, [initialCompanyId, preserveHash]);

  // Effect for subgraph-based data (address IDs)
  useEffect(() => {
    if (isAddressId && subgraphOrg && !subgraphLoading) {
      setError(null);
      setCompanyData(subgraphOrg);

      // Async function to fetch pool data for proposals
      const fetchProposalPools = async () => {
        // For each proposal, fetch pool data from Market subgraph
        const transformedProposals = await Promise.all(
          (subgraphOrg.proposals || []).map(async (p) => {
            // Parse proposal metadata to get chain info
            let proposalMeta = {};
            try {
              proposalMeta = p.metadata ? JSON.parse(p.metadata) : {};
            } catch (e) { }

            const chainId = proposalMeta.chain ? parseInt(proposalMeta.chain) : 100;
            const proposalAddress = p.proposalAddress || p.id;

            // Fetch pools from Market subgraph
            let poolAddresses = { yes: null, no: null };
            let predictionPools = { yes: null, no: null };
            let yesPrice = null;
            let noPrice = null;
            let totalVolume = 0;
            let totalLiquidity = 0;

            try {
              const { SUBGRAPH_ENDPOINTS } = await import('../../../../../config/subgraphEndpoints');
              const endpoint = SUBGRAPH_ENDPOINTS[chainId];

              if (endpoint) {
                const poolQuery = `{
                  proposal(id: "${proposalAddress.toLowerCase()}") {
                    pools {
                      id
                      type
                      outcomeSide
                      price
                      liquidity
                      volumeToken0
                      volumeToken1
                    }
                  }
                }`;

                const res = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: poolQuery })
                });
                const result = await res.json();
                const pools = result.data?.proposal?.pools || [];

                // Extract conditional pools for YES/NO prices
                const yesConditional = pools.find(p => p.type === 'CONDITIONAL' && p.outcomeSide === 'YES');
                const noConditional = pools.find(p => p.type === 'CONDITIONAL' && p.outcomeSide === 'NO');

                if (yesConditional) {
                  poolAddresses.yes = yesConditional.id;
                  yesPrice = parseFloat(yesConditional.price) || null;
                }
                if (noConditional) {
                  poolAddresses.no = noConditional.id;
                  noPrice = parseFloat(noConditional.price) || null;
                }

                // Aggregate volume and liquidity across all pools
                totalVolume = pools.reduce((sum, p) => {
                  return sum + (parseFloat(p.volumeToken0) || 0) + (parseFloat(p.volumeToken1) || 0);
                }, 0);
                totalLiquidity = pools.reduce((sum, p) => {
                  return sum + (parseFloat(p.liquidity) || 0);
                }, 0);

                // Extract prediction pools
                const yesPrediction = pools.find(p => p.type === 'PREDICTION' && p.outcomeSide === 'YES');
                const noPrediction = pools.find(p => p.type === 'PREDICTION' && p.outcomeSide === 'NO');

                if (yesPrediction) predictionPools.yes = { address: yesPrediction.id };
                if (noPrediction) predictionPools.no = { address: noPrediction.id };
              }
            } catch (e) {
              console.warn('[ProposalsPage] Failed to fetch pools for', proposalAddress, e);
            }

            // Calculate impact from prices
            let impact = null;
            if (yesPrice !== null && noPrice !== null) {
              const maxPrice = Math.max(yesPrice, noPrice);
              if (maxPrice !== 0) {
                const impactValue = ((yesPrice - noPrice) / maxPrice) * 100;
                impact = `${impactValue >= 0 ? '+' : ''}${impactValue.toFixed(2)}%`;
              }
            }

            return {
              proposalID: proposalAddress,
              proposalTitle: p.displayNameQuestion
                ? `${p.displayNameQuestion} ${p.displayNameEvent || ''}`
                : 'Untitled Proposal',
              description: p.description || '',
              // Inputs of resolveMarketStatus; marketStatus is derived below,
              // once the on-chain state is known.
              resolution_status: proposalMeta.resolution_status || null,
              resolution_outcome: proposalMeta.resolution_outcome || null,
              onChainResolution: null,
              // Visibility: 'public' (default) or 'hidden'. Hidden proposals are
              // filtered from the public list below and shown to the org owner
              // with a "Hidden" badge (mirrors EventHighlightCard's convention).
              visibility: proposalMeta.visibility || 'public',
              isOwner,
              chainId,
              // Use org's cover image as the card banner
              image: subgraphOrg.coverImage || subgraphOrg.logo || PROPOSAL_IMAGES['gnosis-pay'],
              // Pass pool addresses for price fetching
              poolAddresses,
              predictionPools,
              // Pass prices directly from subgraph (avoid Supabase lookup)
              prices: { yes: yesPrice, no: noPrice },
              impact,
              metadata: {
                ...proposalMeta,
                background_image: subgraphOrg.coverImage || subgraphOrg.logo,
                display_title_0: p.displayNameQuestion,
                display_title_1: p.displayNameEvent
              },
              totalVolume,
              totalLiquidity,
              fromSubgraph: true
            };
          })
        );

        // Registry resolution metadata lags the chain (KIP-90 stayed "Ongoing"
        // after it resolved), so read the ConditionalTokens payout state for
        // whatever it doesn't settle — batched, two RPC POSTs per chain.
        const unsettled = transformedProposals.filter(needsOnChainResolution);
        if (unsettled.length > 0) {
          const resolutions = await fetchOnChainResolutions(unsettled.map((p) => ({
            proposalAddress: p.proposalID,
            chainId: p.chainId,
            conditionalTokens: p.metadata?.contractInfos?.conditionalTokens,
          })));
          for (const p of unsettled) {
            const result = resolutions.get(resolutionKey(p.chainId, p.proposalID));
            if (result?.resolved) p.onChainResolution = result;
          }
        }

        for (const p of transformedProposals) {
          p.marketStatus = resolveMarketStatus(p);
          p.approvalStatus = APPROVAL_STATUS_BY_OUTCOME[p.marketStatus.outcome] || 'ongoing';
        }

        // Sort by total volume (highest first), fallback to timestamp
        transformedProposals.sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0));

        setProposals(transformedProposals);
        setIsLoadingCompany(false);
        setIsLoading(false);
        console.log('[ProposalsPage] Loaded', transformedProposals.length, 'proposals from subgraph for:', subgraphOrg.name);
      };

      fetchProposalPools();
    } else if (isAddressId && !subgraphLoading && !subgraphOrg) {
      // Subgraph returned no org for this address — bail out cleanly.
      setProposals([]);
      setCompanyData(null);
      setIsLoadingCompany(false);
      setIsLoading(false);
      // A failed request is not an empty organization: show the error.
      if (orgError) {
        setError(/not found/i.test(orgError.message || '')
          ? 'Organization not found.'
          : "Couldn't load this organization's milestones. The registry did not respond.");
      }
    }
  }, [isAddressId, subgraphOrg, subgraphLoading, orgError]);

  // Update the filter options structure
  const filterOptions = [
    { value: "All", label: "All Milestones", icon: DropdownListIcon },
    { value: "Active", label: describeMarketStatus("active").label, icon: DropdownOngoingIcon },
    { value: "Awaiting", label: describeMarketStatus("awaiting_resolution").label, icon: DropdownOngoingIcon },
    { value: "Approved", label: describeMarketStatus("resolved", "yes").labelWithOutcome, icon: DropdownCheckIcon },
    { value: "Refused", label: describeMarketStatus("resolved", "no").labelWithOutcome, icon: DropdownCancelIcon },
  ];

  // Update the filter logic to handle new options and debug mode
  // Hidden proposals are removed from the public list, but still shown to the
  // org owner (who sees a "Hidden" badge on the card). Matches the convention
  // used by EventHighlightCard / the company carousels. Without this, hidden
  // proposals leaked onto the milestones list (this page reads the raw,
  // unfiltered org.proposals from useOrganization, which does no filtering).
  const isVisibleToViewer = (proposal) =>
    !(proposal.visibility === "hidden" && !isOwner && !debugMode);

  const filteredProposals = (proposals || []).filter((proposal) => {
    // First apply debug mode filtering - hide pending_review unless debug mode is on
    if (proposal.approvalStatus === "pending_review" && !debugMode) {
      return false;
    }

    // Visibility: drop 'hidden' proposals for the public (owner/debug still see them)
    if (!isVisibleToViewer(proposal)) {
      return false;
    }

    const titleMatch =
      proposal.proposalTitle
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ?? false;
    const statusMatch = (() => {
      switch (activeFilter) {
        case "All":
          return true;
        case "Active":
          return proposal.marketStatus?.state === "active";
        case "Awaiting":
          return proposal.marketStatus?.state === "awaiting_resolution";
        case "Approved":
          return proposal.marketStatus?.outcome === "yes";
        case "Refused":
          return proposal.marketStatus?.outcome === "no";
        default:
          return false;
      }
    })();
    return titleMatch && statusMatch;
  });

  // Calculate active proposals count
  const activeProposalsCount = useMemo(() => {
    return proposals.filter((proposal) =>
      isVisibleToViewer(proposal) &&
      proposal.marketStatus?.state === "active"
    ).length;
  }, [proposals, isOwner, debugMode]);

  // Calculate total visible milestones count (respecting debug mode)
  const visibleMilestonesCount = useMemo(() => {
    return proposals.filter((proposal) => {
      // Hide pending_review unless debug mode is on
      if (proposal.approvalStatus === "pending_review" && !debugMode) {
        return false;
      }
      // Hide 'hidden' proposals from non-owners
      if (!isVisibleToViewer(proposal)) {
        return false;
      }
      return true;
    }).length;
  }, [proposals, debugMode, isOwner]);

  const heroContent = useMemo(() => {
    if (isLoadingCompany) {
      return (
        <div className="bg-seer-page pt-20">
          <div className="flex justify-center items-center min-h-[240px]">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-seer-border border-t-seer-purple" role="status" aria-label="Loading organization"></div>
          </div>
        </div>
      );
    }
    if (companyData) {
      return (
        <PageHeader title={companyData.name} logoSrc={companyData.logo} logoAlt={`${companyData.name} Logo`}>
          <div className="flex flex-col items-start gap-4 w-full mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChainBadge chainId={companyData.chain || 100} />
              {activeProposalsCount > 0 && (
                <Badge tone="accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-seer-accent-text" aria-hidden="true"></span>
                  {activeProposalsCount} Active Milestone
                  {activeProposalsCount !== 1 ? "s" : ""}
                </Badge>
              )}
              {/* Subgraph badge */}
              {SHOW_DATA_DEBUG && companyData.fromSubgraph && (
                <Badge>Subgraph</Badge>
              )}
              {/* Owner badge + Manage button */}
              {isOwner && (
                <>
                  <Badge tone="positive">Owner</Badge>
                  <Button variant="outline" size="sm" onClick={() => setShowManager(true)}>
                    Manage Organization
                  </Button>
                </>
              )}
            </div>

            {companyData.description && (
              <p className="text-[15px] leading-relaxed text-seer-muted max-w-[68ch]">
                {companyData.description}
              </p>
            )}

            {/* The count reads first; the term stays first in the markup for screen readers. */}
            <dl className="flex items-baseline gap-2">
              <dt className="order-2 text-[13px] text-seer-muted">
                Milestones
              </dt>
              <dd className="order-1 text-xl font-semibold tabular-nums text-seer-text">
                {visibleMilestonesCount}
              </dd>
            </dl>
          </div>
        </PageHeader>
      );
    }
    return null;
  }, [isLoadingCompany, companyData, activeProposalsCount, visibleMilestonesCount]);

  return (
    <RootLayout>
      <PageLayout hero={heroContent} contentClassName="pt-8 z-10 select-none">
        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-center md:justify-between items-center">
          <div className="hidden w-full md:w-auto flex flex-col md:flex-row gap-4">
            <SearchBox value={searchQuery} onChange={setSearchQuery} />
          </div>
          <div className="w-full md:w-auto">
            <CustomDropdown
              options={filterOptions}
              value={activeFilter}
              onChange={setActiveFilter}
            />
          </div>
        </div>

        {useNewCards ? (
          <div className="mt-8">
            <ProposalsListCarousel proposals={filteredProposals} isLoading={isLoading} />
          </div>
        ) : (
          <>
            {/* Proposals Section */}
            <h2 className="mt-8 text-lg font-semibold tracking-tight text-seer-text">
              Proposals
            </h2>
            <p className="mt-1 text-sm text-seer-muted max-w-[68ch]">
              Fully realized proposals with all features and comprehensive
              data where functionalities meet their full expression
            </p>
            <div className="mt-6">
              {isLoading ? (
                <div className="flex justify-center items-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-seer-border border-t-seer-purple" role="status" aria-label="Loading milestones"></div>
                </div>
              ) : error ? (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-surface border border-seer-border bg-seer-surface p-6 text-center">
                  <span className="text-sm font-semibold text-seer-negative">{error}</span>
                  {orgError && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setIsLoading(true); refetchOrg(); }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              ) : filteredProposals.length === 0 ? (
                <p className="rounded-surface border border-dashed border-seer-border p-6 text-center text-sm text-seer-muted">
                  No milestones found matching your criteria.
                </p>
              ) : (
                <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredProposals.map((proposal) => (
                    <div
                      key={proposal.proposalID || proposal.proposalTitle}
                      className="flex min-w-0"
                    >
                      <div className="hidden md:flex w-full">
                        <ProposalsCard
                          {...proposal}
                          resolutionStatus={proposal.resolution_status}
                          organizationName={companyData?.name}
                          organizationLogo={companyData?.logo}
                        />
                      </div>
                      <div className="flex md:hidden w-full">
                        <MobileProposalsCard
                          {...proposal}
                          resolutionStatus={proposal.resolution_status}
                          organizationName={companyData?.name}
                          organizationLogo={companyData?.logo}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </PageLayout>

      <OrganizationManagerModal
        isOpen={showManager}
        onClose={() => setShowManager(false)}
        mode="organization"
        entityId={isAddressId ? initialCompanyId : null}
      />
    </RootLayout>
  );
};

export default ProposalsPage;
