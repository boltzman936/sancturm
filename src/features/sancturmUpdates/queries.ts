"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SancturmUpdate } from "./types";

/** Every update, newest first — global (no branch scoping), public read. */
export function useSancturmUpdates() {
  return useQuery({
    queryKey: ["sancturm-updates"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sancturm_updates")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SancturmUpdate[];
    },
    staleTime: 30_000,
  });
}
