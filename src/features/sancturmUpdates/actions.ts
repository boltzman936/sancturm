"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";

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

  const title = formData.get("title") as string;
  const file = formData.get("file") as File;

  const filePath = `sancturm-updates/${crypto.randomUUID()}-${file.name}`;
  const fileUrl = await uploadToR2(filePath, file);

  const { error: insertError } = await supabase.from("sancturm_updates").insert({
    title,
    pdf_url: fileUrl,
  });
  if (insertError) throw insertError;

  revalidatePath("/sancturm-updates");
}

/** The "custom creation tool" path — typed text, no PDF. */
export async function createCustomSancturmUpdate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const title = formData.get("title") as string;
  const body = formData.get("body") as string;

  const { error: insertError } = await supabase.from("sancturm_updates").insert({
    title,
    body,
    pdf_url: null,
  });
  if (insertError) throw insertError;

  revalidatePath("/sancturm-updates");
}

export async function deleteSancturmUpdate(updateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sancturm_updates").delete().eq("id", updateId);
  if (error) throw error;
  revalidatePath("/sancturm-updates");
}

/** Pin/unpin — admin-only, same as everything else on this table. */
export async function toggleSancturmUpdatePin(updateId: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("sancturm_updates").update({ is_pinned: pinned }).eq("id", updateId);
  if (error) throw error;
  revalidatePath("/sancturm-updates");
}
