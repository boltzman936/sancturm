"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { withDateKey } from "@/lib/date";

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
  const title = formData.get("title") as string;
  // Uploaded straight to R2 from the browser already — see resources/
  // actions.ts's uploadResourceDirect for the full reasoning.
  const fileUrl = formData.get("fileUrl") as string;

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    term_id: termId,
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

  const termId = formData.get("termId") as string;
  const title = formData.get("title") as string;
  const fileUrl = formData.get("fileUrl") as string;
  const branchIds = JSON.parse(formData.get("branchIds") as string) as string[];
  if (!Array.isArray(branchIds) || !branchIds.every((id) => typeof id === "string") || !branchIds.length) {
    throw new Error("Invalid branch selection.");
  }

  const { error: insertError } = await supabase.from("notices").insert(
    branchIds.map((branchId) => ({
      branch_id: branchId,
      term_id: termId,
      title,
      pdf_url: fileUrl,
      important_dates: [],
    }))
  );
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

  const termId = formData.get("termId") as string;
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;
  const branchIds = JSON.parse(formData.get("branchIds") as string) as string[];
  if (!Array.isArray(branchIds) || !branchIds.every((id) => typeof id === "string") || !branchIds.length) {
    throw new Error("Invalid branch selection.");
  }

  const { error: insertError } = await supabase.from("notices").insert(
    branchIds.map((branchId) => ({
      branch_id: branchId,
      term_id: termId,
      title,
      body,
      pdf_url: null,
      important_dates: [],
    }))
  );
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
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    term_id: termId,
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
 * Admin-only: retroactively changes an already-published notice's date
 * from the Manage list — same reasoning as resources' updateResourceDate,
 * including the explicit role check (RLS alone would let a CR reach
 * this within their own branch, which isn't the intent here).
 */
export async function updateNoticeDate(noticeId: string, dateKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");

  const { data: existing, error: fetchError } = await supabase
    .from("notices")
    .select("created_at")
    .eq("id", noticeId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("notices")
    .update({ created_at: withDateKey(existing.created_at, dateKey) })
    .eq("id", noticeId);
  if (updateError) throw updateError;

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
