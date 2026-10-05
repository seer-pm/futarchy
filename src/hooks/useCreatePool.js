/**
 * useCreatePool Hook
 * 
 * Handles pool creation for Futarchy markets via Uniswap V3 (Chain 1) or Algebra (Chain 100).
 * No token approval needed for pool creation - only creates and initializes the pool.
 */

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useConfig, useSwitchChain } from 'wagmi';
import { getPublicClient, getWalletClient } from 'wagmi/actions';
import { parseAbi, toEventSelector } from 'viem';
import { assertReceiptSucceeded } from '../utils/txErrors';
import { CHAIN_CONFIG, getExplorerTxUrl } from '../components/debug/constants/chainConfig';

// Position Manager ABI - different for Uniswap V3 vs Algebra
const UNISWAP_V3_NFPM_ABI = [
    'function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)'
];

const ALGEBRA_NFPM_ABI = [
    'function createAndInitializePoolIfNecessary(address token0, address token1, uint160 sqrtPriceX96) external payable returns (address pool)'
];

/**
 * Convert price to sqrtPriceX96
 * @param {number} price - Price as token1 per token0
 * @returns {bigint} sqrtPriceX96
 */
function priceToSqrtPriceX96(price) {
    const sqrtPrice = Math.sqrt(price);
    const Q96 = 2n ** 96n;
    return BigInt(Math.floor(sqrtPrice * Number(Q96)));
}

/**
 * Get AMM token order (lower address first)
 * @param {string} token0 - Logical token0 address
 * @param {string} token1 - Logical token1 address
 * @returns {{ ammToken0: string, ammToken1: string, needsReorder: boolean }}
 */
function getAMMOrder(token0, token1) {
    const t0Lower = token0.toLowerCase();
    const t1Lower = token1.toLowerCase();
    const needsReorder = t0Lower > t1Lower;

    return {
        ammToken0: needsReorder ? token1 : token0,
        ammToken1: needsReorder ? token0 : token1,
        needsReorder
    };
}

export function useCreatePool() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChainAsync } = useSwitchChain();
    const wagmiConfig = useConfig();

    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const [txHash, setTxHash] = useState(null);
    const [poolAddress, setPoolAddress] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    /**
     * Create a pool with the given token pair and initial price
     * @param {Object} params
     * @param {string} params.token0 - First token address (logical)
     * @param {string} params.token1 - Second token address (logical)
     * @param {number} params.initialPrice - Price as token1 per token0
     * @param {number} params.targetChainId - Target chain ID (1 or 100)
     * @param {number} [params.feeTier=3000] - Fee tier for Uniswap V3 (ignored for Algebra)
     */
    const createPool = useCallback(async ({
        token0,
        token1,
        initialPrice,
        targetChainId,
        feeTier = 3000
    }) => {
        if (!isConnected || !address) {
            setStatus({ type: 'error', message: 'Please connect your wallet' });
            return null;
        }

        const config = CHAIN_CONFIG[targetChainId];
        if (!config) {
            setStatus({ type: 'error', message: `Unsupported chain: ${targetChainId}` });
            return null;
        }

        setIsCreating(true);
        setTxHash(null);
        setPoolAddress(null);

        try {
            // Switch chain if needed
            if (chainId !== targetChainId) {
                setStatus({ type: 'pending', message: `Switching to ${config.name}...` });
                await switchChainAsync({ chainId: targetChainId });
                // Wait a bit for chain switch to propagate
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // The connected wallet's client for the target chain. (This used to
            // sign through window.ethereum, which is whichever extension won the
            // injection race, not necessarily the wallet the user connected.)
            // It throws if the wallet is still on another chain.
            const walletClient = await getWalletClient(wagmiConfig, { chainId: targetChainId });
            const publicClient = getPublicClient(wagmiConfig, { chainId: targetChainId });

            // Get AMM token order
            const { ammToken0, ammToken1, needsReorder } = getAMMOrder(token0, token1);

            // Calculate sqrtPriceX96 (adjust for token order)
            const ammPrice = needsReorder ? (1 / initialPrice) : initialPrice;
            const sqrtPriceX96 = priceToSqrtPriceX96(ammPrice);

            console.log('[useCreatePool] Creating pool:', {
                ammToken0,
                ammToken1,
                logicalPrice: initialPrice,
                ammPrice,
                sqrtPriceX96: sqrtPriceX96.toString(),
                needsReorder,
                amm: config.amm
            });

            setStatus({ type: 'pending', message: 'Creating pool transaction...' });

            // Call createAndInitializePoolIfNecessary; the wallet estimates gas.
            const isUniswap = config.amm === 'uniswap';
            const hash = await walletClient.writeContract({
                address: config.positionManager,
                abi: parseAbi(isUniswap ? UNISWAP_V3_NFPM_ABI : ALGEBRA_NFPM_ABI),
                functionName: 'createAndInitializePoolIfNecessary',
                // Algebra has no fee tier
                args: isUniswap
                    ? [ammToken0, ammToken1, feeTier || config.defaultFeeTier || 3000, sqrtPriceX96]
                    : [ammToken0, ammToken1, sqrtPriceX96],
            });

            setTxHash(hash);
            setStatus({ type: 'pending', message: 'Waiting for confirmation...' });

            console.log('[useCreatePool] Transaction submitted:', hash);

            // Wait for confirmation
            const receipt = assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);

            // Try to extract pool address from Initialize event
            let createdPoolAddress = null;
            const initTopic = toEventSelector('Initialize(uint160,int24)');
            for (const log of (receipt.logs || [])) {
                if (log.topics && log.topics[0] === initTopic && log.address) {
                    createdPoolAddress = log.address;
                    console.log('[useCreatePool] Found pool from Initialize event:', createdPoolAddress);
                    break;
                }
            }

            setPoolAddress(createdPoolAddress);
            setStatus({
                type: 'success',
                message: `Pool created successfully!${createdPoolAddress ? ` Address: ${createdPoolAddress.slice(0, 10)}...` : ''}`
            });

            return {
                txHash: hash,
                poolAddress: createdPoolAddress,
                receipt
            };

        } catch (error) {
            console.error('[useCreatePool] Error:', error);

            let errorMessage = 'Pool creation failed';
            if (error.reason) {
                errorMessage = error.reason;
            } else if (error.message) {
                if (error.message.includes('user rejected')) {
                    errorMessage = 'Transaction rejected by user';
                } else if (error.message.includes('insufficient funds')) {
                    errorMessage = 'Insufficient funds for gas';
                } else {
                    errorMessage = error.message.slice(0, 100);
                }
            }

            setStatus({ type: 'error', message: errorMessage });
            return null;
        } finally {
            setIsCreating(false);
        }
    }, [isConnected, address, chainId, switchChainAsync, wagmiConfig]);

    /**
     * Reset the hook state
     */
    const reset = useCallback(() => {
        setStatus({ type: 'idle', message: '' });
        setTxHash(null);
        setPoolAddress(null);
        setIsCreating(false);
    }, []);

    /**
     * Get explorer link for transaction
     */
    const getExplorerLink = useCallback((targetChainId) => {
        if (!txHash || !targetChainId) return null;
        return getExplorerTxUrl(targetChainId, txHash);
    }, [txHash]);

    return {
        createPool,
        reset,
        getExplorerLink,
        status,
        txHash,
        poolAddress,
        isCreating,
        isConnected
    };
}

export default useCreatePool;
