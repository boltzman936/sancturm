"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import {
  assertValidId,
  assertValidString,
  assertValidDateKey,
  safeDbError,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/validation";

/**
 * Admin-only, full stop — RLS ("Admin only manages", supabase/
 * sancturm_updates_v2.sql) rejects the insert outright for anyone else,
 * CR included. This function doesn't need its own role check.
 */
export async function createSancturmUpdate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("createSancturmUpdate", user.id, 30, 60_000);

  const title = formData.get("title") as string;
  // Uploaded straight to R2 from the browser already — see resources/
  // actions.ts's uploadResourceDirect for the full reasoning.
  const fileUrl = formData.get("fileUrl") as string;

  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });

  if (!(await verifyUploadedFileOrCleanUp(fileUrl))) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const { error: insertError } = await supabase.from("sancturm_updates").insert({
    title,
    pdf_url: fileUrl,
  });
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/sancturm-updates");
}

/** The "custom creation tool" path — typed text, no PDF. */
export async function createCustomSancturmUpdate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("createCustomSancturmUpdate", user.id, 30, 60_000);

  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  assertValidString(title, "Title", { maxLength: MAX_TITLE_LENGTH });
  assertValidString(body ?? "", "Body", { maxLength: MAX_DESCRIPTION_LENGTH, required: false });

  const { error: insertError } = await supabase.from("sancturm_updates").insert({
    title,
    body,
    pdf_url: null,
  });
  if (insertError) throw safeDbError(insertError);

  revalidatePath("/sancturm-updates");
}

export async function deleteSancturmUpdate(updateId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("deleteSancturmUpdate", user.id, 30, 60_000);
  assertValidId(updateId, "update");

  const { data, error } = await supabase
    .from("sancturm_updates")
    .delete()
    .eq("id", updateId)
    .select("pdf_url")
    .single();
  if (error) throw safeDbError(error);

  try {
    await deleteFromR2(data?.pdf_url);
  } catch {
    // Best-effort — see deleteResource's identical comment.
  }

  revalidatePath("/sancturm-updates");
}

/**
 * Retroactively changes an already-published update's date from the
 * Manage list — admin-only, same as everything else on this table
 * (RLS alone already covers it, see toggleSancturmUpdatePin below).
 */
export async function updateSancturmUpdateDate(updateId: string, dateKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("updateSancturmUpdateDate", user.id, 60, 60_000);
  assertValidId(updateId, "update");
  assertValidDateKey(dateKey, "date");

  const { data: existing, error: fetchError } = await supabase
    .from("sancturm_updates")
    .select("created_at")
    .eq("id", updateId)
    .single();
  if (fetchError) throw safeDbError(fetchError);

  const { error: updateError } = await supabase
    .from("sancturm_updates")
    .update({ created_at: withDateKey(existing.created_at, dateKey) })
    .eq("id", updateId);
  if (updateError) throw safeDbError(updateError);

  revalidatePath("/sancturm-updates");
  revalidatePath("/cr/manage");
}

/** Pin/unpin — admin-only, same as everything else on this table. */
export async function toggleSancturmUpdatePin(updateId: string, pinned: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  await checkRateLimit("toggleSancturmUpdatePin", user.id, 60, 60_000);
  assertValidId(updateId, "update");
  if (typeof pinned !== "boolean") throw new Error("Invalid pin value.");

  const { error } = await supabase.from("sancturm_updates").update({ is_pinned: pinned }).eq("id", updateId);
  if (error) throw safeDbError(error);
  revalidatePath("/sancturm-updates");
}
