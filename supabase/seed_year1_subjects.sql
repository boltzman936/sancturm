-- 1st Year - Semester 1 subjects, one row per branch (AIML/Core/AIDS).
-- Lab-capable subjects here (Engineering Mechanics, Electrical
-- Engineering, Engineering Physics, Engineering Graphics) must have
-- their slugs added to LAB_SUBJECT_SLUGS in
-- src/features/resources/labSubjects.ts, which decides which subjects
-- show up in the Lab upload form.

insert into subjects (branch_id, term_id, name, slug, sort_order)
select b.id, t.id, s.name, s.slug, s.sort_order
from branches b
cross join academic_terms t
cross join (values
  ('Mathematics I', 'mathematics-i', 1),
  ('Engineering Mechanics', 'engineering-mechanics', 2),
  ('Electrical Engineering', 'electrical-engineering', 3),
  ('Engineering Physics', 'engineering-physics', 4),
  ('Environmental Science', 'environmental-science', 5),
  ('Elementary English', 'elementary-english', 6),
  ('Design and Thinking', 'design-and-thinking', 7),
  ('Engineering Graphics', 'engineering-graphics', 8)
) as s(name, slug, sort_order)
where t.slug = 'y1-s1';
