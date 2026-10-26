// components/ui/Button.jsx
//
// The kit's .seer-button in React. The look lives in @seer-pm/ui-kit/components.css; this only
// maps props onto its classes, so every action in the app reads as the same control.

import React, { forwardRef } from "react";

const buttonClassName = ({ variant = "primary", size, block, icon, className = "" }) =>
  [
    "seer-button",
    `seer-button-${variant}`,
    size && `seer-button-${size}`,
    block && "seer-button-block",
    icon && "seer-button-icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");

/**
 * variant: primary | secondary | outline | ghost. size: sm | lg (40px when omitted).
 * busy keeps the label and adds the kit's spinner. An icon-only button needs aria-label.
 * Pass `as` (a Next Link or "a") to render a link that looks like a button.
 */
const Button = forwardRef(function Button(
  { as: Component = "button", variant, size, block, icon, busy, className, type, children, ...props },
  ref
) {
  return (
    <Component
      ref={ref}
      type={Component === "button" ? type || "button" : type}
      className={buttonClassName({ variant, size, block, icon, className })}
      aria-busy={busy ? "true" : undefined}
      {...props}
    >
      {children}
    </Component>
  );
});

export { buttonClassName };
export default Button;
