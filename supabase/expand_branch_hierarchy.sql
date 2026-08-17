-- Expands Sancturm from "branches == CSE specializations" into a real
-- Department -> Degree -> Branch -> Specialization hierarchy, so 4 new
-- branches (Civil, Mechanical, Automation & Robotics, Biotechnology —
-- none with a specialization concept) can be added alongside CSE
-- (Core/AIML/AIDS + new Cyber Security) without duplicating any
-- Notes/PYQ/Notices/Upload/Manage/auth logic per branch.
--
-- Full dependency map done before writing this (see the approved plan
-- at /Users/anuragkumar/.claude/plans/humming-strolling-thunder.md):
-- every FK to branches.id (subjects, resources, notices, cr_profiles,
-- and the DEAD-but-still-FK'd class_updates table), every index on
-- branch_id, every RLS policy matching branch_id in a tuple, every
-- `.from("branches")` call site in src/. No table is renamed on the
-- strength of "src/ doesn't reference it" alone.
--
-- Zero rows are deleted. Zero ids change. Zero file_url/storage values
-- are touched. Existing resources/notices/subjects/cr_profiles keep
-- their current branch_id VALUE, just renamed to specialization_id and
-- backfilled with a new branch_id = CSE. This whole script is one
-- transaction — it either fully applies or fully rolls back.
--
-- Row counts captured live before writing this migration (asserted
-- unchanged at the end): resources=57, notices=5, subjects=39,
-- cr_profiles=1, branches(old)=3.
--
-- Rollback: supabase/rollback_expand_branch_hierarchy.sql reverses
-- every step here in exact reverse order.

begin;

-- ============================================================
-- 1. departments — never surfaced in any UI. Exists so the schema is
--    honest about the hierarchy, not because the app needs to pick one.
-- ============================================================
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table departments enable row level security;
create policy "Public read" on departments for select using (true);

insert into departments (name, slug, sort_order) values ('Engineering', 'engineering', 1);


-- ============================================================
-- 2. programs -> degrees, done early (before the new branches table is
--    created) so branches can reference degree_id directly, matching
--    the target Department -> Degree -> Branch chain. Was a
--    single-purpose "B.Tech CSE" row conflating degree+branch; now
--    Branch is its own dimension, so the degree itself is renamed to
--    reflect only what it actually is. Never surfaced in the UI, same
--    as departments.
-- ============================================================
alter table programs rename to degrees;
alter table degrees add column department_id uuid references departments(id);
update degrees set department_id = (select id from departments where slug = 'engineering');
alter table degrees alter column department_id set not null;
update degrees set name = 'B.Tech', slug = 'btech' where slug = 'btech-cse';


-- ============================================================
-- 3. Free up the name "branches" for the new real-branch table: rename
--    today's branches (== CSE's specializations) to specializations.
--    Postgres tracks FK constraints by OID, not by name, so every
--    existing FK to this table (subjects, resources, notices,
--    cr_profiles, class_updates) keeps working through the rename with
--    zero data movement.
-- ============================================================
alter table branches rename to specializations;


-- ============================================================
-- 4. branches (new) — the 5 real branches, linked directly to degrees
--    (skipping department_id here since a branch's department is
--    always implied by its degree — one degree, one department, today;
--    department_id living on degrees is enough to answer "which
--    department" without a redundant second FK on every branch row).
--    has_specializations drives the Cockpit's conditional Specialization
--    step and every CSE-only UI branch (Sidebar switcher, Upload/Manage
--    dropdown).
-- ============================================================
create table branches (
  id uuid primary key default gen_random_uuid(),
  degree_id uuid not null references degrees(id) on delete cascade,
  name text not null,
  slug text not null unique,
  has_specializations boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table branches enable row level security;
create policy "Public read" on branches for select using (true);

insert into branches (degree_id, name, slug, has_specializations, sort_order)
select d.id, v.name, v.slug, v.has_specializations, v.sort_order
from (values
  ('CSE', 'cse', true, 1),
  ('Civil', 'civil', false, 2),
  ('Mechanical', 'mechanical', false, 3),
  ('Automation & Robotics', 'automation-robotics', false, 4),
  ('Biotechnology', 'biotechnology', false, 5)
) as v(name, slug, has_specializations, sort_order)
cross join (select id from degrees where slug = 'btech') d;


-- ============================================================
-- 5. specializations gains branch_id (not null) — backfill every
--    existing row (CSE AIML/Core/AIDS) to the new CSE branch, drop the
--    now-redundant program_id (a specialization reaches its degree via
--    branch_id -> branches -> degree_id -> degrees, so a second, direct
--    FK to the same degree would just be a duplicate fact that could
--    drift out of sync), then add the 4th specialization, Cyber
--    Security, confirmed independent of the existing subject-
--    interchange and PYQ-sharing rules.
-- ============================================================
alter table specializations add column branch_id uuid references branches(id);
update specializations set branch_id = (select id from branches where slug = 'cse');
alter table specializations alter column branch_id set not null;
alter table specializations drop column program_id;

insert into specializations (branch_id, name, slug, sort_order)
select (select id from branches where slug = 'cse'), 'CSE Cyber Security', 'cse-cyber-security', 4;


-- ============================================================
-- 6. subjects / resources / notices / cr_profiles: rename branch_id to
--    specialization_id (nullable — non-CSE rows will have none), add a
--    new required branch_id, backfill every existing row to CSE.
--    class_updates is deliberately left untouched: it's a dead table
--    (zero references anywhere in src/, confirmed in an earlier
--    session's security audit) whose branch_id FK still resolves fine
--    after the rename above — not worth restructuring unused code.
-- ============================================================
alter table subjects rename column branch_id to specialization_id;
alter table subjects alter column specialization_id drop not null;
alter table subjects add column branch_id uuid references branches(id);
update subjects set branch_id = (select id from branches where slug = 'cse');
alter table subjects alter column branch_id set not null;

alter table resources rename column branch_id to specialization_id;
alter table resources alter column specialization_id drop not null;
alter table resources add column branch_id uuid references branches(id);
update resources set branch_id = (select id from branches where slug = 'cse');
alter table resources alter column branch_id set not null;

alter table notices rename column branch_id to specialization_id;
alter table notices alter column specialization_id drop not null;
alter table notices add column branch_id uuid references branches(id);
update notices set branch_id = (select id from branches where slug = 'cse');
alter table notices alter column branch_id set not null;

alter table cr_profiles rename column branch_id to specialization_id;
alter table cr_profiles alter column specialization_id drop not null;
alter table cr_profiles add column branch_id uuid references branches(id);
update cr_profiles set branch_id = (select id from branches where slug = 'cse');
alter table cr_profiles alter column branch_id set not null;


-- ============================================================
-- 7. Recreate the three indexes that covered the old branch_id, now
--    covering both branch_id and specialization_id — every real query
--    will filter by branch always and specialization only for CSE.
-- ============================================================
drop index if exists idx_resources_query;
create index idx_resources_query
  on resources (section, status, branch_id, specialization_id, term_id, is_pinned desc, created_at desc);

drop index if exists idx_notices_query;
create index idx_notices_query
  on notices (branch_id, specialization_id, term_id, is_pinned desc, created_at desc);

drop index if exists idx_cr_profiles_branch_term;
create index idx_cr_profiles_branch_term on cr_profiles (branch_id, specialization_id, term_id);


-- ============================================================
-- 8. RLS: rewrite every policy that matched branch_id in a tuple
--    against cr_profiles, to also match branch_id AND compare
--    specialization_id with IS NOT DISTINCT FROM instead of `IN` — a
--    plain tuple `IN` never matches two rows that both have
--    specialization_id = null (SQL NULL semantics: NULL = NULL is not
--    true), which would silently break every non-CSE CR. Every other
--    existing clause (PYQ's cross-branch term-only carve-out, the
--    is_admin_display_name update/delete guard, notices' cr_only
--    check) is preserved exactly — only the tuple-match shape changes.
-- ============================================================

-- subjects
drop policy if exists "CR or admin manages" on subjects;
create policy "CR or admin manages" on subjects for all
  using (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cp.term_id = subjects.term_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cp.term_id = subjects.term_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- resources: select
drop policy if exists "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.specialization_id is not distinct from resources.specialization_id
          and cp.term_id = resources.term_id
          and cp.batch_id = resources.batch_id
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- resources: insert
drop policy if exists "CR or admin inserts" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.specialization_id is not distinct from resources.specialization_id
          and cp.term_id = resources.term_id
          and cp.batch_id = resources.batch_id
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- resources: update
drop policy if exists "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (
        (section = 'pyq' and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid()))
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (
        (section = 'pyq' and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid()))
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- resources: delete
drop policy if exists "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (section = 'pyq' and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid()))
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- notices: insert
drop policy if exists "CR or admin inserts" on notices;
create policy "CR or admin inserts" on notices for insert
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = notices.branch_id
        and cp.specialization_id is not distinct from notices.specialization_id
        and cp.term_id = notices.term_id
        and cp.batch_id = notices.batch_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- notices: update
drop policy if exists "CR or admin updates" on notices;
create policy "CR or admin updates" on notices for update
  using (
    (
      exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = notices.branch_id
          and cp.specialization_id is not distinct from notices.specialization_id
          and cp.term_id = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = notices.branch_id
          and cp.specialization_id is not distinct from notices.specialization_id
          and cp.term_id = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- notices: delete
drop policy if exists "CR or admin deletes" on notices;
create policy "CR or admin deletes" on notices for delete
  using (
    (
      exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = notices.branch_id
          and cp.specialization_id is not distinct from notices.specialization_id
          and cp.term_id = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- notices' "Public read" (cr_only) policy has no branch/tuple match at
-- all — untouched, deliberately not reproduced here.

-- Known, accepted, out-of-scope gap: resource_reports' "CR or admin
-- reads/reviews reports" policies (scope_cr_by_term.sql) still match
-- resources.branch_id = cr_profiles.branch_id + term_id with a plain
-- tuple IN, unchanged by this migration. resource_reports is a dead
-- table (write policies already revoked in security_hardening.sql, no
-- reachable submit UI in src/, confirmed in an earlier session's
-- security audit) — leaving its stale policy alone rather than
-- restructuring unused code, same reasoning as class_updates above.


-- ============================================================
-- 9. Academic shells: Year 3-4 / Sem 5-8. academic_terms and
--    batch_terms have NO branch_id column at all (confirmed — genuinely
--    global), so this is the entire mechanism needed for every branch,
--    existing and new, to have the full 4-year chronology. Purely
--    additive: existing terms/rows are untouched.
-- ============================================================
insert into academic_terms (year_number, semester_number, label, slug, sort_order) values
  (3, 5, '3rd Year - Semester 5', 'y3-s5', 5),
  (3, 6, '3rd Year - Semester 6', 'y3-s6', 6),
  (4, 7, '4th Year - Semester 7', 'y4-s7', 7),
  (4, 8, '4th Year - Semester 8', 'y4-s8', 8)
on conflict (slug) do nothing;

-- Continues each batch's own existing Aug-Dec / Jan-Jul cadence from
-- wherever its batch_terms coverage currently ends (captured live
-- before writing this migration — 2025-26 ends at y2-s4/2027-07-31;
-- 2026-27 ends at y1-s2/2027-07-31, and is also missing y2-s3/y2-s4
-- rows it never got, backfilled here too so both batches reach the
-- same full range).
insert into batch_terms (batch_id, term_id, start_date, end_date)
select b.id, t.id, v.start_date, v.end_date
from (values
  ('2025-26', 'y3-s5', date '2027-08-01', date '2027-12-30'),
  ('2025-26', 'y3-s6', date '2028-01-01', date '2028-07-31'),
  ('2025-26', 'y4-s7', date '2028-08-01', date '2028-12-30'),
  ('2025-26', 'y4-s8', date '2029-01-01', date '2029-07-31'),

  ('2026-27', 'y2-s3', date '2027-08-01', date '2027-12-30'),
  ('2026-27', 'y2-s4', date '2028-01-01', date '2028-07-31'),
  ('2026-27', 'y3-s5', date '2028-08-01', date '2028-12-30'),
  ('2026-27', 'y3-s6', date '2029-01-01', date '2029-07-31'),
  ('2026-27', 'y4-s7', date '2029-08-01', date '2029-12-30'),
  ('2026-27', 'y4-s8', date '2030-01-01', date '2030-07-31')
) as v(batch_label, term_slug, start_date, end_date)
join batches b on b.label = v.batch_label
join academic_terms t on t.slug = v.term_slug
on conflict (batch_id, term_id) do nothing;


-- ============================================================
-- 10. Assertions — abort (rolling back the whole transaction) if any
--     existing-data invariant this migration promised doesn't hold.
-- ============================================================
do $$
declare
  res_count int;
  not_count int;
  sub_count int;
  cr_count int;
  spec_count int;
  branch_count int;
begin
  select count(*) into res_count from resources;
  select count(*) into not_count from notices;
  select count(*) into sub_count from subjects;
  select count(*) into cr_count from cr_profiles;
  select count(*) into spec_count from specializations;
  select count(*) into branch_count from branches;

  if res_count != 57 then raise exception 'resources row count changed: expected 57, got %', res_count; end if;
  if not_count != 5 then raise exception 'notices row count changed: expected 5, got %', not_count; end if;
  if sub_count != 39 then raise exception 'subjects row count changed: expected 39, got %', sub_count; end if;
  if cr_count != 1 then raise exception 'cr_profiles row count changed: expected 1, got %', cr_count; end if;
  if spec_count != 4 then raise exception 'specializations row count wrong: expected 4, got %', spec_count; end if;
  if branch_count != 5 then raise exception 'branches row count wrong: expected 5, got %', branch_count; end if;

  if exists (select 1 from resources where branch_id is null) then
    raise exception 'a resource has null branch_id after backfill';
  end if;
  if exists (select 1 from subjects where specialization_id is null and branch_id = (select id from branches where slug = 'cse')) then
    raise exception 'a CSE subject lost its specialization_id';
  end if;
end $$;

commit;
