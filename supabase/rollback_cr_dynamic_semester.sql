-- Reverses cr_dynamic_semester.sql. Restores term_id by resolving
-- each CR's CURRENT term at rollback time (the exact original stored
-- value isn't recoverable once dropped — this is the best-effort
-- equivalent, and matches whatever that CR's permissions currently
-- resolve to anyway, so nothing about their access changes across the
-- rollback itself).

begin;

alter table cr_profiles add column term_id uuid;
update cr_profiles set term_id = cr_current_term_id(batch_id, year_number);
alter table cr_profiles alter column term_id set not null;
alter table cr_profiles add constraint cr_profiles_term_id_fkey foreign key (term_id) references academic_terms(id);

drop function if exists public.team_directory();

drop policy "CR or admin reads reports" on resource_reports;
create policy "CR or admin reads reports" on resource_reports for select
  using (
    resource_id in (
      select resources.id from resources
      where (resources.specialization_id, resources.term_id) in (
        select cr_profiles.specialization_id, cr_profiles.term_id
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
        select cr_profiles.specialization_id, cr_profiles.term_id
        from cr_profiles
        where cr_profiles.auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop index idx_cr_profiles_branch_year;
create index idx_cr_profiles_branch_term on cr_profiles (branch_id, specialization_id, term_id);

drop policy "CR or admin manages" on subjects;
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

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (section = 'pyq' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.term_id = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cp.term_id = resources.term_id
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
        and cp.term_id = resources.term_id
    ))
    or
    (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cp.term_id = resources.term_id
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
            and cp.term_id = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cp.term_id = resources.term_id
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
            and cp.term_id = resources.term_id
        ))
        or
        (section = 'notes_lab' and exists (
          select 1 from cr_profiles cp
          where cp.auth_user_id = auth.uid()
            and cp.branch_id = resources.branch_id
            and cp.specialization_id is not distinct from resources.specialization_id
            and cp.term_id = resources.term_id
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
        and cp.term_id = resources.term_id
    ))
    or (section = 'notes_lab' and exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = resources.branch_id
        and cp.specialization_id is not distinct from resources.specialization_id
        and cp.term_id = resources.term_id
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
          and cp.term_id = notices.term_id
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
        and cp.term_id = notices.term_id
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
          and cp.term_id = notices.term_id
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
          and cp.term_id = notices.term_id
          and cp.batch_id = notices.batch_id
      )
      and not is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop function if exists cr_current_term_id(uuid, integer);

alter table cr_profiles drop column year_number;

commit;
