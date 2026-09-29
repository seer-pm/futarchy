import { buildRealityQuestionUrl } from '../../../utils/marketPageUtils.mjs';

// Multi-chain configuration for Create Proposal and Pool features
// Supports Ethereum (1) and Gnosis (100)

export const CHAIN_CONFIG = {
    1: {
        id: 1,
        name: 'Ethereum',
        rpcUrl: 'https://eth-mainnet.public.blastapi.io',
        factoryAddress: '0xf9369c0F7a84CAC3b7Ef78c837cF7313309D3678',
        adapterAddress: '0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc',
        positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        poolFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        amm: 'uniswap',
        defaultFeeTier: 3000,
        explorerUrl: 'https://etherscan.io',
        nativeCurrency: 'ETH',
        defaultTokens: {
            company: {
                address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                symbol: 'WETH'
            },
            currency: {
                address: '0x83F20F44975D03b1B09E64809B757C47f942BEeA',
                symbol: 'sDAI'
            }
        }
    },
    100: {
        id: 100,
        name: 'Gnosis',
        rpcUrl: 'https://rpc.gnosischain.com',
        factoryAddress: '0xa6cB18FCDC17a2B44E5cAd2d80a6D5942d30a345',
        adapterAddress: '0x7495a583ba85875d59407781b4958ED6e0E1228f',
        positionManager: '0x91fd594c46d8b01e62dbdebed2401dde01817834',
        poolFactory: null, // Algebra uses different mechanism
        amm: 'algebra',
        defaultFeeTier: null, // Algebra uses dynamic fees
        explorerUrl: 'https://gnosisscan.io',
        nativeCurrency: 'xDAI',
        defaultTokens: {
            company: {
                address: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
                symbol: 'GNO'
            },
            currency: {
                address: '0xaf204776c7245bF4147c2612BF6e5972Ee483701',
                symbol: 'sDAI'
            }
        }
    }
};

// Min bond presets (user-friendly instead of wei)
export const MIN_BOND_PRESETS = [
    { label: '0.01', value: '10000000000000000', wei: 10000000000000000n },
    { label: '0.1', value: '100000000000000000', wei: 100000000000000000n },
    { label: '1', value: '1000000000000000000', wei: 1000000000000000000n },
    { label: '10', value: '10000000000000000000', wei: 10000000000000000000n },
];

// Category presets
export const CATEGORY_PRESETS = [
    { value: 'crypto', label: 'Crypto' },
    { value: 'governance', label: 'Governance' },
    { value: 'defi', label: 'DeFi' },
    { value: 'other', label: 'Other' }
];

// Language presets
export const LANGUAGE_PRESETS = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' }
];

// Helper to get explorer links
export const getExplorerTxUrl = (chainId, txHash) =>
    `${CHAIN_CONFIG[chainId]?.explorerUrl}/tx/${txHash}`;

export const getExplorerAddressUrl = (chainId, address) =>
    `${CHAIN_CONFIG[chainId]?.explorerUrl}/address/${address}`;

// Reality.eth contract addresses per chain
export const REALITY_CONFIG = {
    1: {
        contract: '0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c',
        token: 'ETH'
    },
    100: {
        contract: '0xE78996A233895bE74a66F451f1019cA9734205cc',
        token: 'XDAI'
    }
};

/**
 * Fetch questionId from proposal contract via RPC
 * @param {number} chainId - Chain ID (1 or 100)
 * @param {string} proposalAddress - The proposal contract address
 * @returns {Promise<string|null>} - The questionId or null
 */
export const fetchQuestionId = async (chainId, proposalAddress) => {
    const rpcUrl = CHAIN_CONFIG[chainId]?.rpcUrl;
    if (!rpcUrl || !proposalAddress) return null;

    try {
        // questionId() function selector: 0xb06a5c52
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: proposalAddress,
                    data: '0xb06a5c52' // questionId() selector
                }, 'latest'],
                id: 1
            })
        });

        const result = await response.json();
        if (result.result && result.result !== '0x') {
            return result.result; // Returns the questionId (bytes32)
        }
        return null;
    } catch (error) {
        console.error('Error fetching questionId:', error);
        return null;
    }
};

/**
 * Generate Reality.eth question URL (async - fetches questionId from RPC)
 * @param {number} chainId - Chain ID (1 or 100)
 * @param {string} proposalAddress - The proposal contract address
 * @returns {Promise<string|null>} - The Reality.eth URL or null if not supported
 */
export const getRealityQuestionUrl = async (chainId, proposalAddress) => {
    const config = REALITY_CONFIG[chainId];
    if (!config || !proposalAddress) return null;

    const questionId = await fetchQuestionId(chainId, proposalAddress);
    if (!questionId) return null;

    return buildRealityQuestionUrl(chainId, config.contract, questionId);
};

/**
 * Generate Reality.eth question URL (sync - uses provided questionId)
 * @param {number} chainId - Chain ID (1 or 100)
 * @param {string} questionId - The questionId (bytes32)
 * @returns {string|null} - The Reality.eth URL or null if not supported
 */
export const getRealityQuestionUrlSync = (chainId, questionId) => {
    const config = REALITY_CONFIG[chainId];
    if (!config || !questionId) return null;

    return buildRealityQuestionUrl(chainId, config.contract, questionId);
};

// Default chain
export const DEFAULT_CHAIN_ID = 100;
