const legacyPalette = require("./tailwind.legacy-palette");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@seer-pm/ui-kit/tailwind")],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/ops/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],


  theme: {
    screens: {
      zf: "864px",
      xl: "1280px",
      lg: "1024px",
      md: "768px",
      sm: "640px",
      pc: "900px",
    },
    extend: {
      keyframes: {
        "slide-down": {
          "0%": { opacity: 0, transform: "translateY(-20px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: 1, transform: "translateY(0)" },
          "100%": { opacity: 0, transform: "translateY(-20px)" },
        },
        "subtle-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        "ping-once": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "75%, 100%": { transform: "scale(2)", opacity: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: 0.1 },
          "50%": { opacity: 0.3 },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "gradient-float": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        rotate: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        pulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.1)", opacity: "0.8" },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        'pulse-blue': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(125, 51, 255, 0.4)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 6px rgba(125, 51, 255, 0)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(125, 51, 255, 0)' }
        },
        'pulse-gold': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(184, 134, 11, 0.4)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 6px rgba(184, 134, 11, 0)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(184, 134, 11, 0)' }
        },
        'subtle-pulse': {
          '50%': {
            opacity: '.75',
          },
        },
      },
      animation: {
        "slide-down": "slide-down 0.1s ease-out forwards",
        "slide-up": "slide-up 0.1s ease-out forwards",
        "subtle-pulse": "subtle-pulse 2s ease-in-out infinite",
        "ping-once": "ping-once 1s cubic-bezier(0, 0, 0.2, 1) forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-glow": "pulse-glow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "gradient-float": "gradient-float 15s ease infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "rotate-slow": "rotate 12s linear infinite",
        "pulse-slow": "pulse 6s ease-in-out infinite",
        'slide-in': 'slide-in 0.3s ease-out',
        'pulse-blue': 'pulse-blue 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-gold': 'pulse-gold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'subtle-pulse': 'subtle-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      width: {
        22: "88px",
        87: "348px",
        90: "360px",
        100: "400px",
        120: "480px",
        143: "572px",
        220: "880px",
      },

      height: {
        12: "48px",
        87: "348px",
        100: "400px",
        107: "428px",
        133: "532px",
        142: "568px",
        147: "588px",
      },
      backdropBlur: {
        xs: '2px',
      },
      colors: legacyPalette,

      // The kit's scale: sm for compact controls and badges, md for surfaces, inputs and rows.
      // Tailwind's own sizes resolve to the same two values, so existing classes take the brand
      // radii without being rewritten.
      borderRadius: {
        DEFAULT: "var(--seer-radius-sm)",
        sm: "var(--seer-radius-sm)",
        md: "var(--seer-radius-sm)",
        lg: "var(--seer-radius-md)",
        xl: "var(--seer-radius-md)",
        "2xl": "var(--seer-radius-md)",
        "3xl": "var(--seer-radius-md)",
        full: "var(--seer-radius-full)",
      },

      // Electric Foundation surfaces are flat and separated by hairlines. Small shadows go; the
      // larger ones, which lift menus and dialogs off the page, become one soft elevation.
      boxShadow: {
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "0 10px 28px rgb(20 18 35 / 0.14)",
        xl: "0 10px 28px rgb(20 18 35 / 0.14)",
        "2xl": "0 24px 64px rgb(20 18 35 / 0.28)",
      },

      // Open Sans everywhere, from the kit. `font-oxanium` predates the rebrand and resolves to the
      // same face until the components that use it are rewritten.
      fontFamily: {
        sans: ["var(--seer-font-sans)"],
        oxanium: ["var(--seer-font-sans)"],
      },

      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-to-br":
          "linear-gradient(to bottom right, var(--tw-gradient-stops))", // Top-left to bottom-right
        "gradient-to-bl":
          "linear-gradient(to bottom left, var(--tw-gradient-stops))", // Top-right to bottom-left
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      const newUtilities = {
        ".select-none": {
          userSelect: "none",
          "-webkit-user-select": "none", // Add WebKit support
        },
        ".select-text": {
          userSelect: "text",
          "-webkit-user-select": "text",
        },
        ".select-auto": {
          userSelect: "auto",
          "-webkit-user-select": "auto",
        },
        ".select-all": {
          userSelect: "all",
          "-webkit-user-select": "all",
        },
      };
      addUtilities(newUtilities, ["responsive", "hover", "focus"]);
    },
  ],
  darkMode: 'class',
};
