"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MaintenanceConfig } from "./types";

/**
 * The site-wide maintenance singleton — `until` is the sole source of
 * truth for whether maintenance is active (null or in the past = not
 * in maintenance). Polls every 15s (baked into the hook itself, not
 * left to each call site) since this hook's whole value is near-real-
 * time countdown/recovery on /maintenance and a trustworthy live
 * status on the admin's own control panel.
 */
export function useMaintenanceConfig() {
  return useQuery({
    queryKey: ["maintenance-config"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("maintenance_config").select("*").single();
      if (error) throw error;
      return data as MaintenanceConfig;
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}
