/**
 * OrganizationManagerModal
 * 
 * Comprehensive management interface for Futarchy v2 Entities (Aggregators & Organizations).
 * Supports:
 * - Viewing Entity Details (Overview)
 * - Managing Content (Orgs in Aggregator, Proposals in Org)
 * - Settings (Transfer Ownership, Manage Editor, Update Metadata)
 */

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from '../futarchyFi/marketPage/constants/contracts';
import { AGGREGATOR_SUBGRAPH_URL as SUBGRAPH_URL } from '../../config/subgraphEndpoints';
import { useSearchProposals } from '../../hooks/useSearchProposals'; // Import search hook
import { Dialog } from '@seer-pm/ui-kit/react';
import {
    ArchiveBoxIcon,
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    BuildingLibraryIcon,
    Cog6ToothIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    LightBulbIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Field } from '../ui/Field';

// Tabs
const TAB = {
    OVERVIEW: 'overview',
    CONTENT: 'content',
    SETTINGS: 'settings'
};

// Mode
const MODE = {
    AGGREGATOR: 'aggregator',
    ORGANIZATION: 'organization'
};

export default function OrganizationManagerModal({
    isOpen,
    onClose,
    entityId,
    mode = MODE.ORGANIZATION // 'aggregator' | 'organization'
}) {
    const { address: connectedAddress, isConnected } = useAccount();

    // State
    const [activeTab, setActiveTab] = useState(TAB.OVERVIEW);
    const [entityData, setEntityData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [parsedMetadata, setParsedMetadata] = useState({});

    // Permission state
    const isOwner = entityData?.owner && connectedAddress &&
        entityData.owner.toLowerCase() === connectedAddress.toLowerCase();
    const isEditor = entityData?.editor && connectedAddress &&
        entityData.editor.toLowerCase() === connectedAddress.toLowerCase();
    const canEdit = isOwner || isEditor;

    // Refresh trigger
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const refresh = () => setRefreshTrigger(prev => prev + 1);

    // Fetch Entity Data
    useEffect(() => {
        if (!isOpen || !entityId) return;

        const fetchEntity = async () => {
            setIsLoading(true);
            try {
                const query = mode === MODE.AGGREGATOR
                    ? `{ aggregator(id: "${entityId.toLowerCase()}") { id name description metadata owner editor organizations { id name } } }`
                    : `{ organization(id: "${entityId.toLowerCase()}") { id name description metadata owner editor proposals { metadataContract: id proposalAddress title } } }`;

                const response = await fetch(SUBGRAPH_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                const result = await response.json();
                const data = mode === MODE.AGGREGATOR
                    ? result.data?.aggregator
                    : result.data?.organization;

                if (data) {
                    setEntityData(data);
                    try {
                        setParsedMetadata(JSON.parse(data.metadata || '{}'));
                    } catch {
                        setParsedMetadata({});
                    }
                } else {
                    setError('Entity not found');
                }
            } catch (e) {
                console.error(e);
                setError('Failed to load entity data');
            } finally {
                setIsLoading(false);
            }
        };

        fetchEntity();
    }, [isOpen, entityId, mode, refreshTrigger]);

    if (!isOpen) return null;

    const tabs = [
        { id: TAB.OVERVIEW, label: 'Overview', icon: DocumentTextIcon },
        { id: TAB.CONTENT, label: mode === MODE.AGGREGATOR ? 'Organizations' : 'Proposals', icon: ArchiveBoxIcon },
        { id: TAB.SETTINGS, label: 'Settings', icon: Cog6ToothIcon }
    ];

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            size="wide"
            title={(
                <span className="flex items-center gap-3">
                    <span className="shrink-0 rounded-control bg-seer-accent-soft p-2 text-seer-accent-text">
                        {mode === MODE.AGGREGATOR ? <GlobeAltIcon className="h-5 w-5" aria-hidden="true" /> : <BuildingLibraryIcon className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate">{entityData?.name || 'Loading...'}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-normal text-seer-muted">
                            <span className="font-mono">{entityId?.slice(0, 8)}...{entityId?.slice(-6)}</span>
                            {isOwner && <Badge tone="positive">Owner</Badge>}
                            {isEditor && <Badge tone="warning">Editor</Badge>}
                        </span>
                    </span>
                </span>
            )}
        >
            {/* Tabs */}
            <div role="tablist" className="-mx-5 -mt-4 mb-5 flex border-b border-seer-border px-5">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const selected = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setActiveTab(tab.id)}
                            className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors ${selected
                                ? 'border-seer-purple text-seer-text'
                                : 'border-transparent text-seer-muted hover:text-seer-text'}`}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Body */}
            {isLoading ? (
                <div className="flex justify-center p-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-seer-border border-t-seer-purple" role="status" aria-label="Loading"></div></div>
            ) : error ? (
                <div role="alert" className="p-8 text-center text-seer-negative">{error}</div>
            ) : !entityData ? (
                <div className="p-8 text-center text-seer-muted">No data found</div>
            ) : (
                <>
                    {activeTab === TAB.OVERVIEW && <OverviewTab entity={entityData} canEdit={canEdit} mode={mode} onRefresh={refresh} />}
                    {activeTab === TAB.CONTENT && <ContentTab entity={entityData} canEdit={canEdit} mode={mode} chainId={parsedMetadata.chain || 100} onRefresh={refresh} />}
                    {activeTab === TAB.SETTINGS && <SettingsTab entity={entityData} isOwner={isOwner} mode={mode} onRefresh={refresh} />}
                </>
            )}
        </Dialog>
    );
}

// --- Sub-Components ---

function OverviewTab({ entity, canEdit, mode, onRefresh }) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoCard label="Name" value={entity.name} />
                <InfoCard label="Type" value={mode === MODE.AGGREGATOR ? 'Aggregator' : 'Organization'} />
                <InfoCard label="Owner" value={entity.owner} mono />
                <InfoCard label="Editor" value={entity.editor || 'None'} mono />
            </div>

            <div>
                <h3 className="mb-2 text-sm font-semibold text-seer-text">Metadata</h3>
                <pre className="max-h-40 overflow-auto rounded-surface border border-seer-border bg-seer-surface-raised p-3 font-mono text-xs text-seer-text">
                    {entity.metadata}
                </pre>
            </div>

            <div className="flex justify-end">
                <div className="break-all text-xs text-seer-muted">
                    ID: {entity.id}
                </div>
            </div>
        </div>
    );
}

function InfoCard({ label, value, mono }) {
    return (
        <div className="min-w-0 rounded-surface bg-seer-surface-raised p-3">
            <div className="mb-1 text-[13px] text-seer-muted">{label}</div>
            <div className={`truncate text-sm text-seer-text ${mono ? 'font-mono' : 'font-semibold'}`} title={value}>
                {value}
            </div>
        </div>
    );
}

function ContentTab({ entity, canEdit, mode, chainId, onRefresh }) {
    const [subStep, setSubStep] = useState('list'); // list | create
    const publicClient = usePublicClient();

    // Create/Add Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [metadataJSON, setMetadataJSON] = useState('{}');
    const [targetAddress, setTargetAddress] = useState(''); // For linking existing

    // Proposal specific
    const [propQuestion, setPropQuestion] = useState('');
    const [propEvent, setPropEvent] = useState('');

    // Search Hook (Only for Organization mode)
    const { proposals, loading: isSearching, search } = useSearchProposals(chainId);
    const [searchTerm, setSearchTerm] = useState('');

    // Contracts
    const { writeContract, isPending: isTxPending, isSuccess, data: txData } = useWriteContract();
    const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txData });

    // Removal State
    const [removingId, setRemovingId] = useState(null);

    useEffect(() => {
        if (isConfirmed) {
            setSubStep('list');
            setName('');
            setTargetAddress('');
            setRemovingId(null);
            onRefresh();
        }
    }, [isConfirmed]);

    // Debounce search
    useEffect(() => {
        if (mode === MODE.ORGANIZATION && subStep === 'create') {
            const timer = setTimeout(() => search(searchTerm), 500);
            return () => clearTimeout(timer);
        }
    }, [searchTerm, subStep, mode]);

    const handleCreateAndAdd = () => {
        const metadata = JSON.stringify({ ...JSON.parse(metadataJSON || '{}'), createdAt: new Date().toISOString() });

        if (mode === MODE.AGGREGATOR) {
            writeContract({
                address: entity.id,
                abi: CONTRACT_ABIS.AGGREGATOR,
                functionName: 'createAndAddOrganizationMetadata',
                args: [name, description, metadata, ''], // metadataURI empty for now
                chainId: 100
            });
        } else {
            // Organization -> Create Proposal (wraps existing pool)
            writeContract({
                address: entity.id,
                abi: CONTRACT_ABIS.ORGANIZATION,
                functionName: 'createAndAddProposalMetadata',
                args: [targetAddress, propQuestion, propEvent, description, metadata, ''],
                chainId: 100
            });
        }
    };

    const handleRemove = async (item) => {
        const idDisplay = item.metadataContract ? `Metadata Contract: ${item.metadataContract}` : (item.name || item.id);
        if (!confirm(`Are you sure you want to remove this item?\n\n${idDisplay}`)) return;
        setRemovingId(item.id);

        try {
            // 1. Find the index of the item on-chain
            const abi = mode === MODE.AGGREGATOR ? CONTRACT_ABIS.AGGREGATOR : CONTRACT_ABIS.ORGANIZATION;
            const getMethod = mode === MODE.AGGREGATOR ? 'getOrganizations' : 'getProposals';

            // Fetch a large batch to find the index (assuming < 1000 items)
            const list = await publicClient.readContract({
                address: entity.id,
                abi: abi,
                functionName: getMethod,
                args: [0n, 1000n]
            });

            let index = -1;

            if (mode === MODE.ORGANIZATION) {
                // Proposal Mode: Use metadataContract from subgraph if available
                const targetAddress = item.metadataContract;

                if (targetAddress) {
                    console.log(`Using metadataContract: ${targetAddress}`);
                    index = list.findIndex(addr => addr.toLowerCase() === targetAddress.toLowerCase());
                } else {
                    // Fallback: This path should rarely happen with the new query
                    console.warn("metadataContract missing, resolving manually...");
                    const proposalAddresses = await Promise.all(list.map(async (addr) => {
                        try {
                            return await publicClient.readContract({
                                address: addr,
                                abi: CONTRACT_ABIS.PROPOSAL,
                                functionName: 'proposalAddress'
                            });
                        } catch (e) {
                            return null;
                        }
                    }));
                    index = proposalAddresses.findIndex(addr => addr && addr.toLowerCase() === item.id.toLowerCase());
                }
            } else {
                // Aggregator Mode: item.id is the Organization Metadata Address
                index = list.findIndex(addr => addr.toLowerCase() === item.id.toLowerCase());
            }

            if (index === -1) {
                console.error("Item ID not found in list. Item ID:", item.id);
                console.log("On-chain list:", list);
                alert(`Item ${item.id} not found on-chain. It may have already been removed or there is an index mismatch.`);
                setRemovingId(null);
                return;
            }

            console.log(`Found item ${item.id} at index ${index}`);

            // 2. Call remove function
            const removeMethod = mode === MODE.AGGREGATOR ? 'removeOrganizationMetadata' : 'removeProposalMetadata';

            writeContract({
                address: entity.id,
                abi: abi,
                functionName: removeMethod,
                args: [BigInt(index)],
                chainId: 100
            });

        } catch (error) {
            console.error("Error finding item index:", error);
            alert("Failed to prepare removal transaction. See console.");
            setRemovingId(null);
        }
    };

    const selectProposal = (p) => {
        setTargetAddress(p.id);
        setPropEvent(p.marketName || '');
        // Try to guess question from marketName
        setPropQuestion(p.marketName || '');
    };

    if (subStep === 'create') {
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold text-seer-text">
                        {mode === MODE.AGGREGATOR ? 'Create & Add Organization' : 'Link Proposal'}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setSubStep('list')}>Cancel</Button>
                </div>

                {mode === MODE.ORGANIZATION && (
                    <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2 rounded-surface bg-seer-surface-raised p-3 text-sm text-seer-text">
                            <LightBulbIcon className="h-5 w-5 shrink-0 text-seer-warning" aria-hidden="true" />
                            <span>Search for an existing Proposal Pool to create metadata and link it.</span>
                        </div>
                        <Input
                            label="Search Proposals"
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder="Search by market name..."
                        />

                        {/* Search Results */}
                        {(isSearching || proposals.length > 0) && (
                            <div className="max-h-40 divide-y divide-seer-border overflow-y-auto rounded-surface border border-seer-border bg-seer-surface">
                                {isSearching && <div className="p-2 text-xs text-seer-muted">Searching...</div>}
                                {proposals.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => selectProposal(p)}
                                        className="cursor-pointer p-2 text-sm text-seer-text hover:bg-seer-surface-raised"
                                    >
                                        <div className="font-semibold">{p.marketName}</div>
                                        <div className="break-all font-mono text-xs text-seer-muted">{p.id}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Common Fields */}
                {mode === MODE.AGGREGATOR && (
                    <div className="space-y-3">
                        <Input label="Organization Name" value={name} onChange={setName} placeholder="e.g. Gnosis DAO" />
                    </div>
                )}

                {mode === MODE.ORGANIZATION && (
                    <div className="space-y-3 border-t border-seer-border pt-3">
                        <Input label="Proposal Address (0x...)" value={targetAddress} onChange={setTargetAddress} placeholder="0x123..." mono />
                        <Input label="Market Question" value={propQuestion} onChange={setPropQuestion} placeholder="Will GNO reach..." />
                        <Input label="Event Name" value={propEvent} onChange={setPropEvent} placeholder="GNO Price" />
                    </div>
                )}

                <div className="space-y-3">
                    <Input label="Description" value={description} onChange={setDescription} isTextArea />
                    <Input label="Metadata JSON" value={metadataJSON} onChange={setMetadataJSON} isTextArea mono />
                </div>

                <Button
                    block
                    size="lg"
                    onClick={handleCreateAndAdd}
                    disabled={isTxPending || (mode === MODE.ORGANIZATION && !targetAddress)}
                    busy={isTxPending}
                    className="mt-4"
                >
                    {isTxPending ? 'Confirming...' : (mode === MODE.AGGREGATOR ? 'Create & Add (1-Tx)' : 'Link Proposal (1-Tx)')}
                </Button>
            </div>
        );
    }

    // List View
    const items = mode === MODE.AGGREGATOR ? entity.organizations : entity.proposals;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold tabular-nums text-seer-text">
                    {items?.length || 0} {mode === MODE.AGGREGATOR ? 'Organizations' : 'Proposals'}
                </h3>
                {canEdit && (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => setSubStep('create')}>
                            <PlusIcon className="h-4 w-4" aria-hidden="true" />
                            {mode === MODE.AGGREGATOR ? 'Create New' : 'Add Proposal'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="max-h-[400px] divide-y divide-seer-border overflow-y-auto rounded-surface border border-seer-border">
                {items?.length === 0 && <div className="py-8 text-center text-seer-muted">No content found</div>}
                {items?.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                            <div className="font-semibold text-seer-text">
                                {/* Organizations have 'name', proposals usually don't in this basic query but let's see */}
                                {item.name || item.title || item.id}
                            </div>
                            <div className="break-all font-mono text-xs text-seer-muted">
                                {mode === MODE.ORGANIZATION ? (
                                    <a
                                        href={`/market?proposalId=${item.id}&useContractSource=subgraph-100`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex cursor-pointer items-center gap-1 text-seer-accent-text hover:underline"
                                    >
                                        <span className="min-w-0 break-all">{item.id}</span>
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    </a>
                                ) : (
                                    item.id
                                )}
                            </div>
                            {item.metadataContract && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 break-all font-mono text-[11px] text-seer-muted">
                                    <span className="font-sans">Metadata:</span>
                                    {item.metadataContract}
                                </div>
                            )}
                        </div>
                        {canEdit && (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon
                                onClick={() => handleRemove(item)}
                                disabled={isTxPending || removingId === item.id}
                                className="shrink-0 !text-seer-negative"
                                title="Remove"
                                aria-label="Remove"
                            >
                                {removingId === item.id ? (
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                                )}
                            </Button>
                        )}
                    </div>
                ))}
            </div>
            {items?.length > 0 && <div className="pt-2 text-center text-xs text-seer-muted">Showing {items.length} items</div>}
        </div>
    );
}

function SettingsTab({ entity, isOwner, mode, onRefresh }) {
    const [editorAddr, setEditorAddr] = useState('');
    const [ownerAddr, setOwnerAddr] = useState('');

    const { writeContract, isPending, isSuccess, data: txData } = useWriteContract();
    const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txData });

    useEffect(() => {
        if (isConfirmed) {
            setEditorAddr('');
            setOwnerAddr('');
            onRefresh();
        }
    }, [isConfirmed]);

    const handleSetEditor = () => {
        writeContract({
            address: entity.id,
            abi: mode === MODE.AGGREGATOR ? CONTRACT_ABIS.AGGREGATOR : CONTRACT_ABIS.ORGANIZATION,
            functionName: 'setEditor',
            args: [editorAddr],
            chainId: 100
        });
    };

    const handleTransferOwnership = () => {
        if (!confirm('Are you sure you want to transfer ownership? This cannot be undone.')) return;
        writeContract({
            address: entity.id,
            abi: mode === MODE.AGGREGATOR ? CONTRACT_ABIS.AGGREGATOR : CONTRACT_ABIS.ORGANIZATION,
            functionName: 'transferOwnership',
            args: [ownerAddr],
            chainId: 100
        });
    };

    if (!isOwner) return <div className="p-8 text-center text-seer-muted">Settings are only available to the Owner.</div>;

    return (
        <div className="space-y-8 animate-in fade-in">
            {/* Editor Management */}
            <section className="space-y-3">
                <h3 className="border-b border-seer-border pb-2 text-base font-semibold text-seer-text">Manage Editor</h3>
                <p className="text-sm text-seer-muted">Editors can add/remove content but cannot change ownership.</p>
                <div className="flex gap-2">
                    <Input value={editorAddr} onChange={setEditorAddr} placeholder="0x..." mono />
                    <Button
                        onClick={handleSetEditor}
                        disabled={!editorAddr || isPending}
                        className="self-center"
                    >
                        Set
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            writeContract({
                                address: entity.id,
                                abi: mode === MODE.AGGREGATOR ? CONTRACT_ABIS.AGGREGATOR : CONTRACT_ABIS.ORGANIZATION,
                                functionName: 'revokeEditor',
                                args: [],
                                chainId: 100
                            })
                        }}
                        disabled={isPending}
                        className="self-center !text-seer-negative"
                    >
                        Revoke
                    </Button>
                </div>
            </section>

            {/* Ownership Transfer */}
            <section className="space-y-3">
                <h3 className="border-b border-seer-negative/30 pb-2 text-base font-semibold text-seer-negative">Transfer Ownership</h3>
                <p className="text-sm text-seer-muted">Permanently transfer full control of this entity.</p>
                <div className="flex gap-2">
                    <Input value={ownerAddr} onChange={setOwnerAddr} placeholder="New Owner Address (0x...)" mono />
                    <Button
                        variant="outline"
                        onClick={handleTransferOwnership}
                        disabled={!ownerAddr || isPending}
                        className="self-center !text-seer-negative"
                    >
                        Transfer
                    </Button>
                </div>
            </section>
        </div>
    );
}

// Helper Input
function Input({ label, value, onChange, placeholder, mono, isTextArea }) {
    const control = isTextArea ? (
        <textarea
            value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className={`seer-input text-sm ${mono ? 'font-mono' : ''}`}
            rows={4}
        />
    ) : (
        <input
            type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className={`seer-input text-sm ${mono ? 'font-mono' : ''}`}
        />
    );

    if (!label) return <div className="w-full min-w-0">{control}</div>;

    return (
        <Field label={label} className="w-full min-w-0">
            {control}
        </Field>
    );
}
