"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";

/**
 * Takes down an already-published resource — same RLS-enforced
 * "CR or admin deletes" policy as everything else here. Only removes
 * the database row; the underlying file stays in Storage (harmless,
 * just an orphaned object — not worth the extra round trip to also
 * delete it from Storage for this).
 */
export async function deleteResource(resourceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .select("file_url")
    .single();
  if (error) throw error;

  // Best-effort: the row is already gone (the outcome that actually
  // matters to whoever clicked delete), so a storage hiccup here
  // shouldn't surface as a failed delete.
  try {
    await deleteFromR2(data?.file_url);
  } catch {
    // Orphaned object in R2 — same as before this fix existed, not a
    // new failure mode, so nothing more to do here.
  }

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
  const termId = formData.get("termId") as string;
  const subjectId = (formData.get("subjectId") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  // Uploaded straight to R2 from the browser already (see
  // features/uploads/uploadFile.ts) — this only ever receives the
  // resulting URL, never the file itself, so there's no serverless
  // body-size limit to hit regardless of how large the PDF is.
  const fileUrl = formData.get("fileUrl") as string;

  const { error: insertError } = await supabase.from("resources").insert({
    branch_id: branchId,
    term_id: termId,
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

/**
 * Admin-only: publishes one Notes/Lab resource to every branch WITHIN
 * ONE TERM in a single action, instead of repeating the upload per
 * branch — a 1st-Year note has nothing to do with 2nd-Year branches,
 * so this deliberately doesn't cross terms (confirmed behavior, not
 * "all 6 branch/term combos"). Uploads the file to R2 once, then
 * inserts one `resources` row per branch — each branch has its own
 * `subjects` rows with different UUIDs even for identically-named
 * subjects, so the subject is resolved by NAME within each branch
 * rather than reusing one subject_id everywhere (same cross-branch-
 * name-matching approach already used for PYQ). RLS only lets an
 * admin insert outside their own branch scope at all (see supabase/
 * restrict_uploads_to_cr.sql), so a non-admin calling this just gets
 * a database rejection either way — the explicit role check here is
 * just a faster, clearer failure.
 */
export async function uploadResourceDirectAllBranches(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");

  const termId = formData.get("termId") as string;
  const subjectName = (formData.get("subjectName") as string) || null;
  const section = formData.get("section") as string;
  const resourceType = formData.get("resourceType") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const fileUrl = formData.get("fileUrl") as string;

  const { data: branches, error: branchesError } = await supabase.from("branches").select("id");
  if (branchesError) throw branchesError;
  if (!branches?.length) throw new Error("No branches found.");

  for (const branch of branches) {
    let subjectId: string | null = null;
    if (subjectName) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("branch_id", branch.id)
        .eq("term_id", termId)
        .eq("name", subjectName)
        .maybeSingle();
      subjectId = subject?.id ?? null;
    }

    const { error: insertError } = await supabase.from("resources").insert({
      branch_id: branch.id,
      term_id: termId,
      subject_id: subjectId,
      section,
      resource_type: resourceType,
      title,
      description,
      file_url: fileUrl,
      status: "approved",
      uploaded_by_device: null,
      uploaded_by_name: role.displayName,
    });
    if (insertError) throw insertError;
  }

  revalidatePath("/notes");
  revalidatePath("/pyqs");
  revalidatePath("/cr");
}
