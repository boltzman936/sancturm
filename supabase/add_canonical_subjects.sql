-- Canonical subject identity system — preparation only, for a future
-- "historical 2025-26 same-subject" resource-visibility feature. Does
-- NOT change resource queries, UI, or existing subject display names;
-- see the migration's own commit message for the full scope.
--
-- Extends the existing `subjects` table (one row per branch +
-- specialization + term, e.g. "Engineering Chemistry" for CSE AIDS
-- Sem 1) rather than duplicating it — canonical_subjects is a small,
-- separate lookup of the ~48 REAL underlying courses, and each
-- existing subjects row points at exactly one via
-- canonical_subject_id. Nullable: a handful of existing subject names
-- (Biotechnology's own "Elementary Mathematics I/II" and "Graphics")
-- have no confirmed canonical match yet — see this migration's own
-- verification query for the full list — and are deliberately left
-- unmapped rather than guessed.
create table canonical_subjects (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table canonical_subjects enable row level security;
create policy "Public read" on canonical_subjects for select using (true);
create policy "Admin manages" on canonical_subjects for all
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

alter table subjects add column canonical_subject_id uuid references canonical_subjects(id);

-- The 48 real courses every existing (and future) subjects row should
-- eventually point at. Seeded here as the one-time canonical set from
-- the reviewed subject inventory — inserting by name, not hardcoding
-- ids, so this migration stays readable and idempotent-by-slug.
insert into canonical_subjects (canonical_name, slug) values
  ('Mathematics I', 'mathematics-i'),
  ('Mathematics II', 'mathematics-ii'),
  ('Mathematics III', 'mathematics-iii'),
  ('Chemistry', 'chemistry'),
  ('Physics', 'physics'),
  ('Mechanics', 'mechanics'),
  ('C Programming', 'c-programming'),
  ('Digital Electronics', 'digital-electronics'),
  ('Professional Communication', 'professional-communication'),
  ('Manufacturing', 'manufacturing'),
  ('Elementary English I', 'elementary-english-i'),
  ('Elementary English II', 'elementary-english-ii'),
  ('Soft Skill', 'soft-skill'),
  ('Environmental Science', 'environmental-science'),
  ('Design and Thinking', 'design-and-thinking'),
  ('Electrical Engineering', 'electrical-engineering'),
  ('Engineering Graphics', 'engineering-graphics'),
  ('Biotechnology I', 'biotechnology-i'),
  ('Biotechnology II', 'biotechnology-ii'),
  ('Biotechnology', 'biotechnology'),
  ('Analytical Techniques', 'analytical-techniques'),
  ('Biochemistry', 'biochemistry'),
  ('Biostatistics', 'biostatistics'),
  ('Cell & Molecular Biology', 'cell-molecular-biology'),
  ('Enzyme Engineering', 'enzyme-engineering'),
  ('Microbiology', 'microbiology'),
  ('Linux & PERL Programming', 'linux-perl-programming'),
  ('Basics of Food and Nutrition', 'basics-of-food-and-nutrition'),
  ('Python', 'python'),
  ('DSA', 'dsa'),
  ('Human Values', 'human-values'),
  ('Strength of Materials', 'strength-of-materials'),
  ('Basic Surveying', 'basic-surveying'),
  ('Fluid Mechanics', 'fluid-mechanics'),
  ('Building Material and Construction', 'building-material-and-construction'),
  ('Disaster Management', 'disaster-management'),
  ('Engineering Materials and Applications', 'engineering-materials-and-applications'),
  ('Engineering Materials Lab', 'engineering-materials-lab'),
  ('Computer Aided Machine Drawing Lab', 'computer-aided-machine-drawing-lab'),
  ('Civil Engineering Drawing Lab', 'civil-engineering-drawing-lab'),
  ('Engineering Thermodynamics', 'engineering-thermodynamics'),
  ('Thermodynamics Lab', 'thermodynamics-lab'),
  ('Mechanics of Deformable Solids', 'mechanics-of-deformable-solids'),
  ('Fluid Mechanics Lab', 'fluid-mechanics-lab'),
  ('Basic Surveying Lab', 'basic-surveying-lab'),
  ('Building, Material & Construction Lab', 'building-material-construction-lab'),
  ('Digital Electronics Lab', 'digital-electronics-lab'),
  ('Python Lab', 'python-lab');

-- Existing subject rows -> canonical subject, by exact current name.
-- Every mapping below is either a direct 1:1 (the existing name
-- already IS the canonical name) or one of the explicit aliases
-- reviewed against the subject inventory. Anything NOT listed here
-- (Biotechnology's "Elementary Mathematics I", "Elementary
-- Mathematics II", "Graphics") is deliberately left unmapped — see
-- this file's own header comment.
update subjects s set canonical_subject_id = c.id
from canonical_subjects c
where c.slug = case s.name
  when 'Engineering Mathematics I' then 'mathematics-i'
  when 'Mathematics I' then 'mathematics-i'
  when 'Engineering Mathematics II' then 'mathematics-ii'
  when 'Mathematics II' then 'mathematics-ii'
  when 'Mathematics-III' then 'mathematics-iii'
  when 'Engineering Mathematics-III' then 'mathematics-iii'
  when 'Mathematics III' then 'mathematics-iii'
  when 'Engineering Chemistry' then 'chemistry'
  when 'Chemistry' then 'chemistry'
  when 'Engineering Physics' then 'physics'
  when 'Physics' then 'physics'
  when 'Engineering Mechanics' then 'mechanics'
  when 'Mechanics' then 'mechanics'
  when 'C Programming' then 'c-programming'
  when 'Digital Electronics' then 'digital-electronics'
  when 'Professional Communication' then 'professional-communication'
  when 'Manufacturing' then 'manufacturing'
  when 'Elementary English I' then 'elementary-english-i'
  when 'Elementary English II' then 'elementary-english-ii'
  when 'Soft Skill' then 'soft-skill'
  when 'Environmental Science' then 'environmental-science'
  when 'Design & Thinking' then 'design-and-thinking'
  when 'Design and Thinking' then 'design-and-thinking'
  when 'Electrical Engineering' then 'electrical-engineering'
  when 'Engineering Graphics' then 'engineering-graphics'
  when 'Biotechnology I' then 'biotechnology-i'
  when 'Biotechnology II' then 'biotechnology-ii'
  when 'Biotechnology' then 'biotechnology'
  when 'Analytical Techniques' then 'analytical-techniques'
  when 'Biochemistry' then 'biochemistry'
  when 'Biostatistics' then 'biostatistics'
  when 'Cell & Molecular Biology' then 'cell-molecular-biology'
  when 'Enzyme Engineering' then 'enzyme-engineering'
  when 'Microbiology' then 'microbiology'
  when 'Linux & PERL Programming' then 'linux-perl-programming'
  when 'Basics of Food and Nutrition' then 'basics-of-food-and-nutrition'
  when 'Python' then 'python'
  when 'Python Programming' then 'python'
  when 'DSA' then 'dsa'
  when 'Human Values' then 'human-values'
  when 'Strength of Materials' then 'strength-of-materials'
  when 'Basic Surveying' then 'basic-surveying'
  when 'Fluid Mechanics' then 'fluid-mechanics'
  when 'Building Material and Construction' then 'building-material-and-construction'
  when 'Disaster Management' then 'disaster-management'
  when 'Engineering Materials and Applications' then 'engineering-materials-and-applications'
  when 'Engineering Materials Lab' then 'engineering-materials-lab'
  when 'Engineering Material Lab' then 'engineering-materials-lab'
  when 'Computer Aided Machine Drawing Lab' then 'computer-aided-machine-drawing-lab'
  when 'Civil Engineering Drawing Lab' then 'civil-engineering-drawing-lab'
  when 'Engineering Thermodynamics' then 'engineering-thermodynamics'
  when 'Thermodynamics Lab' then 'thermodynamics-lab'
  when 'Mechanics of Deformable Solids' then 'mechanics-of-deformable-solids'
  when 'Fluid Mechanics Lab' then 'fluid-mechanics-lab'
  when 'Basic Surveying Lab' then 'basic-surveying-lab'
  when 'Building, Material & Construction Lab' then 'building-material-construction-lab'
  when 'Digital Electronics Lab' then 'digital-electronics-lab'
  when 'Python Lab' then 'python-lab'
  else null
end;
-- Unmapped names (the CASE above returns null for them) simply match
-- no canonical_subjects row, so the UPDATE's FROM join skips them —
-- their canonical_subject_id stays null, not force-set to anything.
