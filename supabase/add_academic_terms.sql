-- Sancturm was 2nd-Year-Sem-3-only until now. Adding 1st Year Sem 1
-- means every branch's content now needs to be scoped by (branch,
-- term), not just branch — a "DSA notes" upload for 2nd year AIML
-- has nothing to do with 1st year AIML. `academic_terms` and
-- `subjects.term_id` already existed in the schema (subjects were
-- quietly built term-aware from day one) — this just corrects the one
-- existing term row and extends the same term_id column to
-- resources, notices, and cr_profiles.

-- The existing row's semester_number was wrong (1, not 3) — every
-- subject/resource/notice already points at this exact id, so
-- correcting it in place avoids remapping 15+ rows to a new id.
update academic_terms
set semester_number = 3, label = '2nd Year - Semester 3'
where year_number = 2 and semester_number = 1;

alter table academic_terms add column if not exists slug text;
alter table academic_terms add column if not exists sort_order integer not null default 0;

update academic_terms set slug = 'y2-s3', sort_order = 2
where year_number = 2 and semester_number = 3;

insert into academic_terms (year_number, semester_number, label, slug, sort_order)
values (1, 1, '1st Year - Semester 1', 'y1-s1', 1)
on conflict (year_number, semester_number) do nothing;

alter table academic_terms alter column slug set not null;
alter table academic_terms add constraint academic_terms_slug_key unique (slug);

-- resources and notices: add term_id, backfill every existing row to
-- 2nd-Year-Sem-3 (the only term that existed before now), then
-- require it going forward — same nullable-then-backfill-then-NOT
-- NULL sequence as subjects.term_id already went through.
alter table resources add column if not exists term_id uuid references academic_terms(id);
update resources set term_id = (select id from academic_terms where slug = 'y2-s3') where term_id is null;
alter table resources alter column term_id set not null;

alter table notices add column if not exists term_id uuid references academic_terms(id);
update notices set term_id = (select id from academic_terms where slug = 'y2-s3') where term_id is null;
alter table notices alter column term_id set not null;

-- cr_profiles: a CR is scoped to one (branch, term) pair, not just a
-- branch — a 1st-year AIML CR and a 2nd-year AIML CR are different
-- people with different scopes ("no of CRs increase ho jayenge").
-- Table is empty right now, so no backfill needed.
alter table cr_profiles add column if not exists term_id uuid references academic_terms(id);
alter table cr_profiles alter column term_id set not null;
