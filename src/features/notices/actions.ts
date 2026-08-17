"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import { assertBatchTermReached } from "@/features/batches/academicValidation";
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
  const { data, error } = await supabase
    .from("batch_terms")
    .select("batch_id, start_date")
    .eq("term_id", termId)
    .order("start_date", { ascending: true });
  if (error) throw safeDbError(error);
  const today = new Date().toISOString().slice(0, 10);
  const started = (data ?? []).filter((row) => row.start_date <= today);
  const chosen = started.length ? started[started.length - 1] : data?.[0];
  if (!chosen) throw new Error("No batch configured for this year yet.");
  return chosen.batch_id;
}

/**
 * Only a CR (own branch) or admin (any branch) can ever call this
 * successfully — there's no "anyone can submit" policy on `notices`
 * like there is on `resources`. Postgres RLS ("CR or admin manages",
 * supabase/add_admins.sql) rejects the insert outright for anyone else;
 * this function doesn't need its own role check to enforce that.
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

  // See resources/actions.ts's uploadResourceDirect for why this
  // exists — confirms the object's actual bytes match its claimed
  // Content-Type before it can be referenced by a published notice.
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
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
 * uploadResourceDirectAllBranches. RLS ("CR or admin manages") only
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
  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const rows = [];
  for (const termId of termIds) {
    const batchId = await resolveCurrentBatchId(supabase, termId);
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

  const rows = [];
  for (const termId of termIds) {
    const batchId = await resolveCurrentBatchId(supabase, termId);
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
    batchId?: string;
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
  if (fields.batchId !== undefined) assertValidId(fields.batchId, "batch");
  if (fields.crOnly !== undefined && typeof fields.crOnly !== "boolean") {
    throw new Error("Invalid CR-only value.");
  }
  if (fields.dateKey !== undefined) assertValidDateKey(fields.dateKey, "date");

  // Same reasoning as updateResourceFields' identical check — Edit
  // lets an admin retarget a notice to ANY branch/term/batch, and
  // nothing before this point already ruled out an unreached pairing.
  if (fields.termId !== undefined && fields.batchId !== undefined) {
    // Same fields.specializationId ?? null reasoning as
    // updateResourceFields' identical check.
    await assertBatchTermReached(supabase, fields.batchId, fields.termId, fields.specializationId ?? null);
  }

  const update: Record<string, string | boolean | null> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.specializationId !== undefined) update.specialization_id = fields.specializationId;
  if (fields.termId !== undefined) update.term_id = fields.termId;
  if (fields.batchId !== undefined) update.batch_id = fields.batchId;
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

/** Pin/unpin — same RLS-enforced "CR or admin manages" policy as everything else on notices. */
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
