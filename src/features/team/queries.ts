"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TeamDirectoryEntry } from "@/types/database";

/**
 * Every CR, publicly — via team_directory(), a security-definer
 * Postgres function, not a direct `.from("cr_profiles")` select.
 * cr_profiles' own RLS deliberately restricts reads to "your own row,
 * or an admin" (see supabase/security_hardening.sql — that closed a
 * real PII leak), so this is the ONE sanctioned way to show CR names
 * on the public Sancturm Team page without reopening it. Each row's
 * current_term_id is already resolved server-side (cr_current_term_id,
 * the same function RLS itself calls for permissions), so what this
 * page shows always matches what that CR can actually act on right
 * now — no separate "is this stale" concern to reconcile.
 */
export function useTeamDirectory() {
  return useQuery({
    queryKey: ["team-directory"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("team_directory");
      if (error) throw error;
      return data as TeamDirectoryEntry[];
    },
    staleTime: 60_000,
  });
}

export type CrProfileForAdmin = {
  id: string;
  display_name: string;
  branch_id: string;
  specialization_id: string | null;
  batch_id: string;
  year_number: number;
  card_file_url: string | null;
};

/**
 * The CR Card upload picker's own source list — a direct
 * `.from("cr_profiles")` select, NOT team_directory(). This is safe
 * specifically because cr_profiles' RLS ("Read own profile, or any if
 * admin") already limits this to exactly the caller's own admin
 * session; a non-admin calling this hook gets back at most their own
 * single row, never the roster. The actual "only admin can upload a
 * card" boundary is still enforced server-side in uploadCrCard, not by
 * this query being reachable at all — same belt-and-suspenders shape
 * every other admin-only mutation in this app already uses.
 */
export function useCrProfilesForAdmin() {
  return useQuery({
    queryKey: ["cr-profiles-admin"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cr_profiles")
        .select("id, display_name, branch_id, specialization_id, batch_id, year_number, card_file_url")
        .order("display_name");
      if (error) throw error;
      return data as CrProfileForAdmin[];
    },
    staleTime: 60_000,
  });
}
