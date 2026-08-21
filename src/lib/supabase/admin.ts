import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * The ONE place in this codebase that uses Supabase's service-role
 * key — every other Server Action deliberately uses the same anon-key
 * client a browser would (see server.ts's own comment), relying on
 * RLS as the real boundary. That works because every other mutation
 * in this app is triggered by a signed-in CR/admin's own session.
 *
 * A payment-provider webhook has no session at all — it's a trusted
 * server-to-server call authenticated by a signature, not a cookie —
 * so it structurally cannot satisfy any auth.uid()-based RLS policy.
 * The service role is the correct, standard way to let a verified
 * webhook write past RLS anyway. Import this ONLY from
 * src/app/api/support/webhook/route.ts — never from a Server Action a
 * browser can trigger, and never from anything "use client".
 *
 * Whether SUPABASE_SERVICE_ROLE_KEY is set doesn't by itself activate
 * this route — SUPPORT_WEBHOOK_SECRET being unset (see
 * add_support_sancturm.sql; Support Sancturm ships dormant) is what
 * makes the webhook 503 before ever reaching this function, regardless
 * of whether this key happens to be configured in the environment.
 * This throws rather than silently falling back to the anon key if
 * BOTH env vars were ever present but this one went missing, which
 * would make the webhook either fail on every write (safe but
 * confusing) or, worse, appear to work while writes silently fail to
 * actually verify anything.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — the payment webhook can't verify or record anything without it."
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
