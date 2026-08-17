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
