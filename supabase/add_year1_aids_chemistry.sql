-- Adds Engineering Chemistry to CSE AIDS's 1st-year Sem 1 subject
-- list — AIML/Core are untouched (their subject structure is
-- different, see fix_year1_aids_subjects.sql). Same insert shape as
-- every other subject: no separate table, no special-case code path,
-- so Notes/Lab/Upload/Manage/filtering/PYQ all pick it up for free.
--
-- Notes-only (no lab component) — AIDS's existing lab-capable
-- subjects are Manufacturing, Digital Electronics, C Programming, and
-- Soft Skill (see fix_year1_aids_subjects.sql's own comment); this
-- follows the same split as AIDS's other notes-only subjects
-- (Mathematics I, Professional Communication, Elementary English), so
-- its slug is deliberately NOT added to LAB_SUBJECT_SLUGS in
-- src/features/resources/labSubjects.ts.
insert into subjects (branch_id, term_id, name, slug, sort_order)
select
  (select id from branches where name = 'CSE AIDS'),
  t.id,
  'Engineering Chemistry',
  'engineering-chemistry',
  8
from academic_terms t
where t.slug = 'y1-s1'
on conflict do nothing;
