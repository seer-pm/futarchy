import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { PRECISION_CONFIG } from '../components/futarchyFi/marketPage/constants/contracts';
import { fetchMarketEventData, parseContractSource } from '../adapters/subgraphConfigAdapter';
import { fetchProposalMetadataFromRegistry, extractChainFromMetadata, extractSpotPriceFromMetadata, extractStartCandleFromMetadata, extractCloseTimestampFromMetadata, extractTwapFromMetadata, extractResolutionFromMetadata, extractDisplayConfigFromMetadata, extractSnapshotIdFromMetadata } from '../adapters/registryAdapter';

// Public RPCs for the on-chain resolution fallback check
const RESOLUTION_RPC_BY_CHAIN = {
  1: 'https://eth.llamarpc.com',
  100: process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.gnosischain.com'
};

/**
 * Check resolution directly on-chain via ConditionalTokens payouts.
 * Registry metadata can lag behind the actual on-chain resolution (e.g. Kleros KIP-88
 * resolved on-chain but its metadata was never updated with resolution_status),
 * which hid the Redeem tab. payoutDenominator > 0 is the authoritative signal that
 * redemption is possible.
 * @param {string} proposalAddress - FutarchyProposal contract address
 * @param {string} conditionalTokensAddress - ConditionalTokens contract address
 * @param {number|string} chainId - Chain the proposal lives on
 * @returns {Promise<{resolved: boolean, outcome: string|null}|null>} null when the check fails
 */
async function fetchOnChainResolution(proposalAddress, conditionalTokensAddress, chainId) {
  try {
    const rpcUrl = RESOLUTION_RPC_BY_CHAIN[Number(chainId)] || RESOLUTION_RPC_BY_CHAIN[100];
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    // URL-sourced addresses may carry a bad EIP-55 checksum; lowercase so
    // ethers doesn't throw before the read.
    const proposal = new ethers.Contract(
      proposalAddress.toLowerCase(),
      ['function conditionId() view returns (bytes32)'],
      provider
    );
    const conditionId = await proposal.conditionId();
    const conditionalTokens = new ethers.Contract(
      conditionalTokensAddress.toLowerCase(),
      [
        'function payoutDenominator(bytes32) view returns (uint256)',
        'function payoutNumerators(bytes32, uint256) view returns (uint256)'
      ],
      provider
    );
    const denominator = await conditionalTokens.payoutDenominator(conditionId);
    if (denominator.isZero()) {
      return { resolved: false, outcome: null };
    }
    // Outcome slot 0 = Yes, slot 1 = No for futarchy proposals
    const yesNumerator = await conditionalTokens.payoutNumerators(conditionId, 0);
    return { resolved: true, outcome: yesNumerator.gt(0) ? 'Yes' : 'No' };
  } catch (error) {
    console.warn('[Config] On-chain resolution check failed:', error?.message);
    return null;
  }
}

/**
 * Hook to fetch and manage contract configuration data from the Registry/subgraph
 * @param {string} proposalId - The proposal ID to fetch configuration for
 * @param {boolean} forceTestPools - Force use of test pool addresses (default: false)
 * @returns {Object} - Contains loading state, error state, contract configuration data, and refetch function
 */
export const useContractConfig = (proposalId, forceTestPools = false) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchContractConfig = async () => {
      try {
        // Get proposal ID from URL parameters using native browser API
        let extractedProposalId = proposalId;

        // Try to get proposalId from URL search parameters
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const proposalFromUrl = urlParams.get('proposalId');
          console.log('📊 Full URL:', window.location.href);
          console.log('📊 Window location search:', window.location.search);
          console.log('📊 URL search params:', Object.fromEntries(urlParams.entries()));
          console.log('📊 proposalFromUrl:', proposalFromUrl);
          console.log('📊 proposalId param:', proposalId);

          if (proposalFromUrl) {
            extractedProposalId = proposalFromUrl;
            console.log('📊 Using proposalId from URL:', extractedProposalId);
          } else if (proposalId) {
            console.log('📊 Using proposalId from parameter:', extractedProposalId);
          } else {
            console.log('📊 No proposalId found in URL or parameters');
          }
        } else {
          console.log('📊 Server-side rendering - using passed proposalId:', proposalId);
        }

        // If no proposal ID found, return null config (graceful handling for non-proposal pages)
        if (!extractedProposalId) {
          console.log('📊 No proposal ID found in parameters or URL - returning null config');
          console.log('📊 Debug - URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
          console.log('📊 Debug - Search params:', typeof window !== 'undefined' ? window.location.search : 'N/A');
          setConfig(null);
          setLoading(false);
          setError(null);
          return;
        }

        console.log('📊 Fetching contract config for proposal ID:', extractedProposalId);

        setLoading(true);

        // Check for useContractSource query parameter (e.g., subgraph-1, subgraph-100)
        let useContractSource = null;
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          useContractSource = urlParams.get('useContractSource');
        }

        // NEW: If no explicit useContractSource, try auto-detecting from Registry metadata
        let registryMetadata = null; // Store Registry data for later use
        let registrySpotPrice = null; // Store coingecko_ticker for spot price
        let registryStartCandle = null; // Store startCandleUnix for chart filtering
        let registryCloseTimestamp = null; // Store closeTimestamp for countdown
        let registryTwap = null; // Store TWAP configuration
        let registryResolution = null; // Store resolution status/outcome
        let registrySnapshotId = null; // Store snapshot_id for Snapshot link
        if (!useContractSource) {
          console.log('🔍 No explicit useContractSource, checking Registry for chain...');
          const registryData = await fetchProposalMetadataFromRegistry(extractedProposalId);
          const detectedChain = extractChainFromMetadata(registryData);
          const detectedSpotPrice = extractSpotPriceFromMetadata(registryData);
          const detectedStartCandle = extractStartCandleFromMetadata(registryData);
          const detectedCloseTimestamp = extractCloseTimestampFromMetadata(registryData);
          const detectedTwap = extractTwapFromMetadata(registryData);
          const detectedResolution = extractResolutionFromMetadata(registryData);
          const detectedDisplayConfig = extractDisplayConfigFromMetadata(registryData);
          const detectedSnapshotId = extractSnapshotIdFromMetadata(registryData);

          if (detectedChain) {
            useContractSource = `subgraph-${detectedChain}`;
            console.log('🔍 Auto-detected chain from Registry:', detectedChain, '→', useContractSource);
          } else {
            // The legacy Supabase market_event backend is permanently gone; default
            // to the Gnosis subgraph (with its on-chain fallback) when Registry has no chain.
            useContractSource = 'subgraph-100';
            console.log('🔍 No chain in Registry metadata, defaulting to', useContractSource);
          }
          // Store registry data (if any) to enrich the subgraph response
          if (registryData) {
            registryMetadata = { ...registryData, ...(registryMetadata || {}) };
          }

          if (detectedSpotPrice) {
            registrySpotPrice = detectedSpotPrice;
            console.log('🔍 Auto-detected spotPrice from Registry:', detectedSpotPrice.slice(0, 30) + '...');
          }

          if (detectedStartCandle) {
            registryStartCandle = detectedStartCandle;
            console.log('🔍 Auto-detected startCandleUnix from Registry:', detectedStartCandle);
          }

          if (detectedCloseTimestamp) {
            registryCloseTimestamp = detectedCloseTimestamp;
            console.log('🔍 Auto-detected closeTimestamp from Registry:', detectedCloseTimestamp);
          }

          if (detectedTwap) {
            registryTwap = detectedTwap;
            console.log('🔍 Auto-detected TWAP config from Registry:', detectedTwap);
          }

          if (detectedResolution) {
            registryResolution = detectedResolution;
            console.log('🔍 Auto-detected resolution from Registry:', detectedResolution);
          }

          if (detectedDisplayConfig) {
            // Attach it to the registry metadata object directly so we can use it later
            if (!registryMetadata) registryMetadata = {};
            registryMetadata._displayConfig = detectedDisplayConfig;
            console.log('🔍 Auto-detected display config from Registry');
          }

          if (detectedSnapshotId) {
            registrySnapshotId = detectedSnapshotId;
            console.log('🔍 Auto-detected snapshot_id from Registry:', detectedSnapshotId);
          }
        }

        let data = null;

        // If subgraph source is specified (explicit or auto-detected), try to fetch from subgraph first
        if (useContractSource && useContractSource.startsWith('subgraph-')) {
          console.log('📊 Using subgraph source:', useContractSource);

          const subgraphData = await fetchMarketEventData(extractedProposalId, useContractSource);

          if (subgraphData) {
            console.log('✅ Fetched from subgraph successfully');
            data = subgraphData;

            // Enrich with Registry metadata if available
            if (registryMetadata || registrySpotPrice || registryStartCandle || registryTwap || registryResolution || registrySnapshotId) {
              console.log('📝 Enriching with Registry metadata:', {
                displayNameQuestion: registryMetadata?.displayNameQuestion,
                displayNameEvent: registryMetadata?.displayNameEvent,
                description: registryMetadata?.description?.slice(0, 50) + '...',
                coingecko_ticker: registrySpotPrice ? registrySpotPrice.slice(0, 30) + '...' : null,
                startCandleUnix: registryStartCandle,
                closeTimestamp: registryCloseTimestamp,
                twap: registryTwap,
                snapshot_id: registrySnapshotId
              });
              // Store registry display names in metadata for marketInfo
              data._registryMetadata = {
                displayNameQuestion: registryMetadata?.displayNameQuestion,
                displayNameEvent: registryMetadata?.displayNameEvent,
                description: registryMetadata?.description,
                title: registryMetadata?.title,
                organization: registryMetadata?.organization,
                coingecko_ticker: registrySpotPrice, // Add spot price ticker
                startCandleUnix: registryStartCandle, // Add chart start filter
                closeTimestamp: registryCloseTimestamp, // Add close timestamp
                owner: registryMetadata?.owner, // Proposal metadata owner for edit permissions
                proposalMetadataAddress: registryMetadata?.id, // ProposalMetadata contract address for editing
                // TWAP configuration
                twapDurationHours: registryTwap?.twapDurationHours || null,
                twapStartTimestamp: registryTwap?.twapStartTimestamp || null,
                twapDescription: registryTwap?.twapDescription || null,
                // TWAP pool inversion flags
                invertTwapPoolYes: registryTwap?.invertTwapPoolYes || false,
                invertTwapPoolNo: registryTwap?.invertTwapPoolNo || false,
                // Resolution fields from Registry metadata
                resolution_status: registryResolution?.resolution_status || null,
                resolution_outcome: registryResolution?.resolution_outcome || null,
                // Nested display config from flat "display_*" fields
                display: registryMetadata?._displayConfig || null,
                // Snapshot proposal ID from on-chain metadata
                snapshot_id: registrySnapshotId || null
              };
            }
          } else {
            console.warn('⚠️ Subgraph fetch failed and no fallback backend is available');
          }
        }

        if (!data) {
          throw new Error(`Proposal ${extractedProposalId} not found in market events`);
        }

        console.log('Market event fetched successfully:', data);

        // Parse metadata if it's a string, handle null case
        const metadata = data.metadata
          ? (typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata)
          : null;

        // Check if we have the required metadata
        // For subgraph sources, contractInfos may not be present, so only require tokens
        const isSubgraphSource = metadata?._source === 'subgraph';
        if (!metadata || !metadata?.currencyTokens || !metadata?.companyTokens) {
          throw new Error(`Proposal ${extractedProposalId} does not have complete metadata configuration`);
        }
        if (!isSubgraphSource && !metadata?.contractInfos) {
          throw new Error(`Proposal ${extractedProposalId} does not have contractInfos configuration`);
        }

        console.log('metadata', metadata);

        // Test pool addresses for override
        const TEST_POOLS = {
          yes: '0x44fEA76b9F876d85C117e96f6a0323517210CA25',
          no: '0x8a896a495690Abf9C8394b18780a821699f5f52c',
          base: '0x31227b50eCCDC9C589826AA2D9E7C5619B1895Da'
        };

        // Proposal-specific base pool overrides (highest priority)
        const PROPOSAL_BASE_POOL_OVERRIDES = {
          '0x1F54f0312E85c5AFACe2bDF15AA2514BeFDB844F': '0x2A4b52B47625431Fdc6fE58CeD3086E76c1f6bbf'
        };

        if (forceTestPools) {
          console.log('🔧 FORCING TEST POOLS:', TEST_POOLS);
        }

        // Check for proposal-specific base pool override
        const proposalSpecificBasePool = PROPOSAL_BASE_POOL_OVERRIDES[extractedProposalId];
        if (proposalSpecificBasePool) {
          console.log('🎯 Using proposal-specific base pool override:', proposalSpecificBasePool, 'for proposal:', extractedProposalId);
        }

        // Resolution status: prefer metadata, but fall back to the on-chain
        // ConditionalTokens payout state when metadata says unresolved/missing.
        const metadataResolved = (data.resolution_outcome !== null && data.resolution_outcome !== undefined)
          || data.resolution_status === 'resolved'
          || data._registryMetadata?.resolution_status === 'resolved'
          || (data._registryMetadata?.resolution_outcome !== null && data._registryMetadata?.resolution_outcome !== undefined);

        let onChainResolution = null;
        if (!metadataResolved && metadata?.contractInfos?.conditionalTokens) {
          onChainResolution = await fetchOnChainResolution(
            extractedProposalId,
            metadata.contractInfos.conditionalTokens,
            metadata?.chain || 100
          );
          if (onChainResolution?.resolved) {
            console.log('[Config] Market resolved on-chain but not in metadata; enabling redemption UI', onChainResolution);
          }
        }

        // Transform API data into the format needed by the application
        const transformedConfig = {
          // Proposal/Market identification (these are the same thing)
          proposalId: extractedProposalId,
          MARKET_ADDRESS: extractedProposalId,

          // Chain info (parse as number since Registry stores as string)
          chainId: parseInt(metadata.chain, 10) || 100,

          // Contract addresses
          CONDITIONAL_TOKENS_ADDRESS: metadata?.contractInfos?.conditionalTokens || '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce',
          WRAPPER_SERVICE_ADDRESS: metadata?.contractInfos?.wrapperService || '0xc14f5d2B9d6945EF1BA93f8dB20294b90FA5b5b1',

          // Router addresses from contractInfos
          FUTARCHY_ROUTER_ADDRESS: metadata?.contractInfos?.futarchy?.router || '0x7495a583ba85875d59407781b4958ED6e0E1228f',
          SUSHISWAP_V2_ROUTER: metadata?.contractInfos?.sushiswap?.routerV2 || '0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55',
          SUSHISWAP_V3_ROUTER: metadata.contractInfos?.sushiswap?.routerV3 || '0x592abc3734cd0d458e6e44a2db2992a3d00283a4',
          SUSHISWAP_FACTORY: metadata?.contractInfos?.sushiswap?.factory || '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',

          // Base token configurations
          BASE_TOKENS_CONFIG: {
            currency: {
              address: metadata.currencyTokens?.base?.wrappedCollateralTokenAddress || metadata?.baseTokens?.currency?.address || '0xaf204776c7245bF4147c2612BF6e5972Ee483701',
              // Use explicit symbol from metadata, or fallback to chain-specific defaults
              symbol: metadata.currencyTokens?.base?.tokenSymbol || metadata?.baseTokens?.currency?.symbol || (metadata.chain === 1 ? 'USDS' : 'sDAI'),
              name: metadata.currencyTokens?.base?.tokenName || metadata?.baseTokens?.currency?.name || (metadata.chain === 1 ? 'USDS' : 'sDAI'),
              decimals: 18
            },
            company: {
              address: metadata.companyTokens?.base?.wrappedCollateralTokenAddress || metadata?.baseTokens?.company?.address || '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
              symbol: metadata.companyTokens?.base?.tokenSymbol || metadata?.baseTokens?.company?.symbol || 'GNO',
              name: metadata.companyTokens?.base?.tokenName || metadata?.baseTokens?.company?.name || 'Gnosis',
              decimals: 18
            }
          },

          // Pool configurations - use conditional pools metadata (more consistent for price fetching)
          // For subgraph source, don't fall back to default addresses when pools are null
          POOL_CONFIG_YES: {
            address: forceTestPools
              ? TEST_POOLS.yes
              : (metadata.conditional_pools?.yes?.address || (isSubgraphSource ? null : (data.pool_yes || '0xF336F812Db1ad142F22A9A4dd43D40e64B478361'))),
            tokenCompanySlot: metadata.conditional_pools?.yes?.tokenCompanySlot ?? 1,
          },

          POOL_CONFIG_NO: {
            address: forceTestPools
              ? TEST_POOLS.no
              : (metadata.conditional_pools?.no?.address || (isSubgraphSource ? null : (data.pool_no || '0xfbf1BE5CE2f9056dAaB1C368EC241ad7Be3507A8'))),
            tokenCompanySlot: metadata.conditional_pools?.no?.tokenCompanySlot ?? 0,
          },

          // Prediction pools configuration - handle null pools from subgraph
          PREDICTION_POOLS: metadata.prediction_pools ? {
            yes: metadata.prediction_pools.yes ? {
              address: metadata.prediction_pools.yes.address,
              tokenBaseSlot: metadata.prediction_pools.yes.tokenBaseSlot ?? metadata.prediction_pools.yes.token_slot ?? 0
            } : null,
            no: metadata.prediction_pools.no ? {
              address: metadata.prediction_pools.no.address,
              tokenBaseSlot: metadata.prediction_pools.no.tokenBaseSlot ?? metadata.prediction_pools.no.token_slot ?? 0
            } : null
          } : {
            yes: null,
            no: null
          },

          // Base pool configuration (spot price reference for TradingView chart)
          // For subgraph sources: only use base_pool from metadata, no fallbacks
          // For Supabase: Priority: 1) metadata.base_pool, 2) proposalSpecificBasePool, 3) chain-specific, 4) defaults
          BASE_POOL_CONFIG: metadata.base_pool?.address ? {
            address: metadata.base_pool.address,
            type: metadata.base_pool.type || 'DXswapPair',
            companyName: metadata.base_pool.companyName,
            currencyName: metadata.base_pool.currencyName,
            currencySlot: metadata.base_pool.currencySlot ?? 0
          } : isSubgraphSource ? null : (
            proposalSpecificBasePool ? {
              address: "0xabc6625d494568349704cae6ba77bbec96470683b4d0384e83823d59f2240ea9",
              type: 'DXswapPair',
              companyName: 'TSLAon',
              currencyName: 'USDS',
              currencySlot: 0
            } : (metadata.chain === 1) ? {
              address: "0x31227b50eCCDC9C589826AA2D9E7C5619B1895Da",
              type: 'DXswapPair',
              companyName: 'TSLAon',
              currencyName: 'USDS',
              currencySlot: 0
            } : forceTestPools ? {
              address: TEST_POOLS.base,
              type: 'DXswapPair',
              companyName: 'GNO',
              currencyName: 'SDAI',
              currencySlot: 0
            } : {
              address: "0xd1d7fa8871d84d0e77020fc28b7cd5718c446522",
              type: 'DXswapPair',
              companyName: 'GNO',
              currencyName: 'sDAI',
              currencySlot: 0
            }
          ),

          // Third pool configuration (for additional price fetching) - handle null pools
          POOL_CONFIG_THIRD: metadata.prediction_pools?.yes ? {
            address: metadata.prediction_pools.yes.address,
            tokenCompanySlot: metadata.prediction_pools.yes.tokenBaseSlot ?? metadata.prediction_pools.yes.token_slot ?? 0,
          } : null,

          // Merge configuration - use metadata if available, otherwise use updated addresses
          MERGE_CONFIG: {
            currencyPositions: {
              yes: {
                positionId: '0x0da8ddb6e1511c1b897fa0fdabac151efbe8a6a1cee0d042035a10bd8ca50566',
                wrap: {
                  tokenName: metadata.currencyTokens?.yes?.tokenName || 'YES_sDAI',
                  tokenSymbol: metadata.currencyTokens?.yes?.tokenSymbol || 'YES_sDAI',
                  wrappedCollateralTokenAddress: metadata?.currencyTokens?.yes?.wrappedCollateralTokenAddress || '0x2301e71f6c6dc4f8d906772f0551e488dd007a99'
                }
              },
              no: {
                positionId: '0xc493e87c029b70d6dd6a58ea51d2bb5e7c5e19a61833547e3f3876242665b501',
                wrap: {
                  tokenName: metadata.currencyTokens?.no?.tokenName || 'NO_sDAI',
                  tokenSymbol: metadata.currencyTokens?.no?.tokenSymbol || 'NO_sDAI',
                  wrappedCollateralTokenAddress: metadata?.currencyTokens?.no?.wrappedCollateralTokenAddress || '0xb9d258c84589d47d9c4cab20a496255556337111'
                }
              }
            },
            companyPositions: {
              yes: {
                positionId: '0x15883231add67852d8d5ae24898ec21779cc1a99897a520f12ba52021266e218',
                wrap: {
                  tokenName: metadata.companyTokens?.yes?.tokenName || 'YES_GNO',
                  tokenSymbol: metadata.companyTokens?.yes?.tokenSymbol || 'YES_GNO',
                  wrappedCollateralTokenAddress: metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress || '0xb28dbe5cd5168d2d94194eb706eb6bcd81edb04e'
                }
              },
              no: {
                positionId: '0x50b02574e86d37993b7a6ebd52414f9deea42ecfe9c3f1e8556a6d91ead41cc7',
                wrap: {
                  tokenName: metadata.companyTokens?.no?.tokenName || 'NO_GNO',
                  tokenSymbol: metadata.companyTokens?.no?.tokenSymbol || 'NO_GNO',
                  wrappedCollateralTokenAddress: metadata?.companyTokens?.no?.wrappedCollateralTokenAddress || '0xad34b43712588fa57d80e76c5c2bcbd274bdb5c0'
                }
              }
            }
          },

          // Use PRECISION_CONFIG from metadata if available, otherwise fallback to static PRECISION_CONFIG
          // Priority: 
          // 1. Registry dynamically built display object (from flat display_ fields)
          // 2. Metadata 'display' object directly
          // 3. Metadata 'precisions.display' object
          // 4. Fallback defaults
          PRECISION_CONFIG: {
            display: data._registryMetadata?.display || metadata?.display || metadata?.precisions?.display || PRECISION_CONFIG.display,
            tokens: metadata?.precisions?.tokens || PRECISION_CONFIG.tokens || {
              default: 18,
              [metadata.currencyTokens?.base?.tokenSymbol || (metadata.chain === 1 ? 'USDS' : 'sDAI')]: 18,
              [metadata.companyTokens?.base?.tokenSymbol || 'GNO']: 18
            },
            rounding: metadata?.precisions?.rounding || PRECISION_CONFIG.rounding || {
              floor: true,
              multiplier: {
                default: 8,
                high: 20
              },
              tolerance: {
                balance: 1e-15,
                price: 1e-12,
                amount: 1e-10
              }
            }
          },

          // Keep the market information
          // Priority: Registry metadata > subgraph metadata > defaults
          marketInfo: {
            title: (data._registryMetadata?.displayNameQuestion || data._registryMetadata?.title || data.title),
            description: (data._registryMetadata?.description || data.proposal_markdown || metadata?.description),
            outcomes: metadata?.outcomes,
            endTime: data._registryMetadata?.closeTimestamp || data.end_date || data.end_time, // Support both field names, prioritize Registry closeTimestamp
            // Extract display text from metadata if available
            // Registry displayNameQuestion = display_text_0 (title/question)
            // Registry displayNameEvent = display_text_1 (event name)
            display_text_0: (data._registryMetadata?.displayNameQuestion || metadata?.display_title_0 || metadata?.metadata?.display_title_0 || null),
            display_text_1: (data._registryMetadata?.displayNameEvent || metadata?.display_title_1 || metadata?.metadata?.display_title_1 || null),
            // Include fetchSpotPrice URL for custom price endpoints
            fetchSpotPrice: metadata?.fetchSpotPrice || null,
            // Include spot price for inversion logic
            spotPrice: metadata?.spotPrice || null,
            // Include coingecko_ticker from Registry metadata for external spot price (auto-discovery)
            coingecko_ticker: data._registryMetadata?.coingecko_ticker || null,
            // Include startCandleUnix from Registry metadata for chart filtering (auto-discovery)
            startCandleUnix: data._registryMetadata?.startCandleUnix || null,
            // Include closeTimestamp from Registry metadata
            closeTimestamp: data._registryMetadata?.closeTimestamp || null,
            // Include track progress link from metadata
            trackProgressLink: metadata?.trackProgressLink || null,
            // Off-by-default: only show the Prediction Market badge when explicitly enabled
            showPredictionMarket: metadata?.showPredictionMarket === true,
            // Optional arbitrage contract for this proposal — exposed as a Gnosisscan link
            arbitrageContractAddress: metadata?.arbitrageContractAddress || null,
            // Include question link from metadata (check both nested and direct paths)
            questionLink: metadata?.metadata?.question_link || metadata?.questionLink || null,
            // Add resolved status - only resolved if there's an actual outcome or resolution_status indicates completion
            // Fall back to _registryMetadata for resolution fields (market subgraph doesn't have these),
            // then to the on-chain ConditionalTokens payout state (metadata can lag behind resolution)
            resolved: metadataResolved || onChainResolution?.resolved === true,
            resolutionStatus: data.resolution_status || data._registryMetadata?.resolution_status
              || (onChainResolution?.resolved ? 'resolved' : null),
            finalOutcome: data.resolution_outcome || data._registryMetadata?.resolution_outcome || metadata?.finalOutcome
              || onChainResolution?.outcome || null,
            // TWAP configuration (prioritize Registry metadata, then direct metadata)
            twapStartTimestamp: data._registryMetadata?.twapStartTimestamp || metadata?.twapStartTimestamp || null,
            twapDurationHours: data._registryMetadata?.twapDurationHours || metadata?.twapDurationHours || 24,
            twapDescription: data._registryMetadata?.twapDescription || metadata?.twapDescription || null,
            // TWAP pool inversion flags (from Registry metadata)
            invertTwapPoolYes: data._registryMetadata?.invertTwapPoolYes || false,
            invertTwapPoolNo: data._registryMetadata?.invertTwapPoolNo || data._registryMetadata?.invertTwapPoolNO || false
          },

          // Include the full metadata for access to all fields
          metadata: metadata,

          // Include spot price for inversion logic
          spotPrice: metadata?.spotPrice || null,

          // Include precision settings
          precisions: metadata?.precisions || { main: 2 }, // Default to 2 if not specified

          // Proposal ownership info for edit permissions (from Registry)
          owner: data._registryMetadata?.owner || null,
          proposalMetadataAddress: data._registryMetadata?.proposalMetadataAddress || null,

          // TWAP configuration (from Registry metadata)
          twapDurationHours: data._registryMetadata?.twapDurationHours || null,
          twapStartTimestamp: data._registryMetadata?.twapStartTimestamp || null,
          twapDescription: data._registryMetadata?.twapDescription || null,

          // Full Registry metadata for direct access (e.g. snapshot_id)
          _registryMetadata: data._registryMetadata || null
        };

        setConfig(transformedConfig);
        setLoading(false);
        console.log('✅ Contract config loaded successfully', {
          title: data.title,
          chain: metadata?.chain,
          router: metadata?.contractInfos.futarchy.router
        });
      } catch (err) {
        console.error('🔴 Failed to fetch contract config:', err);
        setError(err);
        setLoading(false);
      }
    };

    fetchContractConfig();
  }, [proposalId, forceTestPools, refreshKey]);

  // Function to trigger a refetch of config (useful after pool creation)
  const refetch = useCallback(() => {
    console.log('[useContractConfig] Triggering config refetch...');
    setRefreshKey(k => k + 1);
  }, []);

  return { config, loading, error, refetch };
};

export default useContractConfig; 