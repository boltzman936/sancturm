-- CSE AIDS's 1st-year subject list is different from AIML/Core's —
-- seed_year1_subjects.sql wrongly gave AIDS the same 8 subjects as
-- the other two branches. This replaces AIDS's y1-s1 subjects only;
-- AIML and Core are untouched (their list was correct).
--
-- Notes: Mathematics I, C Programming, Digital Electronics,
--        Professional Communication, Manufacturing, Elementary English
-- Lab:   Manufacturing, Digital Electronics, C Programming, Soft Skill
--
-- Lab-capable slugs here (c-programming, manufacturing, soft-skill)
-- must be added to LAB_SUBJECT_SLUGS in
-- src/features/resources/labSubjects.ts — digital-electronics is
-- already there from the 2nd-year list.

delete from subjects
where branch_id = (select id from branches where name = 'CSE AIDS')
  and term_id = (select id from academic_terms where slug = 'y1-s1');

insert into subjects (branch_id, term_id, name, slug, sort_order)
select
  (select id from branches where name = 'CSE AIDS'),
  t.id,
  s.name,
  s.slug,
  s.sort_order
from academic_terms t
cross join (values
  ('Mathematics I', 'mathematics-i', 1),
  ('C Programming', 'c-programming', 2),
  ('Digital Electronics', 'digital-electronics', 3),
  ('Professional Communication', 'professional-communication', 4),
  ('Manufacturing', 'manufacturing', 5),
  ('Elementary English', 'elementary-english', 6),
  ('Soft Skill', 'soft-skill', 7)
) as s(name, slug, sort_order)
where t.slug = 'y1-s1';
