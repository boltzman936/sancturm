-- Reverses exclude_sem2_core_aiml_aids.sql back to
-- cr_dynamic_semester.sql's 2-argument cr_current_term_id (no
-- exception), restoring every policy call site to match.

begin;

-- Same overload-coexistence approach as the forward migration — the
-- 2-arg version is created alongside the 3-arg one, every policy is
-- rewritten to call it, and only then is the 3-arg version dropped.
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

drop function if exists cr_current_term_id(uuid, integer, uuid);

commit;
