-- A CR's stored academic scope becomes (branch, specialization, batch,
-- year) — never a fixed semester. Their CURRENT semester is resolved
-- dynamically, every time, from the same date-aware chronology every
-- other page already uses (batch_terms' start_date, same "latest
-- started, or soonest upcoming if none has started yet" reduction
-- useCurrentTermsByYear does client-side — see cr_current_term_id
-- below, the single SQL source of truth both RLS and app code call
-- into, so the two can never drift apart into two different answers
-- for "what semester is this CR in right now").
--
-- Why this can't be an app-code-only fix: RLS is the actual
-- enforcement boundary for who can upload/edit what (see every
-- existing "CR or admin manages/deletes/inserts/updates" policy below)
-- — a Server Action believing the right thing proves nothing if the
-- database itself still checks a person's OLD stored term_id. Every
-- policy that referenced cr_profiles.term_id is rewritten here to
-- call cr_current_term_id(cp.batch_id, cp.year_number) instead, so
-- permissions themselves advance the moment a new semester starts,
-- with zero manual edits to any CR row.

begin;

alter table cr_profiles add column year_number integer;
update cr_profiles cp
  set year_number = t.year_number
  from academic_terms t
  where t.id = cp.term_id;
alter table cr_profiles alter column year_number set not null;
alter table cr_profiles add constraint cr_profiles_year_number_check check (year_number between 1 and 8);

-- The one place "what semester is CURRENT for this batch+year" is
-- computed — mirrors useCurrentTermsByYear's exact reduction (src/
-- features/terms/queries.ts): the latest-started batch_terms row for
-- this (batch, year) if any has started, otherwise the soonest
-- upcoming one (never NULL as long as at least one batch_terms row
-- exists for this batch+year — a malformed/unprovisioned combination
-- correctly resolves to NULL, which fails every RLS match closed
-- rather than open). `stable`, not `immutable` — its result
-- legitimately changes as real time passes, but is constant within
-- one statement/transaction, which is exactly the semantics RLS needs.
create or replace function cr_current_term_id(p_batch_id uuid, p_year_number integer)
returns uuid
language sql
stable
as $$
  select coalesce(
    (
      select bt.term_id
      from batch_terms bt
      join academic_terms t on t.id = bt.term_id
      where bt.batch_id = p_batch_id
        and t.year_number = p_year_number
        and bt.start_date <= current_date
      order by bt.start_date desc
      limit 1
    ),
    (
      select bt.term_id
      from batch_terms bt
      join academic_terms t on t.id = bt.term_id
      where bt.batch_id = p_batch_id
        and t.year_number = p_year_number
      order by bt.start_date asc
      limit 1
    )
  );
$$;
grant execute on function cr_current_term_id(uuid, integer) to anon, authenticated;

-- ============================================================
-- Rewrite every policy that matched cp.term_id — same field shape as
-- before in every other respect (branch/specialization/batch
-- matching, the PYQ-vs-notes_lab split on resources, the
-- is_admin_display_name guard on writes), only the term comparison
-- changes.
-- ============================================================

drop policy "CR or admin manages" on subjects;
create policy "CR or admin manages" on subjects for all
  using (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = subjects.term_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = subjects.term_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (section = 'pyq' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
            and cp.batch_id = resources.batch_id
        ))
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin inserts" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (section = 'pyq' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
    ))
    or
    (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
        and cp.batch_id = resources.batch_id
    ))
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (
        (section = 'pyq' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
            and cp.batch_id = resources.batch_id
        ))
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (
        (section = 'pyq' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
            and cp.batch_id = resources.batch_id
        ))
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (section = 'pyq' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
    ))
    or (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = resources.term_id
        and cp.batch_id = resources.batch_id
    ))
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on notices;
create policy "CR or admin deletes" on notices for delete
  using (
    (
      exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = notices.branch_id
          and cp.specialization_id is not distinct from notices.specialization_id
          and cr_current_term_id(cp.batch_id, cp.year_number) = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin inserts" on notices;
create policy "CR or admin inserts" on notices for insert
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = notices.branch_id
        and cp.specialization_id is not distinct from notices.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number) = notices.term_id
        and cp.batch_id = notices.batch_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on notices;
create policy "CR or admin updates" on notices for update
  using (
    (
      exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = notices.branch_id
          and cp.specialization_id is not distinct from notices.specialization_id
          and cr_current_term_id(cp.batch_id, cp.year_number) = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not is_admin_display_name(uploaded_by_name)
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
          and cr_current_term_id(cp.batch_id, cp.year_number) = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- resource_reports — a table with its own two cr_profiles-referencing
-- policies but zero references anywhere in src/ (confirmed dead
-- application code, same situation as class_updates found in an
-- earlier session's dependency sweep) — still live in the database
-- and still blocks the term_id column drop below, so its policies get
-- the same term_id -> cr_current_term_id swap and nothing else. Note
-- these were already scoped by (specialization_id, term_id) only, no
-- branch_id/batch_id match at all — preserved exactly as-is; not this
-- migration's place to change unrelated behavior in an unused table.
drop policy "CR or admin reads reports" on resource_reports;
create policy "CR or admin reads reports" on resource_reports for select
  using (
    resource_id in (
      select resources.id from resources
      where (resources.specialization_id, resources.term_id) in (
        select cr_profiles.specialization_id, cr_current_term_id(cr_profiles.batch_id, cr_profiles.year_number)
        from cr_profiles
        where cr_profiles.auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin reviews reports" on resource_reports;
create policy "CR or admin reviews reports" on resource_reports for update
  using (
    resource_id in (
      select resources.id from resources
      where (resources.specialization_id, resources.term_id) in (
        select cr_profiles.specialization_id, cr_current_term_id(cr_profiles.batch_id, cr_profiles.year_number)
        from cr_profiles
        where cr_profiles.auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- ============================================================
-- Schema cleanup — now that nothing references the column anymore.
-- ============================================================
drop index idx_cr_profiles_branch_term;
create index idx_cr_profiles_branch_year on cr_profiles (branch_id, specialization_id, batch_id, year_number);
alter table cr_profiles drop column term_id;

-- ============================================================
-- team_directory() — the ONLY thing that lets the public Sancturm
-- Team page show CR names at all. cr_profiles' own RLS (see
-- security_hardening.sql) deliberately restricts SELECT to "your own
-- row, or an admin" — that fix closed a real PII leak (every CR's
-- name + auth_user_id + full scope, enumerable by anyone,
-- unauthenticated) and this must not reopen it. security definer
-- lets this ONE function bypass that (table owners bypass their own
-- RLS in Postgres by default — see PostgreSQL's row security docs),
-- but it returns only what a team directory needs: no auth_user_id,
-- no id, no created_at. current_term_id is resolved the exact same
-- way permissions themselves are, so what a visitor sees here always
-- matches what that CR can actually act on right now.
create or replace function public.team_directory()
returns table (
  display_name text,
  branch_id uuid,
  specialization_id uuid,
  batch_id uuid,
  year_number integer,
  current_term_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cp.display_name,
    cp.branch_id,
    cp.specialization_id,
    cp.batch_id,
    cp.year_number,
    cr_current_term_id(cp.batch_id, cp.year_number) as current_term_id
  from cr_profiles cp
  order by cp.created_at asc;
$$;
revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'cr_profiles' and column_name = 'term_id') then
    raise exception 'cr_profiles.term_id should have been dropped';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'cr_profiles' and column_name = 'year_number') then
    raise exception 'cr_profiles.year_number is missing';
  end if;
end $$;

commit;
