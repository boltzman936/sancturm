"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";

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
  if (error) throw error;
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

  const branchId = formData.get("branchId") as string;
  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const title = formData.get("title") as string;
  // Uploaded straight to R2 from the browser already — see resources/
  // actions.ts's uploadResourceDirect for the full reasoning.
  const fileUrl = formData.get("fileUrl") as string;

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    term_id: termId,
    batch_id: batchId,
    title,
    pdf_url: fileUrl,
    important_dates: [],
  });
  if (insertError) throw insertError;

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

  const title = formData.get("title") as string;
  const fileUrl = formData.get("fileUrl") as string;
  const branchIds = JSON.parse(formData.get("branchIds") as string) as string[];
  if (!Array.isArray(branchIds) || !branchIds.every((id) => typeof id === "string") || !branchIds.length) {
    throw new Error("Invalid branch selection.");
  }
  const termIds = JSON.parse(formData.get("termIds") as string) as string[];
  if (!Array.isArray(termIds) || !termIds.every((id) => typeof id === "string") || !termIds.length) {
    throw new Error("Invalid year selection.");
  }

  const rows = [];
  for (const termId of termIds) {
    const batchId = await resolveCurrentBatchId(supabase, termId);
    for (const branchId of branchIds) {
      rows.push({
        branch_id: branchId,
        term_id: termId,
        batch_id: batchId,
        title,
        pdf_url: fileUrl,
        important_dates: [],
      });
    }
  }

  const { error: insertError } = await supabase.from("notices").insert(rows);
  if (insertError) throw insertError;

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

  const title = formData.get("title") as string;
  const body = formData.get("body") as string;
  const branchIds = JSON.parse(formData.get("branchIds") as string) as string[];
  if (!Array.isArray(branchIds) || !branchIds.every((id) => typeof id === "string") || !branchIds.length) {
    throw new Error("Invalid branch selection.");
  }
  const termIds = JSON.parse(formData.get("termIds") as string) as string[];
  if (!Array.isArray(termIds) || !termIds.every((id) => typeof id === "string") || !termIds.length) {
    throw new Error("Invalid year selection.");
  }

  const rows = [];
  for (const termId of termIds) {
    const batchId = await resolveCurrentBatchId(supabase, termId);
    for (const branchId of branchIds) {
      rows.push({
        branch_id: branchId,
        term_id: termId,
        batch_id: batchId,
        title,
        body,
        pdf_url: null,
        important_dates: [],
      });
    }
  }

  const { error: insertError } = await supabase.from("notices").insert(rows);
  if (insertError) throw insertError;

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

  const branchId = formData.get("branchId") as string;
  const termId = formData.get("termId") as string;
  const batchId = formData.get("batchId") as string;
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    term_id: termId,
    batch_id: batchId,
    title,
    body,
    pdf_url: null,
    important_dates: [],
  });
  if (insertError) throw insertError;

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

export async function deleteNotice(noticeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .delete()
    .eq("id", noticeId)
    .select("pdf_url")
    .single();
  if (error) throw error;

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
  fields: { branchId?: string; termId?: string; batchId?: string; dateKey?: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");

  const update: Record<string, string> = {};
  if (fields.branchId !== undefined) update.branch_id = fields.branchId;
  if (fields.termId !== undefined) update.term_id = fields.termId;
  if (fields.batchId !== undefined) update.batch_id = fields.batchId;

  if (fields.dateKey !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from("notices")
      .select("created_at")
      .eq("id", noticeId)
      .single();
    if (fetchError) throw fetchError;
    update.created_at = withDateKey(existing.created_at, fields.dateKey);
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase.from("notices").update(update).eq("id", noticeId);
    if (updateError) throw updateError;
  }

  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}

/** Pin/unpin — same RLS-enforced "CR or admin manages" policy as everything else on notices. */
export async function toggleNoticePin(noticeId: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("notices").update({ is_pinned: pinned }).eq("id", noticeId);
  if (error) throw error;
  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}
