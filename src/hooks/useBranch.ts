"use client";

import { useSyncExternalStore } from "react";

// A branch is just its slug — e.g. "cse", "civil", "mechanical". Using
// the slug (not the database id) as the stored value means the value
// in localStorage is human-readable if you ever inspect it, and stays
// stable even if a branch's UUID changes between environments.
const STORAGE_KEY = "sancturm:branch";
const SPECIALIZATION_STORAGE_KEY = "sancturm:specialization";

// One-time migration: before the branch-expansion migration, this key
// stored a SPECIALIZATION slug directly ("cse-core"/"cse-aiml"/
// "cse-aids" — CSE's specializations used to be modeled as top-level
// branches). Post-migration, "branch" means the real branch ("cse")
// and specialization is its own key. A returning student's browser
// still has the old value; without this remap they'd either see
// nothing (no branch named "cse-core" exists anymore) or silently get
// bounced back into onboarding. Bounded, one-time list — these are the
// exact 3 pre-migration specialization slugs, not a pattern to extend.
const LEGACY_SPECIALIZATION_SLUGS = new Set(["cse-core", "cse-aiml", "cse-aids"]);

function migrateLegacyValue(raw: string | null): string | null {
  if (raw && LEGACY_SPECIALIZATION_SLUGS.has(raw)) {
    if (!window.localStorage.getItem(SPECIALIZATION_STORAGE_KEY)) {
      window.localStorage.setItem(SPECIALIZATION_STORAGE_KEY, raw);
    }
    window.localStorage.setItem(STORAGE_KEY, "cse");
    return "cse";
  }
  return raw;
}

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
    snapshot = { branch: migrateLegacyValue(window.localStorage.getItem(STORAGE_KEY)), isLoaded: true };
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
