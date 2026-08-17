"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import { assertBatchTermReached } from "@/features/batches/academicValidation";
import { isBatchTermHiddenForSpecialization } from "@/features/batches/academicChronology";
import { resolveSubjectSpecializationName } from "./subjectInterchange";
import type { SubjectStructureConfig, ResourceSection, ResourceType } from "./types";
import {
  assertValidId,
  assertValidIdOrNull,
  assertValidString,
  assertValidDateKey,
  safeDbError,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/validation";

// The database's own CHECK constraints — mirrored here so a malformed
// resource_type/section can be rejected with a clear error before it
// ever reaches Postgres, not just relying on the DB to bounce it.
const RESOURCE_TYPES = new Set<ResourceType>([
  "notes",
  "lab_manual",
  "code",
  "assignment",
  "viva",
  "record_file",
  "pdf",
  "pyq",
  "pyq_solution",
]);
const RESOURCE_SECTIONS = new Set<ResourceSection>(["notes_lab", "pyq"]);

function assertValidResourceType(value: unknown): asserts value is ResourceType {
  if (typeof value !== "string" || !RESOURCE_TYPES.has(value as ResourceType)) {
    throw new Error("Invalid resource type.");
  }
}

function assertValidSection(value: unknown): asserts value is ResourceSection {
  if (typeof value !== "string" || !RESOURCE_SECTIONS.has(value as ResourceSection)) {
    throw new Error("Invalid section.");
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
  await checkRateLimit("deleteResource", user.id, 30, 60_000);
  assertValidId(resourceId, "resource");

  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .select("file_url")
    .single();
  if (error) throw safeDbError(error);

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
    specializationId?: string | null;
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
  await checkRateLimit("updateResourceFields", user.id, 60, 60_000);

  assertValidId(resourceId, "resource");
  if (fields.branchId !== undefined) assertValidId(fields.branchId, "branch");
  if (fields.specializationId !== undefined) assertValidIdOrNull(fields.specializationId, "specialization");
  if (fields.termId !== undefined) assertValidId(fields.termId, "year");
  if (fields.batchId !== undefined) assertValidId(fields.batchId, "batch");
  if (fields.subjectId !== undefined) assertValidIdOrNull(fields.subjectId, "subject");
  if (fields.dateKey !== undefined) assertValidDateKey(fields.dateKey, "date");
  if (fields.title !== undefined) assertValidString(fields.title, "Title", { maxLength: MAX_TITLE_LENGTH });
  if (fields.description !== undefined) {
    assertValidString(fields.description ?? "", "Description", {
      maxLength: MAX_DESCRIPTION_LENGTH,
      required: false,
    });
  }
  if (fields.resourceType !== undefined) assertValidResourceType(fields.resourceType);
  if (fields.section !== undefined) assertValidSection(fields.section);

  // The Edit dialog's Batch <select> (useBatchesForTerm) isn't itself
  // date-filtered — Edit deliberately lets an admin retarget a
  // resource to ANY branch/term/batch, not just the ones it already
  // had (see EditResourceButton) — so unlike Upload's own dropdown,
  // nothing before this point already ruled out an unreached pairing.
  // Same check Upload's own insert uses, so the two can't drift apart.
  if (fields.termId !== undefined && fields.batchId !== undefined) {
    // fields.specializationId ?? null: EditResourceButton's cascade
    // always submits specialization together with term/batch (it's
    // one combined <select> chain), so this is the resource's real
    // target specialization in every real request this ever receives.
    // A hand-crafted request that changes term/batch WITHOUT also
    // resending specializationId would fall through to null here
    // (treated as "no specialization"), which the hidden-semester
    // exception never matches — a narrow, admin-only gap, accepted
    // rather than adding an extra fetch of the resource's current
    // specialization_id just to close a case the real UI never
    // produces.
    await assertBatchTermReached(supabase, fields.batchId, fields.termId, fields.specializationId ?? null);
  }

  const update: Record<string, string | null> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.specializationId !== undefined) update.specialization_id = fields.specializationId;
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
    if (fetchError) throw safeDbError(fetchError);
    update.created_at = withDateKey(existing.created_at, fields.dateKey);
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase.from("resources").update(update).eq("id", resourceId);
    if (updateError) throw safeDbError(updateError);
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
  await checkRateLimit("setSubjectInterchange", user.id, 10, 60_000);

  if (typeof active !== "boolean") throw new Error("Invalid value.");

  const { error } = await supabase
    .from("subject_structure_config")
    .update({
      interchange_active: active,
      updated_by: role.displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw safeDbError(error);

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
  await checkRateLimit("toggleResourcePin", user.id, 60, 60_000);

  assertValidId(resourceId, "resource");
  if (typeof pinned !== "boolean") throw new Error("Invalid pin value.");

  const { error } = await supabase.from("resources").update({ is_pinned: pinned }).eq("id", resourceId);
  if (error) throw safeDbError(error);
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
  await checkRateLimit("uploadResourceDirect", user.id, 30, 60_000);

  const role = await getCurrentRole();

  const branchId = formData.get("branchId") as string;
  const specializationId = (formData.get("specializationId") as string) || null;
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

  assertValidId(branchId, "branch");
  assertValidIdOrNull(specializationId, "specialization");
  assertValidId(termId, "year");
  assertValidId(batchId, "batch");
  assertValidIdOrNull(subjectId, "subject");
  assertValidSection(section);
  assertValidResourceType(resourceType);
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  if (customCreatedAt !== null) assertValidString(customCreatedAt, "Date", { maxLength: 40 });

  await assertBatchTermReached(supabase, batchId, termId, specializationId);

  // The presigned PUT already constrained WHICH Content-Type header
  // could be set on this object; this confirms the object's actual
  // bytes match that claimed type before it can ever be referenced by
  // a published row — see uploadVerification.ts's own comment for why
  // the earlier check alone wasn't enough.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const { error: insertError } = await supabase.from("resources").insert({
    branch_id: branchId,
    specialization_id: specializationId,
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
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}

/**
 * Admin-only: publishes one Notes/Lab resource to any number of
 * SPECIALIZATIONS within one branch WITHIN ONE TERM in a single
 * action, instead of repeating the upload per specialization — a
 * 1st-Year note has nothing to do with 2nd-Year specializations, so
 * this deliberately doesn't cross terms (confirmed behavior, not "all
 * combos"). "Every specialization" is just what it does when every one
 * happens to be selected in the form's multi-select — not a separate
 * mode. For a branch with no specialization concept, specializationIds
 * is empty and this publishes exactly once, specialization_id null —
 * there's nothing to fan out across.
 *
 * Uploads the file to R2 once, then inserts one `resources` row per
 * target — each specialization has its own `subjects` rows with
 * different UUIDs even for identically-named subjects, so the subject
 * is resolved by NAME within each specialization rather than reusing
 * one subject_id everywhere (same cross-specialization-name-matching
 * approach already used for PYQ). RLS only lets an admin insert outside
 * their own scope at all (see supabase/restrict_uploads_to_cr.sql), so
 * a non-admin calling this just gets a database rejection either way —
 * the explicit role check here is just a faster, clearer failure.
 */
export async function uploadResourceDirectAllBranches(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("uploadResourceDirectAllBranches", user.id, 30, 60_000);

  const branchId = formData.get("branchId") as string;
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

  assertValidId(branchId, "branch");
  assertValidId(termId, "year");
  assertValidId(batchId, "batch");
  assertValidString(subjectName ?? "", "Subject", { maxLength: MAX_TITLE_LENGTH, required: false });
  assertValidSection(section);
  assertValidResourceType(resourceType);
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  if (customCreatedAt !== null) assertValidString(customCreatedAt, "Date", { maxLength: 40 });

  // The form's multi-select sends exactly which specializations were
  // checked — falls back to every specialization the branch has only
  // if the field is missing entirely (an older client), never silently
  // on a malformed value, since that would publish somewhere the admin
  // didn't pick. Empty array (branch has no specialization concept) is
  // valid and means "publish once, specialization_id null".
  const specializationIdsRaw = formData.get("specializationIds") as string | null;
  let specializationIds: string[];
  if (specializationIdsRaw === null) {
    const { data: allSpecializations, error: specializationsError } = await supabase
      .from("specializations")
      .select("id")
      .eq("branch_id", branchId);
    if (specializationsError) throw safeDbError(specializationsError);
    specializationIds = (allSpecializations ?? []).map((s) => s.id);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(specializationIdsRaw);
    } catch {
      throw new Error("Invalid specialization selection.");
    }
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
      throw new Error("Invalid specialization selection.");
    }
    for (const id of parsed) assertValidId(id, "specialization");
    specializationIds = parsed;
  }

  // Specialization-agnostic here on purpose — this only confirms the
  // (batch, term) pair itself has started; the specialization-specific
  // exception (see isBatchTermHiddenForSpecialization) is applied
  // below, per target, since a bulk publish can span several
  // specializations at once and only SOME of them might be excluded
  // (e.g. Core+AIML+Cyber Security picked together for 1st Year Sem 2 —
  // Cyber Security should still get published to, even though the
  // other two are filtered out).
  await assertBatchTermReached(supabase, batchId, termId, null);

  // Verified once, not per-target — it's the same uploaded object
  // referenced by every row below. See uploadResourceDirect's identical
  // check for why this exists.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  // Resolved once for the whole batch, not per-target — fine to share
  // across every target since it only depends on termId, which is
  // fixed for this whole call. Same resolveSubjectSpecializationName
  // useSubjects itself calls client-side, so a bulk-publish and a
  // regular upload can never disagree about which subject list is
  // currently active for a given specialization.
  let interchangeActive = false;
  let allSpecializationNames: { id: string; name: string }[] = [];
  let termSlug: string | null = null;
  if (subjectName && specializationIds.length > 0) {
    const [{ data: config }, { data: specializationRows }, { data: termRow }] = await Promise.all([
      supabase.from("subject_structure_config").select("*").single(),
      supabase.from("specializations").select("id, name").eq("branch_id", branchId),
      supabase.from("academic_terms").select("slug").eq("id", termId).single(),
    ]);
    interchangeActive = (config as SubjectStructureConfig | null)?.interchange_active ?? false;
    allSpecializationNames = specializationRows ?? [];
    termSlug = termRow?.slug ?? null;
  }

  const rawTargets = specializationIds.length > 0 ? specializationIds : [null];
  // Drops any target this exact (batch, term) is hidden for (see
  // isBatchTermHiddenForSpecialization) — a bulk publish spanning
  // several specializations still goes through for the ones that
  // aren't excluded, rather than the whole request failing outright.
  const targets = rawTargets.filter((id) => !isBatchTermHiddenForSpecialization(batchId, termId, id));
  if (targets.length === 0) {
    throw new Error("That semester isn't available for any of the selected specializations.");
  }

  for (const specializationId of targets) {
    let subjectId: string | null = null;
    if (subjectName && specializationId) {
      const requestedName = allSpecializationNames.find((s) => s.id === specializationId)?.name;
      const resolvedName = requestedName
        ? resolveSubjectSpecializationName(requestedName, termSlug, interchangeActive)
        : undefined;
      const resolvedSpecializationId = resolvedName
        ? allSpecializationNames.find((s) => s.name === resolvedName)?.id
        : specializationId;
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("branch_id", branchId)
        .eq("specialization_id", resolvedSpecializationId ?? specializationId)
        .eq("term_id", termId)
        .eq("name", subjectName)
        .maybeSingle();
      subjectId = subject?.id ?? null;
    } else if (subjectName) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("branch_id", branchId)
        .is("specialization_id", null)
        .eq("term_id", termId)
        .eq("name", subjectName)
        .maybeSingle();
      subjectId = subject?.id ?? null;
    }

    const { error: insertError } = await supabase.from("resources").insert({
      branch_id: branchId,
      specialization_id: specializationId,
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
    if (insertError) throw safeDbError(insertError);
  }

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}
