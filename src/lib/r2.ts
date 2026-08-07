import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 for file storage (PDFs) — Supabase's own Storage quota
 * fills up fast on the free tier, and R2 is S3-compatible, so the
 * AWS SDK talks to it directly. This never runs in the browser: every
 * upload path here is a Server Action, so the R2 secret key is never
 * exposed client-side.
 */
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * The public URL a file at `path` will be reachable at once uploaded —
 * pure string math, no request. R2_PUBLIC_URL is the bucket's public
 * base (either the r2.dev dev URL or a custom domain) — see .env.example.
 */
export function r2PublicUrl(path: string): string {
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  return `${base}/${path}`;
}

/**
 * A short-lived URL the BROWSER can PUT a file to directly. Used to
 * exist as uploadToR2(path, file) — a Server Action that took the
 * file, read its bytes into memory, and forwarded them to R2 itself.
 * That routed every upload through the Next.js server, which on
 * Vercel means the whole file has to fit inside a serverless
 * function's request body (~4.5MB) — anything bigger (a real PDF,
 * easily) failed with no useful error. A presigned URL lets the
 * browser upload straight to R2, bypassing that limit entirely; the
 * server's only job is minting this URL and, once the upload
 * finishes, writing the resulting public URL into the database.
 */
export async function getPresignedUploadUrl(path: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: path,
    ContentType: contentType || "application/octet-stream",
  });
  return getSignedUrl(r2Client, command, { expiresIn: 5 * 60 });
}

/**
 * Deletes the object a public R2 URL points to. Every "delete" action
 * (resources, notices, sancturm updates) used to only remove the
 * database row, leaving the actual PDF behind in the bucket forever —
 * this is what those call now so storage doesn't grow unbounded.
 * Silently no-ops for null/empty urls (custom text posts have no
 * file) and for a url that isn't actually one of ours, since either
 * case means there's nothing in R2 to clean up.
 */
export async function deleteFromR2(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  if (!url.startsWith(`${base}/`)) return;
  const key = url.slice(base.length + 1);
  if (!key) return;

  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}
