"use client";

import { getUploadUrl } from "@/features/uploads/actions";

/**
 * Uploads a file straight from the browser to R2 — gets a presigned
 * URL from the server (one small request), then PUTs the file bytes
 * directly to R2, never through the Next.js server. This is what
 * makes large PDFs (tens of MB) work at all; routing them through a
 * Server Action instead hit Vercel's serverless body-size limit.
 */
export async function uploadFileToR2(path: string, file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await getUploadUrl(path, file.type);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error("Upload to storage failed.");

  return publicUrl;
}
