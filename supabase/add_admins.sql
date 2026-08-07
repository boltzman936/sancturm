-- Adds a superior "admin/controller" role that can act across ALL
-- branches, on top of the existing per-branch CR model. cr_profiles
-- can't do this itself — both its auth_user_id and branch_id columns
-- are unique, so one person can only ever be CR for exactly one
-- branch. This is a separate, parallel table instead.

create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
create policy "Public read" on admins for select using (true);

-- Every "CR manages own branch" policy gets OR-ed with "or you're an
-- admin". Same shape everywhere: drop the old policy, recreate it
-- with the admin clause added.

drop policy "CR manages own branch" on subjects;
create policy "CR or admin manages" on subjects for all
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Admins aren't in cr_profiles, so without this the approvals page
-- would show them nothing — pending resources outside their (nonexistent)
-- own branch would stay invisible even though they're allowed to act on them.
drop policy "Public read approved" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR updates own branch" on resources;
create policy "CR or admin updates" on resources for update
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR deletes own branch" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR reads own branch reports" on resource_reports;
create policy "CR or admin reads reports" on resource_reports for select
  using (
    resource_id in (
      select id from resources
      where branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR reviews own branch reports" on resource_reports;
create policy "CR or admin reviews reports" on resource_reports for update
  using (
    resource_id in (
      select id from resources
      where branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR manages own branch" on class_updates;
create policy "CR or admin manages" on class_updates for all
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR manages own branch" on notices;
create policy "CR or admin manages" on notices for all
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR manages own branch" on sanctum_updates;
create policy "CR or admin manages" on sanctum_updates for all
  using (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Once you've created your own Supabase Auth user (Authentication ->
-- Users -> Add user) for yourself as the admin, link it here:
-- insert into admins (auth_user_id, display_name)
-- values ('<your-auth-user-uuid>', 'Anurag');
