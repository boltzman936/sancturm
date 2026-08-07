"use server";

import { createClient } from "@/lib/supabase/server";
import { getPresignedUploadUrl, r2PublicUrl } from "@/lib/r2";

/**
 * Mints a short-lived URL the browser can PUT a file to directly,
 * bypassing Vercel's serverless request-body limit that made large
 * PDFs fail silently before (see r2.ts's getPresignedUploadUrl for
 * the full story). Shared by every upload flow — resources, notices,
 * sancturm updates — since minting a signed URL is identical work
 * regardless of what the file is for.
 *
 * Just requires being signed in — this alone can't publish anything.
 * The actual RLS-gated insert (what makes an upload actually show up
 * anywhere) still happens in each feature's own Server Action after
 * the browser finishes the PUT.
 */
export async function getUploadUrl(path: string, contentType: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const uploadUrl = await getPresignedUploadUrl(path, contentType);
  return { uploadUrl, publicUrl: r2PublicUrl(path) };
}
