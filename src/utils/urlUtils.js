/**
 * URL Utilities
 * 
 * Centralized URL generation for consistent link formats across the app.
 */

import { USE_QUERY_PARAM_URLS } from '../config/featureFlags';
import { STATIC_MARKET_ADDRESSES } from '../config/marketAddresses';

// Lowercased address -> the exact key /markets/<address> was exported under.
const STATIC_MARKET_PATHS = new Map(
    STATIC_MARKET_ADDRESSES.map((address) => [address.toLowerCase(), address])
);

/**
 * Generate market page URL based on feature flag
 * 
 * @param {string} proposalId - The proposal/market address
 * @returns {string} - URL to the market page
 * 
 * When USE_QUERY_PARAM_URLS is true:
 *   /market?proposalId=0x123...
 * 
 * When USE_QUERY_PARAM_URLS is false:
 *   /markets/0x123... for markets with a static page (src/config/markets.js),
 *   /market?proposalId=0x123... for any other market, since the static
 *   export has no page for it.
 */
export function getMarketUrl(proposalId) {
    if (!proposalId) return '/';

    if (!USE_QUERY_PARAM_URLS) {
        const staticAddress = STATIC_MARKET_PATHS.get(String(proposalId).toLowerCase());
        if (staticAddress) return `/markets/${staticAddress}`;
    }

    return `/market?proposalId=${proposalId}`;
}

export default {
    getMarketUrl
};
