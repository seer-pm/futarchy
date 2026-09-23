// components/common/BrandLogo.jsx
//
// The site wordmark: the Seer symbol next to the product name. Header, Footer
// and CompaniesHeader all render it, so the brand lives in one place.

import Image from "next/image";

// Seer symbol, taken from seer-pm/demo docs/logo/dark.svg with the "Seer"
// wordmark stripped. White fill, so it only reads over the dark app chrome —
// the same surface every call site renders on.
export const SEER_LOGO_SRC = '/assets/seer-logo.svg';

const BrandLogo = ({ className = '', size = 28 }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <Image
      src={SEER_LOGO_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
    />
    <span className="text-white font-oxanium text-xl font-semibold tracking-tight leading-none">
      Futarchy
    </span>
  </span>
);

export default BrandLogo;
