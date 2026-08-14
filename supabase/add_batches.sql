-- Introduces Batch (admission cohort, e.g. "2025-26") as an explicit
-- new layer: Year -> Batch -> Semester -> Branch -> Subject -> Resource.
--
-- Two orthogonal FKs, not one bigger merged row:
--   - academic_terms keeps meaning exactly what it already means today
--     (the "1st Year Sem 1" curriculum slot that subjects.term_id
--     points to) — UNCHANGED, so existing subjects need zero
--     re-seeding.
--   - batches is cohort identity only, NOT tied to one year_number,
--     since the same batch spans year_number 1 then 2 as the cohort
--     progresses (e.g. batch "2025-26" is in 1st Year today and will
--     be in 2nd Year a year from now).
--   - batch_terms records which (batch, curriculum-slot) combinations
--     are actually valid/live, plus the real calendar dates for each —
--     this is what lets a dependent filter ("1st Year -> 2025-26"
--     should only offer valid semesters) be driven by real data
--     instead of hardcoded logic, and what makes adding a future batch
--     a pure data operation (1 batches insert + N batch_terms inserts,
--     no code change).
create table batches (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,      -- "2025-26"
  start_year integer not null,     -- 2025 — sorting/future logic
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table batch_terms (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  term_id uuid not null references academic_terms(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  unique (batch_id, term_id)
);

alter table batches enable row level security;
alter table batch_terms enable row level security;
create policy "Public read" on batches for select using (true);
create policy "Public read" on batch_terms for select using (true);

-- 1st Year Sem 2 and 2nd Year Sem 4 don't exist as academic_terms rows
-- yet (only Sem 1 and Sem 3 were ever seeded) — needed so the mapping
-- below has a curriculum slot to attach batch_terms to. Subjects for
-- these two new slots are NOT seeded here — that's real curriculum
-- content Anurag needs to define, out of scope for a schema migration
-- (the Notes/Lab upload form will correctly show "no subjects yet"
-- for them until seeded, same as any new slot would).
insert into academic_terms (year_number, semester_number, label, slug, sort_order)
values
  (1, 2, '1st Year - Semester 2', 'y1-s2', 3),
  (2, 4, '2nd Year - Semester 4', 'y2-s4', 4)
on conflict (slug) do nothing;

-- Seed both batches from the user-supplied mapping.
insert into batches (label, start_year, sort_order) values
  ('2025-26', 2025, 1),
  ('2026-27', 2026, 2)
on conflict (label) do nothing;

insert into batch_terms (batch_id, term_id, start_date, end_date)
select b.id, t.id, v.start_date, v.end_date
from (values
  ('2025-26', 'y1-s1', date '2025-08-01', date '2025-12-30'),
  ('2025-26', 'y1-s2', date '2026-01-01', date '2026-07-31'),
  ('2025-26', 'y2-s3', date '2026-08-01', date '2026-12-30'),
  ('2025-26', 'y2-s4', date '2027-01-01', date '2027-07-31'),
  ('2026-27', 'y1-s1', date '2026-08-01', date '2026-12-30'),
  ('2026-27', 'y1-s2', date '2027-01-01', date '2027-07-31')
) as v(batch_label, term_slug, start_date, end_date)
join batches b on b.label = v.batch_label
join academic_terms t on t.slug = v.term_slug
on conflict (batch_id, term_id) do nothing;

-- Backfill: every resource/notice uploaded before Batch existed
-- belongs to the 2025-26 cohort — confirmed against real upload dates
-- already in the database (e.g. resources dated Dec 2025, which only
-- fits inside 2025-26's Sem 1 window above), not guessed.
alter table resources add column if not exists batch_id uuid references batches(id);
update resources set batch_id = (select id from batches where label = '2025-26') where batch_id is null;
alter table resources alter column batch_id set not null;

alter table notices add column if not exists batch_id uuid references batches(id);
update notices set batch_id = (select id from batches where label = '2025-26') where batch_id is null;
alter table notices alter column batch_id set not null;

-- cr_profiles is empty in production today (confirmed live before
-- writing this), so this backfill is a no-op in practice — added for
-- the same reason term_id was: a CR is scoped to one (branch, term,
-- batch) triple, not just branch+term.
alter table cr_profiles add column if not exists batch_id uuid references batches(id);
update cr_profiles set batch_id = (select id from batches where label = '2025-26') where batch_id is null;
alter table cr_profiles alter column batch_id set not null;

-- Extend the existing notes_lab scoping to also require batch —
-- PYQ's own clause is left exactly as it was (term-only, no branch or
-- batch restriction): the user's PYQ sharing rules are about BRANCH,
-- not batch, and redesigning PYQ scoping is Phase 2's job, not this
-- migration's.
drop policy "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin inserts" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Notices: same three-way OR shape as before (scope_cr_by_term.sql),
-- now also requiring batch to match.
drop policy "CR or admin manages" on notices;
create policy "CR or admin manages" on notices for all
  using (
    (branch_id, term_id, batch_id) in (
      select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (branch_id, term_id, batch_id) in (
      select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
