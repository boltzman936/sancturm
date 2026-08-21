"use client";

import { useSyncExternalStore } from "react";

export type ColorMode = "light" | "dark";
const STORAGE_KEY = "sancturm:mode";
// Theme 1 (Navy) + Light is the product default — deliberately NOT
// the browser's prefers-color-scheme, so every first-time visitor
// lands on the same designed look regardless of their OS setting.
// Once someone picks a different theme/mode explicitly, that choice
// is written to localStorage (see setMode below) and stays sticky for
// that browser — this default is only ever consulted before any such
// pick has ever been made.
const DEFAULT_MODE: ColorMode = "light";

function isColorMode(value: string | null): value is ColorMode {
  return value === "light" || value === "dark";
}

// Same module-level useSyncExternalStore pattern as useTheme — see its
// own comment for why, and for why applyAttribute mutates the DOM
// directly rather than going through a React provider tree.
let snapshot: { mode: ColorMode; isLoaded: boolean } = {
  mode: DEFAULT_MODE,
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

function applyAttribute(mode: ColorMode) {
  document.documentElement.setAttribute("data-mode", mode);
}

function getSnapshot() {
  if (!snapshot.isLoaded) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const mode = isColorMode(stored) ? stored : DEFAULT_MODE;
    snapshot = { mode, isLoaded: true };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { mode: DEFAULT_MODE, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setMode(mode: ColorMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
  applyAttribute(mode);
  snapshot = { mode, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes Light/Dark for the CURRENT theme (see useTheme —
 * the two are independent axes: 4 themes × 2 modes). Defaults to Light
 * on a brand-new visit, same as the inline <head> script's own
 * fallback (see layout.tsx) — no disagreement once React hydrates.
 */
export function useColorMode() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { mode: state.mode, isLoaded: state.isLoaded, setMode };
}
