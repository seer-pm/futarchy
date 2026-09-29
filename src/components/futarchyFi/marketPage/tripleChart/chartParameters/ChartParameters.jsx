import React from 'react';
import { formatWith } from '../../../../../utils/precisionFormatter';
import { computeImpactPercent, formatImpactPercent } from '../../../../../utils/marketPageUtils.mjs';

/**
 * A reusable card for displaying a single market parameter.
 * It features a label and a value, with styles for both light and dark modes,
 * and an optional right-border for separation.
 */
const ParameterCard = ({ label, value, valueClassName = '', isValueFirst = false, onClick, isDisabled = false, isClickable = false }) => (
  <div
    className={`flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 first:rounded-tl-3xl last:rounded-tr-3xl px-1 ${isClickable ? 'cursor-pointer hover:bg-futarchyGray3/50 dark:hover:bg-futarchyDarkGray3/50 transition-colors duration-200' : ''
      } ${isDisabled ? 'opacity-40' : ''}`}
    onClick={onClick}
  >
    {isValueFirst ? (
      <>
        <span className={`text-xs md:text-sm font-bold text-futarchyGray12 dark:text-white ${valueClassName}`}>{value}</span>
        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">{label}</span>
      </>
    ) : (
      <>
        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">{label}</span>
        <span className={`text-[9px] md:text-sm font-bold text-futarchyGray12 dark:text-white ${valueClassName}`}>{value}</span>
      </>
    )}
  </div>
);

const LoadingSpinner = () => (
  <div className="w-4 h-4 border-2 border-futarchyGray11 dark:border-futarchyGray112 border-t-transparent rounded-full animate-spin" />
);

const ClickableParameterCard = ({ label, value, link }) => {
  const lowerCaseValue = typeof value === 'string' ? value.toLowerCase() : '';

  let valueColorClass = '!text-futarchyViolet11 dark:!text-futarchyViolet6';
  let hoverShadowClass = 'hover:shadow-[inset_0_0_0_2px_rgba(138,43,226,0.5)]'; // Violet
  let labelHoverColorClass = 'group-hover:text-futarchyViolet11 dark:group-hover:text-futarchyViolet6';

  if (lowerCaseValue === 'yes') {
    valueColorClass = '!text-futarchyBlue9 dark:!text-futarchyBlue8';
    hoverShadowClass = 'hover:shadow-[inset_0_0_0_2px_rgba(59,130,246,0.5)]'; // Blue
    labelHoverColorClass = 'group-hover:text-futarchyBlue9 dark:group-hover:text-futarchyBlue8';
  } else if (lowerCaseValue === 'no') {
    valueColorClass = '!text-yellow-500 dark:!text-yellow-400';
    hoverShadowClass = 'hover:shadow-[inset_0_0_0_2px_rgba(234,179,8,0.5)]'; // Gold
    labelHoverColorClass = 'group-hover:text-yellow-500 dark:group-hover:text-yellow-400';
  }

  const formattedValue = typeof value === 'string' && value.length > 0
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
    : value;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 cursor-pointer first:rounded-tl-3xl last:rounded-tr-3xl transition-shadow duration-300 ease-in-out ${hoverShadowClass} px-1`}
    >
      <span className={`text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium transition-colors duration-300 ${labelHoverColorClass}`}>{label}</span>
      <span className={`text-[9px] md:text-sm font-bold animate-[pulse-bright_1s_ease-in-out_infinite] ${valueColorClass}`}>{formattedValue}</span>
    </a>
  );
};

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

  // Debug logging to verify precision config
  console.log('[ChartParameters] config received:', config);
  console.log('[ChartParameters] precisionConfig extracted:', precisionConfig);
  console.log('[ChartParameters] precision display values:', precisionConfig?.display);
  // Impact = (Yes - No) / Max(Yes, No) * 100 — independent of spot price
  // Same formula and formatter as the header's "Impact (spot)" stat.
  const impact = computeImpactPercent(yesPrice, noPrice) ?? 0;
  const impactColorClass = impact >= 0 ? '!text-futarchyTeal7' : '!text-futarchyCrimson7';

  return (
    <div className="flex items-stretch justify-around font-oxanium h-full ">
      <ParameterCard label="Trading Pair" value={tradingPair} isValueFirst={false} />
      {showSpot && (
        <ParameterCard
          label="Spot Price"
          value={spotPrice === null ? <LoadingSpinner /> : `${formatWith(spotPrice, 'price', precisionConfig)} ${currency}`}
          isClickable={true}
          isDisabled={!chartFilters.spot}
          onClick={() => onFilterClick && onFilterClick('spot')}
        />
      )}
      <ParameterCard
        label="Yes Price"
        value={yesPrice === null ? <LoadingSpinner /> : `${formatWith(yesPrice, 'price', precisionConfig)} ${currency}`}
        valueClassName={`!text-futarchyBlue9 dark:!text-futarchyBlue8 ${!chartFilters.yes ? '!opacity-50' : ''}`}
        isClickable={true}
        isDisabled={!chartFilters.yes}
        onClick={() => onFilterClick && onFilterClick('yes')}
      />
      <ParameterCard
        label="No Price"
        value={noPrice === null ? <LoadingSpinner /> : `${formatWith(noPrice, 'price', precisionConfig)} ${currency}`}
        valueClassName={`!text-yellow-500 dark:!text-yellow-400 ${!chartFilters.no ? '!opacity-50' : ''}`}
        isClickable={true}
        isDisabled={!chartFilters.no}
        onClick={() => onFilterClick && onFilterClick('no')}
      />
      {false && (resolutionDetails ? (
        <ClickableParameterCard
          label={resolutionDetails.label}
          value={resolutionDetails.value}
          link={resolutionDetails.link}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFilterClick && onFilterClick('eventProbability')}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && onFilterClick) {
              event.preventDefault();
              onFilterClick('eventProbability');
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 px-1 cursor-pointer transition-all duration-200 ${chartFilters.eventProbability
            ? 'bg-futarchyViolet3/30 dark:bg-futarchyViolet11/20 shadow-[inset_0_0_0_2px_rgba(138,43,226,0.5)]'
            : 'hover:bg-futarchyGray3/50 dark:hover:bg-futarchyDarkGray3/50'
            }`}
        >
          <span className={`text-[9px] md:text-xs font-medium transition-colors duration-300 ${chartFilters.eventProbability
            ? 'text-futarchyViolet11 dark:text-futarchyViolet6'
            : 'text-futarchyGray11 dark:text-white/70'
            }`}>Event Probability</span>
          <span className={`text-[9px] md:text-sm font-bold ${chartFilters.eventProbability
            ? 'text-futarchyViolet11 dark:text-futarchyViolet6'
            : 'text-futarchyViolet11 dark:text-futarchyViolet6'
            }`}>
            {eventProbability === null ? <LoadingSpinner /> : `${formatWith(eventProbability * 100, 'default', precisionConfig)}%`}
          </span>
        </div>
      )
      )}
      <div
        className={`flex-1 flex flex-col items-center justify-center text-center border-r-2 border-futarchyGray62 dark:border-futarchyGray112/40 last:border-r-0 px-1 cursor-pointer transition-all duration-200 ${chartFilters.impact
          ? 'bg-futarchyViolet3/30 dark:bg-futarchyViolet11/20 shadow-[inset_0_0_0_2px_rgba(138,43,226,0.5)]'
          : 'hover:bg-futarchyGray3/50 dark:hover:bg-futarchyDarkGray3/50'
          }`}
        onClick={() => onFilterClick && onFilterClick('impact')}
      >
        <span className="text-[9px] md:text-xs text-futarchyGray11 dark:text-white/70 font-medium">Impact (spot)</span>
        <span className={`text-[9px] md:text-sm font-bold text-futarchyGray12 dark:text-white ${impactColorClass}`}>
          {(spotPrice === null || yesPrice === null || noPrice === null) ? <LoadingSpinner /> : formatImpactPercent(computeImpactPercent(yesPrice, noPrice))}
        </span>
      </div>
    </div>
  );
};

export default ChartParameters;
