"use client";

import { useSyncExternalStore } from "react";

// A specialization is its slug — e.g. "cse-core". Its own key (not
// merged into useBranch), same reasoning useBatch.ts already
// established for Batch: this is a second identity dimension that
// only sometimes applies (CSE only), layered on top of Branch, not a
// property of Branch itself. Null here has two different meanings
// depending on the current branch — "not chosen yet" for a
// has_specializations branch, or "not applicable" for one without —
// callers distinguish those via the branch's own has_specializations
// flag, not by anything stored here.
const STORAGE_KEY = "sancturm:specialization";

let snapshot: { specialization: string | null; isLoaded: boolean } = {
  specialization: null,
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
    snapshot = { specialization: window.localStorage.getItem(STORAGE_KEY), isLoaded: true };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { specialization: null, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setSpecialization(slug: string) {
  window.localStorage.setItem(STORAGE_KEY, slug);
  snapshot = { specialization: slug, isLoaded: true };
  emitChange();
}

function clearSpecialization() {
  window.localStorage.removeItem(STORAGE_KEY);
  snapshot = { specialization: null, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes the student's selected specialization to
 * localStorage — same one-time-persisted, shared-snapshot pattern as
 * useBranch/useBatch. Only meaningful when the current branch has
 * has_specializations=true (CSE today); every other branch's pages
 * never read this.
 */
export function useSpecialization() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    specialization: state.specialization,
    isLoaded: state.isLoaded,
    setSpecialization,
    clearSpecialization,
  };
}
