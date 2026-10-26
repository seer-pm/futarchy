import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '../constants/chainConfig';

// ERC20 ABI for fetching symbol and decimals
const ERC20_ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)'
];

// Regex for valid Ethereum address
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Hook for validating token addresses via RPC
 * Fetches symbol and decimals, validates decimals === 18
 */
export const useTokenValidation = (chainId) => {
    const [tokenInfo, setTokenInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const validateAddress = useCallback(async (address) => {
        // Reset state
        setTokenInfo(null);
        setError(null);

        // Empty address - clear state
        if (!address || address.length === 0) {
            return;
        }

        // Check regex first
        if (!ADDRESS_REGEX.test(address)) {
            if (address.length >= 10) {
                setError('Invalid address format');
            }
            return;
        }

        setIsLoading(true);

        try {
            // Get RPC for selected chain
            const chainConfig = CHAIN_CONFIG[chainId];
            if (!chainConfig) {
                setError('Invalid chain selected');
                setIsLoading(false);
                return;
            }

            // Use ethers v5 JsonRpcProvider
            const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
            const contract = new ethers.Contract(address, ERC20_ABI, provider);

            // Fetch token info with timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 10000)
            );

            const fetchPromise = Promise.all([
                contract.symbol(),
                contract.decimals(),
                contract.name().catch(() => null) // name() is optional
            ]);

            const [symbol, decimals, name] = await Promise.race([fetchPromise, timeoutPromise]);

            const decimalsNumber = Number(decimals);

            // Validate decimals === 18
            if (decimalsNumber !== 18) {
                setError(`Invalid: Must be 18 decimals (got ${decimalsNumber})`);
                setIsLoading(false);
                return;
            }

            // Success!
            setTokenInfo({
                address,
                symbol,
                decimals: decimalsNumber,
                name: name || symbol,
                isValid: true
            });
            setError(null);

        } catch (err) {
            console.error('Token validation error:', err);
            if (err.message === 'Timeout') {
                setError('Timeout - RPC not responding');
            } else {
                setError('Failed to fetch token - check address');
            }
        } finally {
            setIsLoading(false);
        }
    }, [chainId]);

    // Reset when chain changes
    useEffect(() => {
        setTokenInfo(null);
        setError(null);
    }, [chainId]);

    return {
        tokenInfo,
        isLoading,
        error,
        isValid: tokenInfo?.isValid === true,
        validateAddress
    };
};

export default useTokenValidation;
