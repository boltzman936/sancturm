-- PYQs are shared content — identical across all CSE branches for
-- 2nd year, 1st semester — so unlike notes_lab (locked to a CR's own
-- branch), ANY CR (or admin) can approve/upload/remove a PYQ in ANY
-- branch. notes_lab keeps the existing own-branch-only restriction.

drop policy "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      section = 'pyq'
      and exists (select 1 from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      section = 'pyq'
      and exists (select 1 from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      section = 'pyq'
      and exists (select 1 from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      section = 'pyq'
      and exists (select 1 from cr_profiles where auth_user_id = auth.uid())
    )
    or (
      section = 'notes_lab'
      and branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
