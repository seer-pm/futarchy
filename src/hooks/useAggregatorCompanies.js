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

import { useState, useEffect } from 'react';

import { fetchRegistrySnapshot } from '../services/registrySnapshot';
import { getFlmPathForOrg } from '../utils/flm';
import { isProposalActive, isProposalArchived } from '../utils/proposalLifecycle';

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
 * @param {Array<Object>} proposalsForOrg - Raw proposalEntity rows whose organization === org
 */
function transformOrgToCard(org, proposalsForOrg) {
    const meta = parseMetadata(org.metadata);
    const chainId = meta.chain ? parseInt(meta.chain, 10) : 100;

    // "Total proposals" excludes archived ones (treat archive as a delete).
    // "Active proposals" further excludes hidden, resolved, and closed markets.
    const proposalMetadata = proposalsForOrg.map(p => parseMetadata(p.metadata));
    const nonArchived = proposalMetadata.filter(pm => !isProposalArchived(pm));
    const active = nonArchived.filter(pm => isProposalActive(pm));

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

    // Group proposals by org
    const visibleOrgIds = new Set(visible.map(o => o.id));
    const propsByOrg = new Map();
    for (const p of proposalEntities) {
        const oid = p.organization?.id;
        if (!oid || !visibleOrgIds.has(oid)) continue;
        if (!propsByOrg.has(oid)) propsByOrg.set(oid, []);
        propsByOrg.get(oid).push(p);
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
    }, [aggregatorAddress, connectedWallet]);

    return { companies, aggregatorName, loading, error };
}

export async function fetchCompaniesFromAggregator(aggregatorAddress, connectedWallet = null) {
    const aggregator = await fetchAggregatorCompanies(aggregatorAddress, connectedWallet);
    return {
        aggregatorName: aggregator.name,
        companies: aggregator.organizations,
    };
}

export default useAggregatorCompanies;
