/**
 * RPC Endpoints
 *
 * One source of truth for which endpoints each chain uses, in priority order:
 * the configured endpoint first, a public one behind it as a fallback, so a
 * paid endpoint hitting its limit degrades instead of taking the app down.
 *
 * NEXT_PUBLIC_* values are inlined at build time, and this project builds
 * with `output: 'export'`, so a private endpoint has to be present in the
 * environment that runs the build — setting it at deploy time is too late.
 *
 * The list used to be duplicated across providers.jsx, getBestRpc.js and
 * activeMarketLiquidity.js, which drifted apart.
 */

export const RPC_ENDPOINTS = {
    1: [
        process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
        'https://ethereum-rpc.publicnode.com',
    ].filter(Boolean),
    100: [
        process.env.NEXT_PUBLIC_GNOSIS_RPC_URL,
        'https://rpc.gnosischain.com',
    ].filter(Boolean),
};

/**
 * Networks stated explicitly, so ethers and viem never spend a round trip
 * detecting what they are already configured for.
 */
export const RPC_NETWORKS = {
    1: { chainId: 1, name: 'homestead' },
    100: { chainId: 100, name: 'xdai' },
};

/**
 * The endpoint a chain reaches for first.
 * @param {number} chainId
 * @returns {string|undefined}
 */
export function getPrimaryRpcUrl(chainId) {
    return RPC_ENDPOINTS[chainId]?.[0];
}

export default RPC_ENDPOINTS;
