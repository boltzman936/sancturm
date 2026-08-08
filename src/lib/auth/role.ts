import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * `auth.getUser()` isn't a cheap cookie read — it's a real round trip
 * to Supabase's auth server (deliberately, to validate the session
 * rather than trust a possibly-stale cookie). CRLayout calls this to
 * decide whether to redirect to /login, and getCurrentRole() below
 * needs it too — without `cache()`, that's the same network call
 * fired twice for every single /cr/* page load. React's `cache()`
 * memoizes it per-request: whichever of the two asks first pays for
 * the round trip, the other gets the same already-resolved promise.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Resolves the logged-in user to exactly one of: a cross-branch admin
 * (the `admins` table — see supabase/add_admins.sql), a single-branch
 * CR (`cr_profiles`), or neither. This is read-only convenience for
 * the UI (what to show, which branch to default to) — it is NOT the
 * security boundary. The actual enforcement is the RLS policies in
 * Postgres; a page or action that gets this wrong still can't write
 * outside what the database allows.
 */
export type Role =
  | { type: "admin"; displayName: string }
  | { type: "cr"; branchId: string; termId: string; displayName: string }
  | null;

export async function getCurrentRole(): Promise<Role> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  // A user is never both an admin and a CR, so there's no ordering
  // dependency between these two lookups — checking admin, THEN (only
  // if that misses) checking cr_profiles turned the common case (a CR
  // signing in) into two round trips paid in sequence for nothing.
  // Firing both at once costs the time of the slower one, not the sum.
  const [{ data: admin }, { data: cr }] = await Promise.all([
    supabase.from("admins").select("display_name").eq("auth_user_id", user.id).maybeSingle(),
    supabase
      .from("cr_profiles")
      .select("branch_id, term_id, display_name")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
  ]);

  if (admin) return { type: "admin", displayName: admin.display_name };
  if (cr) return { type: "cr", branchId: cr.branch_id, termId: cr.term_id, displayName: cr.display_name };
  return null;
}
