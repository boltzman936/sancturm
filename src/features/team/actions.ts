"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { deleteFromR2 } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyUploadedFileOrCleanUp } from "@/lib/uploadVerification";
import { assertValidId, safeDbError } from "@/lib/validation";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  return { supabase, user };
}

/**
 * Admin-only: associates an already-uploaded R2 object with one CR's
 * profile, replacing whatever card that CR had before. Server-side
 * authorization is two independent layers, not one: requireAdmin()
 * above, AND cr_profiles' own "Admin only updates" RLS policy (see
 * supabase/add_cr_cards.sql) — a non-admin session's UPDATE would be
 * rejected by Postgres itself even if this check were ever bypassed.
 *
 * Associates by cr_profiles.id (passed from the searchable picker in
 * CrCardUploadForm, sourced from useCrProfilesForAdmin — never a free-
 * text name), matching how every other "attach this upload to that
 * row" action in this codebase works.
 */
export async function uploadCrCard(crProfileId: string, fileUrl: string) {
  const { supabase, user } = await requireAdmin();
  await checkRateLimit("uploadCrCard", user.id, 20, 60_000);
  assertValidId(crProfileId, "CR");

  const verification = await verifyUploadedFileOrCleanUp(fileUrl);
  if (!verification.valid) {
    throw new Error("Uploaded file is invalid or too large. The file was rejected.");
  }

  const { data: previous, error: readError } = await supabase
    .from("cr_profiles")
    .select("card_file_url")
    .eq("id", crProfileId)
    .maybeSingle();
  if (readError) throw safeDbError(readError);
  if (!previous) throw new Error("CR not found.");
  const previousCardUrl = previous.card_file_url as string | null;

  const { error: updateError } = await supabase
    .from("cr_profiles")
    .update({
      card_file_url: fileUrl,
      card_content_hash: verification.contentHash,
      card_uploaded_at: new Date().toISOString(),
    })
    .eq("id", crProfileId);
  if (updateError) throw safeDbError(updateError);

  // Best-effort, same accepted tradeoff as deleteResource's identical
  // check — only delete the OLD object once nothing else still points
  // at it (a fresh upload always gets its own R2 key, so this rarely
  // fires, but a hand-crafted duplicate re-association is possible).
  if (previousCardUrl && previousCardUrl !== fileUrl) {
    try {
      const { count } = await supabase
        .from("cr_profiles")
        .select("id", { count: "exact", head: true })
        .eq("card_file_url", previousCardUrl);
      if (!count) await deleteFromR2(previousCardUrl);
    } catch {
      // Orphaned object in R2 — same non-fatal cleanup miss every other
      // delete path in this app already accepts.
    }
  }

  revalidatePath("/ownership");
  revalidatePath("/cr/upload");
}

/** Admin-only: clears a CR's card without uploading a replacement. */
export async function removeCrCard(crProfileId: string) {
  const { supabase, user } = await requireAdmin();
  await checkRateLimit("removeCrCard", user.id, 20, 60_000);
  assertValidId(crProfileId, "CR");

  const { data: previous, error: readError } = await supabase
    .from("cr_profiles")
    .select("card_file_url")
    .eq("id", crProfileId)
    .maybeSingle();
  if (readError) throw safeDbError(readError);
  if (!previous) throw new Error("CR not found.");
  const previousCardUrl = previous.card_file_url as string | null;

  const { error: updateError } = await supabase
    .from("cr_profiles")
    .update({ card_file_url: null, card_content_hash: null, card_uploaded_at: null })
    .eq("id", crProfileId);
  if (updateError) throw safeDbError(updateError);

  if (previousCardUrl) {
    try {
      const { count } = await supabase
        .from("cr_profiles")
        .select("id", { count: "exact", head: true })
        .eq("card_file_url", previousCardUrl);
      if (!count) await deleteFromR2(previousCardUrl);
    } catch {
      // Same non-fatal cleanup miss as above.
    }
  }

  revalidatePath("/ownership");
  revalidatePath("/cr/upload");
}
