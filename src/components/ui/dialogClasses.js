// components/ui/dialogClasses.js
//
// The kit dialog's look (@seer-pm/ui-kit .seer-dialog) as Tailwind classes, for the modals whose
// open and close are tied to transaction steps and framer-motion and so keep their own shell.
// Centred card on wide screens, a sheet rising from the bottom edge on phones.

export const dialogBackdrop = "fixed inset-0 bg-seer-ink/60";

export const dialogFrame = "flex h-full items-end sm:items-center justify-center sm:p-4";

export const dialogPanel =
  "relative flex flex-col w-full sm:max-w-md max-h-[calc(100dvh-24px)] sm:max-h-[85dvh] " +
  "bg-seer-surface text-seer-text border border-seer-border rounded-t-surface sm:rounded-surface shadow-2xl";

export const dialogPanelWide = dialogPanel.replace("sm:max-w-md", "sm:max-w-xl");

export const dialogHeader = "flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-seer-border";

export const dialogTitle = "pt-1 text-lg font-semibold tracking-tight text-seer-text";

export const dialogBody = "flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4";

export const dialogFooter =
  "flex shrink-0 flex-wrap justify-end gap-2 px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-seer-border";
