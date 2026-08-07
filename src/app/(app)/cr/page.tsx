import Link from "next/link";
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
        href="/cr/upload"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
      >
        <span className="text-foreground">Upload directly</span>
        <span className="text-sm text-muted-foreground">Published immediately</span>
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
