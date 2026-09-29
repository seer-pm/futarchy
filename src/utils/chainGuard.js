/**
 * Whether a connected wallet is on a chain other than the one a market lives
 * on. Transactions built for that market (router, pools, token addresses) are
 * only valid on `requiredChainId`, so modals refuse to submit while this is
 * true. A disconnected wallet is not "wrong" — the connect flow handles it.
 */
export const isWrongChain = ({ isConnected, walletChainId, requiredChainId }) =>
  Boolean(isConnected && requiredChainId && Number(walletChainId) !== Number(requiredChainId));
