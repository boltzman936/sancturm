-- Students can no longer upload anything, anywhere — the app's UI
-- already removed every public "Upload" button, but that's just
-- convenience; the actual boundary is here. This replaces the old
-- open "Anyone can submit for review" insert policy (which is what
-- let an anonymous student submit a pending resource in the first
-- place) with a CR/admin-only one, so even a direct API call with the
-- public anon key can no longer insert a row. A CR is scoped to their
-- own branch's notes_lab/pyq, same as every other CR policy on this
-- table; admin is unrestricted.
drop policy if exists "Anyone can submit for review" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (
      branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
      and section in ('notes_lab', 'pyq')
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
