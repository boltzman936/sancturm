import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MaintenanceCountdown } from "@/features/maintenance/components/MaintenanceCountdown";

function isMaintenanceActive(until: string | null) {
  return !!until && new Date(until).getTime() > Date.now();
}

/**
 * Outside (app), same as /offline and /login — no sidebar/branch/term
 * shell here. Middleware redirects any non-admin request here while
 * maintenance is active (see src/middleware.ts); this page independently
 * re-checks the same row and bounces back to "/" if maintenance is
 * NOT actually active, covering a stale bookmark/link to this URL.
 */
export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data: config } = await supabase.from("maintenance_config").select("until, message").single();

  const until = config?.until ?? null;
  if (!isMaintenanceActive(until)) redirect("/");

  // Node server clock, captured at render time — the trustworthy
  // reference point MaintenanceCountdown anchors its display to
  // instead of the visitor's own (untrustworthy) clock. This is
  // purely cosmetic UX; the actual access gate is middleware's own
  // server-side comparison, re-run on every navigation.
  const serverNow = new Date().toISOString();

  return <MaintenanceCountdown until={until!} message={config?.message ?? null} serverNow={serverNow} />;
}
