-- Reverses add_biotechnology_subjects.sql. Safe as long as no
-- resource has since been uploaded against one of these subjects
-- (subjects.id is referenced by resources.subject_id with no cascade,
-- so a resource pointing at a deleted subject would be left with a
-- dangling reference rather than silently deleted) — confirmed zero
-- Biotechnology resources exist at the time this rollback was written;
-- re-check before running if that's no longer true.

begin;

delete from subjects
where branch_id = (select id from branches where slug = 'biotechnology')
  and slug like 'biotech-%';

commit;
