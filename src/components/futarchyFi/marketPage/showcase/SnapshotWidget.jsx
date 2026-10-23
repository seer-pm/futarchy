import { useMemo } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { SHOW_DATA_DEBUG } from '../../../../config/featureFlags';
import Badge from '../../../ui/Badge';

// Vote choices map onto status, not onto the market's outcomes: For is positive, Against is
// negative, Abstain stays neutral.
const CHOICE_TONES = {
  success: { bar: 'bg-seer-positive', text: 'text-seer-positive' },
  danger: { bar: 'bg-seer-negative', text: 'text-seer-negative' },
  neutral: { bar: 'bg-seer-muted', text: 'text-seer-muted' },
};

// 1300000000 → "1.3B", 1300000 → "1.3M", 47100 → "47.1k", 5000 → "5k"
const formatCount = (count) => {
  const compact = (value, suffix) => {
    const formatted = value.toFixed(1);
    return (formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted) + suffix;
  };
  if (count >= 1000000000) return compact(count / 1000000000, 'B');
  if (count >= 1000000) return compact(count / 1000000, 'M');
  if (count >= 1000) return compact(count / 1000, 'k');
  return count.toLocaleString();
};

const parsePercentage = (percentage) =>
  typeof percentage === 'number' ? percentage : parseFloat(String(percentage).replace('%', ''));

/**
 * The DAO's Snapshot vote on the same proposal, read beside the market's test: the result per
 * choice, the quorum, and a link to the vote. Renders nothing until Snapshot data exists.
 */
const SnapshotWidget = ({
  snapshotData,
  snapshotLoading,
  snapshotSource,
  snapshotProposalId,
}) => {
  const items = snapshotData?.items || [];

  const snapshotProposalUrl = useMemo(() => {
    if (!snapshotProposalId) return null;
    const spaceId = snapshotData?.spaceId || 'gnosis.eth';
    return `https://snapshot.box/#/s:${spaceId}/proposal/${snapshotProposalId}`;
  }, [snapshotProposalId, snapshotData]);

  if (!snapshotData?.items) return null;

  const currentTime = Math.floor(Date.now() / 1000);
  const isProposalClosed = snapshotData.state === 'closed' || (snapshotData.end && currentTime >= snapshotData.end);

  let stateBadge = <Badge tone="accent">Voting open</Badge>;
  if (isProposalClosed) {
    stateBadge = snapshotData.proposalApproved === true
      ? <Badge tone="positive">Approved</Badge>
      : snapshotData.proposalApproved === false
        ? <Badge tone="negative">Rejected</Badge>
        : <Badge>Closed</Badge>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-seer-text">Snapshot vote</h3>
          {stateBadge}
          {snapshotLoading && (
            <span className="h-3 w-3 rounded-full border-2 border-seer-border border-t-seer-purple animate-spin" aria-label="Loading vote" />
          )}
          {SHOW_DATA_DEBUG && snapshotSource === 'api' && (
            <span className="text-[10px] text-seer-accent-text" aria-hidden="true">api</span>
          )}
        </div>
        {snapshotProposalUrl && (
          <a
            href={snapshotProposalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-seer-accent-text hover:underline underline-offset-2"
          >
            {isProposalClosed ? 'Final result on Snapshot' : 'Vote on Snapshot'}
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((item, index) => {
          const tone = CHOICE_TONES[item.colorKey] || CHOICE_TONES.neutral;
          const percentage = Math.max(0, Math.min(100, parsePercentage(item.percentage) || 0));
          return (
            <li key={item.key || index} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
              <span className="text-sm text-seer-text truncate">{item.label}</span>
              <span className="flex items-baseline gap-3 text-sm tabular-nums">
                <span className="text-seer-muted">{formatCount(item.count)}</span>
                <span className={`font-semibold ${tone.text}`}>{item.percentage}</span>
              </span>
              <span className="col-span-2 h-1.5 rounded-full bg-seer-surface-raised overflow-hidden" aria-hidden="true">
                <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${percentage}%` }} />
              </span>
            </li>
          );
        })}
      </ul>

      {snapshotData.quorumPercent !== null && snapshotData.quorumPercent !== undefined && (
        <p className="text-[13px] text-seer-muted">
          Quorum <span className="font-semibold text-seer-text tabular-nums">{snapshotData.quorumPercent}</span>
        </p>
      )}
    </div>
  );
};

export { SnapshotWidget };
