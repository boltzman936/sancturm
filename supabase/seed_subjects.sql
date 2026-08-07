-- Real subject list. If you already ran an earlier version of this
-- file (placeholder DSA/OS/DBMS/CN subjects), run the `delete from
-- subjects;` line below first — the old and new lists both use the
-- 'dsa' slug, so re-running the old on-conflict version would leave
-- stale rows behind instead of replacing them.
--
-- Slugs here must stay in sync with
-- src/features/resources/labSubjects.ts, which decides which
-- subjects show up in the Lab upload form.

delete from subjects;

insert into academic_terms (year_number, semester_number, label)
values (2, 1, '2nd Year - Semester 1')
on conflict (year_number, semester_number) do nothing;

insert into subjects (branch_id, term_id, name, slug, sort_order)
select b.id, t.id, s.name, s.slug, s.sort_order
from branches b
cross join academic_terms t
cross join (values
  ('Mathematics III', 'mathematics-iii', 1),
  ('Digital Electronics', 'digital-electronics', 2),
  ('DSA', 'dsa', 3),
  ('Python', 'python', 4),
  ('Human Values', 'human-values', 5)
) as s(name, slug, sort_order)
where t.year_number = 2 and t.semester_number = 1;
