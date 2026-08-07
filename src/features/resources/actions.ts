"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";

/**
 * Approve/reject a pending resource. No manual branch check here —
 * that's the whole point of doing this as the CR's own authenticated
 * session: Postgres RLS's "CR updates own branch" policy (see
 * supabase/migrations/0001_init.sql) rejects the update outright if
 * this resource's branch_id isn't the caller's own. The database is
 * the actual security boundary, not this function.
 */
export async function approveResource(resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ status: "approved" })
    .eq("id", resourceId);
  if (error) throw error;
  revalidatePath("/cr/approvals");
  revalidatePath("/cr");
}

export async function rejectResource(resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ status: "rejected" })
    .eq("id", resourceId);
  if (error) throw error;
  revalidatePath("/cr/approvals");
  revalidatePath("/cr");
}

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
 * There's no INSERT policy that allows inserting straight in as
 * 'approved' (the only insert policy is "Anyone can submit for
 * review", which requires status = 'pending' for literally everyone,
 * CR or not — see supabase/migrations/0001_init.sql). So this does it
 * as two RLS-legal steps instead of one: insert as pending (always
 * allowed), then immediately update to approved, which only succeeds
 * because "CR or admin updates" (supabase/add_admins.sql) permits it
 * for this caller's branch. Anyone else's attempt at the second step
 * would be rejected by Postgres, not by this function.
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
  const { error: uploadError } = await supabase.storage.from("resources").upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("resources").getPublicUrl(filePath);

  const { data: inserted, error: insertError } = await supabase
    .from("resources")
    .insert({
      branch_id: branchId,
      subject_id: subjectId,
      section,
      resource_type: resourceType,
      title,
      description,
      file_url: publicUrlData.publicUrl,
      status: "pending",
      uploaded_by_device: null,
      uploaded_by_name: role?.displayName ?? null,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const { error: approveError } = await supabase
    .from("resources")
    .update({ status: "approved" })
    .eq("id", inserted.id);
  if (approveError) throw approveError;

  revalidatePath("/notes");
  revalidatePath("/cr");
}
