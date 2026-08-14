"use client";

import { useSyncExternalStore } from "react";

// A batch is its label — e.g. "2025-26". Same reasoning as useTerm's
// STORAGE_KEY: human-readable in localStorage, stable across
// environments. Its own key (not merged into useTerm) since Batch is
// a filter dimension on top of Year/Branch, not a third onboarding
// identity question — see Notes/PYQs pages for where this actually
// surfaces (a Batch filter defaulting to whatever this resolves to,
// not a new onboarding step).
const STORAGE_KEY = "sancturm:batch";

// Same useSyncExternalStore module-level-store pattern as
// useBranch/useTerm — every call site needs to see the same value, in
// sync, without prop-drilling it through the whole tree.
let snapshot: { batch: string | null; isLoaded: boolean } = {
  batch: null,
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

function getSnapshot() {
  if (!snapshot.isLoaded) {
    snapshot = { batch: window.localStorage.getItem(STORAGE_KEY), isLoaded: true };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { batch: null, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setBatch(label: string) {
  window.localStorage.setItem(STORAGE_KEY, label);
  snapshot = { batch: label, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes the last-picked Batch filter to localStorage —
 * same one-time-persisted pattern as useBranch/useTerm, so re-visiting
 * Notes/PYQs remembers your last Batch filter instead of resetting to
 * "current" every page load.
 */
export function useBatch() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { batch: state.batch, isLoaded: state.isLoaded, setBatch };
}
