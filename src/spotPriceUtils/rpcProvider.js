/**
 * Spot Price Utils - RPC Provider
 * 
 * Uses ethers v5.7.2 (same as root package.json)
 * Simplified version of getBestRpc for CLI usage (no CORS)
 * 
 * Chain IDs:
 *   100 = Gnosis Chain
 *   1   = Ethereum Mainnet
 */

const { ethers } = require('ethers');

// RPC lists by chain ID
const RPC_LISTS = {
    1: [ // Ethereum Mainnet
        'https://ethereum-rpc.publicnode.com',
        'https://1rpc.io/eth'
    ],
    100: [ // Gnosis Chain
        'https://rpc.gnosischain.com',
        'https://gnosis-rpc.publicnode.com',
        'https://1rpc.io/gnosis'
    ]
};

/**
 * Get the best RPC for a chain (tests all, returns fastest)
 */
async function getBestRpc(chainId) {
    const rpcs = RPC_LISTS[chainId];

    if (!rpcs || rpcs.length === 0) {
        throw new Error(`No RPCs for chain ${chainId}`);
    }

    console.log(`[RPC] Testing ${rpcs.length} endpoints for chain ${chainId}...`);

    const results = await Promise.all(rpcs.map(async (url) => {
        const start = Date.now();
        try {
            const provider = new ethers.providers.JsonRpcProvider(url);
            await provider.getBlockNumber();
            const latency = Date.now() - start;
            console.log(`  ✅ ${url} - ${latency}ms`);
            return { url, latency, success: true };
        } catch (err) {
            console.log(`  ❌ ${url} - ${err.message}`);
            return { url, success: false };
        }
    }));

    const working = results.filter(r => r.success).sort((a, b) => a.latency - b.latency);

    if (working.length === 0) {
        console.warn(`[RPC] All failed, using fallback: ${rpcs[0]}`);
        return rpcs[0];
    }

    console.log(`[RPC] Best: ${working[0].url} (${working[0].latency}ms)`);
    return working[0].url;
}

/**
 * Get ethers provider for chain
 */
async function getProvider(chainId) {
    const rpcUrl = await getBestRpc(chainId);
    return new ethers.providers.JsonRpcProvider(rpcUrl);
}

/**
 * Get provider directly from URL (no testing)
 */
function getProviderDirect(chainId) {
    const rpcs = RPC_LISTS[chainId];
    if (!rpcs || rpcs.length === 0) {
        throw new Error(`No RPCs for chain ${chainId}`);
    }
    return new ethers.providers.JsonRpcProvider(rpcs[0]);
}

module.exports = {
    getBestRpc,
    getProvider,
    getProviderDirect,
    RPC_LISTS,
};
