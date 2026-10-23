import React, { useState, useMemo } from 'react';
import OrgRow from './OrgRow';

/**
 * Sortable column header
 */
const SortableHeader = ({ label, field, currentSort, onSort, align = 'left', hideClass = '' }) => {
    const isActive = currentSort.field === field;
    const direction = isActive ? currentSort.direction : null;

    const alignClass = align === 'center' ? 'justify-center' : 'justify-start';

    return (
        <th
            className={`py-3 px-4 text-xs font-semibold text-seer-muted uppercase tracking-wide cursor-pointer hover:text-seer-text transition-colors select-none ${hideClass}`}
            onClick={() => onSort(field)}
        >
            <div className={`flex items-center gap-1 ${alignClass}`}>
                {label}
                <span className="text-seer-muted/60">
                    {direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : ''}
                </span>
            </div>
        </th>
    );
};

/**
 * Organizations Table Component
 * Displays orgs in a sortable, filterable table format
 */
const OrganizationsTable = ({
    organizations = [],
    connectedWallet = null,
    onOrgClick,
    loading = false,
    error = null,
    onRetry = null,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [sort, setSort] = useState({ field: 'proposalsCount', direction: 'desc' });

    // Handle sort toggle
    const handleSort = (field) => {
        setSort(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    // Filter and sort organizations
    const filteredOrgs = useMemo(() => {
        let result = [...organizations];

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(org =>
                org.title?.toLowerCase().includes(query)
            );
        }

        // Sort
        result.sort((a, b) => {
            const aVal = a[sort.field] ?? 0;
            const bVal = b[sort.field] ?? 0;

            if (typeof aVal === 'string') {
                return sort.direction === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }

            return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return result;
    }, [organizations, searchQuery, sort]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-seer-border border-t-seer-purple" role="status" aria-label="Loading organizations"></div>
            </div>
        );
    }

    // A failed registry request is not an empty registry: say so, and let
    // the user try again instead of reading "No organizations found".
    if (error) {
        return (
            <div role="alert" className="flex flex-col items-center justify-center gap-3 h-40 rounded-surface border border-seer-border bg-seer-surface text-center">
                <p className="text-sm font-semibold text-seer-text">
                    Couldn&apos;t load organizations
                </p>
                <p className="text-xs text-seer-muted">
                    The registry did not respond. Check your connection and try again.
                </p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="seer-button seer-button-outline seer-button-sm"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Search Bar */}
            <div className="mb-4 flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <input
                        type="search"
                        aria-label="Filter organizations by name"
                        placeholder="Filter by name"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="seer-input !pl-10"
                    />
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-seer-muted" aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-surface border border-seer-border bg-seer-surface">
                <table className="w-full">
                    <thead className="border-b border-seer-border">
                        <tr>
                            <th className="py-3 pl-4 pr-0 w-14"><span className="sr-only">Logo</span></th>
                            <SortableHeader
                                label="Name"
                                field="title"
                                currentSort={sort}
                                onSort={handleSort}
                            />
                            <SortableHeader
                                label="Active"
                                field="activeProposals"
                                currentSort={sort}
                                onSort={handleSort}
                                align="center"
                            />
                            <SortableHeader
                                label="Proposals"
                                field="proposalsCount"
                                currentSort={sort}
                                onSort={handleSort}
                                align="center"
                                hideClass="hidden sm:table-cell"
                            />
                            <th className="hidden sm:table-cell py-3 px-4 text-left text-xs font-semibold text-seer-muted uppercase tracking-wide">
                                Chain
                            </th>
                            <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-seer-muted uppercase tracking-wide">
                                Liquidity
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-seer-border">
                        {filteredOrgs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-8 text-center text-sm text-seer-muted">
                                    {searchQuery ? 'No organizations match your search' : 'No organizations found'}
                                </td>
                            </tr>
                        ) : (
                            filteredOrgs.map((org) => (
                                <OrgRow
                                    key={org.companyID}
                                    companyID={org.companyID}
                                    title={org.title}
                                    image={org.image}
                                    activeProposals={org.activeProposals || 0}
                                    proposalsCount={org.proposals || org.proposalsCount || 0}
                                    chainId={org.chainId || 100}
                                    flmPath={org.flmPath}
                                    hasActiveMarket={(org.activeProposals || 0) > 0}
                                    isOwner={connectedWallet && org.owner?.toLowerCase() === connectedWallet.toLowerCase()}
                                    onClick={() => onOrgClick?.(org)}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Results count */}
            <div className="mt-3 text-[13px] text-seer-muted">
                {filteredOrgs.length} organization{filteredOrgs.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};

export default OrganizationsTable;
