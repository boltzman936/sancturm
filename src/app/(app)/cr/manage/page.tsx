import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { ManageResourceList, type ManageableResource } from "@/features/resources/components/ManageResourceList";

export default async function CRManagePage() {
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
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  // Same shape as the approvals queue: a CR manages their own branch's
  // notes_lab items, plus every branch's PYQs (shared content — see
  // supabase/pyq_cross_branch.sql).
  if (role.type === "cr") {
    query = query.or(`section.eq.pyq,and(section.eq.notes_lab,branch_id.eq.${role.branchId})`);
  }

  const { data: published } = await query;

  // Notices are branch-scoped only (no PYQ-style cross-branch exception),
  // so a CR only ever manages their own branch's notices here.
  let noticesQuery = supabase
    .from("notices")
    .select("id, title, created_at, branch:branches(name)")
    .order("created_at", { ascending: false });
  if (role.type === "cr") {
    noticesQuery = noticesQuery.eq("branch_id", role.branchId);
  }
  const { data: notices } = await noticesQuery;

  const { data: branches } = await supabase.from("branches").select("name").order("name");

  const resourceItems: ManageableResource[] = (published ?? []).map((resource) => ({
    ...resource,
    kind: "resource",
  }));

  const noticeItems: ManageableResource[] = (notices ?? []).map((notice) => ({
    id: notice.id,
    kind: "notice",
    title: notice.title,
    section: "notice",
    resource_type: null,
    uploaded_by_device: null,
    uploaded_by_name: null,
    created_at: notice.created_at,
    subject: null,
    branch: Array.isArray(notice.branch) ? notice.branch[0] ?? null : notice.branch,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Manage</h1>
        <p className="text-muted-foreground">
          {role.type === "admin"
            ? "Everything currently live, across every branch."
            : "Everything currently live in your branch."}
        </p>
      </div>

      <ManageResourceList
        resources={[...resourceItems, ...noticeItems]}
        isAdmin={role.type === "admin"}
        branches={branches ?? []}
      />
    </div>
  );
}
