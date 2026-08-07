"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const title = formData.get("title") as string;
  const file = formData.get("file") as File;

  const filePath = `notices/${branchId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("resources").upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("resources").getPublicUrl(filePath);

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
    title,
    pdf_url: publicUrlData.publicUrl,
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
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  const { error: insertError } = await supabase.from("notices").insert({
    branch_id: branchId,
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
  const { error } = await supabase.from("notices").delete().eq("id", noticeId);
  if (error) throw error;
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
