"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import { assertBatchTermReached } from "@/features/batches/academicValidation";
import { YEAR_TO_CURRENT_SEMESTER_NUMBER } from "@/features/notices/activeNoticeContexts";
import {
  assertValidId,
  assertValidIdOrNull,
  assertValidIdArray,
  assertValidString,
  assertValidDateKey,
  safeDbError,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/validation";

// Bulk-publish's per-target list is a (branch, specialization) pair,
// not a flat id — a branch with specializations needs one row per
// specialization selected, a branch without needs exactly one row with
// specialization_id null. Validated the same way assertValidIdArray
// bounds a flat array (non-empty, capped, every entry checked).
const MAX_BULK_TARGET_COUNT = 50;
function assertValidTargetArray(
  value: unknown
): asserts value is { branchId: string; specializationId: string | null }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_TARGET_COUNT) {
    throw new Error("Invalid branch selection.");
  }
  for (const target of value) {
    if (typeof target !== "object" || target === null) throw new Error("Invalid branch selection.");
    const t = target as Record<string, unknown>;
    assertValidId(t.branchId, "branch");
    assertValidIdOrNull(t.specializationId, "specialization");
  }
}

/**
 * Resolves the currently-active batch for one term, server-side — same
 * "latest batch_terms row that's already started, falling back to the
 * earliest upcoming one" logic as the client's useCurrentTermsByYear,
 * just inverted (given a term, not a year). Only the admin bulk-
 * publish paths below use this: with several years selectable at
 * once, there's no practical single "pick a batch" control to show,
 * so each selected year resolves its own current batch instead. The
 * single-year paths (createNotice/createCustomNotice) still take an
 * explicit client-supplied batchId (always a CR's own fixed one).
 */
async function resolveCurrentBatchId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termId: string
): Promise<string> {
  const resolved = await resolveCurrentBatchIdsForTerms(supabase, [termId]);
  const batchId = resolved.get(termId);
  if (!batchId) throw new Error("No batch configured for this year yet.");
  return batchId;
}

/**
 * Same resolution as resolveCurrentBatchId, batched across every term
 * at once — the "All Years" bulk-publish paths below used to call the
 * single-term version once per selected year, in a sequential loop
 * (N round trips before the actual insert even started); this is the
 * identical logic over one `.in("term_id", termIds)` query instead.
 */
async function resolveCurrentBatchIdsForTerms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termIds: string[]
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("batch_terms")
    .select("term_id, batch_id, start_date")
    .in("term_id", termIds)
    .order("start_date", { ascending: true });
  if (error) throw safeDbError(error);
  const today = new Date().toISOString().slice(0, 10);
  const byTerm = new Map<string, { batch_id: string; start_date: string }[]>();
  for (const row of data ?? []) {
    const rows = byTerm.get(row.term_id) ?? [];
    rows.push(row);
    byTerm.set(row.term_id, rows);
  }
  const result = new Map<string, string>();
  for (const [termId, rows] of byTerm) {
    const started = rows.filter((row) => row.start_date <= today);
    const chosen = started.length ? started[started.length - 1] : rows[0];
    if (chosen) result.set(termId, chosen.batch_id);
  }
  return result;
}

/**
 * A CR can only ever post a Notice for one of the two Notice contexts
 * that actually exist right now (see activeNoticeContexts.ts) — even
 * though a CR's own termId is already fixed to their own current
 * context by construction (NoticeComposer never lets them pick),
 * "their own current context" and "an active Notice context" can
 * still diverge once their year has moved past semester 1/3 and
 * nobody's updated the map yet, which would otherwise let them
 * publish a notice into a context Notices never actually shows —
 * confusing for a CR ("I posted it, why can't anyone see it?"), not a
 * security issue. Admin is exempt (checked by the caller, not here) —
 * "full Notice upload access... any current Year + Semester + Branch
 * + Specialisation" is the explicit admin exception.
 */
async function assertIsActiveNoticeContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termId: string
) {
  const { data: term, error } = await supabase
    .from("academic_terms")
    .select("year_number, semester_number")
    .eq("id", termId)
    .single();
  if (error) throw safeDbError(error);
  if (YEAR_TO_CURRENT_SEMESTER_NUMBER[term.year_number] !== term.semester_number) {
    throw new Error("Notices can only be posted for the current semester.");
  }
}

/**
 * Only a CR (own branch) or admin (any branch) can ever call this
 * successfully — there's no "anyone can submit" policy on `notices`
 * like there is on `resources`. Postgres RLS (the "CR or admin
 * inserts" policy — see supabase/*.sql for its current definition,
 * it's been redefined a few times as scoping tightened) rejects the
 * insert outright for anyone else; this function doesn't need its own
 * role check to enforce that.
 */
export async function createNotice(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("createNotice", user.id, 30, 60_000);

  const role = await getCurrentRole();

  const branchId = formData.get("branchId") as string;
  const specializationId = (formData.get("specializationId") as string) || null;
  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const title = formData.get("title") as string;
  // Uploaded straight to R2 from the browser already — see resources/
  // actions.ts's uploadResourceDirect for the full reasoning.
  const fileUrl = formData.get("fileUrl") as string;

  assertValidId(branchId, "branch");
  assertValidIdOrNull(specializationId, "specialization");
  assertValidId(termId, "year");
  assertValidId(batchId, "batch");
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });

  // Admin exception — see assertIsActiveNoticeContext's own comment.
  if (role?.type !== "admin") await assertIsActiveNoticeContext(supabase, termId);

  // See resources/actions.ts's uploadResourceDirect for why this
  // exists — confirms the object's actual bytes match its claimed
  // Content-Type before it can be referenced by a published notice.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl)).valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    specialization_id: specializationId,
    term_id: termId,
    batch_id: batchId,
    title,
    pdf_url: fileUrl,
    important_dates: [],
    uploaded_by_name: role?.displayName ?? null,
  });
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/**
 * Admin-only: publishes one notice to any number of branches within
 * one term at once — same reasoning and shape as resources.ts's
 * uploadResourceDirectAllBranches. RLS ("CR or admin inserts") only
 * lets an admin insert outside their own branch scope in the first
 * place, so a non-admin calling this just gets a database rejection
 * either way — the explicit role check here is just a faster, clearer
 * failure.
 */
export async function createNoticeAllBranches(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("createNoticeAllBranches", user.id, 30, 60_000);

  const title = formData.get("title") as string;
  const fileUrl = formData.get("fileUrl") as string;
  // Only reachable at all when the role check above already confirmed
  // admin, so this is safe to read directly — createNotice (the CR
  // path) never reads this field at all, forcing it false for anyone
  // who isn't admin by construction, not by trusting client input.
  const crOnly = (formData.get("crOnly") as string) === "true";
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  let targets: unknown;
  let termIds: unknown;
  try {
    targets = JSON.parse(formData.get("targets") as string);
    termIds = JSON.parse(formData.get("termIds") as string);
  } catch {
    throw new Error("Invalid branch/year selection.");
  }
  assertValidTargetArray(targets);
  assertValidIdArray(termIds, "year");

  // Verified once — the same uploaded object gets referenced by every
  // (term, target) row built below.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl)).valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const batchIdsByTerm = await resolveCurrentBatchIdsForTerms(supabase, termIds);
  const rows = [];
  for (const termId of termIds) {
    const batchId = batchIdsByTerm.get(termId);
    if (!batchId) throw new Error("No batch configured for one of the selected years yet.");
    for (const target of targets) {
      rows.push({
        branch_id: target.branchId,
        specialization_id: target.specializationId,
        term_id: termId,
        batch_id: batchId,
        title,
        pdf_url: fileUrl,
        important_dates: [],
        cr_only: crOnly,
        uploaded_by_name: role.displayName,
      });
    }
  }

  const { error: insertError } = await supabase.from("notices").insert(rows);
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/** The admin-only, multi-branch equivalent of createCustomNotice — see createNoticeAllBranches. */
export async function createCustomNoticeAllBranches(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("createCustomNoticeAllBranches", user.id, 30, 60_000);

  const title = formData.get("title") as string;
  const body = formData.get("body") as string;
  const crOnly = (formData.get("crOnly") as string) === "true";
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(body, "Body", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });
  let targets: unknown;
  let termIds: unknown;
  try {
    targets = JSON.parse(formData.get("targets") as string);
    termIds = JSON.parse(formData.get("termIds") as string);
  } catch {
    throw new Error("Invalid branch/year selection.");
  }
  assertValidTargetArray(targets);
  assertValidIdArray(termIds, "year");

  const batchIdsByTerm = await resolveCurrentBatchIdsForTerms(supabase, termIds);
  const rows = [];
  for (const termId of termIds) {
    const batchId = batchIdsByTerm.get(termId);
    if (!batchId) throw new Error("No batch configured for one of the selected years yet.");
    for (const target of targets) {
      rows.push({
        branch_id: target.branchId,
        specialization_id: target.specializationId,
        term_id: termId,
        batch_id: batchId,
        title,
        body,
        pdf_url: null,
        important_dates: [],
        cr_only: crOnly,
        uploaded_by_name: role.displayName,
      });
    }
  }

  const { error: insertError } = await supabase.from("notices").insert(rows);
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/** The "custom creation tool" path — typed text, no PDF. */
export async function createCustomNotice(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("createCustomNotice", user.id, 30, 60_000);

  const role = await getCurrentRole();

  const branchId = formData.get("branchId") as string;
  const specializationId = (formData.get("specializationId") as string) || null;
  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  assertValidId(branchId, "branch");
  assertValidIdOrNull(specializationId, "specialization");
  assertValidId(termId, "year");
  assertValidId(batchId, "batch");
  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(body, "Body", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });

  // Admin exception — see assertIsActiveNoticeContext's own comment.
  if (role?.type !== "admin") await assertIsActiveNoticeContext(supabase, termId);

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    specialization_id: specializationId,
    term_id: termId,
    batch_id: batchId,
    title,
    body,
    pdf_url: null,
    important_dates: [],
    uploaded_by_name: role?.displayName ?? null,
  });
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

export async function deleteNotice(noticeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("deleteNotice", user.id, 30, 60_000);
  assertValidId(noticeId, "notice");

  const { data, error } = await supabase
    .from("notices")
    .delete()
    .eq("id", noticeId)
    .select("pdf_url")
    .single();
  if (error) throw safeDbError(error);

  try {
    await deleteFromR2(data?.pdf_url);
  } catch {
    // Best-effort — see deleteResource's identical comment.
  }

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/**
 * Admin-only: retroactively changes ANY of an already-published
 * notice's Year/Batch/Branch/Date — same reasoning as resources'
 * updateResourceFields, including the explicit role check (RLS alone
 * would let a CR reach this within their own branch, which isn't the
 * intent here).
 */
export async function updateNoticeFields(
  noticeId: string,
  fields: {
    branchId?: string;
    specializationId?: string | null;
    termId?: string;
    crOnly?: boolean;
    dateKey?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  await checkRateLimit("updateNoticeFields", user.id, 60, 60_000);

  assertValidId(noticeId, "notice");
  if (fields.branchId !== undefined) assertValidId(fields.branchId, "branch");
  if (fields.specializationId !== undefined) assertValidIdOrNull(fields.specializationId, "specialization");
  if (fields.termId !== undefined) assertValidId(fields.termId, "year");
  if (fields.crOnly !== undefined && typeof fields.crOnly !== "boolean") {
    throw new Error("Invalid CR-only value.");
  }
  if (fields.dateKey !== undefined) assertValidDateKey(fields.dateKey, "date");

  // No client-supplied batchId anymore — a notice's Batch has no UI
  // anywhere (see notices/page.tsx and NoticeComposer's own comments);
  // moving a notice to a new term resolves batch_id the same way
  // createNoticeAllBranches already does, server-side, via
  // resolveCurrentBatchId, instead of trusting a picked value.
  let resolvedBatchId: string | undefined;
  if (fields.termId !== undefined) {
    resolvedBatchId = await resolveCurrentBatchId(supabase, fields.termId);
    await assertBatchTermReached(supabase, resolvedBatchId, fields.termId, fields.specializationId ?? null);
  }

  const update: Record<string, string | boolean | null> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.specializationId !== undefined) update.specialization_id = fields.specializationId;
  if (fields.termId !== undefined) update.term_id = fields.termId;
  if (resolvedBatchId !== undefined) update.batch_id = resolvedBatchId;
  if (fields.crOnly !== undefined) update.cr_only = fields.crOnly;

  if (fields.dateKey !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from("notices")
      .select("created_at")
      .eq("id", noticeId)
      .single();
    if (fetchError) throw safeDbError(fetchError);
    update.created_at = withDateKey(existing.created_at, fields.dateKey);
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase.from("notices").update(update).eq("id", noticeId);
    if (updateError) throw safeDbError(updateError);
  }

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/** Pin/unpin — same RLS-enforced "CR or admin updates" policy as any other edit to a notice. */
export async function toggleNoticePin(noticeId: string, pinned: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("toggleNoticePin", user.id, 60, 60_000);
  assertValidId(noticeId, "notice");
  if (typeof pinned !== "boolean") throw new Error("Invalid pin value.");

  const { error } = await supabase.from("notices").update({ is_pinned: pinned }).eq("id", noticeId);
  if (error) throw safeDbError(error);
  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}
