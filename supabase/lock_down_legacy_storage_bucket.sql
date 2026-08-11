-- Found during a full security audit (2026-08-11): the 'resources'
-- Supabase Storage bucket from setup_storage.sql predates the R2
-- migration (see src/lib/r2.ts) and is completely unused by the app
-- now — confirmed live: every resources.file_url / notices.pdf_url /
-- sancturm_updates.pdf_url currently in the database points at R2,
-- zero at Supabase Storage.
--
-- But its original policies were never revoked, and they're still
-- live: "Anyone can upload" had no restriction at all (no auth check,
-- no content-type check, no size limit), and the bucket is public, so
-- ANY unauthenticated request could upload an arbitrary file and get
-- back a public URL serving it from Sancturm's own Supabase project —
-- confirmed by actually uploading and immediately deleting a harmless
-- probe file with the anon key during this audit. That's a live,
-- exploitable, completely free file-hosting/storage-abuse vector with
-- zero relationship to anything the app itself does.
--
-- Revoking both policies rather than just the insert — nothing reads
-- from this bucket either, so there's no reason to keep public read
-- live for a bucket with no legitimate content in it.
drop policy if exists "Public read" on storage.objects;
drop policy if exists "Anyone can upload" on storage.objects;

-- Bucket itself is left in place (harmless once both policies above
-- are gone — no policy means no access, full stop) rather than
-- dropped, in case any historical asset still needs manual recovery.
