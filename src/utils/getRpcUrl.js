import { ethers } from 'ethers';

// List of reliable Gnosis Chain RPC endpoints
// A private endpoint from NEXT_PUBLIC_RPC_URL is tried first; the public
// ones stay behind it as fallbacks.
const GNOSIS_RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://rpc.ankr.com/gnosis",
  "https://gnosis.drpc.org",
  "https://gnosis-rpc.publicnode.com",
  "https://1rpc.io/gnosis"
].filter(Boolean);

// List of Ethereum mainnet RPC endpoints
const ETHEREUM_RPCS = [
  "https://eth.drpc.org",
  "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
  "https://rpc.ankr.com/eth",
];

/**
 * Get RPC URLs based on chain ID
 * @param {number} chainId - Chain ID (1 for Ethereum, 100 for Gnosis)
 * @returns {string[]} Array of RPC URLs for the chain
 */
export function getRpcUrls(chainId) {
  switch (chainId) {
    case 1:
      return ETHEREUM_RPCS;
    case 100:
      return GNOSIS_RPCS;
    default:
      // Default to Gnosis for futarchy contracts
      return GNOSIS_RPCS;
  }
}

/**
 * Get the first RPC URL for a chain
 * @param {number} chainId - Chain ID
 * @returns {string} First RPC URL for the chain
 */
export function getRpcUrl(chainId) {
  const urls = getRpcUrls(chainId);
  return urls[0];
}

/**
 * Create a provider for the given chain
 * @param {number} chainId - Chain ID
 * @returns {ethers.providers.JsonRpcProvider} Provider for the chain
 */
export function createProvider(chainId) {
  const rpcUrl = getRpcUrl(chainId);
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

/**
 * Create a provider with fallback RPCs
 * @param {number} chainId - Chain ID
 * @returns {Promise<ethers.providers.JsonRpcProvider>} Working provider for the chain
 */
export async function createProviderWithFallback(chainId) {
  const rpcUrls = getRpcUrls(chainId);

  for (const rpcUrl of rpcUrls) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      // Test the connection
      await provider.getBlockNumber();
      console.log(`[RPC] Successfully connected to ${rpcUrl}`);
      return provider;
    } catch (error) {
      console.log(`[RPC] Failed to connect to ${rpcUrl}:`, error.message);
    }
  }

  throw new Error(`All RPC endpoints failed for chain ${chainId}`);
}