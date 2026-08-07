-- Tightens what a CR can touch: their own branch, AND only the
-- notes_lab / pyq sections of `resources` (not anurag_file — that's
-- admin-only). Also removes CR access to sanctum_updates entirely —
-- that section is admin-only, full stop, no branch check at all.
-- Admin (the `admins` table) is unrestricted in every policy below:
-- no branch check, no section check — any branch, any section.

drop policy "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
      and section in ('notes_lab', 'pyq')
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
      and section in ('notes_lab', 'pyq')
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
      and section in ('notes_lab', 'pyq')
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
      and section in ('notes_lab', 'pyq')
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Sancturm updates: admin-only. No CR clause at all, any branch.
drop policy "CR or admin manages" on sanctum_updates;
create policy "Admin only manages" on sanctum_updates for all
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));
