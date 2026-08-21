"use client";

import { useSyncExternalStore } from "react";

// Which of the 4 brand palettes is active — see globals.css's own
// header comment for the full [data-theme][data-mode] architecture
// this drives. Stored as the same short string CSS selects on
// ([data-theme="1"] etc.), not a descriptive name, so there's no
// name/value drift to keep in sync between here and the CSS.
export type ThemeId = "1" | "2" | "3" | "4";
export const THEME_IDS: ThemeId[] = ["1", "2", "3", "4"];
export const THEME_LABELS: Record<ThemeId, string> = {
  "1": "Navy",
  "2": "Terracotta",
  "3": "Butter",
  "4": "Purple",
};

const STORAGE_KEY = "sancturm:theme";
const DEFAULT_THEME: ThemeId = "1";

function isThemeId(value: string | null): value is ThemeId {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

// Same module-level useSyncExternalStore pattern as useBranch/useTerm —
// every simultaneously-mounted reader (the switcher itself, anything
// else that ever wants to know the current theme) must observe the
// same live value. Also the one place that actually mutates the DOM
// attribute CSS reads — see applyAttribute's own comment.
let snapshot: { theme: ThemeId; isLoaded: boolean } = {
  theme: DEFAULT_THEME,
  isLoaded: false,
};
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Writes the attribute CSS actually selects on. The blocking inline
// script in layout.tsx's <head> already does this once, synchronously,
// before first paint (avoiding a flash of the wrong theme) — this is
// what keeps it in sync for the rest of the session whenever the user
// picks a different theme, and is a harmless no-op re-write on the
// initial mount sync below (same value the inline script already set).
function applyAttribute(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}

function getSnapshot() {
  if (!snapshot.isLoaded) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const theme = isThemeId(stored) ? stored : DEFAULT_THEME;
    snapshot = { theme, isLoaded: true };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { theme: DEFAULT_THEME, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setTheme(theme: ThemeId) {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyAttribute(theme);
  snapshot = { theme, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes the active brand theme (1-4). Defaults to Theme 1
 * until the user picks one explicitly — matches the inline <head>
 * script's own fallback (see layout.tsx), so there's never a
 * disagreement between what that script painted and what this hook
 * settles on once React hydrates.
 */
export function useTheme() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme: state.theme, isLoaded: state.isLoaded, setTheme };
}
