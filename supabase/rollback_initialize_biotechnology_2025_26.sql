-- Reverses initialize_biotechnology_2025_26.sql — deletes every
-- resource row attached to a Biotechnology subject_id, since this
-- rollback is only safe to run immediately after the forward
-- migration (before any real new uploads land in Biotechnology's
-- context) — matches the precedent set in
-- rollback_initialize_2025_26_shared_content.sql.

begin;

delete from resources
where subject_id in (
  select id from subjects
  where branch_id = (select id from branches where slug = 'biotechnology')
);

commit;
