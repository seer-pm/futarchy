import { useEffect, useState, useMemo } from 'react';
import { SHOW_DATA_DEBUG } from '../../../../config/featureFlags';

// Results Breakdown Component for Snapshot Widget - Matches exact design from screenshot
const ResultsBreakdown = ({ items = [], totalCount = 0, quorumPercent = null, title = "VOTING RESULTS" }) => {
  // Helper to get border and background colors based on colorKey
  const getItemColors = (colorKey) => {
    const colorMap = {
      success: {
        border: 'border-futarchyTeal7',
        ring: 'ring-futarchyTeal7/60',
        bgFill: 'bg-futarchyTeal7/50 dark:bg-futarchyTeal7/35',
        iconBg: 'bg-futarchyTeal7/20 dark:bg-futarchyTeal7/35',
        iconRing: 'ring-futarchyTeal7/50',
        iconColor: 'text-futarchyTeal11 dark:text-futarchyTeal11', // Lighter teal for better visibility
        percentColor: 'text-futarchyTeal9',
      },
      danger: {
        border: 'border-futarchyCrimson7',
        ring: 'ring-futarchyCrimson7/60',
        bgFill: 'bg-futarchyCrimson7/50 dark:bg-futarchyCrimson7/35',
        iconBg: 'bg-futarchyCrimson7/20 dark:bg-futarchyCrimson7/35',
        iconRing: 'ring-futarchyCrimson7/50',
        iconColor: 'text-futarchyCrimson9',
        percentColor: 'text-futarchyCrimson9',
      },
      neutral: {
        border: 'border-futarchyGray62',
        ring: 'ring-futarchyGray62/70',
        bgFill: 'bg-futarchyGray112/60 dark:bg-futarchyGray112/45',
        iconBg: 'bg-futarchyGray112/40 dark:bg-white/15',
        iconRing: 'ring-futarchyGray62/60',
        iconColor: 'text-futarchyGray11 dark:text-futarchyGray122',
        percentColor: 'text-futarchyGray11 dark:text-futarchyGray112',
      },
    };
    return colorMap[colorKey] || colorMap.neutral;
  };

  // Helper to format count (e.g., 1300000000 → "1.3B", 1300000 → "1.3M", 47100 → "47.1k", 5000 → "5k")
  const formatCount = (count) => {
    if (count >= 1000000000) {
      const formatted = (count / 1000000000).toFixed(1);
      // Remove .0 if it's a whole number (1.0B → 1B)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'B' : formatted + 'B';
    } else if (count >= 1000000) {
      const formatted = (count / 1000000).toFixed(1);
      // Remove .0 if it's a whole number (1.0M → 1M)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'M' : formatted + 'M';
    } else if (count >= 1000) {
      const formatted = (count / 1000).toFixed(1);
      // Remove .0 if it's a whole number (5.0k → 5k)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'k' : formatted + 'k';
    }
    return count.toLocaleString();
  };

  // Helper to parse percentage string to number (e.g., "67.57%" → 67.57)
  const parsePercentage = (percentageStr) => {
    if (typeof percentageStr === 'number') return percentageStr;
    return parseFloat(percentageStr.replace('%', ''));
  };

  return (
    <section className="w-full max-w-xl select-none font-oxanium" aria-labelledby="results-title">
      {/* Header with Snapshot Icon */}
      <div className="flex items-center gap-2 mb-3">
        <svg viewBox="0 0 105 126" aria-hidden="true" className="h-5 w-5 text-futarchyTeal9 dark:text-futarchyTeal7" fill="#FFAC33" xmlns="http://www.w3.org/2000/svg">
          <path d="M104.781694,54.7785 C104.270697,53.41 102.961707,52.5 101.498717,52.5 L59.2365129,52.5 L83.6138421,5.103 C84.3803368,3.612 83.9848395,1.7885 82.6653488,0.7525 C82.0283532,0.2485 81.2618586,0 80.498864,0 C79.6833697,0 78.8678754,0.287 78.21338,0.8505 L52.4990602,23.058 L1.21391953,67.3505 C0.107927276,68.306 -0.291069928,69.8495 0.219926491,71.218 C0.730922911,72.5865 2.03641376,73.5 3.49940351,73.5 L45.7616074,73.5 L21.3842782,120.897 C20.6177836,122.388 21.0132808,124.2115 22.3327715,125.2475 C22.9697671,125.7515 23.7362617,126 24.4992564,126 C25.3147506,126 26.1302449,125.713 26.7847403,125.1495 L52.4990602,102.942 L103.784201,58.6495 C104.893693,57.694 105.28919,56.1505 104.781694,54.7785 L104.781694,54.7785 Z" />
        </svg>
        <h2 id="results-title" className="text-sm tracking-wide text-futarchyGray11 dark:text-futarchyGray112">
          {title}
        </h2>
      </div>

      {/* Results List */}
      <div className="space-y-3">
        {items.map((item, index) => {
          const colors = getItemColors(item.colorKey);
          const percentageNum = parsePercentage(item.percentage);

          return (
            <div
              key={index}
              className={`relative overflow-hidden rounded-2xl border-2 ${colors.border} ring-1 ring-inset ${colors.ring} bg-transparent`}
              role="group"
              aria-label={`${item.label} ${item.percentage}`}
            >
              {/* Background fill bar */}
              <div
                className={`absolute inset-y-0 left-0 ${colors.bgFill}`}
                aria-hidden="true"
                style={{ width: `${percentageNum}%` }}
              />

              {/* Shine effect on hover */}
              <div className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-futarchyGray1/15 dark:via-white/10 to-transparent pointer-events-none"></div>

              {/* Content */}
              <div className="relative z-10 flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Icon circle */}
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${colors.iconBg} ring-1 ring-inset ${colors.iconRing}`}
                    aria-hidden="true"
                  >
                    <span className={colors.iconColor}>{item.icon}</span>
                  </span>

                  {/* Label */}
                  <span className="text-base font-medium text-futarchyGray12 dark:text-futarchyGray3 shadow-[0_0_1px_rgba(0,0,0,0.25)] dark:shadow-[0_0_1px_rgba(255,255,255,0.15)]">
                    {item.label}
                  </span>
                </div>

                {/* Count and Percentage */}
                <div className="flex items-baseline gap-3 tabular-nums">
                  <span className="text-sm text-futarchyGray11 dark:text-futarchyGray112">
                    {formatCount(item.count)}
                  </span>
                  <span className={`text-sm font-semibold ${colors.percentColor}`}>
                    {item.percentage}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quorum */}
      {quorumPercent !== null && (
        <p className="mt-4 text-sm text-futarchyGray11 dark:text-futarchyGray112">
          <span className="opacity-70">Quorum:</span>{' '}
          <span className="font-medium">{quorumPercent}</span>
        </p>
      )}
    </section>
  );
};

// Snapshot Results Widget Component
const SnapshotWidget = ({
  snapshotData,
  snapshotLoading,
  snapshotSource,
  snapshotProposalId,
  snapshotHighestResult
}) => {
  const [isWidgetExpanded, setIsWidgetExpanded] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // SVG Icon Components
  const CheckIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );

  const XIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  const LineIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
    </svg>
  );

  const renderIcon = (iconType) => {
    switch (iconType) {
      case 'check': return CheckIcon;
      case 'x': return XIcon;
      case 'line': return LineIcon;
      default: return null;
    }
  };

  // Use Snapshot data or fallback
  const snapshotResultsData = useMemo(() => {
    if (snapshotData && snapshotData.items) {
      return {
        items: snapshotData.items.map(item => ({
          ...item,
          icon: renderIcon(item.iconType),
        })),
        totalCount: snapshotData.totalCount,
        quorumPercent: snapshotData.quorumPercent,
      };
    }
    return null;
  }, [snapshotData]);

  const resultsWithPercentages = useMemo(() => {
    return snapshotResultsData?.items || [];
  }, [snapshotResultsData]);

  // Cycle through results
  useEffect(() => {
    if (!resultsWithPercentages.length) return;
    const intervalId = setInterval(() => {
      setCurrentResultIndex(prev => (prev + 1) % resultsWithPercentages.length);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [resultsWithPercentages]);

  const currentResult = resultsWithPercentages[currentResultIndex];

  // Color classes
  const getColorClasses = (colorKey) => {
    const colorMap = {
      success: {
        bg: 'bg-futarchyTeal7/20 dark:bg-futarchyTeal7/10',
        text: 'text-futarchyTeal11 dark:text-futarchyTeal9',
        icon: 'text-futarchyTeal11 dark:text-futarchyTeal7',
        border: 'border-futarchyTeal9',
      },
      danger: {
        bg: 'bg-futarchyCrimson7/20 dark:bg-futarchyCrimson7/10',
        text: 'text-futarchyCrimson11 dark:text-futarchyCrimson9',
        icon: 'text-futarchyCrimson11 dark:text-futarchyCrimson7',
        border: 'border-futarchyCrimson9',
      },
      neutral: {
        bg: 'bg-futarchyGray7/20 dark:bg-futarchyGray7/10',
        text: 'text-futarchyGray11 dark:text-white',
        icon: 'text-futarchyGray11 dark:text-futarchyGray7',
        border: 'border-futarchyGray11 dark:border-white',
      },
    };
    return colorMap[colorKey] || colorMap.neutral;
  };


  // Generate Snapshot proposal URL
  const snapshotProposalUrl = useMemo(() => {
    if (!snapshotProposalId) return null;
    const spaceId = snapshotData?.spaceId || 'gnosis.eth';
    return `https://snapshot.box/#/s:${spaceId}/proposal/${snapshotProposalId}`;
  }, [snapshotProposalId, snapshotData]);

  // Don't show widget if no data
  if (!snapshotResultsData) return null;

  // Check if proposal has ended
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const proposalEnd = snapshotData?.end;
  const proposalState = snapshotData?.state; // "active", "closed", "pending"
  const isProposalClosed = proposalState === 'closed' || (proposalEnd && currentTime >= proposalEnd);

  // Border color logic
  // If closed: use approved (green) or rejected (red) border
  // If active: use currently cycling result color
  let buttonBorderColor;
  if (isProposalClosed && snapshotData?.proposalApproved !== null) {
    buttonBorderColor = snapshotData.proposalApproved
      ? 'border-futarchyTeal9' // Approved = green
      : 'border-futarchyCrimson9'; // Rejected = red
  } else {
    // Active proposal: use cycling result color
    buttonBorderColor = currentResult ? getColorClasses(currentResult.colorKey).border : 'border-futarchyGray11 dark:border-white';
  }

  const BoltIcon = (
    <svg className="flex-shrink-0 w-3.5 h-3.5" viewBox="0 0 105 126" fill="#FFAC33" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M104.781694,54.7785 C104.270697,53.41 102.961707,52.5 101.498717,52.5 L59.2365129,52.5 L83.6138421,5.103 C84.3803368,3.612 83.9848395,1.7885 82.6653488,0.7525 C82.0283532,0.2485 81.2618586,0 80.498864,0 C79.6833697,0 78.8678754,0.287 78.21338,0.8505 L52.4990602,23.058 L1.21391953,67.3505 C0.107927276,68.306 -0.291069928,69.8495 0.219926491,71.218 C0.730922911,72.5865 2.03641376,73.5 3.49940351,73.5 L45.7616074,73.5 L21.3842782,120.897 C20.6177836,122.388 21.0132808,124.2115 22.3327715,125.2475 C22.9697671,125.7515 23.7362617,126 24.4992564,126 C25.3147506,126 26.1302449,125.713 26.7847403,125.1495 L52.4990602,102.942 L103.784201,58.6495 C104.893693,57.694 105.28919,56.1505 104.781694,54.7785 L104.781694,54.7785 Z" />
    </svg>
  );

  // Rendered inline in the hero badge row (it used to float fixed over the
  // chart axis and the tab labels). Styled to sit next to the MarketBadges.
  const pillClasses = `h-7 py-1 pl-2 pr-1 text-sm font-semibold rounded-lg border-2 ${buttonBorderColor} bg-transparent text-white flex items-center gap-2 whitespace-nowrap transition-colors duration-200 hover:bg-white/10`;
  const chipClasses = 'rounded-md px-1.5 py-0.5 flex items-center gap-1 text-xs font-bold tabular-nums';
  // The hero is always dark, so use the dark-theme result colours here.
  const heroChipColors = (colorKey) => ({
    success: 'bg-futarchyTeal7/20 text-futarchyTeal7',
    danger: 'bg-futarchyCrimson7/20 text-futarchyCrimson9',
  }[colorKey] || 'bg-white/10 text-white');

  const debugDot = SHOW_DATA_DEBUG && snapshotSource === 'api' && (
    <span className="ml-1 text-[10px] text-futarchyViolet9 dark:text-futarchyViolet7">●</span>
  );

  return (
    <div className="relative">
      {isProposalClosed ? (
        <a
          href={snapshotProposalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={pillClasses}
          aria-label="View final results on Snapshot"
        >
          {BoltIcon}
          <span>Final Result{debugDot}</span>
          {!snapshotLoading && snapshotData && (
            snapshotData.proposalApproved === true ? (
              <span className={`${chipClasses} bg-futarchyTeal7/20 text-futarchyTeal7`}>
                {CheckIcon}
                APPROVED
              </span>
            ) : snapshotData.proposalApproved === false ? (
              <span className={`${chipClasses} bg-futarchyCrimson7/20 text-futarchyCrimson9`}>
                {XIcon}
                REJECTED
              </span>
            ) : snapshotHighestResult ? (
              <span className={`${chipClasses} ${heroChipColors(snapshotHighestResult.colorKey)}`}>
                {renderIcon(snapshotHighestResult.iconType)}
                {snapshotHighestResult.percentage}
              </span>
            ) : null
          )}
        </a>
      ) : (
        <button
          onClick={() => setIsWidgetExpanded(!isWidgetExpanded)}
          className={pillClasses}
          aria-expanded={isWidgetExpanded}
          aria-label={isWidgetExpanded ? 'Close snapshot results' : 'Open snapshot results'}
        >
          {BoltIcon}
          <span>Snapshot Results{debugDot}</span>
          {snapshotLoading && (
            <span className="h-3 w-3 rounded-full border-2 border-futarchyViolet7/40 border-t-futarchyViolet7 animate-spin" />
          )}
          {!snapshotLoading && currentResult && (
            <span key={`${currentResult.key}-${currentResultIndex}`} className={`${chipClasses} ${heroChipColors(currentResult.colorKey)} animate-fadeIn`}>
              {renderIcon(currentResult.iconType)}
              {currentResult.percentage}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isWidgetExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {/* Results dropdown - only while the proposal is still active */}
      {isWidgetExpanded && !isProposalClosed && (
        <div className="absolute left-0 top-full z-40 mt-2 bg-futarchyGray2 dark:bg-futarchyDarkGray2 rounded-3xl shadow-2xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 w-[calc(100vw-2.5rem)] max-w-md animate-fadeIn">
          <div className="p-3 md:p-4 max-h-[75vh] md:max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2 md:mb-3">
              <div className="flex items-center gap-2">
                {snapshotProposalUrl ? (
                  <a href={snapshotProposalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                    <h3 className="text-base md:text-lg font-semibold text-black dark:text-futarchyGray112 group-hover:text-black/80 dark:group-hover:text-white/80 font-oxanium transition-colors">
                      Snapshot Results
                    </h3>
                    <svg className="w-4 h-4 md:w-5 md:h-5 text-black/60 dark:text-white/60 group-hover:text-black dark:group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <h3 className="text-base md:text-lg font-semibold text-black dark:text-futarchyGray112 font-oxanium">Snapshot Results</h3>
                )}
              </div>
              <button onClick={() => setIsWidgetExpanded(false)} className="text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors" aria-label="Close snapshot results">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Snapshot Description */}
            <div className="mb-3 md:mb-4 pb-3 border-b border-futarchyGray62 dark:border-futarchyGray11/30">
              <p className="text-xs md:text-sm text-black/70 dark:text-white/70 leading-relaxed mb-2">
                Snapshot is a voting platform that allows DAOs, DeFi protocols, or NFT communities to vote easily and without gas fees.
              </p>
              <a href="https://snapshot.box/" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors inline-flex items-center gap-1 font-medium">
                Learn more about Snapshot
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <ResultsBreakdown
              items={snapshotResultsData.items}
              totalCount={snapshotResultsData.totalCount}
              quorumPercent={snapshotResultsData.quorumPercent}
              title="VOTING RESULTS"
            />
          </div>
        </div>
      )}

    </div>
  );
};

export { SnapshotWidget };
