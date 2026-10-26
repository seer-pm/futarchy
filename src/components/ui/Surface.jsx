// components/ui/Surface.jsx
//
// The one container in the app: the kit's surface colour, a hairline and the 10px surface radius,
// with no shadow. Nested content separates with rules (divide-*, border-t), never a second card.

import React from "react";

export const Surface = ({ as: Component = "section", className = "", children, ...props }) => (
  <Component className={`bg-seer-surface border border-seer-border rounded-surface ${className}`} {...props}>
    {children}
  </Component>
);

/** A surface's header row: title on the left, an optional action on the right, a rule below. */
export const SurfaceHeader = ({ title, action, as: Heading = "h2", className = "" }) => (
  <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-seer-border ${className}`}>
    <Heading className="text-sm font-semibold text-seer-text">{title}</Heading>
    {action}
  </div>
);

export default Surface;
