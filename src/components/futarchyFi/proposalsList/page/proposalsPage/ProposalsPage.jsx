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
import { useOrganization } from "../../../../../hooks/useOrganization";
import { useChainId } from "wagmi";
import OrganizationManagerModal from "../../../../debug/OrganizationManagerModal";
import { SHOW_DATA_DEBUG } from "../../../../../config/featureFlags";
import { fetchOnChainResolutions, resolutionKey } from "../../../../../utils/onChainResolution";
import { applyOnChainResolution } from "../../../../../utils/proposalLifecycle";

const PROPOSAL_IMAGES = {
  "ethereum-budget": "/assets/ethereum-budget-picture.webp",
  "gnosis-pay": "/assets/gnosis-pay.png",
  "protocol-upgrade": "/assets/protocol-update-picture.webp",
};

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
              approvalStatus: proposalMeta.resolution_status === 'resolved'
                ? (proposalMeta.resolution_outcome === 'yes' ? 'approved' : 'refused')
                : 'ongoing',
              resolution_status: proposalMeta.resolution_status || null,
              resolution_outcome: proposalMeta.resolution_outcome || null,
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
        // whatever it still calls ongoing — batched, two RPC POSTs per chain.
        const ongoing = transformedProposals.filter((p) => p.approvalStatus === 'ongoing');
        if (ongoing.length > 0) {
          const resolutions = await fetchOnChainResolutions(ongoing.map((p) => ({
            proposalAddress: p.proposalID,
            chainId: p.chainId,
            conditionalTokens: p.metadata?.contractInfos?.conditionalTokens,
          })));
          for (const p of ongoing) {
            const result = resolutions.get(resolutionKey(p.chainId, p.proposalID));
            if (!result?.resolved) continue;
            applyOnChainResolution(p, result);
            p.approvalStatus = p.resolution_outcome === 'yes' ? 'approved' : 'refused';
          }
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
    { value: "Active", label: "Active", icon: DropdownOngoingIcon },
    { value: "Approved", label: "Approved", icon: DropdownCheckIcon },
    { value: "Refused", label: "Refused", icon: DropdownCancelIcon },
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
          return proposal.approvalStatus === "ongoing" || proposal.approvalStatus === "on_going";
        case "Approved":
          return proposal.approvalStatus === "approved";
        case "Refused":
          return proposal.approvalStatus === "refused";
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
      (proposal.approvalStatus === "ongoing" || proposal.approvalStatus === "on_going")
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
        <div className="relative bg-gradient-to-r from-futarchyDarkGray2 via-futarchyDarkGray2 to-futarchyDarkGray2/90 pt-20 font-oxanium">
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyLavender"></div>
          </div>
        </div>
      );
    }
    if (companyData) {
      return (
        <PageHeader title={companyData.name} logoSrc={companyData.logo} logoAlt={`${companyData.name} Logo`}>
          <div className="flex flex-col items-start gap-8 w-full">
            <div className="flex gap-3">
              {activeProposalsCount > 0 && (
                <div className="py-1 px-2 bg-futarchyEmerald3 rounded-full text-futarchyEmerald11 text-sm leading-4 border border-futarchyEmerald6 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-futarchyEmerald11 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-futarchyEmerald11"></span>
                  </span>
                  {activeProposalsCount} Active Milestone
                  {activeProposalsCount !== 1 ? "s" : ""}
                </div>
              )}
              <div className="py-1 px-2 bg-white/10 rounded-full text-futarchyGray112 text-sm leading-4 border border-futarchyGray6">
                {companyData.currencyToken}
              </div>
              {/* Subgraph badge */}
              {SHOW_DATA_DEBUG && companyData.fromSubgraph && (
                <div className="py-1 px-2 bg-purple-600 rounded-full text-white text-sm leading-4 font-medium">
                  📊 Subgraph
                </div>
              )}
              {/* Owner badge + Manage button */}
              {isOwner && (
                <>
                  <div className="py-1 px-2 bg-green-600 rounded-full text-white text-sm leading-4 font-medium">
                    👑 Owner
                  </div>
                  <button
                    onClick={() => setShowManager(true)}
                    className="py-1 px-3 bg-futarchyLavender hover:bg-futarchyLavender/80 rounded-full text-white text-sm leading-4 font-medium transition-colors"
                  >
                    ⚙️ Manage Organization
                  </button>
                </>
              )}
            </div>

            <p className="text-sm lg:text-base text-white/70 leading-relaxed lg:w-2/3">
              {companyData.description}
            </p>

            <div className="flex flex-col md:grid md:grid-cols-3 md:gap-8 gap-4 justify-between">
              <div className="w-full md:w-[167px] lg:py-7 lg:px-10 lg:w-[286px] h-[88px] lg:h-auto p-4 border border-futarchyGray6 bg-futarchyDarkGray3 rounded-xl shadow-[inset_0_0_12px_rgba(255,255,255,0.1)] md:justify-self-start">
                <p className="text-xl lg:text-4xl text-futarchyGray122 font-semibold text-center lg:leading-10 leading-8">
                  {visibleMilestonesCount}
                </p>
                <p className="text-sm lg:text-[22px] text-futarchyGray112 font-normal text-center lg:leading-9 leading-6">
                  Milestones
                </p>
              </div>
            </div>
          </div>
        </PageHeader>
      );
    }
    return null;
  }, [isLoadingCompany, companyData, activeProposalsCount, visibleMilestonesCount]);

  return (
    <RootLayout
      headerConfig="app"
      footerConfig="main"
    >
      <PageLayout hero={heroContent} contentClassName="pt-10 z-10 select-none">
        {/* Test div for new market page */}
        {/*   <div className="my-4 p-4 border border-dashed border-futarchyGray8 dark:border-futarchyDarkGray8 rounded-md">
          <p className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-2">
            Test Area: Link to new Market Page
          </p>
          <Link href="/markets/new" className="text-futarchyBlue11 hover:underline">
            Go to new Market Page
          </Link>
        </div>*/}
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
            <div className="text-2xl text-futarchyDarkGray4 dark:text-futarchyGray3 font-semibold mt-8">
              <span>Proposals</span>
            </div>
            <div className="text-sm text-futarchyDarkGray4/70 dark:text-futarchyGray112/80 font-medium">
              Fully realized proposals with all features and comprehensive
              data where functionalities meet their full expression
            </div>
            <div className="mt-6">
              <div className="mt-2">
                {isLoading ? (
                  <div className="flex justify-center items-center min-h-[200px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyLavender"></div>
                  </div>
                ) : error ? (
                  <div role="alert" className="flex flex-col items-center gap-3 text-center text-futarchyCrimson11 py-8">
                    <span>{error}</span>
                    {orgError && (
                      <button
                        onClick={() => { setIsLoading(true); refetchOrg(); }}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border-2 border-futarchyGray62 dark:border-futarchyGray11/70 text-futarchyGray12 dark:text-white hover:border-futarchyLavender transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : filteredProposals.length === 0 ? (
                  <div className="text-center text-black dark:text-futarchyGray112 py-8">
                    No milestones found matching your criteria.
                  </div>
                ) : (
                  <>
                    <div
                      className="grid auto-rows-fr gap-6 md:gap-8 justify-center"
                      style={{
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(304px, 1fr))",
                        "@media (minWidth: 768px)": {
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(392px, 1fr))",
                        },
                        maxWidth: "1280px",
                        margin: "0 auto",
                      }}
                    >
                      {filteredProposals.map((proposal) => (
                        <div
                          key={proposal.proposalID || proposal.proposalTitle}
                          className="flex justify-start"
                        >
                          <div className="hidden md:block">
                            <ProposalsCard
                              {...proposal}
                              resolutionStatus={proposal.resolution_status}
                            />
                          </div>
                          <div className="block md:hidden">
                            <MobileProposalsCard
                              {...proposal}
                              resolutionStatus={proposal.resolution_status}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
