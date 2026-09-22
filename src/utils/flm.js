import { ethers } from 'ethers';

import flmConfig from '../config/flm.json';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_CHAIN_ID_HEX = '0x64';
const GNOSIS_RPC_URL = process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';
const GNOSIS_EXPLORER_URL = 'https://gnosisscan.io';

const ADDRESS_OVERRIDES = {
    kleros: {
        managerAddress: process.env.NEXT_PUBLIC_KLEROS_FLM_MANAGER,
        proposalSourceAddress: process.env.NEXT_PUBLIC_KLEROS_FLM_PROPOSAL_SOURCE,
    },
    gnosis: {
        managerAddress: process.env.NEXT_PUBLIC_GNOSIS_FLM_MANAGER,
        proposalSourceAddress: process.env.NEXT_PUBLIC_GNOSIS_FLM_PROPOSAL_SOURCE,
    },
};

export const FULCRUM_TICK_LOWER = -887220;
export const FULCRUM_TICK_UPPER = 887220;

export const FLM_MANAGER_ABI = [
    'function activeProposal() view returns (address)',
    'function balanceOf(address) view returns (uint256)',
    'function conditionalNoLiquidity() view returns (uint128)',
    'function conditionalYesLiquidity() view returns (uint128)',
    'function decimals() view returns (uint8)',
    'function depositToSpot(uint256,uint256,bytes) returns (uint128,uint256)',
    'function inConditionalMode() view returns (bool)',
    'function name() view returns (string)',
    'function redeem(uint256,address,bool,bytes,bytes) returns (uint256,uint256)',
    'function spotLiquidity() view returns (uint128)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
];

export const ERC20_ABI = [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

function withAddressOverrides(config) {
    const overrides = ADDRESS_OVERRIDES[config.slug] || {};
    return {
        ...config,
        managerAddress: overrides.managerAddress || config.managerAddress,
        proposalSourceAddress: overrides.proposalSourceAddress || config.proposalSourceAddress,
    };
}

export function getFlmConfigs() {
    return flmConfig.map(withAddressOverrides);
}

export function getFlmConfigBySlug(slug) {
    const normalized = String(slug || '').toLowerCase();
    return getFlmConfigs().find((config) => config.slug === normalized) || null;
}

export function getFlmConfigByOrgId(orgId) {
    const normalized = String(orgId || '').toLowerCase();
    return getFlmConfigs().find((config) => {
        return String(config.companyId) === normalized
            || config.organizationAddress.toLowerCase() === normalized;
    }) || null;
}

export function getFlmPathForOrg(orgId) {
    return getFlmConfigByOrgId(orgId)?.path || null;
}

export function isConfiguredAddress(address) {
    return ADDRESS_RE.test(String(address || '')) && String(address).toLowerCase() !== ZERO_ADDRESS;
}

export function shortAddress(address) {
    if (!address) return 'Pending';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getGnosisExplorerAddressUrl(address) {
    return isConfiguredAddress(address) ? `${GNOSIS_EXPLORER_URL}/address/${address}` : null;
}

export function getGnosisExplorerTxUrl(hash) {
    return hash ? `${GNOSIS_EXPLORER_URL}/tx/${hash}` : null;
}

export function getReadOnlyGnosisProvider() {
    return new ethers.providers.JsonRpcProvider(GNOSIS_RPC_URL, GNOSIS_CHAIN_ID);
}

export async function getBrowserProvider() {
    if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No browser wallet was found.');
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();

    if (network.chainId !== GNOSIS_CHAIN_ID) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: GNOSIS_CHAIN_ID_HEX }],
            });
        } catch (error) {
            if (error?.code !== 4902) {
                throw error;
            }

            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: GNOSIS_CHAIN_ID_HEX,
                    chainName: 'Gnosis Chain',
                    nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 },
                    rpcUrls: [GNOSIS_RPC_URL],
                    blockExplorerUrls: [GNOSIS_EXPLORER_URL],
                }],
            });
        }
    }

    return new ethers.providers.Web3Provider(window.ethereum);
}

export function parseTokenAmount(value, decimals = 18) {
    const normalized = String(value || '').trim();
    if (!normalized) return ethers.constants.Zero;
    return ethers.utils.parseUnits(normalized, decimals);
}

export function formatTokenAmount(value, decimals = 18, precision = 6) {
    if (value === null || value === undefined) return '0';
    const formatted = ethers.utils.formatUnits(value, decimals);
    const [whole, fraction = ''] = formatted.split('.');
    const trimmedFraction = fraction.slice(0, precision).replace(/0+$/, '');
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function encodeAddParams({
    tickLower = FULCRUM_TICK_LOWER,
    tickUpper = FULCRUM_TICK_UPPER,
    amount0Min = '0',
    amount1Min = '0',
    deadline = '0',
    sqrtPriceX96 = '0',
} = {}) {
    return ethers.utils.defaultAbiCoder.encode(
        ['tuple(int24 tickLower,int24 tickUpper,uint256 amount0Min,uint256 amount1Min,uint256 deadline,uint160 sqrtPriceX96)'],
        [[tickLower, tickUpper, amount0Min, amount1Min, deadline, sqrtPriceX96]]
    );
}

export function encodeExitParams({
    amount0Min = '0',
    amount1Min = '0',
    deadline = '0',
} = {}) {
    return ethers.utils.defaultAbiCoder.encode(
        ['tuple(uint256 amount0Min,uint256 amount1Min,uint256 deadline)'],
        [[amount0Min, amount1Min, deadline]]
    );
}

export function encodeDualExitParams(yesExitData, noExitData) {
    return ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], [yesExitData, noExitData]);
}
