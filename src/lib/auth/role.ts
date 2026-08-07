import { createClient } from "@/lib/supabase/server";

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
  | { type: "cr"; branchId: string; displayName: string }
  | null;

export async function getCurrentRole(): Promise<Role> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admins")
    .select("display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (admin) return { type: "admin", displayName: admin.display_name };

  const { data: cr } = await supabase
    .from("cr_profiles")
    .select("branch_id, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (cr) return { type: "cr", branchId: cr.branch_id, displayName: cr.display_name };

  return null;
}
