"use client";

import { useSyncExternalStore } from "react";

// A branch is just its slug — e.g. "cse-core", "cse-aiml", "cse-aids".
// Using the slug (not the database id) as the stored value means the
// value in localStorage is human-readable if you ever inspect it,
// and stays stable even if a branch's UUID changes between environments.
const STORAGE_KEY = "sancturm:branch";

/**
 * Module-level store, shared by every component that calls useBranch()
 * — Sidebar's BranchSwitcher, AppLayout, and every page. This used to
 * be a plain useState *inside* the hook, which meant each call site
 * had its own independent copy: switching branches in the sidebar
 * updated localStorage and the sidebar's own state, but a page's
 * separate useBranch() instance never found out, so it kept showing
 * whatever branch it had at mount. useSyncExternalStore fixes that —
 * one shared snapshot, every subscriber re-renders together.
 */
let snapshot: { branch: string | null; isLoaded: boolean } = {
  branch: null,
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
    // First read happens lazily, on whichever component mounts first —
    // localStorage doesn't exist on the server, so this only ever runs
    // in the browser (getServerSnapshot below covers the server case).
    snapshot = { branch: window.localStorage.getItem(STORAGE_KEY), isLoaded: true };
  }
  return snapshot;
}

// A stable, module-level constant — not a fresh object literal per call.
// useSyncExternalStore compares getServerSnapshot's return value by
// reference across renders; a new object every time reads as "always
// changed" and throws React into an infinite re-render loop.
const SERVER_SNAPSHOT = { branch: null, isLoaded: false };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function setBranch(slug: string) {
  window.localStorage.setItem(STORAGE_KEY, slug);
  snapshot = { branch: slug, isLoaded: true };
  emitChange();
}

/**
 * Reads and writes the student's selected branch to localStorage.
 *
 * This is what makes onboarding a one-time thing: the (onboarding)
 * route group calls setBranch() once after "Choose Branch", and every
 * page after that calls useBranch() to know which branch's resources
 * to show — without ever asking again or requiring login.
 *
 * Returns:
 *  - branch: the stored slug, or null if nothing is stored yet
 *            (this is how the app knows to show onboarding first)
 *  - setBranch: call this to save a new selection (used by the
 *               branch switcher in the sidebar, and by onboarding) —
 *               every other component using useBranch() re-renders
 *               with the new value immediately, not just the caller.
 *  - isLoaded: true once we've checked localStorage. Needed because
 *              localStorage doesn't exist on the server — without this
 *              flag, the server-rendered page and the browser's first
 *              render would briefly disagree (a "hydration mismatch").
 */
export function useBranch() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { branch: state.branch, isLoaded: state.isLoaded, setBranch };
}
