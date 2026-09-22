import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { CHAIN_CONFIG, getExplorerTxUrl, getExplorerAddressUrl } from './constants/chainConfig';
import { CONTRACT_ABIS } from '../futarchyFi/marketPage/constants/contracts';
import { AGGREGATOR_SUBGRAPH_URL } from '../../config/subgraphEndpoints';

// Registry is ALWAYS on Gnosis Chain
const REGISTRY_CHAIN_ID = 100;

// Loading Spinner
const LoadingSpinner = ({ className = "" }) => (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.15" />
        <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" d="M4 12a8 8 0 018-8" />
    </svg>
);

/**
 * Fetch organization metadata from Registry Subgraph
 */
async function fetchOrganizationFromSubgraph(organizationAddress) {
    const query = `
        query GetOrganization($id: ID!) {
            organization(id: $id) {
                id
                name
                description
                metadata
                metadataURI
                owner
                editor
            }
        }
    `;

    const response = await fetch(AGGREGATOR_SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            variables: { id: organizationAddress.toLowerCase() }
        })
    });

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Subgraph query failed');
    }

    return result.data?.organization || null;
}

/**
 * Edit Company/Organization Modal
 * Allows owners to update companyName, description, metadata, and metadataURI
 */
const EditCompanyModal = ({ isOpen, onClose, organizationAddress, initialData = {} }) => {
    const { address: connectedAddress, isConnected } = useAccount();
    const currentChainId = useChainId();
    const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

    const isOnCorrectChain = currentChainId === REGISTRY_CHAIN_ID;

    // Form state
    const [companyName, setCompanyName] = useState(initialData.companyName || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [metadata, setMetadata] = useState(initialData.metadata || '');
    const [metadataURI, setMetadataURI] = useState(initialData.metadataURI || '');
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [copiedField, setCopiedField] = useState(null);

    // Metadata editing mode
    const [metadataMode, setMetadataMode] = useState('keyValue');
    const [keyValuePairs, setKeyValuePairs] = useState([]);
    const [jsonError, setJsonError] = useState(null);

    // Parse JSON to key-value pairs
    const parseMetadataToKeyValue = useCallback((jsonStr) => {
        if (!jsonStr || jsonStr.trim() === '') return [];
        try {
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return Object.entries(parsed).map(([key, value]) => ({
                    key,
                    value: typeof value === 'object' ? JSON.stringify(value) : String(value)
                }));
            }
            return [];
        } catch (e) {
            return [];
        }
    }, []);

    // Convert key-value pairs to JSON
    const keyValueToJson = useCallback((pairs) => {
        const obj = {};
        pairs.forEach(({ key, value }) => {
            if (key.trim()) {
                try {
                    obj[key.trim()] = JSON.parse(value);
                } catch (e) {
                    obj[key.trim()] = value;
                }
            }
        });
        return JSON.stringify(obj, null, 2);
    }, []);

    // Validate JSON
    const validateJson = useCallback((jsonStr) => {
        if (!jsonStr || jsonStr.trim() === '') {
            setJsonError(null);
            return true;
        }
        try {
            JSON.parse(jsonStr);
            setJsonError(null);
            return true;
        } catch (e) {
            setJsonError(`Invalid JSON: ${e.message}`);
            return false;
        }
    }, []);

    // Refs
    const updatingFromKeyValue = React.useRef(false);
    const prevMetadataMode = React.useRef(metadataMode);

    // Sync key-value pairs with metadata mode
    useEffect(() => {
        const switchingToKeyValue = metadataMode === 'keyValue' && prevMetadataMode.current !== 'keyValue';
        const initialKeyValueLoad = metadataMode === 'keyValue' && keyValuePairs.length === 0;

        if ((switchingToKeyValue || initialKeyValueLoad) && !updatingFromKeyValue.current) {
            const pairs = parseMetadataToKeyValue(metadata);
            setKeyValuePairs(pairs.length > 0 ? pairs : [{ key: '', value: '' }]);
        }

        prevMetadataMode.current = metadataMode;
        updatingFromKeyValue.current = false;
    }, [metadataMode, metadata, keyValuePairs.length, parseMetadataToKeyValue]);

    const handleKeyValueChange = (index, field, newValue) => {
        const updated = [...keyValuePairs];
        updated[index][field] = newValue;
        setKeyValuePairs(updated);
        updatingFromKeyValue.current = true;
        setMetadata(keyValueToJson(updated));
    };

    const addKeyValuePair = () => {
        setKeyValuePairs([...keyValuePairs, { key: '', value: '' }]);
    };

    const removeKeyValuePair = (index) => {
        const updated = keyValuePairs.filter((_, i) => i !== index);
        setKeyValuePairs(updated.length > 0 ? updated : [{ key: '', value: '' }]);
        updatingFromKeyValue.current = true;
        setMetadata(keyValueToJson(updated));
    };

    const handleMetadataRawChange = (value) => {
        setMetadata(value);
        validateJson(value);
    };

    // Write contract
    const { writeContract, data: transactionHash, isPending: isSubmitting, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: transactionHash });

    // Load metadata
    useEffect(() => {
        if (isOpen && organizationAddress) {
            loadCurrentMetadata();
        }
    }, [isOpen, organizationAddress]);

    const loadCurrentMetadata = async () => {
        setIsLoadingData(true);
        setLoadError(null);

        try {
            console.log(`[EditCompanyModal] Loading metadata for ${organizationAddress}`);
            const org = await fetchOrganizationFromSubgraph(organizationAddress);

            if (!org) {
                throw new Error('Organization not found in Registry Subgraph');
            }

            setCompanyName(org.name || '');
            setDescription(org.description || '');
            const loadedMetadata = org.metadata || '';
            setMetadata(loadedMetadata);
            setMetadataURI(org.metadataURI || '');

            // Parse key-value pairs on load
            if (metadataMode === 'keyValue' && loadedMetadata) {
                const pairs = parseMetadataToKeyValue(loadedMetadata);
                setKeyValuePairs(pairs.length > 0 ? pairs : [{ key: '', value: '' }]);
            }

            console.log('[EditCompanyModal] Loaded:', org);
        } catch (error) {
            console.error('[EditCompanyModal] Failed to load:', error);
            setLoadError(error.message);
        } finally {
            setIsLoadingData(false);
        }
    };

    const [updateType, setUpdateType] = useState(null);
    const isProcessing = isSubmitting || isConfirming;

    const handleUpdateCompanyInfo = async () => {
        if (!isConnected || !isOnCorrectChain || isProcessing) return;
        setUpdateType('info');

        writeContract({
            address: organizationAddress,
            abi: CONTRACT_ABIS.ORGANIZATION,
            functionName: 'updateCompanyInfo',
            args: [companyName, description],
            chainId: REGISTRY_CHAIN_ID,
        });
    };

    const handleUpdateExtended = async () => {
        if (!isConnected || !isOnCorrectChain || isProcessing || jsonError) return;
        setUpdateType('extended');

        writeContract({
            address: organizationAddress,
            abi: CONTRACT_ABIS.ORGANIZATION,
            functionName: 'updateExtendedMetadata',
            args: [metadata || '', metadataURI || ''],
            chainId: REGISTRY_CHAIN_ID,
        });
    };

    const handleClose = () => {
        if (!isProcessing) {
            onClose();
        }
    };

    const copyToClipboard = (text, fieldName) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const chainConfig = CHAIN_CONFIG[REGISTRY_CHAIN_ID];

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                >
                    <motion.div
                        className="bg-white dark:bg-futarchyDarkGray3 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-futarchyGray6 dark:border-futarchyDarkGray7"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-futarchyGray6 dark:border-futarchyDarkGray7">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🏢</span>
                                <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-futarchyGray112">
                                    Edit Organization
                                </h2>
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500 text-white">
                                    {chainConfig?.name || 'Gnosis'} Registry
                                </span>
                            </div>
                            <button
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="text-futarchyGray9 hover:text-futarchyGray12 dark:hover:text-futarchyGray112 transition-colors p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* Contract Address */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112">
                                    Organization Contract
                                </label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-xs text-futarchyGray12 dark:text-futarchyGray112 bg-futarchyGray4 dark:bg-futarchyDarkGray4 p-2 rounded break-all font-mono">
                                        {organizationAddress}
                                    </code>
                                    <button
                                        className="text-xs px-2 py-1 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray5 text-futarchyGray12 dark:text-futarchyGray112 transition-colors"
                                        onClick={() => copyToClipboard(organizationAddress, 'addr')}
                                    >
                                        {copiedField === 'addr' ? '✓' : 'Copy'}
                                    </button>
                                </div>
                                <a
                                    href={getExplorerAddressUrl(REGISTRY_CHAIN_ID, organizationAddress)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-futarchyBlue11 hover:underline"
                                >
                                    View on {chainConfig?.name || 'Gnosis'} Explorer →
                                </a>
                            </div>

                            {isLoadingData ? (
                                <div className="flex items-center gap-2 text-futarchyGray9 dark:text-futarchyGray112 py-8 justify-center">
                                    <LoadingSpinner className="h-5 w-5" />
                                    <span>Loading organization data...</span>
                                </div>
                            ) : loadError ? (
                                <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg">
                                    ❌ Failed to load: {loadError}
                                </div>
                            ) : (
                                <>
                                    {/* Company Name */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112">
                                            Company Name
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            placeholder="Gnosis DAO"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112">
                                            Description
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-3 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all resize-none"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Description of the organization..."
                                            rows={3}
                                        />
                                    </div>

                                    {/* Chain Warning */}
                                    {!isOnCorrectChain && isConnected && (
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                                            <div className="flex items-center gap-2 text-amber-400 text-sm">
                                                ⚠️ <span>Registry contracts are on <strong>Gnosis Chain</strong>. Please switch.</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                                onClick={() => switchChain({ chainId: REGISTRY_CHAIN_ID })}
                                                disabled={isSwitchingChain}
                                            >
                                                {isSwitchingChain ? 'Switching...' : 'Switch to Gnosis Chain'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Update Company Info Button */}
                                    <button
                                        type="button"
                                        className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${!isConnected || isProcessing || !isOnCorrectChain
                                            ? 'bg-futarchyGray6 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
                                            }`}
                                        disabled={isProcessing || !isConnected || !isOnCorrectChain}
                                        onClick={handleUpdateCompanyInfo}
                                    >
                                        {isProcessing && updateType === 'info' ? (
                                            <>
                                                <LoadingSpinner className="h-4 w-4" />
                                                Updating...
                                            </>
                                        ) : (
                                            '✅ Update Company Info'
                                        )}
                                    </button>

                                    {/* Separator */}
                                    <hr className="border-futarchyGray6 dark:border-futarchyDarkGray7" />

                                    {/* Extended Metadata Section */}
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-futarchyGray11 dark:text-futarchyGray112 uppercase">
                                            Extended Metadata
                                        </h4>
                                        <div className="flex items-center gap-1 bg-futarchyGray4 dark:bg-futarchyDarkGray4 rounded-lg p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setMetadataMode('keyValue')}
                                                className={`px-2 py-1 text-xs rounded-md transition-all ${metadataMode === 'keyValue'
                                                        ? 'bg-white dark:bg-futarchyDarkGray6 text-futarchyGray12 dark:text-futarchyGray112 shadow-sm'
                                                        : 'text-futarchyGray9 dark:text-futarchyGray112 hover:text-futarchyGray11'
                                                    }`}
                                            >
                                                🔑 Key-Value
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMetadataMode('raw');
                                                    validateJson(metadata);
                                                }}
                                                className={`px-2 py-1 text-xs rounded-md transition-all ${metadataMode === 'raw'
                                                        ? 'bg-white dark:bg-futarchyDarkGray6 text-futarchyGray12 dark:text-futarchyGray112 shadow-sm'
                                                        : 'text-futarchyGray9 dark:text-futarchyGray112 hover:text-futarchyGray11'
                                                    }`}
                                            >
                                                📝 Raw JSON
                                            </button>
                                        </div>
                                    </div>

                                    {/* Metadata Editor */}
                                    <div className="space-y-2">
                                        {metadataMode === 'keyValue' ? (
                                            <>
                                                <div className="space-y-2">
                                                    {keyValuePairs.map((pair, index) => (
                                                        <div key={index} className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                className="flex-1 px-3 py-2 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all text-sm font-mono"
                                                                placeholder="key"
                                                                value={pair.key}
                                                                onChange={(e) => handleKeyValueChange(index, 'key', e.target.value)}
                                                            />
                                                            <span className="text-futarchyGray9 dark:text-futarchyGray112">:</span>
                                                            <input
                                                                type="text"
                                                                className="flex-[2] px-3 py-2 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all text-sm font-mono"
                                                                placeholder="value"
                                                                value={pair.value}
                                                                onChange={(e) => handleKeyValueChange(index, 'value', e.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeKeyValuePair(index)}
                                                                className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                                title="Remove"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={addKeyValuePair}
                                                    className="w-full py-2 border-2 border-dashed border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-sm text-futarchyGray9 dark:text-futarchyGray112 hover:border-futarchyBlue9 hover:text-futarchyBlue9 transition-all flex items-center justify-center gap-2"
                                                >
                                                    ➕ Add Field
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <textarea
                                                    className={`w-full px-4 py-3 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all resize-none font-mono text-sm ${jsonError
                                                            ? 'border-red-500 dark:border-red-400'
                                                            : 'border-futarchyGray6 dark:border-futarchyDarkGray7'
                                                        }`}
                                                    value={metadata}
                                                    onChange={(e) => handleMetadataRawChange(e.target.value)}
                                                    placeholder='{"coingecko_ticker": "...", "chain": "100"}'
                                                    rows={5}
                                                />
                                                {jsonError && (
                                                    <div className="flex items-center gap-2 text-sm text-red-400">
                                                        <span>⚠️</span>
                                                        <span>{jsonError}</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Metadata URI */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray112">
                                            Metadata URI
                                            <span className="text-xs text-futarchyGray9 dark:text-futarchyGray112 ml-2">(IPFS or HTTP)</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-futarchyGray4 dark:bg-futarchyDarkGray4 border border-futarchyGray6 dark:border-futarchyDarkGray7 rounded-lg text-futarchyGray12 dark:text-futarchyGray112 focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all font-mono text-sm"
                                            value={metadataURI}
                                            onChange={(e) => setMetadataURI(e.target.value)}
                                            placeholder="ipfs://Qm... or https://..."
                                        />
                                    </div>

                                    {/* Update Extended Metadata Button */}
                                    <button
                                        type="button"
                                        className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${!isConnected || isProcessing || !isOnCorrectChain || jsonError
                                            ? 'bg-futarchyGray6 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700'
                                            }`}
                                        disabled={isProcessing || !isConnected || !isOnCorrectChain || !!jsonError}
                                        onClick={handleUpdateExtended}
                                    >
                                        {isProcessing && updateType === 'extended' ? (
                                            <>
                                                <LoadingSpinner className="h-4 w-4" />
                                                Updating...
                                            </>
                                        ) : (
                                            '📦 Update Extended Metadata'
                                        )}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-futarchyGray6 dark:border-futarchyDarkGray7 space-y-4">
                            {writeError && (
                                <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/30">
                                    ❌ {writeError.message?.slice(0, 100)}
                                </div>
                            )}

                            {isSuccess && (
                                <div className="p-3 rounded-lg text-sm bg-green-500/10 text-green-400 border border-green-500/30 space-y-2">
                                    <div>✅ Metadata updated successfully!</div>
                                    {transactionHash && (
                                        <a
                                            href={getExplorerTxUrl(REGISTRY_CHAIN_ID, transactionHash)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-futarchyBlue11 hover:underline block"
                                        >
                                            View transaction →
                                        </a>
                                    )}
                                </div>
                            )}

                            {isProcessing && (
                                <div className="p-3 rounded-lg text-sm bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-2">
                                    <LoadingSpinner className="h-4 w-4" />
                                    {isSubmitting ? 'Waiting for wallet...' : 'Confirming transaction...'}
                                </div>
                            )}

                            <button
                                type="button"
                                className="w-full py-3 rounded-xl font-semibold text-futarchyGray12 dark:text-futarchyGray112 bg-futarchyGray4 dark:bg-futarchyDarkGray5 hover:bg-futarchyGray5 dark:hover:bg-futarchyDarkGray6 transition-all"
                                onClick={handleClose}
                            >
                                {isSuccess ? 'Close' : 'Cancel'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default EditCompanyModal;
