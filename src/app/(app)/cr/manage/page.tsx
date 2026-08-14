import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { ManageResourceList, type ManageableResource } from "@/features/resources/components/ManageResourceList";
import { SubjectInterchangeControl } from "@/features/resources/components/SubjectInterchangeControl";
import { MaintenanceControl } from "@/features/maintenance/components/MaintenanceControl";

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
    .select("*, subject:subjects(name), branch:branches(name), term:academic_terms(label), batch:batches(label)")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  // Same shape as the approvals queue: a CR manages their own (branch,
  // term, batch)'s notes_lab items, plus every branch's PYQs within
  // their own term (shared content — see supabase/scope_cr_by_term.sql
  // and supabase/add_batches.sql; PYQ stays batch-agnostic there too).
  if (role.type === "cr") {
    query = query
      .eq("term_id", role.termId)
      .or(`section.eq.pyq,and(section.eq.notes_lab,branch_id.eq.${role.branchId},batch_id.eq.${role.batchId})`);
  }

  // Notices are branch-scoped only (no PYQ-style cross-branch exception),
  // so a CR only ever manages their own (branch, term, batch)'s notices
  // here.
  let noticesQuery = supabase
    .from("notices")
    .select(
      "id, title, created_at, branch_id, term_id, batch_id, cr_only, branch:branches(name), term:academic_terms(label), batch:batches(label)"
    )
    .order("created_at", { ascending: false });
  if (role.type === "cr") {
    noticesQuery = noticesQuery
      .eq("branch_id", role.branchId)
      .eq("term_id", role.termId)
      .eq("batch_id", role.batchId);
  }

  // Sancturm Updates are admin-only end to end (RLS rejects a CR's
  // read too, see supabase/sancturm_updates_v2.sql) — only fire this
  // query for an admin instead of sending one a CR can never get
  // anything back from. Term-agnostic — see queries.ts's comment.
  const updatesQuery =
    role.type === "admin"
      ? supabase.from("sancturm_updates").select("id, title, created_at").order("created_at", { ascending: false })
      : Promise.resolve({ data: null });

  // Unrelated queries — none depends on another's result — were being
  // awaited one after another, paying for each round trip in sequence
  // when they could all be in flight at once. Branches/terms/batches
  // are NOT fetched here anymore — ManageResourceList gets those from
  // the same client-side hooks (useBranches/useTerms/useBatches)
  // EditResourceButton already used, instead of a second, separate
  // server-side fetch that could drift from it.
  const [{ data: published }, { data: notices }, { data: updates }] = await Promise.all([
    query,
    noticesQuery,
    updatesQuery,
  ]);

  const resourceItems: ManageableResource[] = (published ?? []).map((resource) => ({
    ...resource,
    kind: "resource",
    term: Array.isArray(resource.term) ? resource.term[0] ?? null : resource.term,
    batch: Array.isArray(resource.batch) ? resource.batch[0] ?? null : resource.batch,
    // Resources have no CR-only concept — only notices do.
    cr_only: false,
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
    term: Array.isArray(notice.term) ? notice.term[0] ?? null : notice.term,
    batch: Array.isArray(notice.batch) ? notice.batch[0] ?? null : notice.batch,
    branch_id: notice.branch_id,
    term_id: notice.term_id,
    batch_id: notice.batch_id,
    subject_id: null,
    cr_only: notice.cr_only,
  }));

  const updateItems: ManageableResource[] = (updates ?? []).map((update) => ({
    id: update.id,
    kind: "update",
    title: update.title,
    section: "update",
    resource_type: null,
    uploaded_by_device: null,
    uploaded_by_name: null,
    created_at: update.created_at,
    subject: null,
    branch: null,
    term: null,
    // Sancturm Updates has no batch_id (platform-wide, not scoped to a
    // cohort at all) — null here, same as branch/term above.
    batch: null,
    branch_id: null,
    term_id: null,
    batch_id: null,
    subject_id: null,
    cr_only: false,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Manage</h1>
        <p className="text-muted-foreground">
          {role.type === "admin"
            ? "Everything currently live, across every branch and year."
            : "Everything currently live in your branch."}
        </p>
      </div>

      {role.type === "admin" && <SubjectInterchangeControl />}
      {role.type === "admin" && <MaintenanceControl />}

      <ManageResourceList
        resources={[...resourceItems, ...noticeItems, ...updateItems]}
        isAdmin={role.type === "admin"}
      />
    </div>
  );
}
