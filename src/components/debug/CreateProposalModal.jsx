import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@seer-pm/ui-kit/react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useCreateProposal } from './hooks/useCreateProposal';
import { useTokenValidation } from './hooks/useTokenValidation';
import {
    CHAIN_CONFIG,
    MIN_BOND_PRESETS,
    CATEGORY_PRESETS,
    LANGUAGE_PRESETS,
    DEFAULT_CHAIN_ID,
    getExplorerTxUrl,
    getExplorerAddressUrl
} from './constants/chainConfig';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Field';

// Loading Spinner (matching ConfirmSwapModal style)
const LoadingSpinner = ({ className = "" }) => (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24">
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            opacity="0.15"
        />
        <path
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            d="M4 12a8 8 0 018-8"
        />
    </svg>
);

/**
 * Token Address Input with automatic validation
 */
const TokenAddressInput = ({ label, value, onChange, chainId, placeholder }) => {
    const { tokenInfo, isLoading, error, validateAddress } = useTokenValidation(chainId);

    // Validate when address changes or reaches full length
    useEffect(() => {
        const trimmed = value?.trim() || '';
        if (trimmed.length === 42 && trimmed.startsWith('0x')) {
            validateAddress(trimmed);
        }
    }, [value, chainId, validateAddress]);

    return (
        <Field label={label}>
            <Input
                type="text"
                className="font-mono text-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || '0x...'}
            />
            {isLoading && (
                <span className="flex items-center gap-2 text-[13px] text-seer-muted">
                    <LoadingSpinner className="h-3 w-3" />
                    <span>Checking...</span>
                </span>
            )}
            {!isLoading && error && (
                <span className="seer-error">{error}</span>
            )}
            {!isLoading && tokenInfo && (
                <span className="flex items-center gap-1 text-[13px] font-semibold text-seer-positive">
                    <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                    {tokenInfo.symbol} ({tokenInfo.decimals} decimals)
                </span>
            )}
        </Field>
    );
};

/**
 * Create Proposal Modal Component
 * Uses Tailwind styling matching ConfirmSwapModal pattern
 */
const CreateProposalModal = ({ isOpen, onClose }) => {
    const {
        isSubmitting,
        status,
        transactionHash,
        proposalAddress,
        isConnected,
        getDefaultFormData,
        createProposal,
        reset
    } = useCreateProposal();

    // Form state
    const [formData, setFormData] = useState(() => getDefaultFormData(DEFAULT_CHAIN_ID));
    const [copiedField, setCopiedField] = useState(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(getDefaultFormData(DEFAULT_CHAIN_ID));
            reset();
        }
    }, [isOpen, getDefaultFormData, reset]);

    // Update form when chain changes
    const handleChainChange = useCallback((newChainId) => {
        setFormData(prev => ({
            ...prev,
            chainId: newChainId,
            companyToken: CHAIN_CONFIG[newChainId]?.defaultTokens?.company?.address || '',
            currencyToken: CHAIN_CONFIG[newChainId]?.defaultTokens?.currency?.address || ''
        }));
    }, []);

    // Update form field
    const updateField = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    // Copy to clipboard
    const copyToClipboard = useCallback(async (text, field) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, []);

    // Handle submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        await createProposal(formData);
    };

    // Close handler
    const handleClose = () => {
        if (!isSubmitting) {
            onClose();
        }
    };

    if (!isOpen) return null;

    const chainConfig = CHAIN_CONFIG[formData.chainId];

    const statusTone = status?.type === 'info'
        ? 'border-seer-border bg-seer-surface-raised text-seer-text'
        : status?.type === 'error'
            ? 'border-seer-negative/40 bg-seer-negative/10 text-seer-negative'
            : 'border-seer-positive/40 bg-seer-positive/10 text-seer-positive';

    const resultRow = (label, text, field, href, linkLabel) => (
        <div className="space-y-1">
            <span className="text-[13px] text-seer-muted">{label}</span>
            <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-control bg-seer-surface p-2 text-xs text-seer-text">
                    {text}
                </code>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(text, field)}>
                    {copiedField === field ? 'Copied' : 'Copy'}
                </Button>
            </div>
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-seer-accent-text hover:underline"
            >
                {linkLabel}
            </a>
        </div>
    );

    const footer = (
        <>
            {/* Status Message */}
            {status && (
                <div role="status" className={`flex basis-full items-start gap-2 rounded-surface border p-3 text-sm ${statusTone}`}>
                    {status.type === 'info' && <LoadingSpinner className="mt-0.5 h-4 w-4" />}
                    {status.type === 'error' && <XCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />}
                    {status.type === 'success' && <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 break-words">{status.message}</span>
                </div>
            )}

            {/* Result Section */}
            {transactionHash && (
                <div className="basis-full space-y-3 rounded-surface border border-seer-border bg-seer-surface-raised p-4">
                    {resultRow(
                        'Transaction hash',
                        transactionHash,
                        'tx',
                        getExplorerTxUrl(formData.chainId, transactionHash),
                        `View on ${chainConfig?.name} Explorer →`
                    )}
                    {proposalAddress && resultRow(
                        'Proposal address',
                        proposalAddress,
                        'addr',
                        getExplorerAddressUrl(formData.chainId, proposalAddress),
                        'View Contract →'
                    )}
                </div>
            )}

            {/* Submit Button */}
            {!transactionHash && (
                <Button
                    type="submit"
                    size="lg"
                    block
                    disabled={isSubmitting || !isConnected}
                    busy={isSubmitting}
                    onClick={handleSubmit}
                >
                    {!isConnected ? 'Connect wallet first' : isSubmitting ? 'Processing...' : 'Create proposal'}
                </Button>
            )}

            {/* Close button after success */}
            {transactionHash && (
                <Button variant="outline" size="lg" block onClick={handleClose}>
                    Close
                </Button>
            )}
        </>
    );

    const optionClass = (selected) => `rounded-control border text-left transition-colors ${selected
        ? 'border-seer-accent-text bg-seer-accent-soft text-seer-accent-text'
        : 'border-seer-border text-seer-text hover:border-seer-accent-text'
        }`;

    return (
        <Dialog
            open={isOpen}
            onClose={handleClose}
            dismissible={!isSubmitting}
            title={(
                <span className="flex items-center gap-2">
                    Create Proposal
                    <Badge tone="warning">DEBUG</Badge>
                </span>
            )}
            footer={footer}
        >
            <div className="space-y-5">
                {/* Chain Selector */}
                <div className="seer-field">
                    <span className="seer-label">Chain</span>
                    <div className="grid grid-cols-2 gap-3">
                        {Object.values(CHAIN_CONFIG).map((chain) => (
                            <button
                                key={chain.id}
                                type="button"
                                aria-pressed={formData.chainId === chain.id}
                                className={`p-3 ${optionClass(formData.chainId === chain.id)}`}
                                onClick={() => handleChainChange(chain.id)}
                            >
                                <div className="font-semibold">{chain.name}</div>
                                <div className="text-xs text-seer-muted">Chain {chain.id}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Market Name */}
                <Field label="Market name / question">
                    <textarea
                        className="seer-input resize-none"
                        value={formData.marketName}
                        onChange={(e) => updateField('marketName', e.target.value)}
                        placeholder="Will proposal X be approved? If unresolved by YYYY-MM-DD, resolves to 'No'."
                        rows={3}
                    />
                </Field>

                {/* Token Addresses */}
                <TokenAddressInput
                    label="Company token (collateralToken1)"
                    value={formData.companyToken}
                    onChange={(val) => updateField('companyToken', val)}
                    chainId={formData.chainId}
                    placeholder={`e.g. ${chainConfig?.defaultTokens?.company?.symbol || 'GNO'} address`}
                />

                <TokenAddressInput
                    label="Currency token (collateralToken2)"
                    value={formData.currencyToken}
                    onChange={(val) => updateField('currencyToken', val)}
                    chainId={formData.chainId}
                    placeholder={`e.g. ${chainConfig?.defaultTokens?.currency?.symbol || 'sDAI'} address`}
                />

                {/* Category & Language */}
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Category" className="min-w-0">
                        <select
                            className="seer-input"
                            value={formData.category}
                            onChange={(e) => updateField('category', e.target.value)}
                        >
                            {CATEGORY_PRESETS.map(cat => (
                                <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Language" className="min-w-0">
                        <select
                            className="seer-input"
                            value={formData.language}
                            onChange={(e) => updateField('language', e.target.value)}
                        >
                            {LANGUAGE_PRESETS.map(lang => (
                                <option key={lang.value} value={lang.value}>{lang.label}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                {/* Min Bond */}
                <div className="seer-field">
                    <span className="seer-label">Min bond ({chainConfig?.nativeCurrency || 'xDAI'})</span>
                    <div className="flex flex-wrap gap-2">
                        {MIN_BOND_PRESETS.map(preset => (
                            <button
                                key={preset.value}
                                type="button"
                                aria-pressed={formData.minBond === preset.value}
                                className={`px-4 py-2 text-sm font-semibold ${optionClass(formData.minBond === preset.value)}`}
                                onClick={() => updateField('minBond', preset.value)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Opening Time */}
                <Field label="Opening time (resolution deadline)">
                    <Input
                        type="datetime-local"
                        value={formData.openingTime}
                        onChange={(e) => updateField('openingTime', e.target.value)}
                    />
                </Field>
            </div>
        </Dialog>
    );
};

export default CreateProposalModal;
