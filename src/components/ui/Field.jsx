// components/ui/Field.jsx
//
// Labels, inputs and their messages on the kit's .seer-field classes. An amount input takes a
// token symbol and an action (Max) through InputGroup, the shape every trade form here needs.

import React, { forwardRef } from "react";

/** A label over its control, with an optional hint and error. The error replaces the hint. */
export const Field = ({ label, hint, error, children, className = "" }) => (
  <label className={`seer-field ${className}`}>
    {label && <span className="seer-label">{label}</span>}
    {children}
    {error ? <span className="seer-error">{error}</span> : hint && <span className="seer-hint">{hint}</span>}
  </label>
);

export const Input = forwardRef(function Input({ className = "", invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`seer-input ${className}`}
      aria-invalid={invalid ? "true" : undefined}
      {...props}
    />
  );
});

/** An input with a unit (affix) and actions on the same line, inside one box. */
export const InputGroup = ({ affix, actions, className = "", children }) => (
  <span className={`seer-input-group ${className}`}>
    {children}
    {affix && <span className="seer-input-affix">{affix}</span>}
    {actions}
  </span>
);
