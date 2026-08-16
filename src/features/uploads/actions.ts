"use server";

import { createClient } from "@/lib/supabase/server";
import { getPresignedUploadUrl, r2PublicUrl } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rateLimit";

// Every legitimate caller (CRUploadForm, NoticeComposer, UpdateComposer)
// builds a path as `<known-prefix>/<uuid>-<original filename>` — and a
// real filename routinely has spaces, parentheses, an ampersand, emoji,
// non-Latin characters. An allowlist narrow enough to exclude all of
// that (the first version of this check did) rejects completely
// ordinary uploads — "Complete physics notes.pdf" fails a charset that
// only permits [a-zA-Z0-9_-./]. The actual threat here is path
// traversal and control characters, not spaces, so check for those
// specifically instead of allowlisting a charset. Server Actions are
// just POST endpoints under the hood — callable directly with any
// payload, bypassing the file picker and every client-side assumption
// about what `path` looks like — so this can't rely on the browser
// having gone through the UI first.
function isSafeUploadPath(path: string): boolean {
  if (!path || path.length > 500) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  // Null bytes and other control characters — no legitimate filename
  // needs them, and some storage/CDN layers mishandle them.
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  return true;
}

// application/pdf and the handful of image types the resource viewer
// actually knows how to render inline (see ResourceViewerDialog's
// isImageUrl). Deliberately excludes image/svg+xml — an SVG can carry
// an embedded <script>, making "image upload" a text/html-equivalent
// XSS vector if this ever accepted it — and anything else (text/html,
// application/javascript, ...) that has no legitimate reason to be
// stored here at all.
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Mints a short-lived URL the browser can PUT a file to directly,
 * bypassing Vercel's serverless request-body limit that made large
 * PDFs fail silently before (see r2.ts's getPresignedUploadUrl for
 * the full story). Shared by every upload flow — resources, notices,
 * sancturm updates — since minting a signed URL is identical work
 * regardless of what the file is for.
 *
 * Requires being signed in, plus — this is the part that actually
 * matters — a path/content-type that matches what a real upload looks
 * like. Without this, "signed in" was the entire check: any CR account
 * could mint a presigned PUT for literally any key in the bucket with
 * literally any Content-Type (including text/html), then point a
 * resource's file_url at it — turning "CR uploads a note" into stored
 * XSS for every student who opens it (see ResourceViewerDialog's
 * iframe). The actual RLS-gated insert (what makes an upload show up
 * anywhere) still happens in each feature's own Server Action after
 * the browser finishes the PUT — this only controls what can land in
 * the bucket in the first place.
 */
export async function getUploadUrl(path: string, contentType: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Up to MAX_FILES (3) per real submit, but a batch of several
  // submits in a session is normal — generous enough not to bother a
  // legitimate CR, tight enough to stop a script minting signed URLs
  // in a loop.
  await checkRateLimit("getUploadUrl", user.id, 30, 60_000);

  if (!isSafeUploadPath(path)) {
    throw new Error("Invalid upload path.");
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Unsupported file type.");
  }

  const uploadUrl = await getPresignedUploadUrl(path, contentType);
  return { uploadUrl, publicUrl: r2PublicUrl(path) };
}
