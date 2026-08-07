import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
 * Uploads a file to the R2 bucket at `path` and returns its public
 * URL. R2_PUBLIC_URL is the bucket's public base (either the r2.dev
 * dev URL or a custom domain you've connected) — see .env.example.
 */
export async function uploadToR2(path: string, file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: path,
      Body: bytes,
      ContentType: file.type || "application/octet-stream",
    })
  );

  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  return `${base}/${path}`;
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
