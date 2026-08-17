-- Reverses supabase/expand_branch_hierarchy.sql exactly, back to the
-- precise pre-migration schema: branches (3 rows, CSE specializations),
-- programs (1 row), no departments/degrees/new-branches tables, plain
-- branch_id (not specialization_id) on subjects/resources/notices/
-- cr_profiles. One transaction, rolls back fully on any failure.
--
-- Run this ONLY if expand_branch_hierarchy.sql was already applied and
-- needs to be undone. Row counts are asserted back to their original
-- values (resources=57, notices=5, subjects=39, cr_profiles=1,
-- branches=3) at the end.

begin;

-- ============================================================
-- Reverse of step 8: drop every policy expand_branch_hierarchy.sql
-- created, before touching any column they reference.
-- ============================================================
drop policy if exists "CR or admin manages" on subjects;
drop policy if exists "Public read approved or own/admin" on resources;
drop policy if exists "CR or admin inserts" on resources;
drop policy if exists "CR or admin updates" on resources;
drop policy if exists "CR or admin deletes" on resources;
drop policy if exists "CR or admin inserts" on notices;
drop policy if exists "CR or admin updates" on notices;
drop policy if exists "CR or admin deletes" on notices;


-- ============================================================
-- Reverse of step 9: remove the academic shell rows this migration
-- added (Year 3-4 / Sem 5-8), leaving the original 4 terms and 5
-- batch_terms rows.
-- ============================================================
delete from batch_terms
where term_id in (select id from academic_terms where slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8'))
   or (batch_id = (select id from batches where label = '2026-27')
       and term_id in (select id from academic_terms where slug in ('y2-s3', 'y2-s4')));

delete from academic_terms where slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8');


-- ============================================================
-- Reverse of step 7: drop the new indexes (originals recreated below).
-- ============================================================
drop index if exists idx_resources_query;
drop index if exists idx_notices_query;
drop index if exists idx_cr_profiles_branch_term;


-- ============================================================
-- Reverse of step 6: subjects / resources / notices / cr_profiles —
-- drop the new branch_id, rename specialization_id back to branch_id,
-- restore not null.
-- ============================================================
alter table subjects drop column branch_id;
alter table subjects rename column specialization_id to branch_id;
alter table subjects alter column branch_id set not null;

alter table resources drop column branch_id;
alter table resources rename column specialization_id to branch_id;
alter table resources alter column branch_id set not null;

alter table notices drop column branch_id;
alter table notices rename column specialization_id to branch_id;
alter table notices alter column branch_id set not null;

alter table cr_profiles drop column branch_id;
alter table cr_profiles rename column specialization_id to branch_id;
alter table cr_profiles alter column branch_id set not null;


-- ============================================================
-- Reverse of step 5: specializations — remove Cyber Security, restore
-- the original program_id column (referencing whatever the degree
-- table is currently named; Postgres tracks FKs by OID so this still
-- resolves correctly after the degrees->programs rename below), then
-- drop branch_id.
-- ============================================================
delete from specializations where slug = 'cse-cyber-security';
alter table specializations add column program_id uuid references degrees(id);
update specializations set program_id = (select id from degrees where slug = 'btech');
alter table specializations alter column program_id set not null;
alter table specializations drop column branch_id;


-- ============================================================
-- Reverse of step 4: drop the new branches table entirely.
-- ============================================================
drop table branches;


-- ============================================================
-- Reverse of step 3: rename specializations back to branches.
-- ============================================================
alter table specializations rename to branches;


-- ============================================================
-- Reverse of step 2: degrees -> programs, dropping department_id and
-- the name/slug change.
-- ============================================================
update degrees set name = 'B.Tech Computer Science Engineering', slug = 'btech-cse' where slug = 'btech';
alter table degrees drop column department_id;
alter table degrees rename to programs;


-- ============================================================
-- Reverse of step 1: drop departments.
-- ============================================================
drop table departments;


-- ============================================================
-- Recreate the exact original final-state RLS policies (plain
-- branch_id, no specialization dimension) — matching
-- fix_admin_upload_protection_rls_leak.sql / add_batches.sql /
-- scope_cr_by_term.sql / protect_admin_uploads_from_cr.sql exactly.
-- ============================================================
create policy "CR or admin manages" on subjects for all
  using (
    (branch_id, term_id) in (select branch_id, term_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (branch_id, term_id) in (select branch_id, term_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

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

create policy "CR or admin updates" on resources for update
  using (
    (
      (
        (section = 'pyq' and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid()))
        or (
          section = 'notes_lab'
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
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
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (section = 'pyq' and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid()))
        or (
          section = 'notes_lab'
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

create policy "CR or admin inserts" on notices for insert
  with check (
    (branch_id, term_id, batch_id) in (
      select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

create policy "CR or admin updates" on notices for update
  using (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

create policy "CR or admin deletes" on notices for delete
  using (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );


-- ============================================================
-- Recreate the original indexes exactly as add_term_to_indexes.sql
-- defined them.
-- ============================================================
create index idx_resources_query
  on resources (section, status, branch_id, term_id, is_pinned desc, created_at desc);
create index idx_notices_query
  on notices (branch_id, term_id, is_pinned desc, created_at desc);
create index if not exists idx_cr_profiles_branch_term on cr_profiles (branch_id, term_id);


-- ============================================================
-- Assertions — abort if the rollback didn't land exactly back on the
-- original pre-migration shape.
-- ============================================================
do $$
declare
  res_count int;
  not_count int;
  sub_count int;
  cr_count int;
  branch_count int;
begin
  select count(*) into res_count from resources;
  select count(*) into not_count from notices;
  select count(*) into sub_count from subjects;
  select count(*) into cr_count from cr_profiles;
  select count(*) into branch_count from branches;

  if res_count != 57 then raise exception 'resources row count wrong after rollback: got %', res_count; end if;
  if not_count != 5 then raise exception 'notices row count wrong after rollback: got %', not_count; end if;
  if sub_count != 39 then raise exception 'subjects row count wrong after rollback: got %', sub_count; end if;
  if cr_count != 1 then raise exception 'cr_profiles row count wrong after rollback: got %', cr_count; end if;
  if branch_count != 3 then raise exception 'branches row count wrong after rollback: got %', branch_count; end if;
end $$;

commit;
