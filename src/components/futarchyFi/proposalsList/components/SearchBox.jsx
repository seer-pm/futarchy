import React from "react";

const SearchBox = ({ value, onChange, placeholder = "Search milestones...", 'data-testid': dataTestId }) => {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search proposals..."}
        className="seer-input !pl-10"
        data-testid={dataTestId}
      />
      {/* The app's search glyph as a mask, so it takes the theme's muted colour. */}
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-seer-muted pointer-events-none"
        style={{
          maskImage: "url(/assets/search.svg)",
          WebkitMaskImage: "url(/assets/search.svg)",
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
        aria-hidden="true"
      />
    </div>
  );
};

export default SearchBox;
