// components/ui/Badge.jsx
//
// A compact label for state: an outcome, a market status, a chain. Tone picks the meaning, never
// decoration: pass and fail for the two outcomes, positive, warning and negative for status,
// accent for the app's own marks, neutral for everything else. Badges always carry text, so the
// colour is never the only cue.

import React from "react";

const TONES = {
  neutral: "bg-seer-surface-raised text-seer-muted",
  accent: "bg-seer-accent-soft text-seer-accent-text",
  pass: "bg-pass-soft text-pass-text",
  fail: "bg-fail-soft text-fail-text",
  positive: "bg-seer-positive/10 text-seer-positive",
  warning: "bg-seer-warning/10 text-seer-warning",
  negative: "bg-seer-negative/10 text-seer-negative",
};

export const Badge = ({ tone = "neutral", className = "", children, ...props }) => (
  <span
    className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-control text-xs font-semibold whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}
    {...props}
  >
    {children}
  </span>
);

export default Badge;
