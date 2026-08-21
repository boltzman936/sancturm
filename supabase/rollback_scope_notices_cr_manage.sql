drop policy if exists "CR or admin manages" on notices;
create policy "CR or admin manages" on notices for all
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
