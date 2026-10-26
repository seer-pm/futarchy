// components/futarchyFi/companyList/forkWall/ForkSpark.jsx
//
// A proposal's fork in miniature: the token's price if it passes (purple) and if it fails (gold)
// since its market opened, with the gap between the two lines shaded. It is the same evidence as
// the market page's chart, small enough to read a dozen proposals side by side.

import React, { useMemo } from 'react';

const SAMPLES = 96;

// Both series resampled onto one shared clock, carrying each value forward, so the two lines and
// the gap polygon line up point for point.
const alignSeries = (yesData, noData) => {
  if (!yesData?.length || !noData?.length) return null;
  const start = Math.max(yesData[0].time, noData[0].time);
  const end = Math.max(yesData[yesData.length - 1].time, noData[noData.length - 1].time);
  if (!(end > start)) return null;

  const sample = (series) => {
    const out = [];
    let i = 0;
    for (let k = 0; k < SAMPLES; k += 1) {
      const t = start + ((end - start) * k) / (SAMPLES - 1);
      while (i + 1 < series.length && series[i + 1].time <= t) i += 1;
      out.push(series[i].value);
    }
    return out;
  };
  return { yes: sample(yesData), no: sample(noData) };
};

const ForkSpark = ({ yesData, noData, height = 96, loading = false, label }) => {
  const aligned = useMemo(() => alignSeries(yesData, noData), [yesData, noData]);

  if (loading) {
    return <div className="w-full rounded-control bg-seer-surface-raised animate-pulse" style={{ height }} aria-label="Loading chart" />;
  }
  if (!aligned) {
    return (
      <div className="w-full flex items-center justify-center rounded-control bg-seer-surface-raised text-[13px] text-seer-muted" style={{ height }}>
        No trades yet
      </div>
    );
  }

  const values = [...aligned.yes, ...aligned.no];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const pad = span * 0.08;
  const W = 300;
  const H = 100;
  const x = (k) => (k / (SAMPLES - 1)) * W;
  const y = (v) => H - ((v - (min - pad)) / (span + pad * 2)) * H;
  const line = (series) => series.map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const gap = `${line(aligned.yes)} ${aligned.no.map((v, k) => `L${x(SAMPLES - 1 - k).toFixed(1)} ${y(aligned.no[SAMPLES - 1 - k]).toFixed(1)}`).join(' ')} Z`;
  const lastYes = aligned.yes[SAMPLES - 1];
  const lastNo = aligned.no[SAMPLES - 1];

  // The SVG stretches to the tile, so the end dots are HTML and keep their round shape.
  const dot = (value, className) => (
    <span
      className={`absolute right-0 w-2 h-2 -mr-1 -mt-1 rounded-full ring-2 ring-seer-surface ${className}`}
      style={{ top: `${(y(value) / H) * 100}%` }}
      aria-hidden="true"
    />
  );

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full overflow-visible"
        role="img"
        aria-label={label}
      >
        <path d={gap} fill="var(--seer-accent-soft)" stroke="none" />
        {/* Pass is drawn wider and fail on top of it, so when the market sees little difference and
            the lines meet, both stay visible: a gold core inside a purple line. */}
        <path d={line(aligned.yes)} fill="none" stroke="var(--futarchy-pass)" strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={line(aligned.no)} fill="none" stroke="var(--futarchy-fail)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {dot(lastYes, 'bg-pass')}
      {dot(lastNo, 'bg-fail')}
    </div>
  );
};

export default ForkSpark;
