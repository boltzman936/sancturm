-- Every "CR manages own branch" policy now needs to also match term —
-- a 1st-Year-Sem-1 CR and a 2nd-Year-Sem-3 CR are different people
-- with different scopes now, not just different branches. Rewritten
-- as one clean baseline rather than another incremental patch, since
-- untangling exactly which of the last few migrations' policies were
-- still live was itself worth doing (see notes on the PYQ clause
-- below — it had regressed to own-branch-only silently).
--
-- PYQ note: pyq_cross_branch.sql intended "any CR can manage a PYQ in
-- any branch", but restrict_cr_scope.sql ran after it and dropped/
-- recreated the same policy names without that clause, silently
-- reverting to own-branch-only for PYQ writes too. Never actually hit
-- in practice (cr_profiles has been empty this whole time), but
-- restored here properly, now scoped to "any branch, same term".

drop policy if exists "CR or admin manages" on subjects;
create policy "CR or admin manages" on subjects for all
  using (
    (branch_id, term_id) in (
      select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (branch_id, term_id) in (
      select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
      and section in ('notes_lab', 'pyq')
    )
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin inserts" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (
      (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
      and section in ('notes_lab', 'pyq')
    )
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
      and section in ('notes_lab', 'pyq')
    )
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
      and section in ('notes_lab', 'pyq')
    )
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
      and section in ('notes_lab', 'pyq')
    )
    or (
      section = 'pyq'
      and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Notices stay strictly own-branch, own-term — no PYQ-style
-- cross-branch exception (unchanged from before, term check added).
drop policy if exists "CR or admin manages" on notices;
create policy "CR or admin manages" on notices for all
  using (
    (branch_id, term_id) in (
      select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (branch_id, term_id) in (
      select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin reads reports" on resource_reports;
create policy "CR or admin reads reports" on resource_reports for select
  using (
    resource_id in (
      select id from resources
      where (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin reviews reports" on resource_reports;
create policy "CR or admin reviews reports" on resource_reports for update
  using (
    resource_id in (
      select id from resources
      where (branch_id, term_id) in (
        select branch_id, term_id from cr_profiles where auth_user_id = auth.uid()
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
