-- Placeholder subjects for CSE Cyber Security, 1st Year - Semester 1 —
-- the specialization exists (see expand_branch_hierarchy.sql) but had
-- zero subjects in any term. These are literal placeholders (name =
-- "Subject 1".."Subject 7") to be renamed once the real syllabus is
-- known — renaming only ever needs an `update subjects set name = ...`
-- later, never a slug change or any code change, since every reference
-- to these subjects (labSubjects.ts's LAB_SUBJECT_SLUGS) is by slug,
-- not name.
--
-- Subject 1-7 all show under Notes and PYQ (filterSubjectsForResourceType
-- excludes a subject from Notes/PYQ only if its slug is in
-- LAB_ONLY_SUBJECT_SLUGS — none of these are). Subject 1-5 additionally
-- show under Lab (added to LAB_SUBJECT_SLUGS in the same commit as this
-- migration); Subject 6-7 are Notes/PYQ only. This produces exactly:
-- Notes/PYQ = All subjects + Extra + 7 = 9 options, Lab = All subjects +
-- Extra + 5 = 7 options — matching the requested count without any of
-- Upload/Manage/Edit/filter code needing a Cyber-Security-specific
-- branch, since all of it already reads subjects from this table.
--
-- Scoped ONLY to CSE Cyber Security's own specialization_id — cannot
-- affect Core/AIML/AIDS or any other branch, whose subjects/labSubjects
-- entries are keyed by their own distinct slugs.
insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order)
select
  '11882125-634c-45df-b51f-dd8c775c660e', -- CSE
  'ab74984a-a34a-4b9b-9119-79b1de0f3a98', -- CSE Cyber Security
  '06223e4a-932a-44ca-b4f5-8d4bd50a5eba', -- 1st Year - Semester 1
  'Subject ' || n,
  'cybersecurity-subject-' || n,
  n
from generate_series(1, 7) as n;
