-- Adds resources.content_hash — a SHA-256 (hex, 64 chars) of the
-- uploaded file's full bytes, computed once at upload time (see
-- src/lib/uploadVerification.ts's verifyUploadedFileOrCleanUp).
--
-- This is what lets Manage's content-identity grouping (see
-- contentGroupKey in ManageResourceList.tsx) recognize the SAME
-- underlying document even when it was genuinely uploaded as a
-- separate R2 object each time — the common real case here: the same
-- PDF manually re-uploaded once per branch, which file_url alone can
-- never catch since every individual upload gets its own fresh object
-- key. content_hash is the actual byte-content signature, so two
-- uploads of the identical file always match here regardless of how
-- many times or through which R2 object each one happened to land.
--
-- Nullable: existing resources predate this column and have no hash
-- yet (backfilled separately, once, via a one-time script — this
-- migration only adds the column). New uploads always populate it
-- going forward; contentGroupKey falls back to file_url whenever it's
-- null, exactly as it did before this column existed.

begin;

alter table resources add column if not exists content_hash text;

create index if not exists idx_resources_content_hash on resources (content_hash) where content_hash is not null;

commit;
