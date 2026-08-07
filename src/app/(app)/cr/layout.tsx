import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
  This layout wraps every /cr/* route. It is the entire access-control
  system for Sancturm — there's no separate roles table, no permission
  matrix. The logic is just: "are you logged in? if not, get out."
  (Once we connect Supabase in that milestone, cr_profiles.branch_id
  further scopes what a logged-in CR can see/edit to their own branch —
  that part lives in each Server Action, not here.)

  NOTE: this will redirect to /login every time until NEXT_PUBLIC_SUPABASE_URL
  and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local — see
  .env.example and the "Connect Supabase" milestone.
*/
export default async function CRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
