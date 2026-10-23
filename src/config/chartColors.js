// config/chartColors.js
//
// Series and chrome colours for the market charts, per theme. lightweight-charts draws on a canvas
// and takes colour strings, not CSS custom properties, so the values live here, mirroring the
// @seer-pm/ui-kit tokens they come from.
//
// pass, fail and eventProbability were checked as one categorical palette (lightness band, chroma
// floor, colour-vision-deficiency separation across all pairs, 3:1 against the chart surface) in
// both themes. Swapping any of them means re-running that check. Impact is a single series whose
// colour follows its sign, so its value always carries the sign as well.

const CHART_COLORS = {
  light: {
    pass: '#7d33ff', // --seer-brand-purple
    fail: '#b8860b',
    eventProbability: '#1a7fc4',
    spot: 'rgba(23, 23, 28, 0.4)', // --seer-text at 40%
    impactPositive: '#13795b', // --seer-positive
    impactNegative: '#c0283f', // --seer-negative
    text: '#5c5c66', // --seer-muted
    crosshair: 'rgba(23, 23, 28, 0.3)',
    labelBackground: '#f1f1f4', // --seer-surface-raised
    labelText: '#17171c',
  },
  dark: {
    pass: '#8f55f7', // --seer-brand-purple-on-ink
    fail: '#b5850f',
    eventProbability: '#3a90d8',
    spot: 'rgba(237, 237, 242, 0.4)',
    impactPositive: '#3ecf8e',
    impactNegative: '#ff6b81',
    text: '#a8a8b3',
    crosshair: 'rgba(237, 237, 242, 0.3)',
    labelBackground: '#1f1f24',
    labelText: '#ededf2',
  },
};

export const CHART_FONT_FAMILY = "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif";

export const chartColors = (isDarkMode) => (isDarkMode ? CHART_COLORS.dark : CHART_COLORS.light);

/** The impact line takes the colour of the sign of its latest point. */
export const impactColor = (isDarkMode, value) =>
  value >= 0 ? chartColors(isDarkMode).impactPositive : chartColors(isDarkMode).impactNegative;
