/**
 * Registry Subgraph Adapter
 * Queries futarchy-complete-new for ProposalEntity metadata
 */

import { AGGREGATOR_SUBGRAPH_URL as REGISTRY_SUBGRAPH_URL } from '../config/subgraphEndpoints';
import { cachedOnce } from '../services/requestCache';

// Default Aggregator address (Futarchy Finance production)
const DEFAULT_AGGREGATOR = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';

/**
 * Fetch ProposalMetadata from Registry by proposalAddress (trading contract)
 * Only returns proposals from organizations registered in the Default Aggregator
 * @param {string} proposalAddress - The trading contract address (from URL)
 * @returns {Promise<Object|null>} - ProposalEntity or null
 */
export function fetchProposalMetadataFromRegistry(proposalAddress) {
    if (!proposalAddress || !/^0x[a-fA-F0-9]{40}$/.test(proposalAddress)) {
        console.log('[Registry] Invalid proposal address:', proposalAddress);
        return Promise.resolve(null);
    }

    const normalizedAddress = proposalAddress.toLowerCase();

    // Every useContractConfig instance on a market page asks for this, and the
    // market page mounts several. Share one request between them.
    return cachedOnce(
        `registry:proposal:${normalizedAddress}`,
        () => queryProposalMetadata(normalizedAddress)
    );
}

async function queryProposalMetadata(normalizedAddress) {

    // Filter by proposalAddress and verify the aggregator client-side.
    // Graph Node does support nested-relation filters
    // (`organization_: { aggregator: ... }`), so this could be pushed into
    // the query, but the client-side check is what the callers already
    // depend on and the result set here is at most 5 rows.
    const query = `{
    proposalEntities(
      where: { proposalAddress: "${normalizedAddress}" },
      first: 5
    ) {
      id
      proposalAddress
      metadata
      title
      description
      displayNameQuestion
      displayNameEvent
      owner
      organization {
        id
        name
        aggregator { id }
      }
    }
  }`;

    try {
        console.log('[Registry] Querying for proposalAddress:', normalizedAddress);

        const response = await fetch(REGISTRY_SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();
        const matchingAgg = DEFAULT_AGGREGATOR.toLowerCase();
        const entity = (result.data?.proposalEntities || []).find(
            e => e.organization?.aggregator?.id?.toLowerCase() === matchingAgg
        ) || null;

        if (entity) {
            console.log('[Registry] Found ProposalMetadata:', entity.id);
        } else {
            console.log('[Registry] No ProposalMetadata found for this address');
        }

        return entity;
    } catch (error) {
        console.error('[Registry] Query failed:', error.message);
        return null;
    }
}

/**
 * Extract chain ID from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {number|null} - Chain ID (1 or 100) or null
 */
export function extractChainFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const chain = meta?.chain;

        // Handle both number and string formats (100 or "100")
        const chainInt = typeof chain === 'string' ? parseInt(chain) : chain;

        if (chainInt && (chainInt === 1 || chainInt === 100)) {
            console.log('[Registry] Extracted chain from metadata:', chainInt);
            return chainInt;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata:', error.message);
        return null;
    }
}

/**
 * Extract spot price ticker (coingecko_ticker) from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {string|null} - Spot price ticker string or null
 */
export function extractSpotPriceFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const ticker = meta?.coingecko_ticker;

        if (ticker && typeof ticker === 'string') {
            console.log('[Registry] Extracted coingecko_ticker from metadata:', ticker.slice(0, 30) + '...');
            return ticker;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for spotPrice:', error.message);
        return null;
    }
}

/**
 * Extract startCandleUnix from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {number|null} - Unix timestamp or null
 */
export function extractStartCandleFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const startCandle = meta?.startCandleUnix;

        // Handle both number and string formats
        const startCandleInt = typeof startCandle === 'string' ? parseInt(startCandle) : startCandle;

        if (startCandleInt && typeof startCandleInt === 'number' && !isNaN(startCandleInt)) {
            console.log('[Registry] Extracted startCandleUnix from metadata:', startCandleInt, '→', new Date(startCandleInt * 1000).toISOString());
            return startCandleInt;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for startCandleUnix:', error.message);
        return null;
    }
}

/**
 * Extract closeTimestamp from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {number|null} - Unix timestamp (seconds) or null
 */
export function extractCloseTimestampFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const closeTimestamp = meta?.closeTimestamp;

        // Handle both number and string formats
        const timestampInt = typeof closeTimestamp === 'string' ? parseInt(closeTimestamp) : closeTimestamp;

        if (timestampInt && typeof timestampInt === 'number' && !isNaN(timestampInt)) {
            // Ensure we are returning seconds for the Subgraph components.
            // If it looks like milliseconds (large number, > 10000000000), divide by 1000
            if (timestampInt > 10000000000) {
                const asSeconds = Math.floor(timestampInt / 1000);
                console.log('[Registry] Extracted closeTimestamp from metadata (ms -> s):', asSeconds, '→', new Date(asSeconds * 1000).toISOString());
                return asSeconds;
            }
            console.log('[Registry] Extracted closeTimestamp from metadata:', timestampInt, '→', new Date(timestampInt * 1000).toISOString());
            return timestampInt;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for closeTimestamp:', error.message);
        return null;
    }
}

/**
 * Extract TWAP configuration from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {Object|null} - TWAP config { twapDurationHours, twapStartTimestamp, twapDescription, invertTwapPoolYes, invertTwapPoolNo } or null
 */
export function extractTwapFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        // Check if any TWAP fields exist
        const hasTwapFields = meta?.twapDurationHours || meta?.twapStartTimestamp || meta?.twapDescription;
        if (!hasTwapFields) {
            return null;
        }

        const twapConfig = {
            twapDurationHours: meta.twapDurationHours ? parseInt(meta.twapDurationHours) : null,
            twapStartTimestamp: meta.twapStartTimestamp ? parseInt(meta.twapStartTimestamp) : null,
            twapDescription: meta.twapDescription || null,
            // Pool inversion flags - used to determine if TWAP price needs to be inverted
            // true means company token is token1 (slot 1), so price needs inversion
            invertTwapPoolYes: meta.invertTwapPoolYes === true || meta.invertTwapPoolYes === 'true',
            invertTwapPoolNo: meta.invertTwapPoolNo === true || meta.invertTwapPoolNo === 'true' || meta.invertTwapPoolNO === true || meta.invertTwapPoolNO === 'true'
        };

        console.log('[Registry] Extracted TWAP config from metadata:', twapConfig);
        return twapConfig;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for TWAP config:', error.message);
        return null;
    }
}

/**
 * Extract resolution status and outcome from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {Object|null} - { resolution_status, resolution_outcome } or null
 */
export function extractResolutionFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const resolutionStatus = meta?.resolution_status;
        const resolutionOutcome = meta?.resolution_outcome;

        if (resolutionStatus || resolutionOutcome) {
            console.log('[Registry] Extracted resolution from metadata:', { resolutionStatus, resolutionOutcome });
            return {
                resolution_status: resolutionStatus || null,
                resolution_outcome: resolutionOutcome || null
            };
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for resolution:', error.message);
        return null;
    }
}

/**
 * Extract snapshot_id from ProposalEntity metadata
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {string|null} - Snapshot proposal ID or null
 */
export function extractSnapshotIdFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const snapshotId = meta?.snapshot_id;

        if (snapshotId && typeof snapshotId === 'string') {
            console.log('[Registry] Extracted snapshot_id from metadata:', snapshotId);
            return snapshotId;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for snapshot_id:', error.message);
        return null;
    }
}

/**
 * Extract display configurations from ProposalEntity metadata
 * Dynamically finds any properties starting with 'display_' (e.g. 'display_main')
 * and returns them as a nested object (e.g. { main: 1 })
 * @param {Object} proposalEntity - The ProposalEntity from Registry
 * @returns {Object|null} - Nested display object or null
 */
export function extractDisplayConfigFromMetadata(proposalEntity) {
    if (!proposalEntity?.metadata) {
        return null;
    }

    try {
        const meta = typeof proposalEntity.metadata === 'string'
            ? JSON.parse(proposalEntity.metadata)
            : proposalEntity.metadata;

        const displayConfig = {};
        let hasDisplayConfig = false;

        // Loop through all keys looking for 'display_' prefix
        for (const key in meta) {
            if (key.startsWith('display_')) {
                // Ignore title properties that are already explicitly handled
                // (e.g., display_text_0, display_title_0)
                if (key.includes('title') || key.includes('text')) {
                    continue;
                }

                // Strip the "display_" prefix
                const displayKey = key.slice(8); // 'display_'.length === 8

                // Keep the original value (numbers, etc)
                displayConfig[displayKey] = meta[key];
                hasDisplayConfig = true;
            }
        }

        if (hasDisplayConfig) {
            console.log('[Registry] Extracted dynamic display config from metadata:', displayConfig);
            return displayConfig;
        }

        return null;
    } catch (error) {
        console.error('[Registry] Failed to parse metadata for display config:', error.message);
        return null;
    }
}
