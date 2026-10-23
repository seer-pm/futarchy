import React from 'react';
import { formatWith } from '../../../../../utils/precisionFormatter';
import { computeImpactPercent, formatImpactPercent } from '../../../../../utils/marketPageUtils.mjs';

/**
 * One series toggle in the chart's legend: the series colour as a dot, the label, the latest value.
 * Pressing it shows or hides that line, and the dot empties when the line is hidden.
 */
export const SeriesToggle = ({ label, value, dotClassName, valueClassName = 'text-seer-text', pressed, onClick }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-control text-left transition-colors hover:bg-seer-surface-raised ${pressed ? '' : 'opacity-60'}`}
  >
    <span className="flex items-center gap-1.5 text-xs text-seer-muted">
      <span
        className={`w-2 h-2 rounded-full ${pressed ? dotClassName : `bg-transparent ring-1 ring-inset ${dotClassName.replace('bg-', 'ring-')}`}`}
        aria-hidden="true"
      />
      {label}
    </span>
    <span className={`text-sm font-semibold tabular-nums ${valueClassName}`}>{value}</span>
  </button>
);

const LoadingSpinner = () => (
  <span className="inline-block w-3.5 h-3.5 border-2 border-seer-border border-t-seer-purple rounded-full animate-spin" aria-label="Loading" />
);

const ChartParameters = ({
  tradingPair = 'GNO/SDAI',
  spotPrice = 0,
  yesPrice = 0,
  noPrice = 0,
  eventProbability = 0,
  currency = 'SDAI',
  precision = 4,
  resolutionDetails,
  chartFilters = { spot: true, yes: true, no: true, impact: false },
  onFilterClick,
  predictionMarketLink = null,
  config = null, // Config from useContractConfig
  showSpot = true // Controls visibility of Spot Price card
}) => {
  // Get PRECISION_CONFIG from config, or use undefined to let formatWith use default
  const precisionConfig = config?.PRECISION_CONFIG;

  // Impact = (Yes - No) / Max(Yes, No) * 100 — independent of spot price
  // Same formula and formatter as the header's "Impact (spot)" stat.
  const impact = computeImpactPercent(yesPrice, noPrice) ?? 0;
  const toggle = (key) => () => onFilterClick && onFilterClick(key);
  const priceValue = (value) => (value === null ? <LoadingSpinner /> : `${formatWith(value, 'price', precisionConfig)} ${currency}`);

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5">
      <div className="flex flex-col px-3 py-2 mr-auto">
        <span className="text-xs text-seer-muted">Trading pair</span>
        <span className="text-sm font-semibold text-seer-text">{tradingPair}</span>
      </div>
      {showSpot && (
        <SeriesToggle
          label="Spot price"
          value={priceValue(spotPrice)}
          dotClassName="bg-seer-muted"
          pressed={!!chartFilters.spot}
          onClick={toggle('spot')}
        />
      )}
      <SeriesToggle
        label="If it passes (YES)"
        value={priceValue(yesPrice)}
        dotClassName="bg-pass"
        valueClassName="text-pass-text"
        pressed={!!chartFilters.yes}
        onClick={toggle('yes')}
      />
      <SeriesToggle
        label="If it fails (NO)"
        value={priceValue(noPrice)}
        dotClassName="bg-fail"
        valueClassName="text-fail-text"
        pressed={!!chartFilters.no}
        onClick={toggle('no')}
      />
      <SeriesToggle
        label="Impact (spot)"
        value={(spotPrice === null || yesPrice === null || noPrice === null) ? <LoadingSpinner /> : formatImpactPercent(computeImpactPercent(yesPrice, noPrice))}
        dotClassName={impact >= 0 ? 'bg-seer-positive' : 'bg-seer-negative'}
        valueClassName={impact >= 0 ? 'text-seer-positive' : 'text-seer-negative'}
        pressed={!!chartFilters.impact}
        onClick={toggle('impact')}
      />
    </div>
  );
};

export default ChartParameters;
