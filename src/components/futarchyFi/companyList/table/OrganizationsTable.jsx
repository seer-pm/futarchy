import React, { useState, useMemo } from 'react';
import OrgRow from './OrgRow';

/**
 * Sortable column header
 */
const SortableHeader = ({ label, field, currentSort, onSort, align = 'left' }) => {
    const isActive = currentSort.field === field;
    const direction = isActive ? currentSort.direction : null;

    const alignClass = align === 'center' ? 'justify-center' : 'justify-start';

    return (
        <th
            className={`py-3 px-4 text-xs font-medium text-futarchyGray11 dark:text-futarchyGray112 uppercase tracking-wider cursor-pointer hover:text-futarchyViolet7 transition-colors select-none`}
            onClick={() => onSort(field)}
        >
            <div className={`flex items-center gap-1 ${alignClass}`}>
                {label}
                <span className="text-futarchyGray11/50">
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyViolet7"></div>
            </div>
        );
    }

    // A failed registry request is not an empty registry: say so, and let
    // the user try again instead of reading "No organizations found".
    if (error) {
        return (
            <div role="alert" className="flex flex-col items-center justify-center gap-3 h-40 rounded-xl border-2 border-futarchyGray4 dark:border-futarchyGray112/40 text-center">
                <p className="text-sm font-semibold text-futarchyGray12 dark:text-white">
                    Couldn&apos;t load organizations
                </p>
                <p className="text-xs text-futarchyGray11">
                    The registry did not respond. Check your connection and try again.
                </p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border-2 border-futarchyGray4 dark:border-futarchyGray112/40 text-futarchyGray12 dark:text-white hover:border-futarchyViolet7 transition-colors"
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
                        type="text"
                        placeholder="Filter by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 rounded-xl border-2 border-futarchyGray4 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 text-futarchyGray12 dark:text-white placeholder:text-futarchyGray11 focus:border-futarchyViolet7 focus:outline-none transition-colors"
                    />
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-futarchyGray11"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border-2 border-futarchyGray4 dark:border-futarchyGray112/40">
                <table className="w-full">
                    <thead className="bg-futarchyGray3 dark:bg-futarchyDarkGray2 border-b border-futarchyGray4 dark:border-futarchyGray112/40">
                        <tr>
                            <th className="py-3 px-4 w-16"></th>
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
                            />
                            <th className="py-3 px-4 text-xs font-medium text-futarchyGray11 dark:text-futarchyGray112 uppercase tracking-wider">
                                Chain
                            </th>
                            <th className="py-3 px-4 text-xs font-medium text-futarchyGray11 dark:text-futarchyGray112 uppercase tracking-wider">
                                Liquidity
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-transparent divide-y divide-futarchyGray4 dark:divide-futarchyGray112/10">
                        {filteredOrgs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-8 text-center text-futarchyGray11">
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
            <div className="mt-3 text-sm text-futarchyGray11">
                {filteredOrgs.length} organization{filteredOrgs.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};

export default OrganizationsTable;
