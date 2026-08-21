"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Just the id + created_at of the single newest notice for this
 * (branch, specialization) — NOT the full useNotices() list (title,
 * body, pdf_url, pinned state, ...), and deliberately not scoped by
 * term/batch the way useNotices() is. This only powers the sidebar's
 * unread red dot (see Sidebar.tsx), which needs to answer one cheap
 * question ("is there anything newer than what I've seen") from every
 * page in the app, not just while actually on /notices — scoping it
 * down to branch/specialization only, instead of replicating the full
 * useBatchSemesterFilter term/batch resolution just for a badge, is a
 * deliberate simplification: an occasional false-positive dot for a
 * notice posted to a semester the viewer isn't currently looking at is
 * a fair trade for not duplicating that machinery (and its own network
 * requests) on every single page load.
 */
export function useLatestNotice(branchId: string | null, specializationId: string | null, hasSpecializations: boolean) {
  return useQuery({
    queryKey: ["notices", "latest", branchId, hasSpecializations ? specializationId : null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("notices").select("id, created_at").eq("branch_id", branchId!);
      query = hasSpecializations ? query.eq("specialization_id", specializationId!) : query.is("specialization_id", null);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; created_at: string } | null;
    },
    enabled: !!branchId && (!hasSpecializations || !!specializationId),
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

  function markSeen(noticeId: string) {
    window.localStorage.setItem(key, noticeId);
    snapshot = { key, id: noticeId };
    emitChange();
  }

  return { lastSeenId: state.id, markSeen };
}
