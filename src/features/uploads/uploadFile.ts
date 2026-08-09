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
  onProgress?: (fraction: number) => void
): Promise<string> {
  const { uploadUrl, publicUrl } = await getUploadUrl(path, file.type);

  await new Promise<void>((resolve, reject) => {
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
    xhr.send(file);
  });

  return publicUrl;
}
