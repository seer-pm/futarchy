/**
 * ProposalLinkModal
 * 
 * Modal for managing proposals on an organization:
 * - Search existing proposals by marketName
 * - Link proposal by address
 * - View linked proposals
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi';
import { useSearchProposals } from '../../hooks/useSearchProposals';

// Gnosis Chain ID (all org transactions happen here)
const GNOSIS_CHAIN_ID = 100;

// ABI for Organization.addProposal and removeProposal
const ORGANIZATION_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_proposal", "type": "address" }
        ],
        "name": "addProposal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "_proposal", "type": "address" }
        ],
        "name": "removeProposal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

/**
 * ProposalLinkModal Component
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Called when modal should close
 * @param {string} props.organizationAddress - The org contract address
 * @param {number} props.chainId - Chain for proposal search (from org metadata)
 * @param {Array} props.linkedProposals - Currently linked proposals from org
 * @param {Function} props.onSuccess - Called after successful link/unlink
 */
export function ProposalLinkModal({
    isOpen,
    onClose,
    organizationAddress,
    chainId = 100,
    linkedProposals = [],
    onSuccess
}) {
    // Tabs
    const [activeTab, setActiveTab] = useState('linked'); // 'linked' | 'search' | 'link'

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const { proposals, loading: searchLoading, error: searchError, search, loadRecent } = useSearchProposals(chainId);

    // Link state
    const [proposalAddress, setProposalAddress] = useState('');
    const [linkError, setLinkError] = useState(null);

    // Chain switching
    const currentChainId = useChainId();
    const { switchChainAsync } = useSwitchChain();

    // Contract write
    const {
        data: linkHash,
        writeContract: linkProposal,
        isPending: isLinking,
        error: wagmiError
    } = useWriteContract();

    const { isSuccess: linkSuccess } = useWaitForTransactionReceipt({
        hash: linkHash
    });

    // Load recent proposals on mount
    useEffect(() => {
        if (isOpen && activeTab === 'search') {
            loadRecent();
        }
    }, [isOpen, activeTab, loadRecent]);

    // Handle search input
    useEffect(() => {
        const debounce = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                search(searchQuery);
            }
        }, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, search]);

    // Handle wagmi errors
    useEffect(() => {
        if (wagmiError) {
            const msg = wagmiError.message || 'Transaction failed';
            setLinkError(
                msg.includes('User rejected') || msg.includes('denied')
                    ? 'You cancelled the transaction'
                    : msg.length > 100 ? msg.slice(0, 100) + '...' : msg
            );
        }
    }, [wagmiError]);

    // Handle success
    useEffect(() => {
        if (linkSuccess) {
            onSuccess?.();
            onClose();
        }
    }, [linkSuccess, onSuccess, onClose]);

    // Link proposal function
    const handleLinkProposal = async (address) => {
        if (!address || !organizationAddress) return;

        setLinkError(null);

        // Switch to Gnosis if needed
        if (currentChainId !== GNOSIS_CHAIN_ID) {
            try {
                await switchChainAsync({ chainId: GNOSIS_CHAIN_ID });
            } catch (e) {
                setLinkError('Please switch to Gnosis Chain');
                return;
            }
        }

        console.log('[ProposalLinkModal] Linking proposal:', address, 'to org:', organizationAddress);

        try {
            linkProposal({
                address: organizationAddress,
                abi: ORGANIZATION_ABI,
                functionName: 'addProposal',
                args: [address],
                chainId: GNOSIS_CHAIN_ID
            });
        } catch (e) {
            console.error('[ProposalLinkModal] Error:', e);
            setLinkError(e.message || 'Failed to link proposal');
        }
    };

    // Validate address format
    const isValidAddress = (addr) => {
        return typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42;
    };

    // Unlink proposal function
    const handleUnlinkProposal = async (address) => {
        if (!address || !organizationAddress) return;

        setLinkError(null);

        // Switch to Gnosis if needed
        if (currentChainId !== GNOSIS_CHAIN_ID) {
            try {
                await switchChainAsync({ chainId: GNOSIS_CHAIN_ID });
            } catch (e) {
                setLinkError('Please switch to Gnosis Chain');
                return;
            }
        }

        console.log('[ProposalLinkModal] Unlinking proposal:', address, 'from org:', organizationAddress);

        try {
            linkProposal({
                address: organizationAddress,
                abi: ORGANIZATION_ABI,
                functionName: 'removeProposal',
                args: [address],
                chainId: GNOSIS_CHAIN_ID
            });
        } catch (e) {
            console.error('[ProposalLinkModal] Unlink error:', e);
            setLinkError(e.message || 'Failed to unlink proposal');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-futarchyDarkGray3 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-futarchyGray6 dark:border-futarchyGray11">
                    <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">
                        📊 Manage Proposals
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-futarchyGray2 dark:hover:bg-futarchyGray11"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-futarchyGray6 dark:border-futarchyGray11">
                    <button
                        onClick={() => setActiveTab('linked')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'linked'
                            ? 'text-futarchyLavender border-b-2 border-futarchyLavender'
                            : 'text-futarchyGray11 hover:text-futarchyGray12 dark:hover:text-white'
                            }`}
                    >
                        📋 Linked ({linkedProposals.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'search'
                            ? 'text-futarchyLavender border-b-2 border-futarchyLavender'
                            : 'text-futarchyGray11 hover:text-futarchyGray12 dark:hover:text-white'
                            }`}
                    >
                        🔍 Search
                    </button>
                    <button
                        onClick={() => setActiveTab('link')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'link'
                            ? 'text-futarchyLavender border-b-2 border-futarchyLavender'
                            : 'text-futarchyGray11 hover:text-futarchyGray12 dark:hover:text-white'
                            }`}
                    >
                        🔗 Link
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'linked' && (
                        <div className="space-y-4">
                            {linkedProposals.length === 0 ? (
                                <div className="text-center py-8 text-futarchyGray11 dark:text-futarchyGray6">
                                    <p className="text-lg mb-2">📭 No proposals linked yet</p>
                                    <p className="text-sm">Use the Search or Link tab to add proposals</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {linkedProposals.map((proposal) => (
                                        <div
                                            key={proposal.id}
                                            className="p-3 rounded-lg border border-futarchyGray6 dark:border-futarchyGray11 hover:border-red-400 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-futarchyGray12 dark:text-white truncate">
                                                        {proposal.displayNameQuestion || proposal.displayNameEvent || proposal.id}
                                                    </p>
                                                    <p className="text-xs text-futarchyGray11 dark:text-futarchyGray6 truncate font-mono">
                                                        {proposal.id}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleUnlinkProposal(proposal.id)}
                                                    disabled={isLinking}
                                                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg disabled:opacity-50"
                                                >
                                                    {isLinking ? '...' : 'Unlink'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Error */}
                            {linkError && (
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-800 dark:text-red-200 text-sm flex items-start gap-2">
                                    <span>⚠️</span>
                                    <span className="flex-1">{linkError}</span>
                                    <button onClick={() => setLinkError(null)} className="hover:opacity-70">✕</button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'search' && (
                        <div className="space-y-4">
                            {/* Search input */}
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by market name..."
                                className="w-full px-4 py-2 rounded-lg border border-futarchyGray6 dark:border-futarchyGray11 bg-white dark:bg-futarchyDarkGray2 text-futarchyGray12 dark:text-white"
                            />

                            {/* Chain indicator */}
                            <div className="text-xs text-futarchyGray11 dark:text-futarchyGray6">
                                Searching on Chain {chainId} ({chainId === 1 ? 'Ethereum' : 'Gnosis'})
                            </div>

                            {/* Loading */}
                            {searchLoading && (
                                <div className="flex justify-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-futarchyLavender"></div>
                                </div>
                            )}

                            {/* Error */}
                            {searchError && (
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-800 dark:text-red-200 text-sm">
                                    ⚠️ {searchError.message}
                                </div>
                            )}

                            {/* Results */}
                            {!searchLoading && proposals.length > 0 && (
                                <div className="space-y-2">
                                    {proposals.map((p) => (
                                        <div
                                            key={p.id}
                                            className="p-3 rounded-lg border border-futarchyGray6 dark:border-futarchyGray11 hover:border-futarchyLavender transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-futarchyGray12 dark:text-white truncate">
                                                        {p.marketName || p.id}
                                                    </p>
                                                    <p className="text-xs text-futarchyGray11 dark:text-futarchyGray6 truncate">
                                                        {p.id}
                                                    </p>
                                                    {p.pools?.length > 0 && (
                                                        <p className="text-xs text-futarchyGray11 mt-1">
                                                            {p.pools.length} pool(s)
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleLinkProposal(p.id)}
                                                    disabled={isLinking}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
                                                >
                                                    {isLinking ? '...' : 'Link'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* No results */}
                            {!searchLoading && proposals.length === 0 && searchQuery.length >= 2 && (
                                <div className="text-center py-4 text-futarchyGray11 dark:text-futarchyGray6">
                                    No proposals found for &quot;{searchQuery}&quot;
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'link' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-futarchyGray12 dark:text-white mb-1">
                                    Proposal Address
                                </label>
                                <input
                                    type="text"
                                    value={proposalAddress}
                                    onChange={(e) => setProposalAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="w-full px-4 py-2 rounded-lg border border-futarchyGray6 dark:border-futarchyGray11 bg-white dark:bg-futarchyDarkGray2 text-futarchyGray12 dark:text-white font-mono text-sm"
                                />
                                <p className="text-xs text-futarchyGray11 dark:text-futarchyGray6 mt-1">
                                    Paste the proposal contract address to link
                                </p>
                            </div>

                            {/* Error */}
                            {linkError && (
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-800 dark:text-red-200 text-sm flex items-start gap-2">
                                    <span>⚠️</span>
                                    <span className="flex-1">{linkError}</span>
                                    <button onClick={() => setLinkError(null)} className="hover:opacity-70">✕</button>
                                </div>
                            )}

                            <button
                                onClick={() => handleLinkProposal(proposalAddress)}
                                disabled={!isValidAddress(proposalAddress) || isLinking}
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLinking ? 'Linking...' : 'Link Proposal'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ProposalLinkModal;
