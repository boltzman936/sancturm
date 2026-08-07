"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { uploadToR2 } from "@/lib/r2";

/**
 * Takes down an already-published resource — same RLS-enforced
 * "CR or admin deletes" policy as everything else here. Only removes
 * the database row; the underlying file stays in Storage (harmless,
 * just an orphaned object — not worth the extra round trip to also
 * delete it from Storage for this).
 */
export async function deleteResource(resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("resources").delete().eq("id", resourceId);
  if (error) throw error;
  revalidatePath("/cr/manage");
  revalidatePath("/notes");
  revalidatePath("/cr");
}

/**
 * Pin/unpin — same RLS-enforced "CR or admin updates" policy as any
 * other resource edit, so a CR can only pin within their own scope
 * (own branch notes_lab, any-branch pyq) and admin can pin anything.
 */
export async function toggleResourcePin(resourceId: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("resources").update({ is_pinned: pinned }).eq("id", resourceId);
  if (error) throw error;
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

  const role = await getCurrentRole();

  const branchId = formData.get("branchId") as string;
  const subjectId = (formData.get("subjectId") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const file = formData.get("file") as File;

  const filePath = `${branchId}/${section}/${crypto.randomUUID()}-${file.name}`;
  const fileUrl = await uploadToR2(filePath, file);

  const { error: insertError } = await supabase.from("resources").insert({
    branch_id: branchId,
    subject_id: subjectId,
    section,
    resource_type: resourceType,
    title,
    description,
    file_url: fileUrl,
    status: "approved",
    uploaded_by_device: null,
    uploaded_by_name: role?.displayName ?? null,
  });
  if (insertError) throw insertError;

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}
