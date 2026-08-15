-- A CR can currently edit/delete ANYTHING within their own
-- (branch, term, batch) scope, including things Anurag (the admin)
-- uploaded — access here has always been scoped by branch/term/batch,
-- never by uploader identity. This migration adds one exception: a CR
-- can no longer edit or delete a resource/notice that was uploaded by
-- an admin. Admins are unaffected — they can still edit/delete
-- anything, including their own uploads.
--
-- resources.uploaded_by_name is already reliably populated server-side
-- (never client-supplied — see uploadResourceDirect) for every
-- existing row that has an uploader at all, so this applies
-- retroactively with no backfill needed. Legacy rows from before that
-- column existed have uploaded_by_name null, which fails the `in`
-- check and is treated as "not admin-uploaded" (unchanged CR access) —
-- the same safe, do-nothing-for-unknowns behavior chosen below for
-- notices.

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (
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
      )
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (
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
      )
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
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
      )
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- notices has never tracked who created a row at all. Add the same
-- column resources already has (nullable — existing notices stay
-- null, meaning CRs keep exactly their current access to every
-- existing notice; only notices created from now on get an uploader
-- name and, if that uploader was an admin, the same edit/delete
-- protection).
alter table notices add column uploaded_by_name text;

drop policy "CR or admin manages" on notices;

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
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

create policy "CR or admin deletes" on notices for delete
  using (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not (uploaded_by_name in (select display_name from admins))
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
