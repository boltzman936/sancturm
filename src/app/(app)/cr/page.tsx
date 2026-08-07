import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";

export default async function CRDashboardPage() {
  const role = await getCurrentRole();

  if (!role) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-muted-foreground">
        Your account isn&apos;t linked to a CR or admin profile yet. Ask the
        person who manages Sancturm to add one.
      </div>
    );
  }

  const supabase = await createClient();
  let countQuery = supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (role.type === "cr") {
    countQuery = countQuery.eq("branch_id", role.branchId);
  }
  const { count: pendingCount } = await countQuery;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          {role.type === "admin" ? "Controller's dashboard" : "CR dashboard"}
        </h1>
        <p className="text-muted-foreground">
          Signed in as {role.displayName}
          {role.type === "admin" ? " (admin — all branches)" : ""}.
        </p>
      </div>

      <Link
        href="/cr/approvals"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
      >
        <span className="text-foreground">Pending approvals</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-sm text-primary">
          {pendingCount ?? 0}
        </span>
      </Link>

      <Link
        href="/cr/upload"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
      >
        <span className="text-foreground">Upload directly</span>
        <span className="text-sm text-muted-foreground">no review needed</span>
      </Link>

      <Link
        href="/cr/manage"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
      >
        <span className="text-foreground">Manage</span>
        <span className="text-sm text-muted-foreground">Remove published items</span>
      </Link>
    </div>
  );
}
