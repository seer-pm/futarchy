import React, { useState, useRef, useEffect } from "react";
import { DownVectorIcon } from "../cards/Resources";

// A filter menu on the kit's field look: the trigger matches .seer-input, and the open list is a
// raised menu (the one place a shadow is allowed) with the selected option on the accent tint.
const CustomDropdown = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="seer-input w-full md:!w-[240px] flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedOption.icon && (
            <selectedOption.icon className="w-4 h-4 shrink-0 text-seer-muted" />
          )}
          <span className="truncate text-sm font-semibold text-seer-text">
            {selectedOption.label}
          </span>
        </span>
        <DownVectorIcon className={`w-3 h-3 shrink-0 text-seer-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 p-1 rounded-surface border border-seer-border bg-seer-surface shadow-lg z-20"
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full h-10 px-3 flex items-center gap-2 text-left text-sm rounded-control transition-colors ${
                option.value === value
                  ? "bg-seer-accent-soft text-seer-accent-text font-semibold"
                  : "text-seer-text hover:bg-seer-surface-raised"
              }`}
            >
              {option.icon && (
                <option.icon className={`w-4 h-4 shrink-0 ${option.value === value ? "text-seer-accent-text" : "text-seer-muted"}`} />
              )}
              <span className="truncate">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
