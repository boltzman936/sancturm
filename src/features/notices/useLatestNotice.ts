"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Just the id + created_at of the single newest notice for this
 * (branch, specialization, term) — NOT the full useNotices() list
 * (title, body, pdf_url, pinned state, ...). This only powers the
 * sidebar's unread red dot (see Sidebar.tsx), which needs to answer
 * one cheap question ("is there anything newer than what I've seen,
 * for MY actual current context") from every page in the app, not
 * just while actually on /notices.
 *
 * termId is the viewer's live term for their sidebar Year (see
 * useLiveTermForYear in useBatchSemesterFilter.ts) — matching exactly
 * what the Notices page itself now shows (Branch + Specialization +
 * Year + current live Semester, no Batch dimension). A notice for a
 * different semester/year no longer lights up this dot; passing
 * termId as null (still loading) disables the query entirely rather
 * than falling back to "any notice ever," which used to produce
 * false-positive dots for notices the viewer would never actually see.
 */
export function useLatestNotice(
  branchId: string | null,
  specializationId: string | null,
  hasSpecializations: boolean,
  termId: string | null
) {
  return useQuery({
    queryKey: ["notices", "latest", branchId, hasSpecializations ? specializationId : null, termId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("notices")
        .select("id, created_at")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!);
      query = hasSpecializations ? query.eq("specialization_id", specializationId!) : query.is("specialization_id", null);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; created_at: string } | null;
    },
    enabled: !!branchId && !!termId && (!hasSpecializations || !!specializationId),
    staleTime: 30_000,
  });
}

// "Last seen" is scoped per (branch, specialization) — switching
// branch (rare, but possible via the sidebar switcher) must never
// carry over a false "read" state from a completely different
// branch's notices, or the reverse (a false unread dot for a branch
// whose notices were never actually new).
function storageKey(branchId: string | null, specializationId: string | null) {
  return `sancturm:lastSeenNotice:${branchId ?? "none"}:${specializationId ?? "none"}`;
}

let snapshot: { key: string; id: string | null } = { key: "", id: null };
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSnapshot(key: string) {
  if (snapshot.key !== key) {
    snapshot = { key, id: window.localStorage.getItem(key) };
  }
  return snapshot;
}

const SERVER_SNAPSHOT = { key: "", id: null as string | null };

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/**
 * Reads/writes the last notice id this browser has actually seen, for
 * one (branch, specialization) — see storageKey's own comment. Marking
 * seen is the CALLER's responsibility (see notices/page.tsx: only once
 * the page has actually mounted and rendered the real notices list, not
 * merely because some other part of the app queried useLatestNotice
 * above for the sidebar's own badge).
 */
export function useLastSeenNotice(branchId: string | null, specializationId: string | null) {
  const key = storageKey(branchId, specializationId);
  const getSnapshot = () => readSnapshot(key);
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // useCallback, not a plain function — a caller (notices/page.tsx)
  // puts this in a useEffect's dependency array to mark the current
  // notice seen once it's actually rendered. A new markSeen identity
  // every render meant that effect never stabilized: it fired, called
  // markSeen, which calls emitChange() and re-renders this component
  // with a brand new markSeen reference, which the effect saw as
  // "changed" and fired again — an infinite loop that only showed up
  // once a real notice existed to mark seen (confirmed live: crashed
  // exactly when, and only when, a context had an actual notice).
  // Stable across renders now, only changing when the (branch,
  // specialization) key itself does.
  const markSeen = useCallback(
    (noticeId: string) => {
      window.localStorage.setItem(key, noticeId);
      snapshot = { key, id: noticeId };
      emitChange();
    },
    [key]
  );

  return { lastSeenId: state.id, markSeen };
}
