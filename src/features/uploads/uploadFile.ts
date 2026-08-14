"use client";

import { getUploadUrl } from "@/features/uploads/actions";

/**
 * Uploads a file straight from the browser to R2 — gets a presigned
 * URL from the server (one small request), then PUTs the file bytes
 * directly to R2, never through the Next.js server. This is what
 * makes large PDFs (tens of MB) work at all; routing them through a
 * Server Action instead hit Vercel's serverless body-size limit.
 *
 * Uses XMLHttpRequest instead of fetch specifically for the PUT —
 * fetch has no cross-browser-reliable way to report request-body
 * upload progress, XHR's `upload.onprogress` does, and that's the
 * only reason to reach for the older API here.
 */
export async function uploadFileToR2(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
  // Lets a caller (CRUploadForm's Cancel button) abort a PUT that's
  // actively in flight — XHR has its own .abort(), this just wires a
  // standard AbortSignal to it so cancellation doesn't need its own
  // one-off API.
  signal?: AbortSignal
): Promise<string> {
  const { uploadUrl, publicUrl } = await getUploadUrl(path, file.type);

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled.", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    // Detects a genuinely STUCK upload (no bytes moving at all, ever)
    // without penalizing a legitimately slow-but-progressing one — a
    // fixed total-duration timeout would kill a real multi-minute
    // upload of a large scanned PDF on a slow connection just as
    // readily as an actually-hung one. Resets on every real progress
    // event; only fires once nothing has moved for this long straight
    // through. Without this, a connection that silently drops mid-PUT
    // (no error event, no progress, just... nothing) left the whole
    // form stuck on "Uploading…" forever, with no way out except Cancel.
    const STALL_TIMEOUT_MS = 30_000;
    let stalledOut = false;
    let stallTimer: ReturnType<typeof setTimeout>;
    function resetStallTimer() {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalledOut = true;
        xhr.abort();
      }, STALL_TIMEOUT_MS);
    }
    resetStallTimer();

    xhr.upload.onprogress = (event) => {
      resetStallTimer();
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      clearTimeout(stallTimer);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload to storage failed."));
    };
    xhr.onerror = () => {
      clearTimeout(stallTimer);
      reject(new Error("Upload failed — check your connection and try again."));
    };
    xhr.onabort = () => {
      clearTimeout(stallTimer);
      reject(
        stalledOut
          ? new Error("Upload stalled — no progress for 30s. Check your connection and try again.")
          : new DOMException("Upload cancelled.", "AbortError")
      );
    };
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });

  return publicUrl;
}
