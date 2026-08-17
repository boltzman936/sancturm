-- One named exception, not a new general capability: 1st Year -
-- Semester 2 for the 2025-26 batch is hidden from CSE Core/AIML/AIDS.
-- Cyber Security (and every non-CSE branch, which reaches this same
-- globally-shared batch_terms row the normal way) keeps it.
-- batch_terms itself is untouched — still branch/specialization-
-- agnostic everywhere else, exactly as designed. This mirrors, in
-- SQL, the exact same constants src/features/batches/
-- academicChronology.ts's isBatchTermHiddenForSpecialization uses —
-- keep the two in sync if this exception is ever extended.
--
-- cr_current_term_id gains a specialization_id parameter and now
-- filters this one row out before its normal "latest started, or
-- soonest upcoming" resolution — every RLS policy and RPC caller that
-- already passes (batch_id, year_number) now also passes
-- specialization_id, since a CR's own row already carries it.

begin;

-- Created alongside the old 2-argument version first (a different
-- argument count is a distinct function/overload in Postgres, so this
-- doesn't conflict) — every policy below is rewritten to call this
-- 3-arg version, and only once nothing references the old one anymore
-- is it dropped, at the very end of this transaction.
create or replace function cr_current_term_id(p_batch_id uuid, p_year_number integer, p_specialization_id uuid)
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
        and not (
          bt.batch_id = '2f2d1232-76ea-4a42-a744-e9be040158e3'
          and bt.term_id = 'f9699ad2-6f0c-469e-9b28-e59ef838d889'
          and p_specialization_id is not null and p_specialization_id in (
            '67e55583-69ed-4a50-9aad-256fdff9fec1',
            '09b06a94-bcf3-41c2-9858-0ec5cb6b647a',
            'f581246d-6feb-4095-aa33-e82e88a1de3f'
          )
        )
      order by bt.start_date desc
      limit 1
    ),
    (
      select bt.term_id
      from batch_terms bt
      join academic_terms t on t.id = bt.term_id
      where bt.batch_id = p_batch_id
        and t.year_number = p_year_number
        and not (
          bt.batch_id = '2f2d1232-76ea-4a42-a744-e9be040158e3'
          and bt.term_id = 'f9699ad2-6f0c-469e-9b28-e59ef838d889'
          and p_specialization_id is not null and p_specialization_id in (
            '67e55583-69ed-4a50-9aad-256fdff9fec1',
            '09b06a94-bcf3-41c2-9858-0ec5cb6b647a',
            'f581246d-6feb-4095-aa33-e82e88a1de3f'
          )
        )
      order by bt.start_date asc
      limit 1
    )
  );
$$;
grant execute on function cr_current_term_id(uuid, integer, uuid) to anon, authenticated;

-- Every RLS policy that calls cr_current_term_id(cp.batch_id,
-- cp.year_number) now passes cp.specialization_id too — same bodies
-- as cr_dynamic_semester.sql, only the function call changes.

drop policy "CR or admin manages" on subjects;
create policy "CR or admin manages" on subjects for all
  using (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = subjects.term_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = subjects.branch_id
        and cp.specialization_id is not distinct from subjects.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = subjects.term_id
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
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
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
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
    ))
    or
    (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
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
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
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
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
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
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
    ))
    or (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = resources.term_id
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
          and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = notices.term_id
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
        and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = notices.term_id
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
          and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = notices.term_id
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
          and cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin reads reports" on resource_reports;
create policy "CR or admin reads reports" on resource_reports for select
  using (
    resource_id in (
      select resources.id from resources
      where (resources.specialization_id, resources.term_id) in (
        select cr_profiles.specialization_id, cr_current_term_id(cr_profiles.batch_id, cr_profiles.year_number, cr_profiles.specialization_id)
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
        select cr_profiles.specialization_id, cr_current_term_id(cr_profiles.batch_id, cr_profiles.year_number, cr_profiles.specialization_id)
        from cr_profiles
        where cr_profiles.auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- team_directory() also calls cr_current_term_id — needs the new arg.
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
    cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) as current_term_id
  from cr_profiles cp
  order by cp.created_at asc;
$$;
revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to anon, authenticated;

-- Safe now — every policy above was rewritten to call the 3-arg
-- version before this point.
drop function if exists cr_current_term_id(uuid, integer);

commit;
