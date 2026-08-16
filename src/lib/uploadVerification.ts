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

/**
 * Fetches the first 16 bytes of an already-uploaded R2 object (a
 * Range request — cheap regardless of the file's real size) and
 * checks them against the known signature for whatever Content-Type
 * R2 is actually serving the object as. The presigned-URL flow (see
 * uploads/actions.ts) already constrains WHICH Content-Type header
 * can be set on an object; this closes the remaining gap — nothing
 * previously checked that the object's actual BYTES match that
 * claimed type, so a CR could rename an HTML/script file to
 * `report.pdf`, set Content-Type: application/pdf on the presigned
 * PUT (a header value, not a content transformation), and have it
 * pass every check that existed before this one.
 *
 * On a mismatch (or an unrecognized/missing Content-Type — fails
 * closed, never silently allowed), deletes the object and returns
 * false. Callers MUST bail out of the DB insert when this returns
 * false — a rejected file must never end up referenced by a
 * published resource/notice/update row.
 *
 * Also enforces MAX_FILE_SIZE_BYTES via a HEAD request before ever
 * downloading bytes — cheap (no body transferred) and lets an
 * oversized object get rejected without paying for the Range fetch
 * below at all.
 */
export async function verifyUploadedFileOrCleanUp(fileUrl: string): Promise<boolean> {
  let headResponse: Response;
  try {
    headResponse = await fetch(fileUrl, { method: "HEAD" });
  } catch {
    return false;
  }
  if (!headResponse.ok) return false;

  const contentLength = Number(headResponse.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) return false;
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    try {
      await deleteFromR2(fileUrl);
    } catch {
      // Best-effort cleanup — same accepted tradeoff as every other
      // orphan-object case already in this codebase.
    }
    return false;
  }

  let response: Response;
  try {
    response = await fetch(fileUrl, { headers: { Range: "bytes=0-15" } });
  } catch {
    return false;
  }
  if (!response.ok && response.status !== 206) return false;

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const check = SIGNATURES[contentType];
  if (!check) return false;

  const bytes = new Uint8Array(await response.arrayBuffer());
  const matches = check(bytes);
  if (!matches) {
    try {
      await deleteFromR2(fileUrl);
    } catch {
      // Best-effort cleanup — same accepted tradeoff as every other
      // orphan-object case already in this codebase (see
      // deleteResource's identical comment).
    }
  }
  return matches;
}
