import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import {
    defaultTokenName,
    estimateCategoricalGas,
    MAX_CATEGORICAL_OUTCOMES
} from '../../utils/categoricalProposal.mjs';
import { getRpcProvider } from '../../utils/getBestRpc';
import { fetchProposalOutcomes } from '../../utils/proposalOutcomes';

// Gas above this needs a mostly empty block (Gnosis blocks hold 17M).
const CATEGORICAL_GAS_WARNING = 10_000_000;

const inputClass = "w-full px-4 py-3 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-lg text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all";

const PROPOSAL_TYPES = [
    { value: 'binary', title: 'Yes / No', hint: 'Will the proposal pass?' },
    { value: 'categorical', title: 'Choose between options', hint: 'Which of several answers wins?' }
];

/**
 * The answers of a categorical question, each with the token name prefix
 * its outcome tokens get (NAME_GNO, NAME_sDAI). Invalid is added by the
 * factory.
 */
const AnswersInput = ({ outcomes, tokenNames, onChange }) => {
    const update = (index, field, value) => {
        const next = { outcomes: [...outcomes], tokenNames: [...tokenNames] };
        next[field][index] = value;
        onChange(next);
    };
    const remove = (index) => onChange({
        outcomes: outcomes.filter((_, i) => i !== index),
        tokenNames: tokenNames.filter((_, i) => i !== index)
    });
    const add = () => onChange({ outcomes: [...outcomes, ''], tokenNames: [...tokenNames, ''] });
    const gas = estimateCategoricalGas(outcomes.length);

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-futarchyGray11">Answers</label>
            {outcomes.map((answer, index) => (
                <div key={index} className="flex items-center gap-2">
                    <input
                        type="text"
                        aria-label={`Answer ${index + 1}`}
                        className={`${inputClass} flex-[3] !py-2 text-sm`}
                        value={answer}
                        onChange={(e) => update(index, 'outcomes', e.target.value)}
                        placeholder={`Answer ${index + 1}`}
                    />
                    <input
                        type="text"
                        aria-label={`Token name ${index + 1}`}
                        className={`${inputClass} flex-[2] !py-2 font-mono text-xs uppercase`}
                        value={tokenNames[index] || ''}
                        onChange={(e) => update(index, 'tokenNames', e.target.value.toUpperCase())}
                        placeholder={defaultTokenName(answer) || 'TOKEN'}
                    />
                    <button
                        type="button"
                        aria-label={`Remove answer ${index + 1}`}
                        className="p-2 text-futarchyGray9 hover:text-red-500 disabled:opacity-30 disabled:hover:text-futarchyGray9"
                        onClick={() => remove(index)}
                        disabled={outcomes.length <= 2}
                    >
                        ✕
                    </button>
                </div>
            ))}
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    className="text-sm font-medium text-futarchyBlue11 hover:underline disabled:opacity-40 disabled:no-underline"
                    onClick={add}
                    disabled={outcomes.length >= MAX_CATEGORICAL_OUTCOMES}
                >
                    + Add answer
                </button>
                <span className="text-xs text-futarchyGray9">
                    Invalid is added as the last outcome.
                </span>
            </div>
            {gas > CATEGORICAL_GAS_WARNING && (
                <div className="text-xs text-amber-500">
                    {outcomes.length} answers need about {(gas / 1e6).toFixed(1)}M gas; the transaction may wait for a quiet block.
                </div>
            )}
        </div>
    );
};

/**
 * The proposal a categorical question follows up, such as a question with
 * candidates A, B, C and Other followed up on its Other by a question with a
 * new candidate D and Other: the market page then shows both as one market
 * (utils/proposalFamily.js). Picking a proposal fills in its collaterals,
 * which the follow-up must share.
 */
const ParentProposalInput = ({ chainId, parentMarket, parentOutcome, onChange, onCollaterals }) => {
    const [parent, setParent] = useState({ status: 'idle', outcomes: [], error: null });
    const address = parentMarket.trim();

    useEffect(() => {
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
            setParent({ status: 'idle', outcomes: [], error: null });
            return undefined;
        }
        let cancelled = false;
        setParent({ status: 'loading', outcomes: [], error: null });
        fetchProposalOutcomes(address, getRpcProvider(chainId), { chainId })
            .then((proposal) => {
                if (cancelled) return;
                if (proposal.kind !== 'categorical') {
                    setParent({ status: 'error', outcomes: [], error: 'Only an answer of a categorical proposal can be followed up.' });
                    return;
                }
                setParent({ status: 'ready', outcomes: proposal.outcomes.map((outcome) => outcome.label), error: null });
                onCollaterals(proposal.companyToken, proposal.currencyToken);
            })
            .catch(() => { if (!cancelled) setParent({ status: 'error', outcomes: [], error: 'No futarchy proposal at this address on this chain.' }); });
        return () => { cancelled = true; };
        // onCollaterals is a new function every render; the address decides what to read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, chainId]);

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-futarchyGray11">Follows up an answer of (optional)</label>
            <input
                type="text"
                aria-label="Proposal this question follows up"
                className={`${inputClass} font-mono text-sm`}
                value={parentMarket}
                onChange={(e) => onChange({ parentMarket: e.target.value, parentOutcome: '' })}
                placeholder="0x… proposal with an “Other” answer"
            />
            {parent.status === 'loading' && <div className="text-xs text-futarchyGray9">Reading the proposal…</div>}
            {parent.error && <div className="text-xs text-amber-500">{parent.error}</div>}
            {parent.status === 'ready' && (
                <select
                    aria-label="Answer this question follows up"
                    className={inputClass}
                    value={parentOutcome}
                    onChange={(e) => onChange({ parentMarket, parentOutcome: e.target.value })}
                >
                    <option value="">Choose the answer it follows up…</option>
                    {parent.outcomes.map((label, index) => <option key={index} value={String(index)}>{label}</option>)}
                </select>
            )}
            {!address && (
                <div className="text-xs text-futarchyGray9">
                    To add answers later, end the answers with “Other” and follow it up with a new question.
                </div>
            )}
        </div>
    );
};

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
        <div className="space-y-2">
            <label className="text-sm font-medium text-futarchyGray11 dark:text-futarchyGray11">
                {label}
            </label>
            <input
                type="text"
                className="w-full px-4 py-3 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-lg text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9 focus:border-transparent transition-all font-mono text-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || '0x...'}
            />
            {isLoading && (
                <div className="flex items-center gap-2 text-futarchyGray9">
                    <LoadingSpinner className="h-3 w-3" />
                    <span className="text-sm">Checking...</span>
                </div>
            )}
            {!isLoading && error && (
                <div className="text-sm text-red-500">{error}</div>
            )}
            {!isLoading && tokenInfo && (
                <div className="text-sm text-green-500 flex items-center gap-1">
                    ✅ {tokenInfo.symbol} ({tokenInfo.decimals} decimals)
                </div>
            )}
        </div>
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
    const isCategorical = formData.proposalType === 'categorical';

    // Backdrop variants for Framer Motion
    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.3 } },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={handleClose}
                >
                    <motion.div
                        className="bg-white dark:bg-futarchyGray2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-futarchyGray6 dark:border-futarchyGray7"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-futarchyGray6 dark:border-futarchyGray7">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🏛️</span>
                                <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">
                                    Create Proposal
                                </h2>
                                <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded">
                                    DEBUG
                                </span>
                            </div>
                            <button
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="text-futarchyGray9 hover:text-futarchyGray12 dark:hover:text-white transition-colors p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* Chain Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11">Chain</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.values(CHAIN_CONFIG).map((chain) => (
                                        <button
                                            key={chain.id}
                                            type="button"
                                            className={`p-3 rounded-xl border-2 transition-all ${formData.chainId === chain.id
                                                    ? 'border-futarchyBlue9 bg-futarchyBlue2 dark:bg-futarchyBlue3'
                                                    : 'border-futarchyGray6 dark:border-futarchyGray7 hover:border-futarchyGray8'
                                                }`}
                                            onClick={() => handleChainChange(chain.id)}
                                        >
                                            <div className="font-semibold text-futarchyGray12 dark:text-white">
                                                {chain.name}
                                            </div>
                                            <div className="text-xs text-futarchyGray9">Chain {chain.id}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Question type: picks FutarchyFactory or FutarchyCategoricalFactory */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11">Question type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {PROPOSAL_TYPES.map((type) => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            aria-pressed={formData.proposalType === type.value}
                                            className={`p-3 rounded-xl border-2 text-left transition-all ${formData.proposalType === type.value
                                                    ? 'border-futarchyBlue9 bg-futarchyBlue2 dark:bg-futarchyBlue3'
                                                    : 'border-futarchyGray6 dark:border-futarchyGray7 hover:border-futarchyGray8'
                                                }`}
                                            onClick={() => updateField('proposalType', type.value)}
                                        >
                                            <div className="font-semibold text-futarchyGray12 dark:text-white">{type.title}</div>
                                            <div className="text-xs text-futarchyGray9">{type.hint}</div>
                                        </button>
                                    ))}
                                </div>
                                {isCategorical && !chainConfig?.categoricalFactoryAddress && (
                                    <div className="text-xs text-amber-500">
                                        The categorical factory is not deployed on {chainConfig?.name} yet.
                                    </div>
                                )}
                            </div>

                            {/* Market Name */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11">
                                    Market Name / Question
                                </label>
                                <textarea
                                    className={`${inputClass} resize-none`}
                                    value={formData.marketName}
                                    onChange={(e) => updateField('marketName', e.target.value)}
                                    placeholder={isCategorical
                                        ? 'Who will win the election held on YYYY-MM-DD?'
                                        : "Will proposal X be approved? If unresolved by YYYY-MM-DD, resolves to 'No'."}
                                    rows={3}
                                />
                            </div>

                            {isCategorical && (
                                <ParentProposalInput
                                    chainId={formData.chainId}
                                    parentMarket={formData.parentMarket}
                                    parentOutcome={formData.parentOutcome}
                                    onChange={({ parentMarket, parentOutcome }) => setFormData(prev => ({ ...prev, parentMarket, parentOutcome }))}
                                    onCollaterals={(companyToken, currencyToken) => setFormData(prev => ({ ...prev, companyToken, currencyToken }))}
                                />
                            )}

                            {isCategorical && (
                                <AnswersInput
                                    outcomes={formData.outcomes}
                                    tokenNames={formData.tokenNames}
                                    onChange={({ outcomes, tokenNames }) => setFormData(prev => ({ ...prev, outcomes, tokenNames }))}
                                />
                            )}

                            {/* Token Addresses */}
                            <TokenAddressInput
                                label="Company Token (collateralToken1)"
                                value={formData.companyToken}
                                onChange={(val) => updateField('companyToken', val)}
                                chainId={formData.chainId}
                                placeholder={`e.g. ${chainConfig?.defaultTokens?.company?.symbol || 'GNO'} address`}
                            />

                            <TokenAddressInput
                                label="Currency Token (collateralToken2)"
                                value={formData.currencyToken}
                                onChange={(val) => updateField('currencyToken', val)}
                                chainId={formData.chainId}
                                placeholder={`e.g. ${chainConfig?.defaultTokens?.currency?.symbol || 'sDAI'} address`}
                            />

                            {/* Category & Language */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-futarchyGray11">Category</label>
                                    <select
                                        className="w-full px-4 py-3 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-lg text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9"
                                        value={formData.category}
                                        onChange={(e) => updateField('category', e.target.value)}
                                    >
                                        {CATEGORY_PRESETS.map(cat => (
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-futarchyGray11">Language</label>
                                    <select
                                        className="w-full px-4 py-3 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-lg text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9"
                                        value={formData.language}
                                        onChange={(e) => updateField('language', e.target.value)}
                                    >
                                        {LANGUAGE_PRESETS.map(lang => (
                                            <option key={lang.value} value={lang.value}>{lang.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Min Bond */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11">
                                    Min Bond ({chainConfig?.nativeCurrency || 'xDAI'})
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {MIN_BOND_PRESETS.map(preset => (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${formData.minBond === preset.value
                                                    ? 'border-futarchyBlue9 bg-futarchyBlue2 dark:bg-futarchyBlue3 text-futarchyBlue11'
                                                    : 'border-futarchyGray6 dark:border-futarchyGray7 text-futarchyGray11 hover:border-futarchyGray8'
                                                }`}
                                            onClick={() => updateField('minBond', preset.value)}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Opening Time */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-futarchyGray11">
                                    Opening Time (Resolution Deadline)
                                </label>
                                <input
                                    type="datetime-local"
                                    className="w-full px-4 py-3 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-lg text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9"
                                    value={formData.openingTime}
                                    onChange={(e) => updateField('openingTime', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-futarchyGray6 dark:border-futarchyGray7 space-y-4">
                            {/* Status Message */}
                            {status && (
                                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${status.type === 'info' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                                        status.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                                            'bg-green-500/10 text-green-400 border border-green-500/30'
                                    }`}>
                                    {status.type === 'info' && <LoadingSpinner className="h-4 w-4 mt-0.5" />}
                                    {status.type === 'error' && <span>❌</span>}
                                    {status.type === 'success' && <span>✅</span>}
                                    <span>{status.message}</span>
                                </div>
                            )}

                            {/* Result Section */}
                            {transactionHash && (
                                <div className="space-y-3 bg-futarchyGray2 dark:bg-futarchyGray3 p-4 rounded-lg">
                                    <div className="space-y-1">
                                        <span className="text-xs text-futarchyGray9 uppercase">Transaction Hash</span>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-xs text-futarchyGray12 dark:text-white bg-black/20 p-2 rounded break-all">
                                                {transactionHash}
                                            </code>
                                            <button
                                                className="text-xs px-2 py-1 border border-futarchyGray6 rounded hover:bg-futarchyGray4 transition-colors"
                                                onClick={() => copyToClipboard(transactionHash, 'tx')}
                                            >
                                                {copiedField === 'tx' ? '✓' : 'Copy'}
                                            </button>
                                        </div>
                                        <a
                                            href={getExplorerTxUrl(formData.chainId, transactionHash)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-futarchyBlue11 hover:underline"
                                        >
                                            View on {chainConfig?.name} Explorer →
                                        </a>
                                    </div>

                                    {proposalAddress && (
                                        <div className="space-y-1">
                                            <span className="text-xs text-futarchyGray9 uppercase">Proposal Address</span>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 text-xs text-futarchyGray12 dark:text-white bg-black/20 p-2 rounded break-all">
                                                    {proposalAddress}
                                                </code>
                                                <button
                                                    className="text-xs px-2 py-1 border border-futarchyGray6 rounded hover:bg-futarchyGray4 transition-colors"
                                                    onClick={() => copyToClipboard(proposalAddress, 'addr')}
                                                >
                                                    {copiedField === 'addr' ? '✓' : 'Copy'}
                                                </button>
                                            </div>
                                            <a
                                                href={getExplorerAddressUrl(formData.chainId, proposalAddress)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-futarchyBlue11 hover:underline"
                                            >
                                                View Contract →
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Submit Button */}
                            {!transactionHash && (
                                <button
                                    type="submit"
                                    className={`w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${!isConnected
                                            ? 'bg-futarchyGray6 cursor-not-allowed'
                                            : isSubmitting
                                                ? 'bg-futarchyBlue9 opacity-75 cursor-wait'
                                                : 'bg-gradient-to-r from-futarchyBlue9 to-futarchyBlue11 hover:from-futarchyBlue10 hover:to-futarchyBlue12'
                                        }`}
                                    disabled={isSubmitting || !isConnected}
                                    onClick={handleSubmit}
                                >
                                    {!isConnected ? (
                                        '🔗 Connect Wallet First'
                                    ) : isSubmitting ? (
                                        <>
                                            <LoadingSpinner className="h-5 w-5" />
                                            Processing...
                                        </>
                                    ) : (
                                        '🚀 Create Proposal'
                                    )}
                                </button>
                            )}

                            {/* Close button after success */}
                            {transactionHash && (
                                <button
                                    type="button"
                                    className="w-full py-4 rounded-xl font-semibold text-white bg-futarchyGray8 hover:bg-futarchyGray9 transition-all"
                                    onClick={handleClose}
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CreateProposalModal;
