/**
 * The app's original colour keys, each set to the nearest Electric Foundation value in the theme
 * where it is used. Components pair a light key with a `dark:` key, so the values stay fixed rather
 * than following the theme: a key such as futarchyGray3 is a surface in light mode and text in dark
 * mode, which no single theme-aware token can be.
 *
 * New code uses the kit's semantic `seer-*` classes instead. A component that moves to them stops
 * using these keys, and the file goes once nothing does.
 *
 * Keys with no value here (futarchyGray7-9, futarchyDarkGray5-7, the *Dark11 keys) produce no CSS,
 * as before. They are resolved when their component is redesigned.
 */

// Light neutrals: page #f7f7f9, surface #ffffff, raised #f1f1f4, border #e2e2e9, muted #5c5c66,
// text #17171c. Dark neutrals: page #101013, surface #1a1a1e, raised #1f1f24, border #34343c,
// muted #a8a8b3, text #ededf2.
const neutrals = {
  futarchyGray: "#9a9aa5",
  futarchyGray1: "#ffffff",
  futarchyGray2: "#f7f7f9",
  futarchyGray3: "#f1f1f4",
  futarchyGray4: "#e9e9ee",
  futarchyGray5: "#e2e2e9",
  futarchyGray6: "#34343c",
  futarchyGray62: "#d6d6de",
  futarchyGray10: "#7a7a85",
  futarchyGray11: "#5c5c66",
  futarchyGray112: "#a8a8b3",
  futarchyGray12: "#17171c",
  futarchyGray122: "#ededf2",
  futarchyGrayLight: "#b9b9c4",
  futarchyGrayDark: "#4a4a55",
  futarchyDarkGray1: "#1a1a1e",
  futarchyDarkGray2: "#101013",
  futarchyDarkGray3: "#1a1a1e",
  futarchyDarkGray4: "#101013",
  futarchyDarkGray42: "#34343c",
  futarchyDarkGrayBG: "#1a1a1e",
  black: "#141223",
  lightGray: "#f7f7f9",
};

// The pass outcome (YES) and the app's accent: Electric Purple and its tints. Text steps (10, 11)
// are the kit's accent text, which holds 4.5:1 on light surfaces.
const pass = {
  futarchyBlue3: "#f4effe",
  futarchyBlue4: "#ece3fd",
  futarchyBlue5: "#e0d2fc",
  futarchyBlue6: "#cdb6fb",
  futarchyBlue7: "#b18aff",
  futarchyBlue9: "#7d33ff",
  futarchyBlue10: "#6c2bd9",
  futarchyBlue11: "#6c2bd9",
  futarchyViolet3: "#f4effe",
  futarchyViolet4: "#ece3fd",
  futarchyViolet5: "#e0d2fc",
  futarchyViolet6: "#cdb6fb",
  futarchyViolet7: "#b18aff",
  futarchyViolet9: "#7d33ff",
  futarchyViolet10: "#6c2bd9",
  futarchyViolet11: "#6c2bd9",
  futarchyPurple: "#7d33ff",
  futarchyLavender: "#8f55f7",
};

// The fail outcome (NO): gold, kept from the original palette so NO still reads as gold.
const fail = {
  futarchyGold3: "#fbf6e6",
  futarchyGold4: "#f6ecc8",
  futarchyGold5: "#efdda0",
  futarchyGold6: "#e3c66a",
  futarchyGold7: "#d4a72c",
  futarchyGold8: "#c9961f",
  futarchyGold9: "#b8860b",
  futarchyGold10: "#8a6408",
  futarchyGold11: "#8a6408",
  futarchyYellow: "#d4a72c",
};

// Status families on the kit's --seer-positive (#13795b), --seer-negative (#c0283f) and
// --seer-warning (#ad4b00), from tint to text.
const positive = {
  3: "#e3f4ee",
  4: "#c7eadd",
  5: "#9fd8c3",
  6: "#5cc29f",
  7: "#2fa57c",
  9: "#13795b",
  10: "#0e5c45",
  11: "#0e5c45",
};
const negative = {
  3: "#fdecef",
  4: "#fbdde3",
  5: "#f7c9d2",
  6: "#f0aab8",
  7: "#e57f93",
  9: "#d63a57",
  10: "#c0283f",
  11: "#c0283f",
};
const warning = {
  3: "#fff1e8",
  4: "#ffe2cf",
  5: "#ffd0b0",
  6: "#ffb98a",
  7: "#f79a5e",
  9: "#e5700f",
  11: "#ad4b00",
};
const family = (name, steps) =>
  Object.fromEntries(Object.entries(steps).map(([step, value]) => [`${name}${step}`, value]));

// Tailwind's stock gray, as the same neutrals, so `text-gray-500` and its kin render in the brand's
// greys instead of Tailwind's blue-grey.
const gray = {
  50: "#f7f7f9",
  100: "#f1f1f4",
  200: "#e2e2e9",
  300: "#cfcfd8",
  400: "#9a9aa5",
  500: "#7a7a85",
  600: "#5c5c66",
  700: "#34343c",
  800: "#1f1f24",
  900: "#1a1a1e",
  950: "#101013",
};

module.exports = {
  gray,
  ...neutrals,
  ...pass,
  ...fail,
  ...family("futarchyTeal", positive),
  ...family("futarchyGreen", positive),
  futarchyEmerald3: "#0f2a20",
  futarchyEmerald6: "#1b5a43",
  futarchyEmerald9: "#3ecf8e",
  futarchyEmerald11: "#3ecf8e",
  futarchyEmerald32: "#e3f4ee",
  futarchyEmerald112: "#13795b",
  ...family("futarchyCrimson", negative),
  futarchyRed: "#e5546b",
  danger: "#c0283f",
  ...family("futarchyOrange", warning),
  warning: "#ad4b00",
};
