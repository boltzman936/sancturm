"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteFromR2 } from "@/lib/r2";

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

/** Pin/unpin — same RLS-enforced "CR or admin manages" policy as everything else on notices. */
export async function toggleNoticePin(noticeId: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("notices").update({ is_pinned: pinned }).eq("id", noticeId);
  if (error) throw error;
  revalidatePath("/notices");
  revalidatePath("/cr/manage");
}
