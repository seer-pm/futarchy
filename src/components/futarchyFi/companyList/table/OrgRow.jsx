import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

import ChainBadge from '../components/ChainBadge';
import Badge from '../../../ui/Badge';

/**
 * Single row in the Organizations table
 * Displays: Logo | Name + Active Badge | Active | Proposals | Chain | Liquidity
 */
const OrgRow = ({
    companyID,
    title,
    image,
    activeProposals = 0,
    proposalsCount = 0,
    chainId = 100, // Default to Gnosis
    flmPath = null,
    hasActiveMarket = false,
    isOwner = false,
    onClick,
}) => {
    return (
        <tr
            onClick={onClick}
            className="hover:bg-seer-surface-raised cursor-pointer transition-colors group"
        >
            {/* Logo */}
            <td className="py-3 pl-4 pr-0 w-14">
                <div className="w-9 h-9 relative rounded-full overflow-hidden bg-seer-surface-raised flex-shrink-0">
                    <Image
                        src={image || '/assets/fallback-company.png'}
                        alt={title}
                        layout="fill"
                        objectFit="cover"
                    />
                </div>
            </td>

            {/* Name + Badges */}
            <td className="py-3 px-3">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-seer-text group-hover:text-seer-accent-text transition-colors">
                        {title}
                    </span>
                    {hasActiveMarket && (
                        <Badge tone="accent">Open market</Badge>
                    )}
                    {isOwner && (
                        <Badge>Owner</Badge>
                    )}
                </div>
            </td>

            {/* Active Proposals Count */}
            <td className="py-3 px-4 text-center tabular-nums">
                <span className={`font-semibold ${activeProposals > 0 ? 'text-seer-accent-text' : 'text-seer-muted'}`}>
                    {activeProposals}
                </span>
            </td>

            {/* Total Proposals Count */}
            <td className="hidden sm:table-cell py-3 px-4 text-center tabular-nums">
                <span className="text-seer-text font-semibold">
                    {proposalsCount}
                </span>
            </td>

            {/* Chain */}
            <td className="hidden sm:table-cell py-3 px-4">
                <ChainBadge chainId={chainId} size="sm" />
            </td>

            {/* Liquidity */}
            <td className="hidden md:table-cell py-3 px-4">
                {flmPath ? (
                    <Link
                        href={flmPath}
                        onClick={(event) => event.stopPropagation()}
                        className="seer-button seer-button-outline seer-button-sm"
                    >
                        <span>Liquidity</span>
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-seer-muted" aria-hidden="true" />
                    </Link>
                ) : (
                    <span className="text-sm text-seer-muted">—</span>
                )}
            </td>
        </tr>
    );
};

export default OrgRow;
