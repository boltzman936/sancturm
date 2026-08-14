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
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload to storage failed."));
    };
    xhr.onerror = () => reject(new Error("Upload to storage failed."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });

  return publicUrl;
}
