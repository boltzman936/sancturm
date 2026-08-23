-- Storage-level dedup for resources (Notes/Lab/PYQ/Solutions) — the
-- exact-file-once-per-hash requirement. `resources` already lets many
-- rows share one `file_url` (see deleteResource's own comment in
-- src/features/resources/actions.ts — the delete-side reference count
-- by file_url already exists and is already relied on in production),
-- but nothing on the UPLOAD side ever checked for an existing matching
-- file before keeping a freshly-uploaded object. A plain "SELECT for a
-- match, INSERT if none" check has a real race window under genuine
-- concurrency — two uploads of the same brand-new file could both see
-- "no match" and both become canonical. This table is what closes that
-- race atomically: it's the single source of truth for "which physical
-- object represents this hash," and its PRIMARY KEY on content_hash
-- means Postgres itself — not application code — guarantees only one
-- row can ever win for a given hash, via ON CONFLICT DO NOTHING at
-- insert time (see uploadResourceDirect/uploadResourceDirectAllBranches
-- in src/features/resources/actions.ts).
--
-- Deliberately NOT a replacement for resources.content_hash/file_url —
-- every resources row keeps its own file_url exactly as today (used
-- for rendering/download, unchanged). This table exists purely to make
-- the upload-time "which object is canonical" decision atomic, and to
-- give delete-time cleanup (deleteResource, mergeCanonicalPyqResources)
-- a clear counterpart entry to remove once the last resources row
-- referencing a hash is gone — without that cleanup, a future upload of
-- the same content would match a registry entry pointing at a deleted
-- object; the app's own upload-time HEAD-check is the runtime safety
-- net for that case, this stays in sync as the normal-path behavior.
create table if not exists resource_files (
  content_hash text primary key,
  file_url text not null,
  created_at timestamptz not null default now()
);

-- Backfills the registry from duplication that already exists today —
-- every bulk-publish via uploadResourceDirectAllBranches already
-- inserts multiple resources rows pointing at one identical file_url
-- (the existing, accepted sharing mechanism deleteResource's own
-- comment describes). Seeding one row per distinct existing
-- (content_hash, file_url) pair makes every already-hashed resource's
-- file immediately reusable by a future upload from the moment this
-- ships, not just files uploaded from here on. If a hash somehow
-- already spans more than one distinct file_url in `resources` today
-- (a genuine pre-existing duplicate, not yet consolidated), this picks
-- one arbitrarily via DISTINCT ON — Part B's own dry-run report
-- (scratch_dedupe_resource_storage.mjs) is what surfaces those cases
-- for manual review; this seed step is not the place that resolves
-- them.
insert into resource_files (content_hash, file_url)
select distinct on (content_hash) content_hash, file_url
from resources
where content_hash is not null
order by content_hash, created_at asc
on conflict (content_hash) do nothing;
