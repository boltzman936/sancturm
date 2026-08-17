"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SupportConfig, Contribution } from "./types";

/**
 * The Support Sancturm singleton — same public-read reasoning as
 * useMaintenanceConfig: every visitor's browser needs `enabled` (and,
 * once true, the public payment fields) with no auth required. No
 * polling (unlike maintenance) — nothing here needs to react to the
 * literal passage of time the way an offline countdown does; an admin
 * flipping `enabled` is a rare, deliberate action, not something a
 * student needs to see update mid-session.
 */
export function useSupportConfig() {
  return useQuery({
    queryKey: ["support-config"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("support_config").select("*").single();
      if (error) throw error;
      return data as SupportConfig;
    },
    staleTime: 30_000,
  });
}

/**
 * Admin-only contributions list, newest first — RLS (not this hook)
 * is what actually keeps a non-admin from getting real rows back; a
 * CR or student calling this just gets an empty/error result.
 */
export function useContributions() {
  return useQuery({
    queryKey: ["contributions"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contributions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Contribution[];
    },
    staleTime: 15_000,
  });
}
