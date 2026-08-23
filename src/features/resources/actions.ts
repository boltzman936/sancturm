"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey, localDateKey } from "@/lib/date";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp, urlObjectExists } from "@/lib/uploadVerification";
import { assertBatchTermReached, assertSubjectMatchesScope } from "@/features/batches/academicValidation";
import { isBatchTermHiddenForSpecialization, isDateReached } from "@/features/batches/academicChronology";
import type { ResourceSection, ResourceType } from "./types";
import {
  assertValidId,
  assertValidIdOrNull,
  assertValidString,
  assertValidDateKey,
  assertNotFutureTimestamp,
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
 * Exact-file storage dedup — decides which R2 object a NEW upload's
 * resources row should actually reference. Called once per upload
 * action (both uploadResourceDirect and uploadResourceDirectAllBranches
 * — the latter resolves it once before its per-target loop, since one
 * bulk-publish already shares one physical upload across every target)
 * right after verifyUploadedFileOrCleanUp confirms the just-uploaded
 * object is valid and has a contentHash.
 *
 * `resource_files` (content_hash PRIMARY KEY, see
 * supabase/add_resource_files_registry.sql) is the single source of
 * truth for "which physical object represents this hash" — a plain
 * SELECT-then-INSERT check here would have a real race window under
 * genuine concurrency (two uploads of the same brand-new file could
 * both see "no match" and both become canonical); the unique
 * constraint's own ON CONFLICT resolution is what makes this atomic
 * instead — Postgres itself guarantees only one upsert can ever win
 * for a given hash, not application-level timing.
 *
 * global, not scoped by resource_type/section — the same bytes are the
 * same physical file regardless of whether one context calls it Notes
 * and another calls it a PYQ; each resources row's own type/section/
 * subject/branch/etc. stay completely independent of which object its
 * file_url happens to point at.
 */
async function resolveDedupedFileUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  freshFileUrl: string,
  contentHash: string | null
): Promise<string> {
  if (!contentHash) return freshFileUrl;

  // ignoreDuplicates: true is what makes this an INSERT ... ON CONFLICT
  // (content_hash) DO NOTHING at the Postgres level — a normal .insert()
  // would instead fail the whole action with a unique-violation error
  // the moment a second upload of the same content ever happened.
  const { data: won } = await supabase
    .from("resource_files")
    .upsert({ content_hash: contentHash, file_url: freshFileUrl }, { onConflict: "content_hash", ignoreDuplicates: true })
    .select("file_url")
    .maybeSingle();
  // A row came back → no conflict occurred → this upload's object just
  // became canonical for this hash (either genuinely new content, or
  // this request happened to win a real concurrent race).
  if (won) return freshFileUrl;

  // Conflict — another physical object is already registered for this
  // hash. Confirm it's actually still live before trusting it (closes
  // the gap where the registry could point at something already
  // deleted — see resource_files' own migration comment).
  const { data: existing } = await supabase
    .from("resource_files")
    .select("file_url")
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (!existing?.file_url) return freshFileUrl; // shouldn't happen; safe fallback

  const stillLive = await urlObjectExists(existing.file_url);
  if (stillLive) {
    // Our own freshly-uploaded object is now a redundant duplicate —
    // best-effort cleanup, same accepted tradeoff as every other R2
    // cleanup in this codebase (a failed delete here is a harmless
    // orphan, not a correctness problem).
    try {
      await deleteFromR2(freshFileUrl);
    } catch {
      // Intentionally ignored — see comment above.
    }
    return existing.file_url;
  }

  // Registered object is actually gone (manual deletion, a missed
  // cleanup elsewhere) — self-heal: this upload becomes canonical
  // instead of reusing a dead link.
  await supabase.from("resource_files").update({ file_url: freshFileUrl }).eq("content_hash", contentHash);
  return freshFileUrl;
}

/**
 * Takes down an already-published resource — same RLS-enforced
 * "CR or admin deletes" policy as everything else here. Deletes the
 * database row; the underlying R2 object is only deleted alongside it
 * once no OTHER resource row still references the same file_url. The
 * same physical file is deliberately reused across independent
 * academic contexts (see supabase/initialize_2025_26_shared_content.sql
 * and its siblings — Manage's own grouped-card view is built on this
 * exact fact, see contentGroupKey in ManageResourceList.tsx), so
 * removing ONE context's row must never delete a file four other
 * contexts still point at.
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
    .select("file_url, content_hash")
    .single();
  if (error) throw safeDbError(error);

  // Best-effort: the row is already gone (the outcome that actually
  // matters to whoever clicked delete), so a storage hiccup here
  // shouldn't surface as a failed delete.
  try {
    if (data?.file_url) {
      const { count } = await supabase
        .from("resources")
        .select("id", { count: "exact", head: true })
        .eq("file_url", data.file_url);
      if (!count) {
        await deleteFromR2(data.file_url);
        // Keeps the exact-file dedup registry (resource_files) from
        // pointing at an object that no longer exists — without this,
        // a future upload of the same content would match this entry
        // and skip storing a new object, producing a resources row
        // with a dead file_url. (resolveDedupedFileUrl's own HEAD
        // check is the runtime safety net if this ever gets missed,
        // but keeping the registry accurate here is the normal path.)
        if (data.content_hash) {
          await supabase
            .from("resource_files")
            .delete()
            .eq("content_hash", data.content_hash)
            .eq("file_url", data.file_url);
        }
      }
    }
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
    // Centralized PYQ — set/change which canonical subject this row is
    // scoped to; null clears it back to a plain per-context resource.
    canonicalSubjectId?: string | null;
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
  if (fields.canonicalSubjectId !== undefined) assertValidIdOrNull(fields.canonicalSubjectId, "subject");
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
  // Same reasoning: EditResourceButton's cascade always resends
  // subjectId alongside branch/term when any of them change, so this
  // is a real check for every real request, not just UI-narrowing.
  if (
    fields.subjectId !== undefined &&
    fields.branchId !== undefined &&
    fields.termId !== undefined &&
    !fields.canonicalSubjectId
  ) {
    await assertSubjectMatchesScope(supabase, fields.subjectId, fields.branchId, fields.specializationId ?? null, fields.termId);
  }

  const update: Record<string, string | null> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.specializationId !== undefined) update.specialization_id = fields.specializationId;
  if (fields.termId !== undefined) update.term_id = fields.termId;
  if (fields.batchId !== undefined) update.batch_id = fields.batchId;
  if (fields.subjectId !== undefined) update.subject_id = fields.subjectId;
  if (fields.canonicalSubjectId !== undefined) {
    update.canonical_subject_id = fields.canonicalSubjectId;
    // Setting a canonical subject supersedes the per-context subject —
    // keeps the two mutually exclusive, same invariant upload enforces.
    if (fields.canonicalSubjectId) update.subject_id = null;
  }
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
 * Admin-only: resolves a "possible duplicate" family in Manage (same
 * canonical subject, same title/resource_type, but a different
 * content_hash — so never auto-consolidated, see
 * scratch_consolidate_pyq_duplicates.mjs) after a human has actually
 * looked at each row's file and decided they're the same paper.
 * Deletes `discardIds` outright (same delete semantics as
 * deleteResource — the R2 object behind a discarded row is only
 * removed if no other row still references its file_url). Never runs
 * automatically; always one explicit admin action per confirmed group.
 */
export async function mergeCanonicalPyqResources(keepId: string, discardIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("mergeCanonicalPyqResources", user.id, 20, 60_000);

  assertValidId(keepId, "resource");
  if (!Array.isArray(discardIds) || discardIds.length === 0) throw new Error("Nothing to merge.");
  for (const id of discardIds) {
    assertValidId(id, "resource");
    if (id === keepId) throw new Error("Can't discard the resource being kept.");
  }

  // One batched delete instead of N sequential ones, same as any other
  // multi-row admin action in this file.
  const { data: discarded, error: deleteError } = await supabase
    .from("resources")
    .delete()
    .in("id", discardIds)
    .select("file_url, content_hash");
  if (deleteError) throw safeDbError(deleteError);

  // Best-effort cleanup, same accepted tradeoff as deleteResource — one
  // reference-count check per unique file_url (almost always 1, since
  // these are duplicates of the same underlying file), not per row.
  const uniqueFiles = new Map<string, string | null>();
  for (const r of discarded ?? []) {
    if (r.file_url) uniqueFiles.set(r.file_url, r.content_hash ?? null);
  }
  await Promise.all(
    Array.from(uniqueFiles.entries()).map(async ([fileUrl, contentHash]) => {
      try {
        const { count } = await supabase
          .from("resources")
          .select("id", { count: "exact", head: true })
          .eq("file_url", fileUrl);
        if (!count) {
          await deleteFromR2(fileUrl);
          // Same resource_files cleanup as deleteResource — see its
          // own comment for why.
          if (contentHash) {
            await supabase.from("resource_files").delete().eq("content_hash", contentHash).eq("file_url", fileUrl);
          }
        }
      } catch {
        // Best-effort, same as deleteResource.
      }
    })
  );

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
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
  // Centralized PYQ: set instead of subjectId when this upload picked
  // a canonical subject (see centralize_pyq_resources.sql) — the
  // resulting row is visible everywhere that subject applies, not just
  // this (branch, specialization, term). Only ever set for
  // section="pyq"; ignored otherwise.
  const canonicalSubjectId = (formData.get("canonicalSubjectId") as string) || null;
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
  // database's own now() default apply exactly as before. Admin-only —
  // CRUploadForm no longer even renders this field for a CR, but that's
  // a UI convenience, not the actual boundary; enforced here too so a
  // hand-crafted form submission can't backdate a CR's own upload.
  const customCreatedAt = role?.type === "admin" ? (formData.get("customCreatedAt") as string) || null : null;

  assertValidId(branchId, "branch");
  assertValidIdOrNull(specializationId, "specialization");
  assertValidId(termId, "year");
  assertValidId(batchId, "batch");
  assertValidIdOrNull(subjectId, "subject");
  assertValidIdOrNull(canonicalSubjectId, "subject");
  assertValidSection(section);
  assertValidResourceType(resourceType);
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  if (customCreatedAt !== null) {
    assertValidString(customCreatedAt, "Date", { maxLength: 40 });
    assertNotFutureTimestamp(customCreatedAt, "Date");
  }

  const isCentralizedPyq = section === "pyq" && !!canonicalSubjectId;

  await assertBatchTermReached(supabase, batchId, termId, specializationId);
  // Scope no longer means anything for a centralized row (its
  // visibility comes entirely from canonical_subject_id, resolved at
  // read time) — skip the per-context check rather than validating
  // subjectId=null against a scope it isn't actually bound to.
  if (!isCentralizedPyq) {
    await assertSubjectMatchesScope(supabase, subjectId, branchId, specializationId, termId);
  }

  // The presigned PUT already constrained WHICH Content-Type header
  // could be set on this object; this confirms the object's actual
  // bytes match that claimed type before it can ever be referenced by
  // a published row — see uploadVerification.ts's own comment for why
  // the earlier check alone wasn't enough. Also yields contentHash —
  // see its own comment for why that's what Manage's grouping keys on.
  const verification = await verifyUploadedFileOrCleanUp(fileUrl);
  if (!verification.valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  if (isCentralizedPyq && verification.contentHash) {
    const { data: existingDup } = await supabase
      .from("resources")
      .select("id")
      .eq("canonical_subject_id", canonicalSubjectId!)
      .eq("resource_type", resourceType)
      .eq("content_hash", verification.contentHash)
      .eq("status", "approved")
      .maybeSingle();
    if (existingDup) {
      throw new Error("This exact file has already been uploaded for this subject.");
    }
  }

  // Exact-file storage dedup — reuses an existing physical object
  // instead of keeping this fresh one if the bytes already exist
  // somewhere else (any branch/specialization/term/batch, any resource
  // type). See resolveDedupedFileUrl's own comment for the full
  // reasoning; this never affects any of the academic-context fields
  // above, only which file_url this row ends up pointing at.
  const dedupedFileUrl = await resolveDedupedFileUrl(supabase, fileUrl, verification.contentHash);

  const { error: insertError } = await supabase.from("resources").insert({
    branch_id: branchId,
    specialization_id: specializationId,
    term_id: termId,
    batch_id: batchId,
    subject_id: isCentralizedPyq ? null : subjectId,
    canonical_subject_id: isCentralizedPyq ? canonicalSubjectId : null,
    section,
    resource_type: resourceType,
    title,
    description,
    file_url: dedupedFileUrl,
    content_hash: verification.contentHash,
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
  // Centralized PYQ — see uploadResourceDirect's identical field.
  const canonicalSubjectId = (formData.get("canonicalSubjectId") as string) || null;
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
  assertValidIdOrNull(canonicalSubjectId, "subject");
  assertValidSection(section);
  assertValidResourceType(resourceType);
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  if (customCreatedAt !== null) {
    assertValidString(customCreatedAt, "Date", { maxLength: 40 });
    assertNotFutureTimestamp(customCreatedAt, "Date");
  }

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
  const verification = await verifyUploadedFileOrCleanUp(fileUrl);
  if (!verification.valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  // Exact-file storage dedup — resolved ONCE for the whole bulk
  // publish (every target below already shares this one physical
  // upload) instead of per-target. See resolveDedupedFileUrl's own
  // comment; this never affects any academic-context field, only
  // which file_url every row inserted below ends up pointing at.
  const dedupedFileUrl = await resolveDedupedFileUrl(supabase, fileUrl, verification.contentHash);

  // Centralized PYQ: exactly ONE row, visible everywhere the canonical
  // subject applies — never fanned out across the selected
  // specializations. branch_id/specialization_id/term_id/batch_id are
  // still recorded (the uploader's own context) but are provenance
  // only; canonical_subject_id is what actually scopes visibility (see
  // centralize_pyq_resources.sql).
  if (section === "pyq" && canonicalSubjectId) {
    if (verification.contentHash) {
      const { data: existingDup } = await supabase
        .from("resources")
        .select("id")
        .eq("canonical_subject_id", canonicalSubjectId)
        .eq("resource_type", resourceType)
        .eq("content_hash", verification.contentHash)
        .eq("status", "approved")
        .maybeSingle();
      if (existingDup) {
        throw new Error("This exact file has already been uploaded for this subject.");
      }
    }
    const { error: insertError } = await supabase.from("resources").insert({
      branch_id: branchId,
      specialization_id: specializationIds[0] ?? null,
      term_id: termId,
      batch_id: batchId,
      subject_id: null,
      canonical_subject_id: canonicalSubjectId,
      section,
      resource_type: resourceType,
      title,
      description,
      file_url: dedupedFileUrl,
      content_hash: verification.contentHash,
      status: "approved",
      uploaded_by_device: null,
      uploaded_by_name: role.displayName,
      ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
    });
    if (insertError) throw safeDbError(insertError);

    revalidatePath("/notes");
    revalidatePath("/pyqs");
    revalidatePath("/cr");
    return;
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
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("branch_id", branchId)
        .eq("specialization_id", specializationId)
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

    // Makes a retry after a mid-loop failure idempotent instead of
    // duplicating: if an earlier attempt already got this exact file
    // into this exact target scope before the loop threw on a LATER
    // target, re-running the whole bulk publish would otherwise insert
    // a second identical row here rather than recognizing it's already
    // done. Scoped to this one target only (not a global content-hash
    // check) — the same file genuinely does need its own row per
    // target in this non-centralized fan-out path.
    if (verification.contentHash) {
      let dupQuery = supabase
        .from("resources")
        .select("id")
        .eq("branch_id", branchId)
        .eq("term_id", termId)
        .eq("batch_id", batchId)
        .eq("resource_type", resourceType)
        .eq("content_hash", verification.contentHash);
      // .eq() with a JS `null` doesn't match NULL rows in Postgres —
      // needs .is() instead (same distinction this function's own
      // subject lookup above already makes for the same column).
      dupQuery = specializationId ? dupQuery.eq("specialization_id", specializationId) : dupQuery.is("specialization_id", null);
      const { data: existingDup } = await dupQuery.maybeSingle();
      if (existingDup) continue;
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
      file_url: dedupedFileUrl,
      content_hash: verification.contentHash,
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

// ---------------------------------------------------------------
// Admin multi-context publish — one resource (one physical file, one
// title/description) published across ANY combination of Branch ×
// Batch × Year × Semester × Specialization at once, instead of
// repeating the upload/edit per combination. Additive only: neither
// uploadResourceDirect (CR) nor uploadResourceDirectAllBranches
// (admin's existing single-branch/multi-specialization flow) is
// touched by any of this — CR's own permissions/options and the
// existing admin flow are both byte-for-byte unchanged.
// ---------------------------------------------------------------

export type MultiContextTarget = {
  branchId: string;
  specializationId: string | null;
  termId: string;
  batchId: string;
};

export type MultiContextResult = {
  published: number;
  skipped: (MultiContextTarget & { reason: string })[];
};

/**
 * Shared core for both "publish a fresh upload to many contexts" and
 * "add more contexts to an already-existing resource" — the only
 * difference between those two callers is whether fileUrl/contentHash
 * come from a brand-new upload+dedup resolution or are already known
 * from an existing resources row (see addResourceContexts below,
 * which never re-uploads or re-verifies anything).
 *
 * Every validity check that already exists for a single-target publish
 * (isBatchTermHiddenForSpecialization, the batch_terms "has this
 * semester started" check, per-target content-hash retry guard) is
 * reused here — just resolved with THREE batched queries up front
 * instead of one query per combination, since a real cross-product
 * (e.g. 3 branches × 2 batches × 4 terms × 3 specializations) would
 * otherwise mean dozens of sequential round trips. An invalid
 * combination is skipped with a reason, never thrown — matching the
 * existing bulk action's own "some targets filtered, the rest still
 * publish" precedent, just extended to every dimension instead of only
 * specialization.
 *
 * Centralized PYQ (canonicalSubjectId set) is a deliberate special
 * case: per the existing model (see uploadResourceDirectAllBranches's
 * identical short-circuit), a centralized PYQ is always exactly ONE
 * row — visibility comes entirely from canonical_subject_id at read
 * time, so inserting one row per target here would just be redundant
 * duplication of the same row, defeating the whole point of
 * centralizing it. Only the first valid target is used as that one
 * row's provenance; every other target is reported as "skipped" with
 * an informational (not error) reason.
 */
async function publishResourceToContexts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    fileUrl: string;
    contentHash: string | null;
    section: string;
    resourceType: string;
    title: string;
    description: string | null;
    subjectName: string | null;
    canonicalSubjectId: string | null;
    customCreatedAt: string | null;
    uploadedByName: string | null;
    targets: MultiContextTarget[];
  }
): Promise<MultiContextResult> {
  const { targets, canonicalSubjectId } = params;
  if (targets.length === 0) return { published: 0, skipped: [] };

  if (canonicalSubjectId) {
    const validTargets = targets.filter(
      (t) => !isBatchTermHiddenForSpecialization(t.batchId, t.termId, t.specializationId)
    );
    if (validTargets.length === 0) {
      return {
        published: 0,
        skipped: targets.map((t) => ({ ...t, reason: "not available for this specialization" })),
      };
    }
    const primary = validTargets[0];
    const { error } = await supabase.from("resources").insert({
      branch_id: primary.branchId,
      specialization_id: primary.specializationId,
      term_id: primary.termId,
      batch_id: primary.batchId,
      subject_id: null,
      canonical_subject_id: canonicalSubjectId,
      section: params.section,
      resource_type: params.resourceType,
      title: params.title,
      description: params.description,
      file_url: params.fileUrl,
      content_hash: params.contentHash,
      status: "approved",
      uploaded_by_device: null,
      uploaded_by_name: params.uploadedByName,
      ...(params.customCreatedAt ? { created_at: params.customCreatedAt } : {}),
    });
    if (error) throw safeDbError(error);
    return {
      published: 1,
      skipped: targets
        .filter((t) => t !== primary)
        .map((t) => ({ ...t, reason: "centralized PYQ — one shared row already covers this subject everywhere" })),
    };
  }

  const batchIds = [...new Set(targets.map((t) => t.batchId))];
  const termIds = [...new Set(targets.map((t) => t.termId))];
  const branchIds = [...new Set(targets.map((t) => t.branchId))];

  const { data: batchTermRows, error: batchTermsError } = await supabase
    .from("batch_terms")
    .select("batch_id, term_id, start_date")
    .in("batch_id", batchIds)
    .in("term_id", termIds);
  if (batchTermsError) throw safeDbError(batchTermsError);
  const today = localDateKey(new Date().toISOString());
  const reachedPairs = new Set(
    (batchTermRows ?? [])
      .filter((r) => isDateReached(r.start_date, today))
      .map((r) => `${r.batch_id}|${r.term_id}`)
  );

  const subjectMap = new Map<string, string>();
  if (params.subjectName) {
    const { data: subjectRows, error: subjectsError } = await supabase
      .from("subjects")
      .select("id, branch_id, specialization_id, term_id, name")
      .in("branch_id", branchIds)
      .in("term_id", termIds);
    if (subjectsError) throw safeDbError(subjectsError);
    for (const s of subjectRows ?? []) {
      subjectMap.set(`${s.branch_id}|${s.specialization_id ?? "null"}|${s.term_id}|${s.name.toLowerCase()}`, s.id);
    }
  }

  // Same idempotent-retry guard as uploadResourceDirectAllBranches's
  // per-target loop, just resolved once for every target at once
  // instead of one query per target.
  const existingDupKeys = new Set<string>();
  if (params.contentHash) {
    const { data: dupRows, error: dupError } = await supabase
      .from("resources")
      .select("branch_id, specialization_id, term_id, batch_id")
      .eq("resource_type", params.resourceType)
      .eq("content_hash", params.contentHash)
      .in("branch_id", branchIds)
      .in("term_id", termIds)
      .in("batch_id", batchIds);
    if (dupError) throw safeDbError(dupError);
    for (const d of dupRows ?? []) {
      existingDupKeys.add(`${d.branch_id}|${d.specialization_id ?? "null"}|${d.term_id}|${d.batch_id}`);
    }
  }

  const rows: Record<string, unknown>[] = [];
  const skipped: (MultiContextTarget & { reason: string })[] = [];

  for (const t of targets) {
    if (isBatchTermHiddenForSpecialization(t.batchId, t.termId, t.specializationId)) {
      skipped.push({ ...t, reason: "not available for this specialization" });
      continue;
    }
    if (!reachedPairs.has(`${t.batchId}|${t.termId}`)) {
      skipped.push({ ...t, reason: "that semester hasn't started yet for that batch" });
      continue;
    }
    const key = `${t.branchId}|${t.specializationId ?? "null"}|${t.termId}|${t.batchId}`;
    if (existingDupKeys.has(key)) {
      skipped.push({ ...t, reason: "already published to this exact context" });
      continue;
    }
    const subjectId = params.subjectName
      ? (subjectMap.get(`${t.branchId}|${t.specializationId ?? "null"}|${t.termId}|${params.subjectName.toLowerCase()}`) ?? null)
      : null;
    rows.push({
      branch_id: t.branchId,
      specialization_id: t.specializationId,
      term_id: t.termId,
      batch_id: t.batchId,
      subject_id: subjectId,
      section: params.section,
      resource_type: params.resourceType,
      title: params.title,
      description: params.description,
      file_url: params.fileUrl,
      content_hash: params.contentHash,
      status: "approved",
      uploaded_by_device: null,
      uploaded_by_name: params.uploadedByName,
      ...(params.customCreatedAt ? { created_at: params.customCreatedAt } : {}),
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("resources").insert(rows);
    if (insertError) throw safeDbError(insertError);
  }

  return { published: rows.length, skipped };
}

/**
 * Admin-only: the actual entry point for a fresh multi-context
 * publish — uploads/verifies/dedupes the file exactly once (same
 * verifyUploadedFileOrCleanUp + resolveDedupedFileUrl as every other
 * upload path), then fans out via publishResourceToContexts above.
 * branchIds/batchIds/yearNumbers/semesterOrdinals/specializationIds
 * all arrive as JSON-stringified arrays; "semesterOrdinals" is 1 or 2,
 * relative to whichever Year(s) it's paired with (1st/2nd semester OF
 * that year — see CRUploadForm's multi-context panel for the exact UI
 * this maps from), not an absolute semester_number, since that's the
 * only interpretation that stays meaningful across more than one Year
 * at once.
 */
export async function uploadResourceDirectMultiContext(formData: FormData): Promise<MultiContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("uploadResourceDirectMultiContext", user.id, 20, 60_000);

  function parseIdArray(field: string, label: string): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse((formData.get(field) as string) || "[]");
    } catch {
      throw new Error(`Invalid ${label} selection.`);
    }
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
      throw new Error(`Invalid ${label} selection.`);
    }
    for (const id of parsed) assertValidId(id, label);
    return parsed;
  }

  const branchIds = parseIdArray("branchIds", "branch");
  const batchIds = parseIdArray("batchIds", "batch");
  const specializationIds = parseIdArray("specializationIds", "specialization");

  let yearNumbers: unknown;
  let semesterOrdinals: unknown;
  try {
    yearNumbers = JSON.parse((formData.get("yearNumbers") as string) || "[]");
    semesterOrdinals = JSON.parse((formData.get("semesterOrdinals") as string) || "[]");
  } catch {
    throw new Error("Invalid year/semester selection.");
  }
  if (
    !Array.isArray(yearNumbers) ||
    !yearNumbers.every((n) => typeof n === "number") ||
    !Array.isArray(semesterOrdinals) ||
    !semesterOrdinals.every((n) => n === 1 || n === 2)
  ) {
    throw new Error("Invalid year/semester selection.");
  }
  if (branchIds.length === 0 || batchIds.length === 0 || yearNumbers.length === 0 || semesterOrdinals.length === 0) {
    throw new Error("Pick at least one Branch, Batch, Year, and Semester.");
  }

  const subjectName = (formData.get("subjectName") as string) || null;
  const canonicalSubjectId = (formData.get("canonicalSubjectId") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const fileUrl = formData.get("fileUrl") as string;
  const customCreatedAt = (formData.get("customCreatedAt") as string) || null;

  assertValidSection(section);
  assertValidResourceType(resourceType);
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  if (customCreatedAt) {
    assertValidString(customCreatedAt, "Date", { maxLength: 40 });
    assertNotFutureTimestamp(customCreatedAt, "Date");
  }

  // Resolve the actual academic_terms rows for the requested Year(s) ×
  // relative Semester(s) — the only place this ordinal math happens,
  // since academic_terms itself only stores an absolute semester_number
  // (Year 2 is semester_number 3/4, not 1/2).
  const { data: termRows, error: termsError } = await supabase
    .from("academic_terms")
    .select("id, year_number, semester_number")
    .in("year_number", yearNumbers);
  if (termsError) throw safeDbError(termsError);
  const termIds = (termRows ?? [])
    .filter((t) => semesterOrdinals.includes((((t.semester_number - 1) % 2) + 1) as 1 | 2))
    .map((t) => t.id);
  if (termIds.length === 0) {
    throw new Error("No semesters match the selected Year(s)/Semester(s).");
  }

  const { data: branchRows, error: branchesError } = await supabase
    .from("branches")
    .select("id, has_specializations")
    .in("id", branchIds);
  if (branchesError) throw safeDbError(branchesError);

  const { data: specializationRows, error: specializationsError } = await supabase
    .from("specializations")
    .select("id, branch_id")
    .in("id", specializationIds);
  if (specializationsError) throw safeDbError(specializationsError);
  const specializationsByBranch = new Map<string, string[]>();
  for (const s of specializationRows ?? []) {
    const list = specializationsByBranch.get(s.branch_id) ?? [];
    list.push(s.id);
    specializationsByBranch.set(s.branch_id, list);
  }

  await assertBatchTermReached(supabase, batchIds[0], termIds[0], null).catch(() => {
    // Deliberately swallowed — this single-pair check exists elsewhere
    // only to fail fast on an obviously-wrong single selection; with a
    // full cross-product, per-target validity is what actually decides
    // what publishes (see publishResourceToContexts), not this.
  });

  const targets: MultiContextTarget[] = [];
  const preSkipped: (MultiContextTarget & { reason: string })[] = [];
  for (const branch of branchRows ?? []) {
    if (branch.has_specializations) {
      const specsForBranch = (specializationsByBranch.get(branch.id) ?? []).filter((id) =>
        specializationIds.includes(id)
      );
      if (specsForBranch.length === 0) {
        for (const termId of termIds) {
          for (const batchId of batchIds) {
            preSkipped.push({ branchId: branch.id, specializationId: null, termId, batchId, reason: "no specialization selected for this branch" });
          }
        }
        continue;
      }
      for (const specializationId of specsForBranch) {
        for (const termId of termIds) {
          for (const batchId of batchIds) {
            targets.push({ branchId: branch.id, specializationId, termId, batchId });
          }
        }
      }
    } else {
      for (const termId of termIds) {
        for (const batchId of batchIds) {
          targets.push({ branchId: branch.id, specializationId: null, termId, batchId });
        }
      }
    }
  }

  const verification = await verifyUploadedFileOrCleanUp(fileUrl);
  if (!verification.valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }
  const dedupedFileUrl = await resolveDedupedFileUrl(supabase, fileUrl, verification.contentHash);

  const result = await publishResourceToContexts(supabase, {
    fileUrl: dedupedFileUrl,
    contentHash: verification.contentHash,
    section,
    resourceType,
    title,
    description,
    subjectName,
    canonicalSubjectId,
    customCreatedAt,
    uploadedByName: role.displayName,
    targets,
  });
  result.skipped = [...preSkipped, ...result.skipped];

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
  revalidatePath("/cr/manage");
  return result;
}

/**
 * Admin-only: adds MORE context rows to an ALREADY-PUBLISHED resource
 * — the Edit-dialog half of multi-context (see Manage's
 * EditResourceButton). Never re-uploads, never re-verifies, never
 * re-hashes: the file identity (file_url/content_hash) is read
 * straight off the existing row and reused as-is for every new row,
 * exactly like every other already-shared-file case in this codebase.
 * The resource's own existing row is never touched by this — adding
 * contexts is purely additive, same guarantee as Part A's dedup.
 */
export async function addResourceContexts(
  resourceId: string,
  targets: MultiContextTarget[],
  subjectName: string | null
): Promise<MultiContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("addResourceContexts", user.id, 30, 60_000);

  assertValidId(resourceId, "resource");
  if (!Array.isArray(targets) || targets.length === 0) throw new Error("Pick at least one context to add.");
  for (const t of targets) {
    assertValidId(t.branchId, "branch");
    assertValidIdOrNull(t.specializationId, "specialization");
    assertValidId(t.termId, "year");
    assertValidId(t.batchId, "batch");
  }

  const { data: source, error: sourceError } = await supabase
    .from("resources")
    .select("file_url, content_hash, section, resource_type, title, description, canonical_subject_id, created_at")
    .eq("id", resourceId)
    .single();
  if (sourceError) throw safeDbError(sourceError);

  const result = await publishResourceToContexts(supabase, {
    fileUrl: source.file_url,
    contentHash: source.content_hash,
    section: source.section,
    resourceType: source.resource_type,
    title: source.title,
    description: source.description,
    subjectName,
    canonicalSubjectId: source.canonical_subject_id,
    customCreatedAt: source.created_at,
    uploadedByName: role.displayName,
    targets,
  });

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
  revalidatePath("/cr/manage");
  return result;
}

/**
 * Admin-only, batched bulk-edit for Manage's multi-select — ONE
 * UPDATE ... WHERE id = ANY(...) instead of firing updateResourceFields
 * once per selected row (the explicit optimization asked for). Scoped
 * to fields that are safe to set identically across rows from
 * DIFFERENT academic contexts: Title, Description, Date. Deliberately
 * excludes Subject/Branch/Term/Batch — those are tied to one specific
 * context each (a subject_id from a CSE row is meaningless force-set
 * onto a Mechanical row), so bulk-setting them the same way across a
 * heterogeneous selection would silently corrupt data rather than
 * "batch edit" it. Per-row updateResourceFields (unchanged) remains
 * the only way to retarget an individual resource's context.
 */
export async function bulkUpdateResourceFields(
  resourceIds: string[],
  fields: { title?: string; description?: string | null; dateKey?: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("bulkUpdateResourceFields", user.id, 30, 60_000);

  if (!Array.isArray(resourceIds) || resourceIds.length === 0) throw new Error("Nothing selected.");
  for (const id of resourceIds) assertValidId(id, "resource");

  if (fields.title !== undefined) assertValidString(fields.title, "Title", { maxLength: MAX_TITLE_LENGTH });
  if (fields.description !== undefined) {
    assertValidString(fields.description ?? "", "Description", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  }
  if (fields.dateKey !== undefined) assertValidDateKey(fields.dateKey, "date");

  const update: Record<string, string | null> = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.description !== undefined) update.description = fields.description;

  if (Object.keys(update).length === 0 && fields.dateKey === undefined) {
    throw new Error("Nothing to update.");
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("resources").update(update).in("id", resourceIds);
    if (error) throw safeDbError(error);
  }

  // Date needs each row's own existing created_at time-of-day preserved
  // (same withDateKey helper every other date edit already uses) — a
  // single UPDATE can't vary the time component per row from one
  // literal value, so this one field alone still needs to read
  // existing rows first, but it's still ONE batched select + one
  // Promise.all of per-row updates, not N sequential round trips like
  // a naive per-row updateResourceFields loop would be.
  if (fields.dateKey !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from("resources")
      .select("id, created_at")
      .in("id", resourceIds);
    if (fetchError) throw safeDbError(fetchError);
    await Promise.all(
      (existing ?? []).map((row) =>
        supabase
          .from("resources")
          .update({ created_at: withDateKey(row.created_at, fields.dateKey!) })
          .eq("id", row.id)
      )
    );
  }

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
  revalidatePath("/cr/manage");
}
