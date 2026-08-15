"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey, localDateKey } from "@/lib/date";
import { isDateReached } from "@/features/batches/academicChronology";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import { resolveSubjectBranchName } from "./subjectInterchange";
import type { SubjectStructureConfig } from "./types";

/**
 * The server-side half of the "never upload into a semester that
 * hasn't started" rule — the client-side dropdown in CRUploadForm
 * already hides a future semester, but that's just UX; this is what
 * actually stops a submission that targets one anyway (a manipulated
 * request, or a stale form left open across a batch_terms edit).
 * Reuses the exact same isDateReached comparison the dropdown filters
 * with, so the two can't silently drift apart.
 */
async function assertBatchTermReached(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  termId: string
) {
  const { data, error } = await supabase
    .from("batch_terms")
    .select("start_date")
    .eq("batch_id", batchId)
    .eq("term_id", termId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isDateReached(data.start_date, localDateKey(new Date().toISOString()))) {
    throw new Error("That semester hasn't started yet, so it can't be uploaded to.");
  }
}

/**
 * Takes down an already-published resource — same RLS-enforced
 * "CR or admin deletes" policy as everything else here. Only removes
 * the database row; the underlying file stays in Storage (harmless,
 * just an orphaned object — not worth the extra round trip to also
 * delete it from Storage for this).
 */
export async function deleteResource(resourceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  checkRateLimit("deleteResource", user.id, 30, 60_000);

  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .select("file_url")
    .single();
  if (error) throw error;

  // Best-effort: the row is already gone (the outcome that actually
  // matters to whoever clicked delete), so a storage hiccup here
  // shouldn't surface as a failed delete.
  try {
    await deleteFromR2(data?.file_url);
  } catch {
    // Orphaned object in R2 — same as before this fix existed, not a
    // new failure mode, so nothing more to do here.
  }

  revalidatePath("/cr/manage");
  revalidatePath("/notes");
  revalidatePath("/cr");
}

/**
 * Admin-only: retroactively changes ANY of an already-published
 * resource's Year/Batch/Branch/Subject/Date — every field pickable at
 * upload time, now editable after the fact from Manage instead of
 * only the date. Only the fields actually passed get updated
 * (omitted = leave unchanged), so editing just the date doesn't need
 * to resend everything else. Explicit role check, not left to RLS
 * alone — RLS's own "CR or admin updates" policy would otherwise let
 * a CR reach this too, defeating the backdating restriction
 * CRUploadForm's minDate already enforces at upload time.
 */
export async function updateResourceFields(
  resourceId: string,
  fields: {
    branchId?: string;
    termId?: string;
    batchId?: string;
    subjectId?: string | null;
    dateKey?: string;
    title?: string;
    description?: string | null;
    // Always sent together (never one without the other) — the edit
    // dialog's Type toggle covers all four resource_types, including
    // across the notes_lab/pyq line, so a save can genuinely move a
    // row from one section to the other.
    resourceType?: string;
    section?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  checkRateLimit("updateResourceFields", user.id, 60, 60_000);

  const update: Record<string, string | null> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.termId !== undefined) update.term_id = fields.termId;
  if (fields.batchId !== undefined) update.batch_id = fields.batchId;
  if (fields.subjectId !== undefined) update.subject_id = fields.subjectId;
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.description !== undefined) update.description = fields.description;
  if (fields.resourceType !== undefined) update.resource_type = fields.resourceType;
  if (fields.section !== undefined) update.section = fields.section;

  if (fields.dateKey !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from("resources")
      .select("created_at")
      .eq("id", resourceId)
      .single();
    if (fetchError) throw fetchError;
    update.created_at = withDateKey(existing.created_at, fields.dateKey);
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase.from("resources").update(update).eq("id", resourceId);
    if (updateError) throw updateError;
  }

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
  revalidatePath("/cr/manage");
}

/**
 * Admin-only: flips the 1st-Year Sem 2 subject-interchange toggle —
 * the single system-level switch resolveSubjectBranchName reads.
 * Explicit role check, not left to RLS's own "Admin only updates"
 * policy alone, for the same clearer-error-message reason as every
 * other admin action here.
 */
export async function setSubjectInterchange(active: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  // Tight — this is a rare, deliberate system-wide toggle, not
  // something a legitimate admin flips repeatedly in a short window.
  checkRateLimit("setSubjectInterchange", user.id, 10, 60_000);

  const { error } = await supabase
    .from("subject_structure_config")
    .update({
      interchange_active: active,
      updated_by: role.displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw error;

  // Every page that resolves a subject list needs to see the new
  // value — Notes/PYQs (browsing), Upload, and Manage (admin's own
  // edit dialog) all call useSubjects.
  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
  revalidatePath("/cr/upload");
  revalidatePath("/cr/manage");
}

/**
 * Pin/unpin — same RLS-enforced "CR or admin updates" policy as any
 * other resource edit, so a CR can only pin within their own scope
 * (own branch notes_lab, any-branch pyq) and admin can pin anything.
 */
export async function toggleResourcePin(resourceId: string, pinned: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  checkRateLimit("toggleResourcePin", user.id, 60, 60_000);

  const { error } = await supabase.from("resources").update({ is_pinned: pinned }).eq("id", resourceId);
  if (error) throw error;
  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr/manage");
}

/**
 * CR/admin direct upload — published immediately, no review queue.
 * Students can't insert into `resources` at all (see supabase/
 * restrict_uploads_to_cr.sql) — the only INSERT policy is CR/admin
 * scoped, so this can insert straight in as 'approved' in one step.
 */
export async function uploadResourceDirect(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  checkRateLimit("uploadResourceDirect", user.id, 30, 60_000);

  const role = await getCurrentRole();

  const branchId = formData.get("branchId") as string;
  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const subjectId = (formData.get("subjectId") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  // Uploaded straight to R2 from the browser already (see
  // features/uploads/uploadFile.ts) — this only ever receives the
  // resulting URL, never the file itself, so there's no serverless
  // body-size limit to hit regardless of how large the PDF is.
  const fileUrl = formData.get("fileUrl") as string;
  // Optional — a full ISO timestamp already built client-side (see
  // CRUploadForm), not just a date, so it sorts correctly against
  // same-day uploads. Omitted entirely when blank, letting the
  // database's own now() default apply exactly as before.
  const customCreatedAt = (formData.get("customCreatedAt") as string) || null;

  await assertBatchTermReached(supabase, batchId, termId);

  // The presigned PUT already constrained WHICH Content-Type header
  // could be set on this object; this confirms the object's actual
  // bytes match that claimed type before it can ever be referenced by
  // a published row — see uploadVerification.ts's own comment for why
  // the earlier check alone wasn't enough.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file doesn't match its declared type. The file was rejected.");
  }

  const { error: insertError } = await supabase.from("resources").insert({
    branch_id: branchId,
    term_id: termId,
    batch_id: batchId,
    subject_id: subjectId,
    section,
    resource_type: resourceType,
    title,
    description,
    file_url: fileUrl,
    status: "approved",
    uploaded_by_device: null,
    uploaded_by_name: role?.displayName ?? null,
    ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
  });
  if (insertError) throw insertError;

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}

/**
 * Admin-only: publishes one Notes/Lab resource to any number of
 * branches WITHIN ONE TERM in a single action, instead of repeating
 * the upload per branch — a 1st-Year note has nothing to do with
 * 2nd-Year branches, so this deliberately doesn't cross terms
 * (confirmed behavior, not "all 6 branch/term combos"). "Every branch"
 * is just what it does when every branch happens to be selected in the
 * form's multi-select — not a separate mode. Uploads the file to R2
 * once, then inserts one `resources` row per selected branch — each
 * branch has its own `subjects` rows with different UUIDs even for
 * identically-named subjects, so the subject is resolved by NAME
 * within each branch rather than reusing one subject_id everywhere
 * (same cross-branch-name-matching approach already used for PYQ).
 * RLS only lets an admin insert outside their own branch scope at all
 * (see supabase/restrict_uploads_to_cr.sql), so a non-admin calling
 * this just gets a database rejection either way — the explicit role
 * check here is just a faster, clearer failure.
 */
export async function uploadResourceDirectAllBranches(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  checkRateLimit("uploadResourceDirectAllBranches", user.id, 30, 60_000);

  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const subjectName = (formData.get("subjectName") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const fileUrl = formData.get("fileUrl") as string;
  // Same as uploadResourceDirect — must be read here too, since admin's
  // Notes/Lab/PYQ uploads always go through this bulk-publish path
  // (canBulkPublish), not the single-branch action. Omitting this read
  // was why a backdated admin upload silently landed on today anyway.
  const customCreatedAt = (formData.get("customCreatedAt") as string) || null;

  // The form's multi-select sends exactly which branches were checked —
  // falls back to every branch that exists only if the field is
  // missing entirely (an older client), never silently on a malformed
  // value, since that would publish somewhere the admin didn't pick.
  const branchIdsRaw = formData.get("branchIds") as string | null;
  let branchIds: string[];
  if (branchIdsRaw === null) {
    const { data: allBranches, error: branchesError } = await supabase.from("branches").select("id");
    if (branchesError) throw branchesError;
    branchIds = (allBranches ?? []).map((b) => b.id);
  } else {
    const parsed: unknown = JSON.parse(branchIdsRaw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
      throw new Error("Invalid branch selection.");
    }
    branchIds = parsed;
  }
  if (!branchIds.length) throw new Error("No branches found.");

  await assertBatchTermReached(supabase, batchId, termId);

  // Verified once, not per-branch — it's the same uploaded object
  // referenced by every branch's row below. See uploadResourceDirect's
  // identical check for why this exists.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file doesn't match its declared type. The file was rejected.");
  }

  // Resolved once for the whole batch, not per-branch — fine to share
  // across every target branch since it only depends on termId, which
  // is fixed for this whole call. Same resolveSubjectBranchName
  // useSubjects itself calls client-side, so a bulk-publish and a
  // regular upload can never disagree about which subject list is
  // currently active for a given branch.
  let interchangeActive = false;
  let allBranchNames: { id: string; name: string }[] = [];
  let termSlug: string | null = null;
  if (subjectName) {
    const [{ data: config }, { data: branchRows }, { data: termRow }] = await Promise.all([
      supabase.from("subject_structure_config").select("*").single(),
      supabase.from("branches").select("id, name"),
      supabase.from("academic_terms").select("slug").eq("id", termId).single(),
    ]);
    interchangeActive = (config as SubjectStructureConfig | null)?.interchange_active ?? false;
    allBranchNames = branchRows ?? [];
    termSlug = termRow?.slug ?? null;
  }

  for (const branchId of branchIds) {
    let subjectId: string | null = null;
    if (subjectName) {
      const requestedName = allBranchNames.find((b) => b.id === branchId)?.name;
      const resolvedName = requestedName
        ? resolveSubjectBranchName(requestedName, termSlug, interchangeActive)
        : undefined;
      const resolvedBranchId = resolvedName ? allBranchNames.find((b) => b.name === resolvedName)?.id : branchId;
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("branch_id", resolvedBranchId ?? branchId)
        .eq("term_id", termId)
        .eq("name", subjectName)
        .maybeSingle();
      subjectId = subject?.id ?? null;
    }

    const { error: insertError } = await supabase.from("resources").insert({
      branch_id: branchId,
      term_id: termId,
      batch_id: batchId,
      subject_id: subjectId,
      section,
      resource_type: resourceType,
      title,
      description,
      file_url: fileUrl,
      status: "approved",
      uploaded_by_device: null,
      uploaded_by_name: role.displayName,
      ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
    });
    if (insertError) throw insertError;
  }

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}
