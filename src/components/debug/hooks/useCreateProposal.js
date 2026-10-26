import { useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { CHAIN_CONFIG, getExplorerTxUrl, getExplorerAddressUrl } from '../constants/chainConfig';
import { getEthersSigner } from '../../../utils/ethersAdapters';

// Futarchy Factory ABI
const FUTARCHY_FACTORY_ABI = [
    'function createProposal((string,address,address,string,string,uint256,uint32)) returns (address)',
    'function proposals(uint256) view returns (address)',
    'function marketsCount() view returns (uint256)'
];

/**
 * Hook for creating Futarchy proposals with multi-chain support
 * Uses wagmi + ethersAdapters pattern from ConfirmSwapModal
 */
export const useCreateProposal = () => {
    const { address: userAddress, isConnected } = useAccount();
    const currentChainId = useChainId();
    const { switchChainAsync } = useSwitchChain();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'info'|'error'|'success', message: string }
    const [transactionHash, setTransactionHash] = useState(null);
    const [proposalAddress, setProposalAddress] = useState(null);

    // Get signer using the ethersAdapters pattern
    const signer = useMemo(() => {
        if (!walletClient) return null;
        return getEthersSigner(walletClient, publicClient);
    }, [walletClient, publicClient]);

    // Get default form values
    const getDefaultFormData = useCallback((chainId = 100) => {
        const chainConfig = CHAIN_CONFIG[chainId];
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

        return {
            chainId,
            marketName: '',
            companyToken: chainConfig?.defaultTokens?.company?.address || '',
            currencyToken: chainConfig?.defaultTokens?.currency?.address || '',
            category: 'crypto',
            language: 'en',
            minBond: '1000000000000000000', // 1 token
            openingTime: threeMonthsFromNow.toISOString().slice(0, 16) // datetime-local format
        };
    }, []);

    // Validate form data
    const validateForm = useCallback((formData) => {
        if (!formData.marketName?.trim()) {
            return { isValid: false, error: 'Market name is required' };
        }
        if (!formData.companyToken || !/^0x[a-fA-F0-9]{40}$/.test(formData.companyToken)) {
            return { isValid: false, error: 'Invalid company token address' };
        }
        if (!formData.currencyToken || !/^0x[a-fA-F0-9]{40}$/.test(formData.currencyToken)) {
            return { isValid: false, error: 'Invalid currency token address' };
        }
        if (!formData.openingTime) {
            return { isValid: false, error: 'Opening time is required' };
        }
        return { isValid: true };
    }, []);

    // Main creation function
    const createProposal = useCallback(async (formData) => {
        // Validate
        const validation = validateForm(formData);
        if (!validation.isValid) {
            setStatus({ type: 'error', message: validation.error });
            return { success: false, error: validation.error };
        }

        // Check wallet
        if (!isConnected || !userAddress) {
            const error = 'Please connect your wallet first';
            setStatus({ type: 'error', message: error });
            return { success: false, error };
        }

        if (!signer) {
            const error = 'Wallet not ready. Please try again.';
            setStatus({ type: 'error', message: error });
            return { success: false, error };
        }

        setIsSubmitting(true);
        setStatus(null);
        setTransactionHash(null);
        setProposalAddress(null);

        try {
            const targetChainId = formData.chainId;
            const chainConfig = CHAIN_CONFIG[targetChainId];

            if (!chainConfig) {
                throw new Error(`Invalid chain: ${targetChainId}`);
            }

            // Switch chain if needed
            if (currentChainId !== targetChainId) {
                setStatus({ type: 'info', message: `Switching to ${chainConfig.name}...` });
                try {
                    await switchChainAsync({ chainId: targetChainId });
                    // Wait a bit for the switch to fully propagate
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (switchError) {
                    throw new Error(`Failed to switch to ${chainConfig.name}: ${switchError.message}`);
                }
            }

            setStatus({ type: 'info', message: 'Preparing transaction...' });

            // Get fresh provider and signer directly from window.ethereum
            // This ensures we have the correct chain context after any switch
            if (!window.ethereum) {
                throw new Error('No wallet found. Please install MetaMask or another wallet.');
            }

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const freshSigner = provider.getSigner();

            // Verify we're on the correct chain
            const network = await provider.getNetwork();
            if (network.chainId !== targetChainId) {
                throw new Error(`Chain mismatch. Expected ${chainConfig.name} (${targetChainId}), but wallet is on chain ${network.chainId}. Please switch manually.`);
            }

            // Create factory contract with fresh signer
            const factory = new ethers.Contract(
                chainConfig.factoryAddress,
                FUTARCHY_FACTORY_ABI,
                freshSigner
            );

            // Convert opening time to unix timestamp
            const openingTimeUnix = Math.floor(new Date(formData.openingTime).getTime() / 1000);

            // Prepare proposal parameters (tuple)
            const params = [
                formData.marketName,
                formData.companyToken,
                formData.currencyToken,
                formData.category,
                formData.language,
                formData.minBond,
                openingTimeUnix
            ];

            console.log('Creating proposal with params:', params);
            console.log('Factory address:', chainConfig.factoryAddress);

            setStatus({ type: 'info', message: 'Please confirm in your wallet...' });

            // Send transaction
            const tx = await factory.createProposal(params);
            setTransactionHash(tx.hash);
            setStatus({
                type: 'info',
                message: 'Transaction submitted! Waiting for confirmation...'
            });

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log('Transaction confirmed:', receipt);

            // Get new proposal address
            let newProposalAddress = null;

            // Try to parse event logs first
            try {
                const iface = new ethers.utils.Interface([
                    'event ProposalCreated(address indexed proposal, string marketName)'
                ]);
                for (const log of receipt.logs) {
                    try {
                        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
                        if (parsed && parsed.name === 'ProposalCreated') {
                            newProposalAddress = parsed.args[0];
                            break;
                        }
                    } catch { }
                }
            } catch { }

            // Fallback: get from marketsCount
            if (!newProposalAddress) {
                try {
                    const count = await factory.marketsCount();
                    if (count.gt(0)) {
                        newProposalAddress = await factory.proposals(count.sub(1));
                    }
                } catch (e) {
                    console.error('Failed to get proposal address:', e);
                }
            }

            setProposalAddress(newProposalAddress);
            setStatus({
                type: 'success',
                message: newProposalAddress
                    ? `Proposal created successfully!`
                    : 'Transaction confirmed! Check explorer for proposal address.'
            });

            return {
                success: true,
                transactionHash: tx.hash,
                proposalAddress: newProposalAddress,
                explorerTxUrl: getExplorerTxUrl(targetChainId, tx.hash),
                explorerAddressUrl: newProposalAddress
                    ? getExplorerAddressUrl(targetChainId, newProposalAddress)
                    : null
            };

        } catch (error) {
            console.error('Create proposal error:', error);

            let errorMessage = 'Failed to create proposal: ';
            if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
                errorMessage = 'Transaction rejected by user';
            } else if (error.reason) {
                errorMessage += error.reason;
            } else if (error.shortMessage) {
                errorMessage += error.shortMessage;
            } else {
                errorMessage += error.message;
            }

            setStatus({ type: 'error', message: errorMessage });
            return { success: false, error: errorMessage };

        } finally {
            setIsSubmitting(false);
        }
    }, [isConnected, userAddress, signer, currentChainId, switchChainAsync, validateForm]);

    // Reset state
    const reset = useCallback(() => {
        setIsSubmitting(false);
        setStatus(null);
        setTransactionHash(null);
        setProposalAddress(null);
    }, []);

    return {
        // State
        isSubmitting,
        status,
        transactionHash,
        proposalAddress,
        isConnected,
        userAddress,
        currentChainId,

        // Functions
        getDefaultFormData,
        validateForm,
        createProposal,
        reset,

        // Helpers
        getExplorerTxUrl: (chainId, hash) => getExplorerTxUrl(chainId, hash || transactionHash),
        getExplorerAddressUrl: (chainId, addr) => getExplorerAddressUrl(chainId, addr || proposalAddress)
    };
};

export default useCreateProposal;
