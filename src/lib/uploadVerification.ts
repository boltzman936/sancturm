import "server-only";
import { deleteFromR2 } from "./r2";

type SignatureCheck = (bytes: Uint8Array) => boolean;

// One entry per type in uploads/actions.ts's ALLOWED_CONTENT_TYPES —
// keep these two lists in sync; an allowed type with no signature
// here would always fail closed (see the `if (!check)` branch below),
// which is the safe failure mode but would wrongly reject a real file.
// Generous headroom above any real scanned-notes PDF (even a dense
// 150+ page scan rarely clears a few tens of MB) while still bounding
// how much storage/bandwidth one upload can claim — the presigned PUT
// itself has no size limit (see r2.ts), so this is the only thing
// standing between "large PDF" and "arbitrarily large object."
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const SIGNATURES: Record<string, SignatureCheck> = {
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

export type VerificationResult = {
  valid: boolean;
  // SHA-256 of the full file body, hex-encoded — null whenever `valid`
  // is false (nothing to hash, or hashing itself never ran). This is
  // the "same file identity/hash" signal Manage's content-identity
  // grouping (see contentGroupKey in ManageResourceList.tsx) uses to
  // recognize the SAME underlying document even when it was uploaded
  // as a genuinely separate R2 object each time (the common case —
  // one admin re-uploading the identical PDF once per branch, which a
  // bare file_url comparison can never catch since each upload gets
  // its own fresh object key).
  contentHash: string | null;
};

/**
 * Fetches an already-uploaded R2 object's full body ONCE and:
 *  1. Checks its first bytes against the known signature for whatever
 *     Content-Type R2 is actually serving the object as. The
 *     presigned-URL flow (see uploads/actions.ts) already constrains
 *     WHICH Content-Type header can be set on an object; this closes
 *     the remaining gap — nothing previously checked that the
 *     object's actual BYTES match that claimed type, so a CR could
 *     rename an HTML/script file to `report.pdf`, set Content-Type:
 *     application/pdf on the presigned PUT (a header value, not a
 *     content transformation), and have it pass every check that
 *     existed before this one.
 *  2. Computes a SHA-256 of the whole body — see VerificationResult's
 *     own comment for why.
 *
 * On a signature mismatch (or an unrecognized/missing Content-Type —
 * fails closed, never silently allowed), deletes the object and
 * returns `{ valid: false, contentHash: null }`. Callers MUST bail out
 * of the DB insert when `valid` is false — a rejected file must never
 * end up referenced by a published resource/notice/update row.
 *
 * Also enforces MAX_FILE_SIZE_BYTES via a HEAD request before ever
 * downloading the body — cheap (no body transferred) and lets an
 * oversized object get rejected without paying for the full fetch
 * below at all. Fetching the whole body (rather than the previous
 * 16-byte Range request) is what lets steps 1 and 2 share a single
 * download instead of two separate requests.
 */
export async function verifyUploadedFileOrCleanUp(fileUrl: string): Promise<VerificationResult> {
  const invalid: VerificationResult = { valid: false, contentHash: null };

  // Every legitimate caller only ever passes back a URL this same
  // server just minted via r2PublicUrl() (uploadFileToR2 → getUploadUrl
  // → here) — but every caller of THIS function is itself a Server
  // Action, callable directly with any string, bypassing that whole
  // chain. Without this check, a crafted call could point `fileUrl` at
  // an arbitrary host (an internal service, a cloud metadata endpoint)
  // and get this server to fetch it — the exact SSRF shape deleteFromR2
  // already guards against for the same reason, just on the read path
  // instead of delete.
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicBase || !fileUrl.startsWith(`${publicBase}/`)) return invalid;

  let headResponse: Response;
  try {
    headResponse = await fetch(fileUrl, { method: "HEAD" });
  } catch {
    return invalid;
  }
  if (!headResponse.ok) return invalid;

  const contentLength = Number(headResponse.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) return invalid;
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    try {
      await deleteFromR2(fileUrl);
    } catch {
      // Best-effort cleanup — same accepted tradeoff as every other
      // orphan-object case already in this codebase.
    }
    return invalid;
  }

  let response: Response;
  try {
    response = await fetch(fileUrl);
  } catch {
    return invalid;
  }
  if (!response.ok) return invalid;

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const check = SIGNATURES[contentType];
  if (!check) return invalid;

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const matches = check(bytes);
  if (!matches) {
    try {
      await deleteFromR2(fileUrl);
    } catch {
      // Best-effort cleanup — same accepted tradeoff as every other
      // orphan-object case already in this codebase (see
      // deleteResource's identical comment).
    }
    return invalid;
  }

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const contentHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { valid: true, contentHash };
}
