// components/common/BrandLogo.jsx
//
// The site wordmark. Header and Footer both render it, so the brand lives in
// one place: when the real Seer logo arrives, drop it at SEER_LOGO_SRC and
// swap the <span> below for an <Image>.

// Placeholder mark shipped at this path. Watermarks, card fallbacks and the
// proposal documents all reference it, so overwriting that one file rebrands
// every one of them.
export const SEER_LOGO_SRC = '/assets/seer-logo.svg';

// Matches the footprint of the SVG wordmark this replaced (128x22).
const BrandLogo = ({ className = '' }) => (
  <span
    className={`text-white font-oxanium text-xl font-semibold tracking-tight leading-none ${className}`}
  >
    Futarchy
  </span>
);

export default BrandLogo;
