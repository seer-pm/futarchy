/**
 * useAggregatorCompanies Hook
 *
 * Fetches organizations (companies) for an aggregator, with their
 * total + active proposal counts, from the Checkpoint registry indexer.
 *
 * Hides organizations whose metadata contains `archived: true` or
 * `visibility: "hidden"` (the latter unless the connected wallet is
 * the org owner/editor — same convention used per proposal).
 */

import { useState, useEffect, useCallback } from 'react';

import { fetchRegistrySnapshot } from '../services/registrySnapshot';
import { getFlmPathForOrg } from '../utils/flm';
import { resolutionKey } from '../utils/onChainResolution';
import { isProposalActive, isProposalArchived } from '../utils/proposalLifecycle';
import { detectProposalChain, fetchUnsettledResolutions } from './useAggregatorProposals';

function parseMetadata(metadataString) {
    if (!metadataString) return {};
    try { return JSON.parse(metadataString); }
    catch (e) {
        console.warn('[useAggregatorCompanies] metadata JSON parse failed:', e);
        return {};
    }
}

/**
 * @param {Object} org - Raw organization row from Checkpoint
 * @param {Array<Object>} proposalsForOrg - That org's non-archived proposals,
 *   as { metadata, onChainResolution } (see fetchAggregatorCompanies)
 */
function transformOrgToCard(org, proposalsForOrg) {
    const meta = parseMetadata(org.metadata);
    const chainId = meta.chain ? parseInt(meta.chain, 10) : 100;

    // "Total proposals" excludes archived ones (treat archive as a delete).
    // "Active proposals" further excludes hidden, resolved, and closed markets.
    const nonArchived = proposalsForOrg;
    const active = nonArchived.filter(p =>
        isProposalActive({ ...p.metadata, onChainResolution: p.onChainResolution })
    );

    return {
        companyID: org.id,
        title: org.name || 'Unknown Organization',
        description: org.description || '',
        image: meta.coverImage || meta.logo || '/assets/fallback-company.png',
        colors: meta.colors || { primary: '#6b21a8' },
        proposals: nonArchived.length,
        proposalsCount: nonArchived.length,
        activeProposals: active.length,
        fromSubgraph: true,
        chainId,
        owner: org.owner,
        editor: org.editor,
        website: meta.website,
        twitter: meta.twitter,
        metadataURI: org.metadataURI,
        flmPath: getFlmPathForOrg(org.id),
        // Surface the parsed org metadata so downstream filters can
        // check archived/visibility without re-parsing.
        _orgMetadata: meta,
    };
}

/**
 * Fetch + assemble all visible organizations under an aggregator.
 * Hidden/archived orgs are filtered out (hidden ones are still shown
 * if the connected wallet is the org owner/editor).
 */
async function fetchAggregatorCompanies(aggregatorAddress, connectedWallet = null) {
    const wallet = connectedWallet?.toLowerCase() || null;

    const { aggregator, organizations, proposalEntities } = await fetchRegistrySnapshot(aggregatorAddress);
    if (!aggregator) {
        throw new Error(`Aggregator not found: ${aggregatorAddress}`);
    }

    // Visibility filter at org level
    const visible = organizations.filter(o => {
        const m = parseMetadata(o.metadata);
        if (m.archived === true) return false;
        if (m.visibility === 'hidden') {
            const isOwner = wallet && o.owner?.toLowerCase() === wallet;
            const isEditor = wallet && o.editor && o.editor !== '0x0000000000000000000000000000000000000000'
                && o.editor.toLowerCase() === wallet;
            return isOwner || isEditor;
        }
        return true;
    });

    // Non-archived proposals of every org, in the shape the proposal lists
    // use, so the on-chain read below is the one they make too.
    const orgMetaById = new Map(organizations.map(o => [o.id, parseMetadata(o.metadata)]));
    const proposals = [];
    for (const p of proposalEntities) {
        const oid = p.organization?.id;
        const metadata = parseMetadata(p.metadata);
        if (!oid || isProposalArchived(metadata)) continue;
        proposals.push({
            orgId: oid,
            proposalAddress: p.proposalAddress,
            chainId: detectProposalChain(metadata, orgMetaById.get(oid) || {}),
            metadata,
            onChainResolution: null,
        });
    }

    // Registry resolution metadata lags the chain, so a market can be resolved
    // while its metadata still reads as open. If the read fails, the counts
    // fall back to metadata alone.
    try {
        const resolutions = await fetchUnsettledResolutions(proposals);
        for (const p of proposals) {
            p.onChainResolution = resolutions.get(resolutionKey(p.chainId, p.proposalAddress)) || null;
        }
    } catch (e) {
        console.warn('[useAggregatorCompanies] on-chain resolution check failed:', e.message);
    }

    // Group proposals by org
    const visibleOrgIds = new Set(visible.map(o => o.id));
    const propsByOrg = new Map();
    for (const p of proposals) {
        if (!visibleOrgIds.has(p.orgId)) continue;
        if (!propsByOrg.has(p.orgId)) propsByOrg.set(p.orgId, []);
        propsByOrg.get(p.orgId).push(p);
    }

    return {
        ...aggregator,
        organizations: visible.map(o => transformOrgToCard(o, propsByOrg.get(o.id) || [])),
    };
}

/**
 * React hook: fetch companies (organizations) for an aggregator.
 *
 * @param {string|null} aggregatorAddress
 * @param {string|null} connectedWallet  optional — used to surface
 *   hidden orgs to their own owner/editor
 */
export function useAggregatorCompanies(aggregatorAddress, connectedWallet = null) {
    const [companies, setCompanies] = useState([]);
    const [aggregatorName, setAggregatorName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Bumped by refetch() to re-run the effect; failed requests are never
    // cached (see services/requestCache.js), so a retry hits the network.
    const [attempt, setAttempt] = useState(0);
    const refetch = useCallback(() => setAttempt(n => n + 1), []);

    useEffect(() => {
        if (!aggregatorAddress) {
            setCompanies([]);
            setAggregatorName('');
            return;
        }

        let cancelled = false;
        async function run() {
            setLoading(true);
            setError(null);
            try {
                const aggregator = await fetchAggregatorCompanies(aggregatorAddress, connectedWallet);
                if (cancelled) return;
                setAggregatorName(aggregator.name || 'Unknown Aggregator');
                setCompanies(aggregator.organizations);
                console.log(`[useAggregatorCompanies] Loaded ${aggregator.organizations.length} companies from ${aggregator.name}`);
            } catch (e) {
                if (cancelled) return;
                console.error('[useAggregatorCompanies] Error:', e);
                setError(e);
                setCompanies([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        run();
        return () => { cancelled = true; };
    }, [aggregatorAddress, connectedWallet, attempt]);

    return { companies, aggregatorName, loading, error, refetch };
}

export async function fetchCompaniesFromAggregator(aggregatorAddress, connectedWallet = null) {
    const aggregator = await fetchAggregatorCompanies(aggregatorAddress, connectedWallet);
    return {
        aggregatorName: aggregator.name,
        companies: aggregator.organizations,
    };
}

export default useAggregatorCompanies;
