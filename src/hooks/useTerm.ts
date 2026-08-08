"use client";

import { useSyncExternalStore } from "react";

// A term is its slug — e.g. "y1-s1", "y2-s3". Same reasoning as
// useBranch's STORAGE_KEY: human-readable in localStorage, stable
// across environments. Kept as its own separate key/hook (not merged
// into useBranch) since the sidebar switcher lets you change term and
// branch independently of each other.
const STORAGE_KEY = "sancturm:term";

// Same useSyncExternalStore module-level-store pattern as useBranch —
// see that file's comment for why a plain useState wasn't enough
// (every call site needs to see the same value, in sync).
let snapshot: { term: string | null; isLoaded: boolean } = {
  term: null,
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
    snapshot = { term: window.localStorage.getItem(STORAGE_KEY), isLoaded: true };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { term: null, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setTerm(slug: string) {
  window.localStorage.setItem(STORAGE_KEY, slug);
  snapshot = { term: slug, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes the student's selected academic term (year + sem)
 * to localStorage — the same one-time-onboarding pattern as
 * useBranch, just for the other half of "which cohort's content do I
 * see". A page isn't considered ready until BOTH useTerm().isLoaded
 * and useBranch().isLoaded are true.
 */
export function useTerm() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { term: state.term, isLoaded: state.isLoaded, setTerm };
}
