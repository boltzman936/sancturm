import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { ApprovalActions } from "@/features/resources/components/ApprovalActions";

const SECTION_LABEL: Record<string, string> = {
  notes_lab: "Notes & lab",
  pyq: "PYQ",
};

export default async function CRApprovalsPage() {
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
  let query = supabase
    .from("resources")
    .select("*, subject:subjects(name), branch:branches(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Admin sees every branch's queue outright. A CR sees their own
  // branch's notes_lab queue PLUS every branch's PYQ queue — PYQs are
  // shared content any CR can review (see supabase/pyq_cross_branch.sql),
  // matching exactly what RLS would allow them to act on anyway.
  if (role.type === "cr") {
    query = query.or(`section.eq.pyq,and(section.eq.notes_lab,branch_id.eq.${role.branchId})`);
  }

  const { data: pending } = await query;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Approvals</h1>
        <p className="text-muted-foreground">
          {role.type === "admin"
            ? "Pending uploads across every branch."
            : "Pending uploads waiting for your review."}
        </p>
      </div>

      {(!pending || pending.length === 0) && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Nothing pending.
        </div>
      )}

      {pending && pending.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pending.map((resource) => (
            <li
              key={resource.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-foreground">{resource.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle-foreground">
                  <span>{SECTION_LABEL[resource.section] ?? resource.section}</span>
                  <span aria-hidden="true">·</span>
                  <span>{resource.subject?.name ?? "Extra"}</span>
                  {(role.type === "admin" || resource.section === "pyq") && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{resource.branch?.name}</span>
                    </>
                  )}
                </p>
              </div>
              <ApprovalActions resourceId={resource.id} fileUrl={resource.file_url} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
