"use client";

import { useCallback, useSyncExternalStore } from "react";

// One cache/listener set per storage key, not a single global store —
// unlike useBranch/useBatch/useTerm (which each ever have exactly one
// fixed key), this hook is called with a different key per filter
// (Semester pick, Subject filter, Manage's own filters, …), so each
// key needs its own independent slice of state.
const cacheByKey = new Map<string, string>();
const listenersByKey = new Map<string, Set<() => void>>();

function getListeners(key: string) {
  let set = listenersByKey.get(key);
  if (!set) {
    set = new Set();
    listenersByKey.set(key, set);
  }
  return set;
}

/**
 * A useState whose value survives unmount/remount within the same
 * browser tab session (sessionStorage-backed) — for a filter selection
 * that must stay put across route navigation (e.g. Notes -> CR
 * Dashboard -> Notes) without persisting across a genuinely new
 * session/tab, matching the sessionStorage semantics
 * useBatchSemesterFilter's own Batch-pick tracking already uses.
 *
 * Same useSyncExternalStore module-level-store pattern as
 * useBranch/useBatch/useTerm, generalized to a caller-supplied key
 * instead of one hardcoded per file — see those files' own comments
 * for why a plain useState/useEffect pair isn't used here (every
 * simultaneously-mounted reader of the same key must observe the same
 * live value, and setting state from inside an effect body causes
 * exactly the cascading-render pattern React's own rules warn against).
 *
 * Whatever "is this still valid for the current scope" check the
 * caller already runs (e.g. useResetInvalidSelection) is what actually
 * decides whether a restored value sticks or gets reset back out —
 * this hook only stops a genuinely still-valid pick from silently
 * vanishing on a route change alone.
 *
 * `initial` doubles as the "cleared" value: setting state back to it
 * removes the storage key instead of persisting it, so a caller's own
 * reset-to-fallback logic (fallback === initial) naturally clears
 * storage too, with no separate null-handling needed.
 */
export function useSessionPersistedState<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const listeners = getListeners(key);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    [key]
  );

  const getSnapshot = useCallback(() => {
    if (!cacheByKey.has(key)) {
      cacheByKey.set(key, window.sessionStorage.getItem(key) ?? initial);
    }
    return cacheByKey.get(key)!;
  }, [key, initial]);

  const getServerSnapshot = useCallback(() => initial, [initial]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as T;

  function setPersisted(next: T) {
    cacheByKey.set(key, next);
    if (next === initial) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, next);
    for (const listener of getListeners(key)) listener();
  }

  return [value, setPersisted];
}
