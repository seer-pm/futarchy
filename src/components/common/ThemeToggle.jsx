import React from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../ui/Button";

/** Light/dark toggle. The icon shows the theme a click switches to. */
const ThemeToggle = () => {
  const { isDarkMode, cycleTheme } = useTheme();
  const label = isDarkMode ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button variant="ghost" icon onClick={cycleTheme} aria-label={label} title={label}>
      {isDarkMode ? (
        <SunIcon className="w-5 h-5" aria-hidden="true" />
      ) : (
        <MoonIcon className="w-5 h-5" aria-hidden="true" />
      )}
    </Button>
  );
};

export default ThemeToggle;
