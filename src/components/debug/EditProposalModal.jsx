import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@seer-pm/ui-kit/react';
import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    PlusIcon,
    XCircleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { CHAIN_CONFIG, getExplorerTxUrl, getExplorerAddressUrl } from './constants/chainConfig';
import { CONTRACT_ABIS } from '../futarchyFi/marketPage/constants/contracts';
import { AGGREGATOR_SUBGRAPH_URL } from '../../config/subgraphEndpoints';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Field';

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
 * Fetch proposal metadata from Registry Subgraph
 * Registry is always on Gnosis, so we use the Gnosis subgraph
 */
async function fetchProposalFromSubgraph(proposalMetadataAddress) {
    const query = `
        query GetProposal($id: ID!) {
            proposalEntity(id: $id) {
                id
                displayNameQuestion
                displayNameEvent
                description
                metadata
                metadataURI
                proposalAddress
                owner
            }
        }
    `;

    const response = await fetch(AGGREGATOR_SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            variables: { id: proposalMetadataAddress.toLowerCase() }
        })
    });

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Subgraph query failed');
    }

    return result.data?.proposalEntity || null;
}

/**
 * Edit Proposal Metadata Modal
 * Allows owners to update displayNameQuestion, displayNameEvent, and description
 * 
 * IMPORTANT: Registry contracts are ALWAYS on Gnosis (100), regardless of which
 * chain the trading/market contracts are on.
 */
const EditProposalModal = ({ isOpen, onClose, proposalMetadataAddress, initialData = {} }) => {
    const { address: connectedAddress, isConnected } = useAccount();
    const currentChainId = useChainId();
    const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

    // Check if user is on the correct chain (Gnosis for Registry)
    const isOnCorrectChain = currentChainId === REGISTRY_CHAIN_ID;

    // Form state
    const [displayNameQuestion, setDisplayNameQuestion] = useState(initialData.displayNameQuestion || '');
    const [displayNameEvent, setDisplayNameEvent] = useState(initialData.displayNameEvent || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [metadata, setMetadata] = useState(initialData.metadata || '');
    const [metadataURI, setMetadataURI] = useState(initialData.metadataURI || '');
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [copiedField, setCopiedField] = useState(null);

    // Metadata editing mode: 'raw' or 'keyValue'
    const [metadataMode, setMetadataMode] = useState('keyValue');
    const [keyValuePairs, setKeyValuePairs] = useState([]);
    const [jsonError, setJsonError] = useState(null);

    // Parse JSON metadata to key-value pairs
    const parseMetadataToKeyValue = useCallback((jsonStr) => {
        if (!jsonStr || jsonStr.trim() === '') {
            return [];
        }
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

    // Convert key-value pairs back to JSON
    const keyValueToJson = useCallback((pairs) => {
        const obj = {};
        pairs.forEach(({ key, value }) => {
            if (key.trim()) {
                // Try to parse value as JSON (for objects/arrays)
                try {
                    obj[key.trim()] = JSON.parse(value);
                } catch (e) {
                    obj[key.trim()] = value;
                }
            }
        });
        return JSON.stringify(obj, null, 2);
    }, []);

    // Validate JSON when in raw mode
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

    // Track whether we're updating metadata from key-value changes to prevent re-parsing
    const updatingFromKeyValue = React.useRef(false);
    const prevMetadataMode = React.useRef(metadataMode);

    // Sync metadata string with key-value pairs (when switching to keyValue mode or on initial load)
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

    // Update metadata string when key-value pairs change
    const handleKeyValueChange = (index, field, newValue) => {
        const updated = [...keyValuePairs];
        updated[index][field] = newValue;
        setKeyValuePairs(updated);
        updatingFromKeyValue.current = true;
        setMetadata(keyValueToJson(updated));
    };

    // Add new key-value pair
    const addKeyValuePair = () => {
        setKeyValuePairs([...keyValuePairs, { key: '', value: '' }]);
    };

    // Remove key-value pair
    const removeKeyValuePair = (index) => {
        const updated = keyValuePairs.filter((_, i) => i !== index);
        setKeyValuePairs(updated.length > 0 ? updated : [{ key: '', value: '' }]);
        updatingFromKeyValue.current = true;
        setMetadata(keyValueToJson(updated));
    };

    // Handle metadata raw text change with validation
    const handleMetadataRawChange = (value) => {
        setMetadata(value);
        validateJson(value);
    };

    // Write contract
    const { writeContract, data: transactionHash, isPending: isSubmitting, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: transactionHash });

    // Load current metadata from Registry Subgraph when modal opens
    useEffect(() => {
        if (isOpen && proposalMetadataAddress) {
            loadCurrentMetadata();
        }
    }, [isOpen, proposalMetadataAddress]);

    const loadCurrentMetadata = async () => {
        setIsLoadingData(true);
        setLoadError(null);

        try {
            console.log(`[EditProposalModal] Loading metadata from Subgraph for ${proposalMetadataAddress}`);

            // Read current values from Registry Subgraph (always on Gnosis)
            const proposal = await fetchProposalFromSubgraph(proposalMetadataAddress);

            if (!proposal) {
                throw new Error('Proposal not found in Registry Subgraph');
            }

            setDisplayNameQuestion(proposal.displayNameQuestion || '');
            setDisplayNameEvent(proposal.displayNameEvent || '');
            setDescription(proposal.description || '');
            const loadedMetadata = proposal.metadata || '';
            setMetadata(loadedMetadata);
            setMetadataURI(proposal.metadataURI || '');

            // Immediately parse key-value pairs if in keyValue mode
            if (metadataMode === 'keyValue' && loadedMetadata) {
                const pairs = parseMetadataToKeyValue(loadedMetadata);
                setKeyValuePairs(pairs.length > 0 ? pairs : [{ key: '', value: '' }]);
            }

            console.log('[EditProposalModal] Loaded metadata from Subgraph:', proposal);
        } catch (error) {
            console.error('[EditProposalModal] Failed to load metadata:', error);
            setLoadError(error.message);
        } finally {
            setIsLoadingData(false);
        }
    };

    // Track which type of update is being performed
    const [updateType, setUpdateType] = useState(null); // 'basic' or 'extended'

    const handleUpdateBasic = async () => {
        setUpdateType('basic');
        console.log('[EditProposalModal] Submitting updateMetadata to Gnosis:', {
            proposalMetadataAddress,
            displayNameQuestion,
            displayNameEvent,
            description,
            chainId: REGISTRY_CHAIN_ID
        });

        writeContract({
            address: proposalMetadataAddress,
            abi: CONTRACT_ABIS.PROPOSAL,
            functionName: 'updateMetadata',
            args: [displayNameQuestion, displayNameEvent, description],
            chainId: REGISTRY_CHAIN_ID  // Registry is ALWAYS on Gnosis
        });
    };

    const handleUpdateExtended = async () => {
        setUpdateType('extended');
        console.log('[EditProposalModal] Submitting updateExtendedMetadata to Gnosis:', {
            proposalMetadataAddress,
            metadata,
            metadataURI,
            chainId: REGISTRY_CHAIN_ID
        });

        writeContract({
            address: proposalMetadataAddress,
            abi: CONTRACT_ABIS.PROPOSAL,
            functionName: 'updateExtendedMetadata',
            args: [metadata, metadataURI],
            chainId: REGISTRY_CHAIN_ID  // Registry is ALWAYS on Gnosis
        });
    };

    const copyToClipboard = useCallback(async (text, field) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, []);

    const handleClose = () => {
        if (!isSubmitting && !isConfirming) {
            onClose();
        }
    };

    if (!isOpen) return null;

    // Registry is ALWAYS on Gnosis
    const chainConfig = CHAIN_CONFIG[REGISTRY_CHAIN_ID];
    const isProcessing = isSubmitting || isConfirming;

    const segmentClass = (selected) => `rounded-control px-2 py-1 text-xs font-semibold transition-colors ${selected
        ? 'bg-seer-surface-raised text-seer-text'
        : 'text-seer-muted hover:text-seer-text'
        }`;

    const footer = (
        <>
            {/* Error Message */}
            {writeError && (
                <div role="alert" className="flex basis-full items-start gap-2 rounded-surface border border-seer-negative/40 bg-seer-negative/10 p-3 text-sm text-seer-negative">
                    <XCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{writeError.message?.slice(0, 100)}</span>
                </div>
            )}

            {/* Success Message */}
            {isSuccess && (
                <div role="status" className="basis-full space-y-2 rounded-surface border border-seer-positive/40 bg-seer-positive/10 p-3 text-sm text-seer-positive">
                    <div className="flex items-center gap-2">
                        <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        Metadata updated successfully!
                    </div>
                    {transactionHash && (
                        <a
                            href={getExplorerTxUrl(REGISTRY_CHAIN_ID, transactionHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-seer-accent-text hover:underline"
                        >
                            View transaction →
                        </a>
                    )}
                </div>
            )}

            {/* Processing Message */}
            {isProcessing && (
                <div role="status" className="flex basis-full items-center gap-2 rounded-surface border border-seer-border bg-seer-surface-raised p-3 text-sm text-seer-text">
                    <LoadingSpinner className="h-4 w-4" />
                    {isSubmitting ? 'Waiting for wallet...' : 'Confirming transaction...'}
                </div>
            )}

            {/* Close button */}
            <Button variant="outline" block onClick={handleClose}>
                {isSuccess ? 'Close' : 'Cancel'}
            </Button>
        </>
    );

    return (
        <Dialog
            open={isOpen}
            onClose={handleClose}
            dismissible={!isProcessing}
            title={(
                <span className="flex flex-wrap items-center gap-2">
                    Edit Proposal Metadata
                    <Badge tone="positive">{chainConfig?.name || 'Gnosis'} Registry</Badge>
                </span>
            )}
            footer={footer}
        >
            <div className="space-y-5">
                {/* Contract Address */}
                <div className="seer-field">
                    <span className="seer-label">Proposal metadata contract</span>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-control bg-seer-surface-raised p-2 font-mono text-xs text-seer-text">
                            {proposalMetadataAddress}
                        </code>
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(proposalMetadataAddress, 'addr')}>
                            {copiedField === 'addr' ? 'Copied' : 'Copy'}
                        </Button>
                    </div>
                    <a
                        href={getExplorerAddressUrl(REGISTRY_CHAIN_ID, proposalMetadataAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-seer-accent-text hover:underline"
                    >
                        View on {chainConfig?.name || 'Gnosis'} Explorer →
                    </a>
                </div>

                {isLoadingData ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-seer-muted">
                        <LoadingSpinner className="h-5 w-5" />
                        <span>Loading current metadata...</span>
                    </div>
                ) : loadError ? (
                    <div role="alert" className="flex items-start gap-2 rounded-surface border border-seer-negative/40 bg-seer-negative/10 p-4 text-sm text-seer-negative">
                        <XCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">Failed to load metadata: {loadError}</span>
                    </div>
                ) : (
                    <>
                        {/* Display Name Question (display_title_0) */}
                        <Field
                            label={(
                                <>
                                    Display name question
                                    <span className="ml-2 text-xs font-normal text-seer-muted">(display_title_0)</span>
                                </>
                            )}
                        >
                            <Input
                                type="text"
                                value={displayNameQuestion}
                                onChange={(e) => setDisplayNameQuestion(e.target.value)}
                                placeholder="What will the impact on GNO price be"
                            />
                        </Field>

                        {/* Display Name Event (display_title_1) */}
                        <Field
                            label={(
                                <>
                                    Display name event
                                    <span className="ml-2 text-xs font-normal text-seer-muted">(display_title_1 - purple text)</span>
                                </>
                            )}
                        >
                            <Input
                                type="text"
                                value={displayNameEvent}
                                onChange={(e) => setDisplayNameEvent(e.target.value)}
                                placeholder="if GIP-145 is approved?"
                            />
                        </Field>

                        {/* Preview */}
                        <div className="space-y-2 rounded-surface bg-seer-surface-raised p-4">
                            <span className="text-[13px] text-seer-muted">Preview</span>
                            <h3 className="text-lg font-semibold text-seer-text">
                                <span>{displayNameQuestion}</span>{' '}
                                <span className="text-seer-accent-text">{displayNameEvent}</span>
                            </h3>
                        </div>

                        {/* Description */}
                        <Field label="Description">
                            <textarea
                                className="seer-input resize-none"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Detailed description of this proposal..."
                                rows={3}
                            />
                        </Field>

                        {/* Chain Warning - Show if not on Gnosis */}
                        {!isOnCorrectChain && isConnected && (
                            <div className="space-y-2 rounded-surface border border-seer-warning/40 bg-seer-warning/10 p-3">
                                <div className="flex items-center gap-2 text-sm text-seer-warning">
                                    <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                    <span>Registry contracts are on <strong>Gnosis Chain</strong>. Please switch to continue.</span>
                                </div>
                                <Button
                                    variant="outline"
                                    block
                                    onClick={() => switchChain({ chainId: REGISTRY_CHAIN_ID })}
                                    disabled={isSwitchingChain}
                                    busy={isSwitchingChain}
                                >
                                    {isSwitchingChain ? 'Switching...' : (
                                        <>
                                            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                                            Switch to Gnosis Chain
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Update Basic Metadata Button */}
                        <Button
                            block
                            disabled={isProcessing || !isConnected || !isOnCorrectChain}
                            busy={isProcessing && updateType === 'basic'}
                            onClick={handleUpdateBasic}
                        >
                            {isProcessing && updateType === 'basic' ? 'Updating...' : 'Update display info'}
                        </Button>

                        {/* Separator */}
                        <hr className="border-seer-border" />

                        {/* Extended Metadata Section */}
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="text-base font-semibold text-seer-text">
                                Extended Metadata
                            </h4>
                            {/* Mode Toggle */}
                            <div className="flex items-center gap-1 rounded-control border border-seer-border p-1">
                                <button
                                    type="button"
                                    aria-pressed={metadataMode === 'keyValue'}
                                    onClick={() => setMetadataMode('keyValue')}
                                    className={segmentClass(metadataMode === 'keyValue')}
                                >
                                    Key-Value
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={metadataMode === 'raw'}
                                    onClick={() => {
                                        setMetadataMode('raw');
                                        validateJson(metadata);
                                    }}
                                    className={segmentClass(metadataMode === 'raw')}
                                >
                                    Raw JSON
                                </button>
                            </div>
                        </div>

                        {/* Metadata Editor */}
                        <div className="space-y-2">
                            {metadataMode === 'keyValue' ? (
                                <>
                                    {/* Key-Value Pairs */}
                                    <div className="space-y-2">
                                        {keyValuePairs.map((pair, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <Input
                                                    type="text"
                                                    className="!w-auto flex-1 font-mono text-sm"
                                                    aria-label="Key"
                                                    placeholder="key"
                                                    value={pair.key}
                                                    onChange={(e) => handleKeyValueChange(index, 'key', e.target.value)}
                                                />
                                                <span className="text-seer-muted">:</span>
                                                <Input
                                                    type="text"
                                                    className="!w-auto flex-[2] font-mono text-sm"
                                                    aria-label="Value"
                                                    placeholder="value"
                                                    value={pair.value}
                                                    onChange={(e) => handleKeyValueChange(index, 'value', e.target.value)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon
                                                    onClick={() => removeKeyValuePair(index)}
                                                    className="shrink-0 !text-seer-negative"
                                                    title="Remove"
                                                    aria-label="Remove"
                                                >
                                                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Add New Key-Value Button */}
                                    <Button variant="outline" block onClick={addKeyValuePair}>
                                        <PlusIcon className="h-4 w-4" aria-hidden="true" />
                                        Add field
                                    </Button>
                                </>
                            ) : (
                                <>
                                    {/* Raw JSON Textarea */}
                                    <textarea
                                        className="seer-input resize-none font-mono text-sm"
                                        aria-invalid={jsonError ? 'true' : undefined}
                                        aria-label="Raw JSON metadata"
                                        value={metadata}
                                        onChange={(e) => handleMetadataRawChange(e.target.value)}
                                        placeholder='{"category": "governance", "tags": ["GIP", "funding"]}'
                                        rows={5}
                                    />
                                    {/* JSON Validation Error */}
                                    {jsonError && (
                                        <div className="flex items-center gap-2 text-sm text-seer-negative">
                                            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                            <span className="min-w-0 break-words">{jsonError}</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Metadata URI */}
                        <Field
                            label={(
                                <>
                                    Metadata URI
                                    <span className="ml-2 text-xs font-normal text-seer-muted">(IPFS or HTTP link)</span>
                                </>
                            )}
                        >
                            <Input
                                type="text"
                                className="font-mono text-sm"
                                value={metadataURI}
                                onChange={(e) => setMetadataURI(e.target.value)}
                                placeholder="ipfs://Qm... or https://..."
                            />
                        </Field>

                        {/* Update Extended Metadata Button */}
                        <Button
                            block
                            disabled={isProcessing || !isConnected || !isOnCorrectChain || !!jsonError}
                            busy={isProcessing && updateType === 'extended'}
                            onClick={handleUpdateExtended}
                        >
                            {isProcessing && updateType === 'extended' ? 'Updating...' : 'Update extended metadata'}
                        </Button>
                    </>
                )}
            </div>
        </Dialog>
    );
};

export default EditProposalModal;
